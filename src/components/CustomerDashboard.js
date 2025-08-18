import React, { useState, useEffect, useRef } from 'react';
import { Bell, LogOut, AlertCircle, Edit, Check, X } from 'lucide-react';
import { auth, db, storage } from '../firebase-config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, Timestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';

// Enhanced Button Component
const EnhancedButton = ({ children, variant = 'default', size = 'md', className = '', onClick, ...props }) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-300 shadow-elegant hover:shadow-card focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary/50',
    luxury: 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl transform hover:scale-105',
    ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
    outline: 'border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground'
  };
  
  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };
  
  return (
    <button
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};

const CustomerDashboard = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    phone: '',
    email: '',
    savedMeasurements: {
      chest: '',
      waist: '',
      hips: '',
      length: '',
      shoulders: '',
      sleeve: ''
    }
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders');
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [rememberMeasurements, setRememberMeasurements] = useState(false);
  
  // Photo upload states
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [photoUrls, setPhotoUrls] = useState([]);

  // Notification states - Now functional
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastChecked, setLastChecked] = useState(new Date());
  
  // Use refs to track cleanup functions
  const unsubscribeRef = useRef(null);
  const userId = useRef(null);
  
  const [orderForm, setOrderForm] = useState({
    garmentType: '',
    measurements: {
      chest: '',
      waist: '',
      hips: '',
      length: '',
      shoulders: '',
      sleeve: ''
    },
    fabric: '',
    specialInstructions: '',
    urgency: 'normal',
    status: 'pending',
    inspirationPhotos: []
  });

  // Fetch customer data and orders when component mounts
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', user);
      
      if (user) {
        userId.current = user.uid;
        try {
          // Fetch customer data
          const customerDoc = await getDoc(doc(db, 'customers', user.uid));
          console.log('Customer doc exists:', customerDoc.exists());
          
          if (customerDoc.exists()) {
            const customerData = customerDoc.data();
            console.log('Customer data from Firestore:', customerData);
            
            setCustomerInfo({
              name: customerData.name || '',
              phone: customerData.phone || '',
              email: customerData.email || user.email || '',
              savedMeasurements: customerData.savedMeasurements || {
                chest: '',
                waist: '',
                hips: '',
                length: '',
                shoulders: '',
                sleeve: ''
              }
            });

            // Set up real-time order listener for this customer
            setupOrderListener(user.uid);
          } else {
            console.log('Customer document does not exist, redirecting to login');
            navigate('/login');
          }
        } catch (error) {
          console.error('Error fetching customer data:', error);
        } finally {
          setLoading(false);
        }
      } else {
        console.log('No user logged in, redirecting to login');
        navigate('/login');
      }
    });

    return () => {
      unsubscribe();
      // Clean up order listener
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [navigate]);

  // Set up real-time order listener for notifications
  const setupOrderListener = (customerId) => {
    try {
      // Clean up existing listener if any
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      const ordersQuery = query(
        collection(db, 'orders'), 
        where('customerId', '==', customerId),
        orderBy('createdAt', 'desc')
      );
      
      // Store initial orders to compare against
      let initialOrdersLoaded = false;
      let previousOrders = new Map();
      
      const unsubscribe = onSnapshot(ordersQuery, 
        (snapshot) => {
          try {
            const newNotifications = [];
            const allOrders = snapshot.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                ...data
              };
            });

            // On first load, just store the orders without notifications
            if (!initialOrdersLoaded) {
              allOrders.forEach(order => {
                previousOrders.set(order.id, order);
              });
              setOrders(allOrders);
              initialOrdersLoaded = true;
              return;
            }

            // Process changes only after initial load
            allOrders.forEach(currentOrder => {
              const orderId = currentOrder.id;
              const previousOrder = previousOrders.get(orderId);
              
              if (previousOrder) {
                // EXISTING ORDER - Check for tailor updates
                const wasModifiedByTailor = currentOrder.modifiedBy === 'tailor';
                
                // Only notify if order was modified by tailor
                if (wasModifiedByTailor) {
                  // Check if there are meaningful changes
                  const hasStatusChange = previousOrder.status !== currentOrder.status;
                  const hasProgressChange = previousOrder.progress !== currentOrder.progress;
                  
                  if (hasStatusChange || hasProgressChange) {
                    let notificationType = 'order_updated';
                    let title = 'Order Updated';
                    let message = `Your order has been updated`;
                    
                    // Specific notifications based on status changes
                    if (hasStatusChange) {
                      switch (currentOrder.status) {
                        case 'confirmed':
                          title = 'Order Confirmed';
                          message = `Your ${currentOrder.garmentType || 'order'} has been confirmed by the tailor`;
                          notificationType = 'status_confirmed';
                          break;
                        case 'in_progress':
                          title = 'Work Started';
                          message = `Work has started on your ${currentOrder.garmentType || 'order'}`;
                          notificationType = 'status_in_progress';
                          break;
                        case 'ready':
                          title = 'Order Ready!';
                          message = `Your ${currentOrder.garmentType || 'order'} is ready for pickup/delivery`;
                          notificationType = 'status_ready';
                          break;
                        case 'delivered':
                          title = 'Order Completed';
                          message = `Your ${currentOrder.garmentType || 'order'} has been completed`;
                          notificationType = 'status_delivered';
                          break;
                        case 'cancelled':
                          title = 'Order Cancelled';
                          message = `Your ${currentOrder.garmentType || 'order'} has been cancelled`;
                          notificationType = 'status_cancelled';
                          break;
                        default:
                          message = `Your ${currentOrder.garmentType || 'order'} status changed to ${currentOrder.status}`;
                      }
                    } else if (hasProgressChange) {
                      title = 'Progress Update';
                      message = `Your ${currentOrder.garmentType || 'order'} is now ${currentOrder.progress || 0}% complete`;
                      notificationType = 'progress_update';
                    }
                    
                    newNotifications.push({
                      id: `tailor-update-${orderId}-${Date.now()}`,
                      type: notificationType,
                      title: title,
                      message: message,
                      orderId: orderId,
                      timestamp: new Date(),
                      read: false,
                      urgent: currentOrder.status === 'ready' || currentOrder.status === 'cancelled'
                    });
                  }
                }
              }
              
              // Update previous orders map
              previousOrders.set(orderId, currentOrder);
            });

            // Update orders state
            setOrders(allOrders);

            // Handle new notifications
            if (newNotifications.length > 0) {
              setNotifications(prev => [
                ...newNotifications,
                ...prev.slice(0, 49) // Keep only last 50 notifications
              ]);
              setUnreadCount(prev => prev + newNotifications.length);
              
              // Show browser notifications if permission granted
              if (Notification.permission === 'granted') {
                newNotifications.forEach(notification => {
                  new Notification(notification.title, {
                    body: notification.message,
                    icon: '/favicon.ico',
                    tag: notification.id
                  });
                });
              }
            }
            
          } catch (snapshotError) {
            console.error('Error processing snapshot:', snapshotError);
          }
        },
        (error) => {
          console.error('Orders listener error:', error);
          // Try to reconnect after a delay
          setTimeout(() => {
            if (auth.currentUser && userId.current) {
              setupOrderListener(userId.current);
            }
          }, 5000);
        }
      );

      // Store the unsubscribe function
      unsubscribeRef.current = unsubscribe;
      
    } catch (error) {
      console.error('Error setting up order listener:', error);
    }
  };

  // Request notification permission on component mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Notification functions
  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications) {
      markAllNotificationsAsRead();
    }
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    setUnreadCount(0);
    setLastChecked(new Date());
  };

  const clearNotification = (notificationId) => {
    setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleNotificationClick = (notification) => {
    if (notification.orderId) {
      const order = orders.find(o => o.id === notification.orderId);
      if (order) {
        openOrderForm(order);
        setShowNotifications(false);
      }
    }
  };

  // Notification Dropdown Component
  const NotificationDropdown = () => {
    if (!showNotifications) return null;

    return (
      <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999] max-h-96 overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
            {notifications.length > 0 && (
              <button
                onClick={() => setNotifications([])}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
        
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <Bell className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>No notifications</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                  !notification.read ? 'bg-blue-50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      {notification.type === 'status_confirmed' ? (
                        <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                      ) : notification.type === 'status_ready' ? (
                        <AlertCircle className="h-4 w-4 text-blue-500 mr-2 mt-0.5" />
                      ) : notification.type === 'status_delivered' ? (
                        <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                      ) : notification.type === 'status_cancelled' ? (
                        <X className="h-4 w-4 text-red-500 mr-2 mt-0.5" />
                      ) : (
                        <Edit className="h-4 w-4 text-blue-500 mr-2 mt-0.5" />
                      )}
                      <h4 className="text-sm font-medium text-gray-900">
                        {notification.title}
                      </h4>
                      {!notification.read && (
                        <div className="ml-2 h-2 w-2 bg-blue-500 rounded-full"></div>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      {notification.timestamp.toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearNotification(notification.id);
                    }}
                    className="text-gray-400 hover:text-gray-600 ml-2"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const handleSignOut = async () => {
    try {
      // Clean up listeners before logout
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Photo upload functions
  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => {
      const isValidType = file.type.startsWith('image/');
      const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB limit
      return isValidType && isValidSize;
    });

    if (validFiles.length !== files.length) {
      alert('Some files were skipped. Please ensure all files are images under 5MB.');
    }

    setSelectedFiles(prevFiles => {
      const combined = [...prevFiles, ...validFiles];
      return combined.slice(0, 5); // Limit to 5 photos
    });
  };

  const removeSelectedPhoto = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeUploadedPhoto = async (index, photoUrl) => {
    try {
      // Delete from Firebase Storage if it's a Firebase URL
      if (photoUrl.includes('firebase')) {
        const photoRef = ref(storage, photoUrl);
        await deleteObject(photoRef);
      }
      
      // Remove from local state
      setPhotoUrls(prev => prev.filter((_, i) => i !== index));
      setOrderForm(prev => ({
        ...prev,
        inspirationPhotos: prev.inspirationPhotos.filter((_, i) => i !== index)
      }));
    } catch (error) {
      console.error('Error removing photo:', error);
    }
  };

  const uploadPhotos = async (files) => {
    if (!files || files.length === 0) return [];
    
    setUploadingPhotos(true);
    const uploadPromises = files.map(async (file) => {
      try {
        const timestamp = Date.now();
        const fileName = `inspiration/${auth.currentUser.uid}/${timestamp}-${file.name}`;
        const storageRef = ref(storage, fileName);
        
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        
        return {
          url: downloadURL,
          name: file.name,
          uploadedAt: new Date().toISOString()
        };
      } catch (error) {
        console.error('Error uploading photo:', error);
        return null;
      }
    });

    try {
      const uploadResults = await Promise.all(uploadPromises);
      const successfulUploads = uploadResults.filter(result => result !== null);
      setUploadingPhotos(false);
      return successfulUploads;
    } catch (error) {
      console.error('Error in photo upload process:', error);
      setUploadingPhotos(false);
      return [];
    }
  };

  // Save measurements to customer profile
  const saveMeasurementsToProfile = async (measurements) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const customerRef = doc(db, 'customers', user.uid);
      await updateDoc(customerRef, {
        savedMeasurements: measurements,
        updatedAt: serverTimestamp()
      });

      // Update local state
      setCustomerInfo(prev => ({
        ...prev,
        savedMeasurements: measurements
      }));

      console.log('Measurements saved to profile');
    } catch (error) {
      console.error('Error saving measurements to profile:', error);
    }
  };

  // Load saved measurements into form
  const loadSavedMeasurements = () => {
    if (customerInfo.savedMeasurements) {
      setOrderForm(prev => ({
        ...prev,
        measurements: { ...customerInfo.savedMeasurements }
      }));
    }
  };

  // Check if customer has saved measurements
  const hasSavedMeasurements = () => {
    const saved = customerInfo.savedMeasurements;
    return saved && Object.values(saved).some(value => value && value.trim() !== '');
  };

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const user = auth.currentUser;
      if (!user) {
        alert('You must be logged in to place an order');
        return;
      }

      // Upload new photos if any
      let uploadedPhotos = [];
      if (selectedFiles.length > 0) {
        uploadedPhotos = await uploadPhotos(selectedFiles);
      }

      // Combine existing photos with newly uploaded ones
      const allPhotos = [...photoUrls, ...uploadedPhotos];

      // Save measurements if remember option is checked
      if (rememberMeasurements) {
        await saveMeasurementsToProfile(orderForm.measurements);
      }

      const now = serverTimestamp();
      
      if (currentOrder) {
        // Update existing order in Firestore
        const orderRef = doc(db, 'orders', currentOrder.id);
        const updateData = {
          ...orderForm,
          inspirationPhotos: allPhotos,
          updatedAt: serverTimestamp(),
          lastModified: serverTimestamp(),
          modifiedBy: 'customer', // CLEAR FLAG: This was modified by customer
          modificationReason: 'customer_edit',
          // Add a unique update identifier to ensure detection
          updateId: `customer-update-${Date.now()}-${Math.random()}`
        };
        
        // Update due date if urgency changed
        if (orderForm.urgency !== currentOrder.urgency) {
          const deliveryDate = calculateDeliveryDate(orderForm.urgency);
          updateData.dueDate = Timestamp.fromDate(deliveryDate);
          updateData.expectedDelivery = deliveryDate.toISOString().split('T')[0];
        }
        
        await updateDoc(orderRef, updateData);
        
        console.log('Order updated by customer with notification triggers');
        
      } else {
        // Create new order in Firestore
        const deliveryDate = calculateDeliveryDate(orderForm.urgency);
        const price = calculatePrice(orderForm.garmentType, orderForm.urgency);
        
        const newOrderData = {
          ...orderForm,
          inspirationPhotos: allPhotos,
          customerId: user.uid,
          customerName: customerInfo.name,
          customerEmail: customerInfo.email,
          customerPhone: customerInfo.phone,
          orderDate: new Date().toISOString().split('T')[0],
          expectedDelivery: deliveryDate.toISOString().split('T')[0],
          dueDate: Timestamp.fromDate(deliveryDate),
          price: price,
          totalAmount: price,
          progress: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastModified: serverTimestamp(),
          modifiedBy: 'customer', // CLEAR FLAG: This was created by customer
          modificationReason: 'new_order',
          createdBy: 'customer', // Additional flag for creation
          // Add a unique creation identifier
          createId: `customer-create-${Date.now()}-${Math.random()}`,
          items: [{
            garmentType: orderForm.garmentType,
            quantity: 1,
            price: price,
            measurements: orderForm.measurements,
            fabric: orderForm.fabric,
            specialInstructions: orderForm.specialInstructions
          }]
        };

        await addDoc(collection(db, 'orders'), newOrderData);
        
        console.log('New order created by customer with notification triggers');
      }
      
      closeOrderForm();
      alert(currentOrder ? 'Order updated successfully! The tailor has been notified.' : 'Order placed successfully! The tailor has been notified.');
    } catch (error) {
      console.error('Error saving order:', error);
      alert('Error saving order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const calculateDeliveryDate = (urgency) => {
    const days = {
      urgent: 7,
      normal: 14,
      relaxed: 30
    };
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + days[urgency]);
    return deliveryDate;
  };

  const calculatePrice = (garmentType, urgency) => {
    const basePrices = {
      'Business Suit': 400,
      'Evening Gown': 550,
      'Casual Blazer': 300,
      'Dress Shirt': 120,
      'Pants': 150,
      'Skirt': 130,
      'Custom': 200
    };
    
    const multipliers = {
      urgent: 1.2,
      normal: 1,
      relaxed: 0.9
    };
    
    return Math.round((basePrices[garmentType] || 200) * multipliers[urgency]);
  };

  const openOrderForm = (order = null) => {
    setCurrentOrder(order);
    setOrderForm(order ? { 
      ...order,
      measurements: order.measurements || {
        chest: '',
        waist: '',
        hips: '',
        length: '',
        shoulders: '',
        sleeve: ''
      },
      inspirationPhotos: order.inspirationPhotos || []
    } : {
      garmentType: '',
      measurements: {
        chest: '',
        waist: '',
        hips: '',
        length: '',
        shoulders: '',
        sleeve: ''
      },
      fabric: '',
      specialInstructions: '',
      urgency: 'normal',
      status: 'pending',
      inspirationPhotos: []
    });
    
    // Set photo URLs for existing order
    if (order && order.inspirationPhotos) {
      setPhotoUrls(order.inspirationPhotos);
    } else {
      setPhotoUrls([]);
    }
    
    setSelectedFiles([]);
    setRememberMeasurements(false);
    setShowOrderForm(true);
  };

  const closeOrderForm = () => {
    setShowOrderForm(false);
    setCurrentOrder(null);
    setRememberMeasurements(false);
    setSelectedFiles([]);
    setPhotoUrls([]);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name.includes('measurements.')) {
      const measurementField = name.split('.')[1];
      setOrderForm(prev => ({
        ...prev,
        measurements: {
          ...prev.measurements,
          [measurementField]: value
        }
      }));
    } else {
      setOrderForm(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'delivered': 'bg-emerald-100 text-emerald-800 border-emerald-200',
      'ready': 'bg-blue-100 text-blue-800 border-blue-200',
      'in_progress': 'bg-purple-100 text-purple-800 border-purple-200',
      'confirmed': 'bg-indigo-100 text-indigo-800 border-indigo-200',
      'pending': 'bg-amber-100 text-amber-800 border-amber-200',
      'cancelled': 'bg-red-100 text-red-800 border-red-200',
      'Completed': 'bg-emerald-100 text-emerald-800 border-emerald-200',
      'In Progress': 'bg-blue-100 text-blue-800 border-blue-200',
      'Pending': 'bg-amber-100 text-amber-800 border-amber-200',
      'Cancelled': 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getProgressColor = (progress) => {
    if (progress >= 90) return 'from-emerald-400 to-emerald-600';
    if (progress >= 50) return 'from-blue-400 to-blue-600';
    if (progress > 0) return 'from-amber-400 to-amber-600';
    return 'from-gray-300 to-gray-400';
  };

  const filterOrders = () => {
    if (activeTab === 'all') return orders;
    if (activeTab === 'active') return orders.filter(o => 
      !['delivered', 'cancelled', 'Completed', 'Cancelled'].includes(o.status)
    );
    if (activeTab === 'completed') return orders.filter(o => 
      ['delivered', 'Completed'].includes(o.status)
    );
    return orders;
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    
    if (dateValue.toDate) {
      return dateValue.toDate().toLocaleDateString();
    }
    if (typeof dateValue === 'string') {
      return new Date(dateValue).toLocaleDateString();
    }
    if (dateValue instanceof Date) {
      return dateValue.toLocaleDateString();
    }
    
    return 'N/A';
  };

  const displayStatus = (status) => {
    const statusMap = {
      'pending': 'Pending',
      'confirmed': 'Confirmed',
      'in_progress': 'In Progress',
      'ready': 'Ready',
      'delivered': 'Completed',
      'cancelled': 'Cancelled'
    };
    return statusMap[status] || status;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-600 text-lg">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Extended Header Banner - Similar to Tailor Dashboard */}
      <header className="relative bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white shadow-2xl overflow-visible z-10">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-indigo-600/20" />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='m36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />
        
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="space-y-2">
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
                xyz shop
                <span className="block text-lg lg:text-xl font-normal text-white/80 mt-1">
                  {customerInfo.name}'s Dashboard
                </span>
              </h1>
              <p className="text-white/70">
                Manage your orders and measurements
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="relative z-[100]">
                <button
                  onClick={toggleNotifications}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all duration-300 relative backdrop-blur-sm"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <NotificationDropdown />
              </div>
              
              <EnhancedButton
                onClick={handleSignOut}
                variant="ghost"
                className="text-white/80 hover:text-white hover:bg-white/10 backdrop-blur-sm"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </EnhancedButton>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Business Overview Section */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-gray-50 px-8 py-6 border-b border-gray-200/50 flex justify-between items-center">
            <h3 className="text-2xl font-bold text-slate-800">Order Overview</h3>
            <button 
              onClick={() => openOrderForm()} 
              className="group bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-6 py-3 rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 flex items-center space-x-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:scale-110 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold">New Order</span>
            </button>
          </div>
          
          {/* Enhanced Stats Cards */}
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-xl border border-indigo-200/50 hover:shadow-lg transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-slate-600 text-sm font-medium uppercase tracking-wider">Total Orders</h3>
                    <p className="text-4xl font-bold text-indigo-700 mt-2">{orders.length}</p>
                  </div>
                  <div className="bg-indigo-500 p-3 rounded-full">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 rounded-xl border border-emerald-200/50 hover:shadow-lg transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-slate-600 text-sm font-medium uppercase tracking-wider">Completed</h3>
                    <p className="text-4xl font-bold text-emerald-700 mt-2">
                      {orders.filter(o => ['delivered', 'Completed'].includes(o.status)).length}
                    </p>
                  </div>
                  <div className="bg-emerald-500 p-3 rounded-full">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200/50 hover:shadow-lg transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-slate-600 text-sm font-medium uppercase tracking-wider">In Progress</h3>
                    <p className="text-4xl font-bold text-blue-700 mt-2">
                      {orders.filter(o => ['in_progress', 'confirmed', 'ready', 'In Progress'].includes(o.status)).length}
                    </p>
                  </div>
                  <div className="bg-blue-500 p-3 rounded-full">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Orders Section */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-gray-50 px-8 py-6 border-b border-gray-200/50 flex justify-between items-center">
            <h3 className="text-2xl font-bold text-slate-800">My Orders</h3>
            <div className="flex space-x-2">
              <button 
                onClick={() => setActiveTab('all')} 
                className={`px-6 py-3 text-sm rounded-xl font-medium transition-all duration-300 ${
                  activeTab === 'all' 
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' 
                    : 'bg-white/50 text-slate-700 hover:bg-white/80 border border-gray-200/50'
                }`}
              >
                All Orders
              </button>
              <button 
                onClick={() => setActiveTab('active')} 
                className={`px-6 py-3 text-sm rounded-xl font-medium transition-all duration-300 ${
                  activeTab === 'active' 
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' 
                    : 'bg-white/50 text-slate-700 hover:bg-white/80 border border-gray-200/50'
                }`}
              >
                Active
              </button>
              <button 
                onClick={() => setActiveTab('completed')} 
                className={`px-6 py-3 text-sm rounded-xl font-medium transition-all duration-300 ${
                  activeTab === 'completed' 
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' 
                    : 'bg-white/50 text-slate-700 hover:bg-white/80 border border-gray-200/50'
                }`}
              >
                Completed
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filterOrders().length === 0 ? (
              <div className="p-12 text-center">
                <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-2xl p-8 max-w-md mx-auto">
                  <svg className="w-16 h-16 text-slate-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-xl font-semibold text-slate-600 mb-2">No orders found</p>
                  <p className="text-slate-500">Click "New Order" to place your first order and start your tailoring journey.</p>
                </div>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200/50">
                <thead className="bg-gradient-to-r from-slate-50 to-gray-50">
                  <tr>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Order ID</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Garment</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Progress</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Delivery Date</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Price</th>
                    <th className="px-8 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white/50 divide-y divide-gray-200/50">
                  {filterOrders().map(order => (
                    <tr key={order.id} className="hover:bg-white/80 transition-all duration-300">
                      <td className="px-8 py-6 whitespace-nowrap">
                        <div className="text-sm font-bold text-slate-800">#{order.id.substring(0, 8)}</div>
                        <div className="text-xs text-slate-500">Order ID</div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <div className="text-sm font-semibold text-slate-800">{order.garmentType}</div>
                        <div className="text-xs text-slate-500">{order.fabric || 'Fabric TBD'}</div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <span className={`inline-flex px-3 py-1.5 text-xs font-semibold rounded-full border ${getStatusColor(order.status)}`}>
                          {displayStatus(order.status)}
                        </span>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <div className="w-full">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-slate-600 font-medium">{order.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                            <div 
                              className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(order.progress)} transition-all duration-500 ease-out`}
                              style={{ width: `${order.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <div className="text-sm font-semibold text-slate-800">
                          {formatDate(order.dueDate || order.expectedDelivery)}
                        </div>
                        <div className="text-xs text-slate-500">Expected</div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <div className="text-sm font-bold text-slate-800">${order.price || order.totalAmount}</div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-sm font-medium space-x-3">
                        <button 
                          onClick={() => openOrderForm(order)}
                          className={`${
                            ['delivered', 'Completed'].includes(order.status)
                              ? 'text-slate-600 hover:text-slate-800'
                              : 'text-indigo-600 hover:text-indigo-800'
                          } font-semibold transition-colors duration-200`}
                          disabled={['delivered', 'Completed'].includes(order.status)}
                        >
                          {['delivered', 'Completed'].includes(order.status) ? 'View' : 'Edit'}
                        </button>
                        {order.status === 'pending' && (
                          <button className="text-red-600 hover:text-red-800 font-semibold transition-colors duration-200">
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* Enhanced Order Form Modal */}
      {showOrderForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-white/50">
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    {currentOrder ? 
                      (['delivered', 'Completed'].includes(currentOrder.status) ? 'View Order Details' : 'Edit Order Details') 
                      : 'Create New Order'
                    }
                  </h2>
                  <p className="text-slate-600 mt-2">
                    {currentOrder ? 'Update your order information' : 'Fill in the details for your custom garment'}
                  </p>
                </div>
                <button 
                  onClick={closeOrderForm}
                  className="text-slate-400 hover:text-slate-600 text-3xl font-light transition-colors duration-200 hover:rotate-90 transform"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleOrderSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">Garment Type *</label>
                    <select
                      name="garmentType"
                      value={orderForm.garmentType}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200/50 bg-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300"
                      required
                      disabled={currentOrder && ['delivered', 'Completed'].includes(currentOrder.status)}
                    >
                      <option value="">Select garment type</option>
                      <option value="Business Suit">Business Suit</option>
                      <option value="Evening Gown">Evening Gown</option>
                      <option value="Casual Blazer">Casual Blazer</option>
                      <option value="Dress Shirt">Dress Shirt</option>
                      <option value="Pants">Pants</option>
                      <option value="Skirt">Skirt</option>
                      <option value="Custom">Custom Design</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">Fabric Preference</label>
                    <input
                      type="text"
                      name="fabric"
                      value={orderForm.fabric}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200/50 bg-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300"
                      placeholder="e.g., Silk, Wool, Cotton"
                      disabled={currentOrder && ['delivered', 'Completed'].includes(currentOrder.status)}
                    />
                  </div>
                </div>

                {/* Enhanced Inspiration Photos Section */}
                <div className="border border-slate-200/50 rounded-2xl p-8 bg-gradient-to-br from-slate-50/50 to-white/50 backdrop-blur-sm">
                  <h3 className="text-xl font-semibold text-slate-800 mb-4">Inspiration Photos</h3>
                  <p className="text-slate-600 mb-6">Upload reference images to help your tailor understand your vision (up to 5 photos, max 5MB each)</p>
                  
                  {/* Photo Upload Input */}
                  {(!currentOrder || !['delivered', 'Completed'].includes(currentOrder.status)) && (
                    <div className="mb-6">
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handlePhotoSelect}
                        className="hidden"
                        id="photo-upload"
                        disabled={uploadingPhotos}
                      />
                      <label
                        htmlFor="photo-upload"
                        className={`group inline-flex items-center px-6 py-4 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all duration-300 ${
                          uploadingPhotos ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <svg className="w-6 h-6 mr-3 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        <span className="text-slate-600 group-hover:text-indigo-600 font-medium">
                          {uploadingPhotos ? 'Uploading...' : 'Add Photos'}
                        </span>
                      </label>
                    </div>
                  )}

                  {/* Selected Files Preview */}
                  {selectedFiles.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">Selected Files:</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Selected ${index + 1}`}
                              className="w-full h-24 object-cover rounded-lg border border-slate-200 shadow-sm group-hover:shadow-md transition-shadow duration-200"
                            />
                            <button
                              type="button"
                              onClick={() => removeSelectedPhoto(index)}
                              className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm transition-colors duration-200 shadow-lg"
                            >
                              ×
                            </button>
                            <p className="text-xs text-slate-500 mt-2 truncate">{file.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Uploaded Photos Display */}
                  {photoUrls.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">
                        {currentOrder ? 'Current Photos:' : 'Uploaded Photos:'}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {photoUrls.map((photo, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={photo.url || photo}
                              alt={`Inspiration ${index + 1}`}
                              className="w-full h-24 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-75 transition-opacity duration-200 shadow-sm group-hover:shadow-md"
                              onClick={() => window.open(photo.url || photo, '_blank')}
                            />
                            {(!currentOrder || !['delivered', 'Completed'].includes(currentOrder.status)) && (
                              <button
                                type="button"
                                onClick={() => removeUploadedPhoto(index, photo.url || photo)}
                                className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm transition-colors duration-200 shadow-lg"
                              >
                                ×
                              </button>
                            )}
                            <p className="text-xs text-slate-500 mt-2 truncate">
                              {photo.name || `Photo ${index + 1}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Photo Upload Guidelines */}
                  <div className="text-xs text-slate-500 space-y-1 bg-white/50 p-4 rounded-lg border border-slate-200/50">
                    <p>• Supported formats: JPG, PNG, GIF, WebP</p>
                    <p>• Maximum file size: 5MB per image</p>
                    <p>• Maximum 5 photos per order</p>
                    <p>• Click on uploaded photos to view them in full size</p>
                  </div>
                </div>

                {/* Enhanced Measurements Section */}
                <div className="border border-slate-200/50 rounded-2xl p-8 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-semibold text-slate-800">Measurements (inches)</h3>
                    {/* Saved Measurements Controls */}
                    <div className="flex items-center space-x-4">
                      {hasSavedMeasurements() && !currentOrder && (
                        <button
                          type="button"
                          onClick={loadSavedMeasurements}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-sm"
                        >
                          Use Saved Measurements
                        </button>
                      )}
                      {!currentOrder && (
                        <label className="flex items-center text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={rememberMeasurements}
                            onChange={(e) => setRememberMeasurements(e.target.checked)}
                            className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                          />
                          <span className="font-medium">Remember my measurements</span>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {Object.entries(orderForm.measurements).map(([key, value]) => (
                      <div key={key}>
                        <label className="block text-sm font-semibold text-slate-700 mb-2 capitalize">
                          {key} {['chest', 'waist', 'length'].includes(key) && <span className="text-red-500">*</span>}
                        </label>
                        <input
                          type="text"
                          name={`measurements.${key}`}
                          value={value}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200/50 bg-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300"
                          placeholder="0"
                          required={['chest', 'waist', 'length'].includes(key)}
                          disabled={currentOrder && ['delivered', 'Completed'].includes(currentOrder.status)}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Show saved measurements info */}
                  {hasSavedMeasurements() && (
                    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <div className="flex items-start">
                        <svg className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="text-sm text-blue-700">
                          <p className="font-semibold mb-1">You have saved measurements on file</p>
                          <p className="text-blue-600">
                            Chest: {customerInfo.savedMeasurements.chest || 'N/A'}", 
                            Waist: {customerInfo.savedMeasurements.waist || 'N/A'}", 
                            Length: {customerInfo.savedMeasurements.length || 'N/A'}"
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">Urgency</label>
                    <select
                      name="urgency"
                      value={orderForm.urgency}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200/50 bg-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300"
                      disabled={currentOrder && !['pending'].includes(currentOrder.status)}
                    >
                      <option value="urgent">Urgent (1 week) - +20% fee</option>
                      <option value="normal">Standard (2 weeks)</option>
                      <option value="relaxed">Relaxed (4 weeks) - 10% discount</option>
                    </select>
                  </div>
                  {currentOrder && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">Status</label>
                      <input
                        type="text"
                        value={displayStatus(orderForm.status)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200/50 bg-slate-50/50 text-slate-600"
                        disabled
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Special Instructions</label>
                  <textarea
                    name="specialInstructions"
                    value={orderForm.specialInstructions}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200/50 bg-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300"
                    rows="4"
                    placeholder="Any special styling preferences, notes for the tailor..."
                    disabled={currentOrder && ['delivered', 'Completed'].includes(currentOrder.status)}
                  ></textarea>
                </div>

                {/* Remember measurements confirmation */}
                {rememberMeasurements && !currentOrder && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
                    <div className="flex">
                      <svg className="h-5 w-5 text-emerald-500 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <div className="text-sm text-emerald-700">
                        <p className="font-semibold mb-1">Your measurements will be saved to your profile</p>
                        <p>This will make it easier to place future orders with the same measurements.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Photo upload status */}
                {uploadingPhotos && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <div className="flex">
                      <svg className="animate-spin h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <div className="text-sm text-blue-700">
                        <p className="font-semibold mb-1">Uploading photos...</p>
                        <p>Please wait while we upload your inspiration photos.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-4 pt-6 border-t border-slate-200/50">
                  <button
                    type="button"
                    onClick={closeOrderForm}
                    className="px-8 py-3 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 font-medium transition-all duration-200"
                  >
                    {currentOrder && ['delivered', 'Completed'].includes(currentOrder.status) ? 'Close' : 'Cancel'}
                  </button>
                  {(!currentOrder || !['delivered', 'Completed'].includes(currentOrder.status)) && (
                    <button
                      type="submit"
                      disabled={submitting || uploadingPhotos}
                      className="px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                    >
                      {submitting ? (
                        <div className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </div>
                      ) : (currentOrder ? 'Update Order' : 'Place Order')}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDashboard;