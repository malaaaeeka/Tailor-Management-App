import React, { useState, useEffect } from 'react';
import { auth, db, storage } from '../firebase-config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';

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

            // Fetch orders for this customer
            await fetchOrders(user.uid);
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

    return () => unsubscribe();
  }, [navigate]);

  const fetchOrders = async (userId) => {
    try {
      const ordersQuery = query(
        collection(db, 'orders'), 
        where('customerId', '==', userId)
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      const userOrders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('Fetched orders:', userOrders);
      setOrders(userOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const handleSignOut = async () => {
    try {
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
    updatedAt: serverTimestamp(), // Server timestamp for change detection
    lastModified: serverTimestamp(), // Additional timestamp
    modifiedBy: 'customer', // Flag to identify who made the change
    modificationReason: 'customer_edit' // Additional context
  };
  
  // Update due date if urgency changed
  if (orderForm.urgency !== currentOrder.urgency) {
    const deliveryDate = calculateDeliveryDate(orderForm.urgency);
    updateData.dueDate = Timestamp.fromDate(deliveryDate);
    updateData.expectedDelivery = deliveryDate.toISOString().split('T')[0];
  }
  
  await updateDoc(orderRef, updateData);
  
  console.log('Order updated with notification triggers'); // Debug log
  
  // Refresh orders after update
  await fetchOrders(user.uid);
        
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
    createdAt: serverTimestamp(), // Server timestamp for real-time detection
    updatedAt: serverTimestamp(),
    lastModified: serverTimestamp(),
    modifiedBy: 'customer',
    modificationReason: 'new_order',
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
  
  console.log('New order created with notification triggers'); // Debug log
  
  // Refresh orders after creation
  await fetchOrders(user.uid);
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
      'delivered': 'bg-green-100 text-green-800',
      'ready': 'bg-blue-100 text-blue-800',
      'in_progress': 'bg-purple-100 text-purple-800',
      'confirmed': 'bg-indigo-100 text-indigo-800',
      'pending': 'bg-yellow-100 text-yellow-800',
      'cancelled': 'bg-red-100 text-red-800',
      'Completed': 'bg-green-100 text-green-800',
      'In Progress': 'bg-blue-100 text-blue-800',
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Cancelled': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getProgressColor = (progress) => {
    if (progress >= 90) return 'bg-green-500';
    if (progress >= 50) return 'bg-blue-500';
    if (progress > 0) return 'bg-yellow-500';
    return 'bg-gray-300';
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-700 text-white p-6 shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">TailorEase Customer Portal</h1>
          <div className="flex items-center space-x-4">
            <span className="text-indigo-200">{customerInfo.name}</span>
            <button 
              onClick={handleSignOut}
              className="bg-white text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-50 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        {/* Dashboard Overview */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Welcome back, {customerInfo.name}
              </h2>
              <p className="text-gray-600">Manage your orders and measurements</p>
            </div>
            <button 
              onClick={() => openOrderForm()} 
              className="mt-4 md:mt-0 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg shadow-md transition flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              New Order
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="bg-indigo-50 p-4 rounded-lg">
              <h3 className="text-gray-600 text-sm font-medium">Total Orders</h3>
              <p className="text-3xl font-bold text-indigo-700">{orders.length}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="text-gray-600 text-sm font-medium">Completed</h3>
              <p className="text-3xl font-bold text-green-700">
                {orders.filter(o => ['delivered', 'Completed'].includes(o.status)).length}
              </p>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-gray-600 text-sm font-medium">In Progress</h3>
              <p className="text-3xl font-bold text-blue-700">
                {orders.filter(o => ['in_progress', 'confirmed', 'ready', 'In Progress'].includes(o.status)).length}
              </p>
            </div>
          </div>
        </div>

        {/* Orders Section */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-800">My Orders</h3>
            <div className="flex space-x-2">
              <button 
                onClick={() => setActiveTab('all')} 
                className={`px-4 py-2 text-sm rounded ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                All Orders
              </button>
              <button 
                onClick={() => setActiveTab('active')} 
                className={`px-4 py-2 text-sm rounded ${activeTab === 'active' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Active
              </button>
              <button 
                onClick={() => setActiveTab('completed')} 
                className={`px-4 py-2 text-sm rounded ${activeTab === 'completed' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Completed
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filterOrders().length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg">No orders found.</p>
                <p>Click "New Order" to place your first order.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Garment</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filterOrders().map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{order.id.substring(0, 8)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.garmentType}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                          {displayStatus(order.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${getProgressColor(order.progress)}`}
                            style={{ width: `${order.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500 mt-1 block">{order.progress}%</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(order.dueDate || order.expectedDelivery)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${order.price || order.totalAmount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button 
                          onClick={() => openOrderForm(order)}
                          className="text-indigo-600 hover:text-indigo-900 mr-3"
                          disabled={['delivered', 'Completed'].includes(order.status)}
                        >
                          {['delivered', 'Completed'].includes(order.status) ? 'View' : 'Edit'}
                        </button>
                        {order.status === 'pending' && (
                          <button className="text-red-600 hover:text-red-900">
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

      {/* Order Form Modal */}
      {showOrderForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {currentOrder ? (['delivered', 'Completed'].includes(currentOrder.status) ? 'View Order' : 'Edit Order') : 'Create New Order'}
                </h2>
                <button 
                  onClick={closeOrderForm}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleOrderSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Garment Type *</label>
                    <select
                      name="garmentType"
                      value={orderForm.garmentType}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fabric Preference</label>
                    <input
                      type="text"
                      name="fabric"
                      value={orderForm.fabric}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g., Silk, Wool, Cotton"
                      disabled={currentOrder && ['delivered', 'Completed'].includes(currentOrder.status)}
                    />
                  </div>
                </div>

                {/* Inspiration Photos Section */}
                <div className="border-t border-b border-gray-200 py-6">
                  <h3 className="text-lg font-medium text-gray-800 mb-4">Inspiration Photos</h3>
                  <p className="text-sm text-gray-600 mb-4">Upload reference images to help your tailor understand your vision (up to 5 photos, max 5MB each)</p>
                  
                  {/* Photo Upload Input */}
                  {(!currentOrder || !['delivered', 'Completed'].includes(currentOrder.status)) && (
                    <div className="mb-4">
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
                        className={`inline-flex items-center px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition ${
                          uploadingPhotos ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        {uploadingPhotos ? 'Uploading...' : 'Add Photos'}
                      </label>
                    </div>
                  )}

                  {/* Selected Files Preview */}
                  {selectedFiles.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Files:</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="relative">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Selected ${index + 1}`}
                              className="w-full h-20 object-cover rounded-lg border"
                            />
                            <button
                              type="button"
                              onClick={() => removeSelectedPhoto(index)}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                            >
                              ×
                            </button>
                            <p className="text-xs text-gray-500 mt-1 truncate">{file.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Uploaded Photos Display */}
                  {photoUrls.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        {currentOrder ? 'Current Photos:' : 'Uploaded Photos:'}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        {photoUrls.map((photo, index) => (
                          <div key={index} className="relative">
                            <img
                              src={photo.url || photo}
                              alt={`Inspiration ${index + 1}`}
                              className="w-full h-20 object-cover rounded-lg border cursor-pointer hover:opacity-75 transition"
                              onClick={() => window.open(photo.url || photo, '_blank')}
                            />
                            {(!currentOrder || !['delivered', 'Completed'].includes(currentOrder.status)) && (
                              <button
                                type="button"
                                onClick={() => removeUploadedPhoto(index, photo.url || photo)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                              >
                                ×
                              </button>
                            )}
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {photo.name || `Photo ${index + 1}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Photo Upload Guidelines */}
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>• Supported formats: JPG, PNG, GIF, WebP</p>
                    <p>• Maximum file size: 5MB per image</p>
                    <p>• Maximum 5 photos per order</p>
                    <p>• Click on uploaded photos to view them in full size</p>
                  </div>
                </div>

                <div className="border-t border-b border-gray-200 py-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-800">Measurements (inches)</h3>
                    {/* Saved Measurements Controls */}
                    <div className="flex items-center space-x-3">
                      {hasSavedMeasurements() && !currentOrder && (
                        <button
                          type="button"
                          onClick={loadSavedMeasurements}
                          className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-md hover:bg-blue-100 transition"
                        >
                          Use Saved Measurements
                        </button>
                      )}
                      {!currentOrder && (
                        <label className="flex items-center text-sm text-gray-600">
                          <input
                            type="checkbox"
                            checked={rememberMeasurements}
                            onChange={(e) => setRememberMeasurements(e.target.checked)}
                            className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          Remember my measurements
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(orderForm.measurements).map(([key, value]) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                          {key} {['chest', 'waist', 'length'].includes(key) && '*'}
                        </label>
                        <input
                          type="text"
                          name={`measurements.${key}`}
                          value={value}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="0"
                          required={['chest', 'waist', 'length'].includes(key)}
                          disabled={currentOrder && ['delivered', 'Completed'].includes(currentOrder.status)}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Show saved measurements info */}
                  {hasSavedMeasurements() && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-md">
                      <div className="flex items-start">
                        <svg className="h-4 w-4 text-blue-400 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="text-sm text-blue-700">
                          <p className="font-medium">You have saved measurements on file</p>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
                    <select
                      name="urgency"
                      value={orderForm.urgency}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      disabled={currentOrder && !['pending'].includes(currentOrder.status)}
                    >
                      <option value="urgent">Urgent (1 week) - +20% fee</option>
                      <option value="normal">Standard (2 weeks)</option>
                      <option value="relaxed">Relaxed (4 weeks) - 10% discount</option>
                    </select>
                  </div>
                  {currentOrder && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <input
                        type="text"
                        value={displayStatus(orderForm.status)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                        disabled
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                  <textarea
                    name="specialInstructions"
                    value={orderForm.specialInstructions}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows="3"
                    placeholder="Any special styling preferences, notes for the tailor..."
                    disabled={currentOrder && ['delivered', 'Completed'].includes(currentOrder.status)}
                  ></textarea>
                </div>

                {/* Remember measurements confirmation */}
                {rememberMeasurements && !currentOrder && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-4">
                    <div className="flex">
                      <svg className="h-4 w-4 text-green-400 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <div className="text-sm text-green-700">
                        <p className="font-medium">Your measurements will be saved to your profile</p>
                        <p>This will make it easier to place future orders with the same measurements.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Photo upload status */}
                {uploadingPhotos && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <div className="flex">
                      <svg className="animate-spin h-4 w-4 text-blue-400 mt-0.5 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <div className="text-sm text-blue-700">
                        <p className="font-medium">Uploading photos...</p>
                        <p>Please wait while we upload your inspiration photos.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={closeOrderForm}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    {currentOrder && ['delivered', 'Completed'].includes(currentOrder.status) ? 'Close' : 'Cancel'}
                  </button>
                  {(!currentOrder || !['delivered', 'Completed'].includes(currentOrder.status)) && (
                    <button
                      type="submit"
                      disabled={submitting || uploadingPhotos}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {submitting ? 'Saving...' : (currentOrder ? 'Update Order' : 'Place Order')}
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