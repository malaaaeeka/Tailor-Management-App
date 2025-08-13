import React, { useState, useEffect, useRef } from 'react';
import { User, ShoppingBag, Calendar, DollarSign, TrendingUp, Bell, Settings, LogOut, Eye, Edit, Check, X, ChevronLeft, ChevronRight, Image, ZoomIn, AlertCircle } from 'lucide-react';
import { auth, db } from '../firebase-config';
import { doc, getDoc, collection, getDocs, updateDoc, query, orderBy, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

const TailorDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [userInfo, setUserInfo] = useState({
    name: 'Loading...',
    businessName: '',
    email: ''
  });
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderFilter, setOrderFilter] = useState('all');
  
  // Notification states
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastChecked, setLastChecked] = useState(new Date());
  const [notifiedDueDates, setNotifiedDueDates] = useState(new Set());
  const [dueDateWarningDays, setDueDateWarningDays] = useState(2);
  
  // Photo viewing states
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [showDayModal, setShowDayModal] = useState(false);
  
  const navigate = useNavigate();
  
  // Use refs to track cleanup functions
  const unsubscribeRef = useRef(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        setLoading(true);
        
        // Check if user is authenticated
        const user = auth.currentUser;
        if (!user) {
          navigate('/login');
          return;
        }

        // Fetch user info first
        await fetchUserInfo(user);
        
        // Fetch customers
        await fetchCustomers();
        
        // Set up orders listener
        setupOrderListener();
        
      } catch (error) {
        console.error('Error initializing dashboard:', error);
        // Set fallback user info
        setUserInfo({
          name: 'Tailor',
          businessName: '',
          email: auth.currentUser?.email || ''
        });
      } finally {
        setLoading(false);
      }
    };

    initializeDashboard();
    
    // Cleanup function
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []); // Empty dependency array

  const fetchUserInfo = async (user) => {
    try {
      const tailorDoc = await getDoc(doc(db, 'tailors', user.uid));
      if (tailorDoc.exists()) {
        const tailorData = tailorDoc.data();
        setUserInfo({
          name: tailorData.name || 'Tailor',
          businessName: tailorData.businessName || '',
          email: tailorData.email || user.email
        });
      } else {
        setUserInfo({
          name: user.displayName || 'Tailor',
          businessName: '',
          email: user.email
        });
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw error;
    }
  };

  const fetchCustomers = async () => {
    try {
      const customersSnapshot = await getDocs(collection(db, 'customers'));
      const allCustomers = customersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCustomers(allCustomers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      // Continue with empty customers array
      setCustomers([]);
    }
  };

  const setupOrderListener = () => {
    try {
      // Clean up existing listener if any
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(ordersQuery, 
        (snapshot) => {
          try {
            const newNotifications = [];
            const existingOrdersMap = new Map(orders.map(order => [order.id, order]));
            
            const allOrders = snapshot.docs.map(doc => {
              const data = doc.data();
              const orderId = doc.id;
              return {
                id: orderId,
                ...data
              };
            });

            // Only process notifications after initial load
            if (!isInitialLoadRef.current) {
              allOrders.forEach(orderData => {
                const orderId = orderData.id;
                const existingOrder = existingOrdersMap.get(orderId);
                
                if (!existingOrder) {
                  // New order notification
                  newNotifications.push({
                    id: `new-order-${orderId}-${Date.now()}`,
                    type: 'new_order',
                    title: 'New Order Received',
                    message: `New order from ${orderData.customerName || 'Customer'} - ${orderData.garmentType || 'Custom order'}`,
                    orderId: orderId,
                    timestamp: new Date(),
                    read: false
                  });
                } else {
                  // Check for updates
                  const existingUpdatedAt = getTimestamp(existingOrder.updatedAt);
                  const newUpdatedAt = getTimestamp(orderData.updatedAt);
                  const existingLastModified = getTimestamp(existingOrder.lastModified);
                  const newLastModified = getTimestamp(orderData.lastModified);
                  
                  const wasUpdated = (newUpdatedAt > existingUpdatedAt) || 
                                   (newLastModified > existingLastModified);
                  
                  const wasModifiedByCustomer = orderData.modifiedBy === 'customer';
                  
                  if (wasUpdated && wasModifiedByCustomer) {
                    newNotifications.push({
                      id: `updated-order-${orderId}-${Date.now()}`,
                      type: 'order_updated',
                      title: 'Order Updated',
                      message: `${orderData.customerName || 'Customer'} updated their order - ${orderData.garmentType || 'Custom order'}`,
                      orderId: orderId,
                      timestamp: new Date(),
                      read: false
                    });
                  }
                }
              });

              // Check for due date notifications
              checkDueDateNotifications(allOrders, newNotifications);
            }

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
            
            // Mark initial load as complete
            isInitialLoadRef.current = false;
            
          } catch (snapshotError) {
            console.error('Error processing snapshot:', snapshotError);
          }
        },
        (error) => {
          console.error('Orders listener error:', error);
          // Try to reconnect after a delay
          setTimeout(() => {
            if (auth.currentUser) {
              setupOrderListener();
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

  const checkDueDateNotifications = (allOrders, newNotifications) => {
    const today = new Date();
    const warningDate = new Date(today);
    warningDate.setDate(today.getDate() + dueDateWarningDays);
    
    allOrders.forEach(order => {
      if (['delivered', 'cancelled'].includes(order.status)) return;
      if (notifiedDueDates.has(order.id)) return;
      
      let dueDate;
      if (order.dueDate?.toDate) {
        dueDate = order.dueDate.toDate();
      } else if (typeof order.dueDate === 'string') {
        dueDate = new Date(order.dueDate);
      } else if (order.dueDate instanceof Date) {
        dueDate = order.dueDate;
      } else if (order.expectedDelivery) {
        dueDate = new Date(order.expectedDelivery);
      }
      
      if (dueDate && !isNaN(dueDate.getTime())) {
        const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= dueDateWarningDays && daysDiff >= 0) {
          const isUrgent = daysDiff <= 1;
          
          newNotifications.push({
            id: `due-soon-${order.id}-${Date.now()}`,
            type: 'due_soon',
            title: isUrgent ? 'Order Due Tomorrow!' : 'Order Due Soon',
            message: `${order.customerName || 'Customer'}'s order is due ${
              daysDiff === 0 ? 'today' : 
              daysDiff === 1 ? 'tomorrow' : 
              `in ${daysDiff} days`
            } - ${order.garmentType || 'Custom order'}`,
            orderId: order.id,
            timestamp: new Date(),
            read: false,
            urgent: isUrgent
          });
          
          setNotifiedDueDates(prev => new Set([...prev, order.id]));
        }
      }
    });
  };

  const getTimestamp = (timestamp) => {
    if (!timestamp) return 0;
    
    if (timestamp.seconds) {
      return timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1000000);
    }
    
    if (timestamp.getTime) {
      return timestamp.getTime();
    }
    
    if (typeof timestamp === 'number') {
      return timestamp;
    }
    
    if (typeof timestamp === 'string') {
      return new Date(timestamp).getTime();
    }
    
    return 0;
  };

  // Request notification permission on component mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Auth state change listener
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      }
    });

    return () => unsubscribeAuth();
  }, [navigate]);

  const handleLogout = async () => {
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

  const handleUpdateOrderStatus = async (orderId, newStatus, newProgress = null) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const updateData = { 
        status: newStatus,
        updatedAt: serverTimestamp(),
        modifiedBy: 'tailor',
        modificationReason: 'status_update'
      };
      
      if (newProgress !== null) {
        updateData.progress = newProgress;
      }

      // Set progress based on status
      if (newStatus === 'pending') updateData.progress = 0;
      else if (newStatus === 'confirmed') updateData.progress = 10;
      else if (newStatus === 'in_progress') updateData.progress = newProgress || 50;
      else if (newStatus === 'ready') updateData.progress = 90;
      else if (newStatus === 'delivered') updateData.progress = 100;
      else if (newStatus === 'cancelled') updateData.progress = 0;
      
      await updateDoc(orderRef, updateData);
      
      // Clean up due date notifications for completed/cancelled orders
      if (['delivered', 'cancelled'].includes(newStatus)) {
        setNotifiedDueDates(prev => {
          const newSet = new Set(prev);
          newSet.delete(orderId);
          return newSet;
        });
      }
      
      // Update selected order if it's currently open
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, ...updateData });
      }
    } catch (error) {
      console.error('Error updating order:', error);
      alert('Failed to update order status');
    }
  };

  const handleUpdateOrderProgress = async (orderId, progress) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const updateData = {
        progress: parseInt(progress),
        updatedAt: serverTimestamp(),
        modifiedBy: 'tailor',
        modificationReason: 'progress_update'
      };
      
      await updateDoc(orderRef, updateData);
      
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, progress: parseInt(progress) });
      }
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

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
        setSelectedOrder(order);
        setShowOrderModal(true);
        setActiveTab('orders');
        setShowNotifications(false);
      }
    }
  };

  const openPhotoModal = (photo) => {
    setSelectedPhoto(photo);
    setShowPhotoModal(true);
  };

  const closePhotoModal = () => {
    setSelectedPhoto(null);
    setShowPhotoModal(false);
  };

  const getInspirationPhotos = (order) => {
    if (!order.inspirationPhotos) return [];
    
    if (Array.isArray(order.inspirationPhotos)) {
      return order.inspirationPhotos.map(photo => {
        if (typeof photo === 'object' && photo.url) {
          return photo;
        }
        if (typeof photo === 'string') {
          return {
            url: photo,
            name: 'Inspiration Photo',
            uploadedAt: null
          };
        }
        return null;
      }).filter(photo => photo !== null);
    }
    
    return [];
  };

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const isSameDay = (date1, date2) => {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  };

  const getOrdersForDate = (date) => {
    return orders.filter(order => {
      if (!order.dueDate) return false;
      
      let dueDate;
      if (order.dueDate.toDate) {
        dueDate = order.dueDate.toDate();
      }
      else if (typeof order.dueDate === 'string') {
        dueDate = new Date(order.dueDate);
      }
      else if (order.dueDate instanceof Date) {
        dueDate = order.dueDate;
      }
      else if (order.expectedDelivery) {
        dueDate = new Date(order.expectedDelivery);
      }
      else {
        return false;
      }
      
      return isSameDay(date, dueDate);
    });
  };

  const isToday = (date) => {
    return isSameDay(date, new Date());
  };

  const isPastDue = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': 'bg-yellow-100 text-yellow-800',
      'confirmed': 'bg-blue-100 text-blue-800',
      'in_progress': 'bg-purple-100 text-purple-800',
      'ready': 'bg-green-100 text-green-800',
      'delivered': 'bg-gray-100 text-gray-800',
      'cancelled': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getProgressColor = (progress) => {
    if (progress >= 80) return 'bg-green-500';
    if (progress >= 50) return 'bg-blue-500';
    if (progress >= 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const filteredOrders = orders.filter(order => {
    if (orderFilter === 'all') return true;
    return order.status === orderFilter;
  });

  const totalRevenue = orders
    .filter(order => order.status === 'delivered')
    .reduce((sum, order) => sum + (order.totalAmount || order.price || 0), 0);

  const pendingOrders = orders.filter(order => order.status === 'pending').length;
  const inProgressOrders = orders.filter(order => ['confirmed', 'in_progress'].includes(order.status)).length;
  const completedOrders = orders.filter(order => order.status === 'delivered').length;

  const formatOrderDate = (dateValue) => {
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

  const NotificationDropdown = () => {
    if (!showNotifications) return null;

    return (
      <div className="absolute right-0 top-12 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
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
                      {notification.type === 'new_order' ? (
                        <ShoppingBag className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                      ) : notification.type === 'due_soon' ? (
                        <AlertCircle className={`h-4 w-4 mr-2 mt-0.5 ${notification.urgent ? 'text-red-500' : 'text-orange-500'}`} />
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

  const PhotoModal = () => {
    if (!showPhotoModal || !selectedPhoto) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
        <div className="relative max-w-4xl max-h-full">
          <button 
            onClick={closePhotoModal}
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
          >
            <X size={32} />
          </button>
          
          <img
            src={selectedPhoto.url || selectedPhoto}
            alt={selectedPhoto.name || "Inspiration photo"}
            className="max-w-full max-h-full object-contain rounded-lg"
            onError={(e) => {
              console.error('Error loading image:', selectedPhoto);
              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9IiNmNWY1ZjUiLz4KPHBhdGggZD0ibTkgOSA1IDEyIDMtOCIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8Y2lyY2xlIGN4PSI5IiBjeT0iOSIgcj0iMiIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+';
              e.target.alt = 'Image failed to load';
            }}
          />
          
          {selectedPhoto.name && (
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 text-white px-3 py-2 rounded-lg">
              <p className="text-sm">{selectedPhoto.name}</p>
              {selectedPhoto.uploadedAt && (
                <p className="text-xs text-gray-300">
                  Uploaded: {new Date(selectedPhoto.uploadedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const DayModal = () => {
    if (!showDayModal || !selectedDate) return null;

    const dayOrders = getOrdersForDate(selectedDate);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold">
                Orders for {formatDate(selectedDate)}
              </h3>
              <button 
                onClick={() => setShowDayModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
          </div>
          
          <div className="p-6">
            {dayOrders.length > 0 ? (
              <div className="space-y-4">
                {dayOrders.map((order) => {
                  const customer = customers.find(c => c.id === order.customerId) || 
                                 { name: order.customerName, phone: order.customerPhone };
                  const inspirationPhotos = getInspirationPhotos(order);
                  return (
                    <div key={order.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {customer.name || 'Unknown Customer'}
                          </h4>
                          <p className="text-sm text-gray-600 flex items-center">
                            Order #{order.id?.slice(-8)}
                            {inspirationPhotos.length > 0 && (
                              <span className="ml-2 inline-flex items-center text-xs text-blue-600">
                                <Image className="h-3 w-3 mr-1" />
                                {inspirationPhotos.length} photo{inspirationPhotos.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                          {order.status?.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p><strong>Amount:</strong> ${order.totalAmount || order.price || 0}</p>
                          <p><strong>Progress:</strong> {order.progress || 0}%</p>
                        </div>
                        <div>
                          <p><strong>Phone:</strong> {customer.phone || 'N/A'}</p>
                          <p><strong>Garment:</strong> {order.garmentType || (order.items?.[0]?.garmentType) || 'N/A'}</p>
                        </div>
                      </div>
                      
                      <div className="mt-3 flex space-x-2">
                        <button
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowDayModal(false);
                            setShowOrderModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-gray-500">No orders due on this date</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const OrderModal = () => {
    if (!showOrderModal || !selectedOrder) return null;

    const customer = customers.find(c => c.id === selectedOrder.customerId) || 
                    { 
                      name: selectedOrder.customerName, 
                      phone: selectedOrder.customerPhone, 
                      email: selectedOrder.customerEmail 
                    };

    const inspirationPhotos = getInspirationPhotos(selectedOrder);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[95vh] overflow-y-auto m-4">
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold">Order Details - #{selectedOrder.id?.slice(-8)}</h3>
              <button 
                onClick={() => setShowOrderModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Customer Information</h4>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p><strong>Name:</strong> {customer.name || 'N/A'}</p>
                <p><strong>Phone:</strong> {customer.phone || 'N/A'}</p>
                <p><strong>Email:</strong> {customer.email || 'N/A'}</p>
                <p><strong>Address:</strong> {customer.address || 'N/A'}</p>
              </div>
            </div>

            {inspirationPhotos.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                  <Image className="h-5 w-5 mr-2" />
                  Customer Inspiration Photos ({inspirationPhotos.length})
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {inspirationPhotos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer">
                        <img
                          src={photo.url || photo}
                          alt={photo.name || `Inspiration ${index + 1}`}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          onClick={() => openPhotoModal(photo)}
                          onError={(e) => {
                            console.error('Error loading thumbnail:', photo);
                            e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9IiNmNWY1ZjUiLz4KPHBhdGggZD0ibTkgOSA1IDEyIDMtOCIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8Y2lyY2xlIGN4PSI5IiBjeT0iOSIgcj0iMiIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+';
                            e.target.alt = 'Image failed to load';
                          }}
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                          <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={24} />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 truncate">
                        {photo.name || `Photo ${index + 1}`}
                      </p>
                      {photo.uploadedAt && (
                        <p className="text-xs text-gray-400">
                          {new Date(photo.uploadedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Click on any photo to view it in full size
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Order Status</h4>
                <select 
                  value={selectedOrder.status}
                  onChange={(e) => handleUpdateOrderStatus(selectedOrder.id, e.target.value)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="ready">Ready</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Progress (%)</h4>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={selectedOrder.progress || 0}
                  onChange={(e) => handleUpdateOrderProgress(selectedOrder.id, e.target.value)}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Order Details</h4>
              <div className="space-y-2">
                {selectedOrder.items?.length > 0 ? (
                  selectedOrder.items.map((item, index) => (
                    <div key={index} className="bg-gray-50 p-3 rounded-lg flex justify-between">
                      <div>
                        <p className="font-medium">{item.garmentType}</p>
                        <p className="text-sm text-gray-600">Quantity: {item.quantity || 1}</p>
                      </div>
                      <p className="font-medium">${item.price}</p>
                    </div>
                  ))
                ) : (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="font-medium">{selectedOrder.garmentType || 'Custom Order'}</p>
                    <p className="text-sm text-gray-600">Quantity: 1</p>
                    <p className="text-sm text-gray-600">Price: ${selectedOrder.totalAmount || selectedOrder.price || 0}</p>
                  </div>
                )}
              </div>
            </div>

            {selectedOrder.measurements && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Measurements</h4>
                <div className="bg-gray-50 p-4 rounded-lg grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(selectedOrder.measurements).map(([key, value]) => (
                    value && <p key={key}><strong>{key}:</strong> {value}"</p>
                  ))}
                </div>
              </div>
            )}

            {(selectedOrder.fabric || selectedOrder.specialInstructions) && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Additional Details</h4>
                <div className="bg-gray-50 p-4 rounded-lg text-sm space-y-2">
                  {selectedOrder.fabric && <p><strong>Fabric:</strong> {selectedOrder.fabric}</p>}
                  {selectedOrder.specialInstructions && (
                    <p><strong>Special Instructions:</strong> {selectedOrder.specialInstructions}</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p><strong>Order Date:</strong> {formatOrderDate(selectedOrder.createdAt)}</p>
                <p><strong>Due Date:</strong> {formatOrderDate(selectedOrder.dueDate || selectedOrder.expectedDelivery)}</p>
              </div>
              <div>
                <p><strong>Total Amount:</strong> ${selectedOrder.totalAmount || selectedOrder.price || 0}</p>
                <p><strong>Urgency:</strong> {selectedOrder.urgency || 'Normal'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <User className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{userInfo.name}</h1>
                {userInfo.businessName && (
                  <p className="text-sm text-gray-500">{userInfo.businessName}</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <button
                  onClick={toggleNotifications}
                  className="h-6 w-6 text-gray-400 cursor-pointer hover:text-gray-600 relative"
                >
                  <Bell size={24} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <NotificationDropdown />
              </div>
              <Settings className="h-6 w-6 text-gray-400 cursor-pointer hover:text-gray-600" />
              <button
                onClick={handleLogout}
                className="flex items-center text-red-600 hover:text-red-800"
              >
                <LogOut className="h-5 w-5 mr-1" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', name: 'Overview', icon: TrendingUp },
              { id: 'orders', name: 'Orders', icon: ShoppingBag },
              { id: 'customers', name: 'Customers', icon: User },
              { id: 'calendar', name: 'Calendar', icon: Calendar }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ShoppingBag className="h-8 w-8 text-yellow-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Pending Orders</dt>
                      <dd className="text-lg font-medium text-gray-900">{pendingOrders}</dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <TrendingUp className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">In Progress</dt>
                      <dd className="text-lg font-medium text-gray-900">{inProgressOrders}</dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Check className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                      <dd className="text-lg font-medium text-gray-900">{completedOrders}</dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <DollarSign className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Revenue</dt>
                      <dd className="text-lg font-medium text-gray-900">${totalRevenue}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Recent Orders</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {orders.slice(0, 5).map((order) => {
                  const customer = customers.find(c => c.id === order.customerId) || 
                                 { name: order.customerName };
                  return (
                    <div key={order.id} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {customer.name || 'Unknown Customer'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {order.garmentType || (order.items?.[0]?.garmentType) || 'Custom order'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                            {order.status?.replace('_', ' ')}
                          </span>
                          <p className="text-sm font-medium text-gray-900">
                            ${order.totalAmount || order.price || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">Orders</h3>
                  <select
                    value={orderFilter}
                    onChange={(e) => setOrderFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="all">All Orders</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="in_progress">In Progress</option>
                    <option value="ready">Ready</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="divide-y divide-gray-200">
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((order) => {
                    const customer = customers.find(c => c.id === order.customerId) || 
                                   { name: order.customerName, phone: order.customerPhone };
                    const inspirationPhotos = getInspirationPhotos(order);
                    return (
                      <div key={order.id} className="px-6 py-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div>
                              <p className="text-sm font-medium text-gray-900 flex items-center">
                                {customer.name || 'Unknown Customer'}
                                {inspirationPhotos.length > 0 && (
                                  <span className="ml-2 inline-flex items-center text-xs text-blue-600">
                                    <Image className="h-3 w-3 mr-1" />
                                    {inspirationPhotos.length}
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-gray-500">
                                {order.garmentType || (order.items?.[0]?.garmentType) || 'Custom order'}
                              </p>
                              <p className="text-xs text-gray-400">
                                Order #{order.id?.slice(-8)} • {formatOrderDate(order.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-900">
                                ${order.totalAmount || order.price || 0}
                              </p>
                              <div className="flex items-center space-x-2">
                                <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                                  {order.status?.replace('_', ' ')}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {order.progress || 0}%
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedOrder(order);
                                setShowOrderModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <Eye size={16} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${getProgressColor(order.progress || 0)}`}
                              style={{ width: `${order.progress || 0}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-6 py-12 text-center">
                    <ShoppingBag className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No orders</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {orderFilter === 'all' ? 'No orders found.' : `No ${orderFilter.replace('_', ' ')} orders found.`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Customers</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {customers.length > 0 ? (
                customers.map((customer) => {
                  const customerOrders = orders.filter(order => order.customerId === customer.id);
                  const totalSpent = customerOrders
                    .filter(order => order.status === 'delivered')
                    .reduce((sum, order) => sum + (order.totalAmount || order.price || 0), 0);
                  
                  return (
                    <div key={customer.id} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{customer.name}</p>
                          <p className="text-sm text-gray-500">{customer.phone || 'No phone'}</p>
                          <p className="text-xs text-gray-400">{customer.email || 'No email'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            {customerOrders.length} order{customerOrders.length !== 1 ? 's' : ''}
                          </p>
                          <p className="text-sm text-gray-500">Total: ${totalSpent}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-6 py-12 text-center">
                  <User className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No customers</h3>
                  <p className="mt-1 text-sm text-gray-500">Customers will appear here once you receive orders.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => navigateMonth(-1)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => navigateMonth(1)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="bg-gray-50 py-2 px-3 text-center text-sm font-medium text-gray-500">
                    {day}
                  </div>
                ))}
                
                {Array.from({ length: getFirstDayOfMonth(currentDate) }, (_, i) => (
                  <div key={`empty-${i}`} className="bg-white p-2 h-24"></div>
                ))}
                
                {Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => {
                  const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1);
                  const dayOrders = getOrdersForDate(date);
                  const isCurrentDay = isToday(date);
                  const hasPastDueOrders = dayOrders.some(order => 
                    ['pending', 'confirmed', 'in_progress'].includes(order.status) && isPastDue(date)
                  );
                  
                  return (
                    <div
                      key={i + 1}
                      className={`bg-white p-2 h-24 border-b border-r cursor-pointer hover:bg-gray-50 ${
                        isCurrentDay ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        setSelectedDate(date);
                        setShowDayModal(true);
                      }}
                    >
                      <div className={`text-sm font-medium mb-1 ${
                        isCurrentDay ? 'text-blue-600' : 'text-gray-900'
                      } ${hasPastDueOrders ? 'text-red-600' : ''}`}>
                        {i + 1}
                      </div>
                      <div className="space-y-1">
                        {dayOrders.slice(0, 2).map(order => (
                          <div
                            key={order.id}
                            className={`text-xs p-1 rounded truncate ${
                              ['pending', 'confirmed', 'in_progress'].includes(order.status) && isPastDue(date)
                                ? 'bg-red-100 text-red-800'
                                : getStatusColor(order.status)
                            }`}
                          >
                            {order.customerName?.split(' ')[0] || 'Customer'}
                          </div>
                        ))}
                        {dayOrders.length > 2 && (
                          <div className="text-xs text-gray-500">
                            +{dayOrders.length - 2} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      <OrderModal />
      <DayModal />
      <PhotoModal />
    </div>
  );
};

export default TailorDashboard;