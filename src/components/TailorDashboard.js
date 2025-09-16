import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, ShoppingBag, Calendar, DollarSign, TrendingUp, Bell, LogOut, Eye, Edit, Check, X, ChevronLeft, ChevronRight, Image, ZoomIn, AlertCircle, Plus } from 'lucide-react';
import { auth, db } from '../firebase-config';
import { doc, getDoc, collection, getDocs, updateDoc, query, orderBy, where, serverTimestamp, onSnapshot, addDoc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { sendOrderReadyEmail, sendOrderDeliveredEmail } from '../emailService.js';

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

// Status Badge Component
const StatusBadge = ({ status }) => {
  const statusConfig = {
    pending: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Pending' },
    confirmed: { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Confirmed' },
    in_progress: { color: 'bg-purple-100 text-purple-800 border-purple-200', label: 'In Progress' },
    ready: { color: 'bg-green-100 text-green-800 border-green-200', label: 'Ready' },
    delivered: { color: 'bg-gray-100 text-gray-800 border-gray-200', label: 'Delivered' },
    cancelled: { color: 'bg-red-100 text-red-800 border-red-200', label: 'Cancelled' }
  };
  
  const config = statusConfig[status] || statusConfig.pending;
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      <div className="w-2 h-2 rounded-full bg-current mr-1.5 opacity-75"></div>
      {config.label}
    </span>
  );
};

// Progress Ring Component
const ProgressRing = ({ progress = 0, size = 'md' }) => {
  const sizeConfig = {
    sm: { outer: 'w-8 h-8', inner: 'w-6 h-6', text: 'text-xs' },
    md: { outer: 'w-12 h-12', inner: 'w-10 h-10', text: 'text-sm' }
  };
  
  const config = sizeConfig[size];
  const circumference = 2 * Math.PI * 16;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  return (
    <div className={`relative ${config.outer}`}>
      <svg className="transform -rotate-90 w-full h-full">
        <circle
          cx="50%"
          cy="50%"
          r="16"
          fill="transparent"
          stroke="#e5e7eb"
          strokeWidth="3"
        />
        <circle
          cx="50%"
          cy="50%"
          r="16"
          fill="transparent"
          stroke="#3b82f6"
          strokeWidth="3"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500 ease-in-out"
        />
      </svg>
    </div>
  );
};

  // Add this complete component before the TailorDashboard
const ManualOrderModal = ({ 
  showManualOrderModal, 
  setShowManualOrderModal,
  manualOrderForm,
  setManualOrderForm,
  selectedCategory,
  setSelectedCategory,
  handleSubmitOrder,
  measurementCategories,
  handleCategoryChange,
  handleMeasurementChange,
  customCategories,
  handleDeleteCustomCategory
}) => {
  if (!showManualOrderModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl sm:rounded-2xl max-w-sm sm:max-w-2xl lg:max-w-4xl w-full max-h-[95vh] overflow-y-auto mx-2 sm:m-4">
        <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-bold text-gray-900">Create New Order</h3>
            <button onClick={() => setShowManualOrderModal(false)} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmitOrder} className="p-6 space-y-6" key="manual-order-form">
          {/* Customer Information */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl">
            <h4 className="font-semibold text-gray-900 mb-4">Customer Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Customer Name"
                value={manualOrderForm.customerName}
                onChange={(e) => setManualOrderForm(prev => ({ ...prev, customerName: e.target.value }))}
                className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
      type="tel"
      placeholder="Phone Number"
      value={manualOrderForm.customerPhone}
      onChange={(e) => setManualOrderForm(prev => ({ ...prev, customerPhone: e.target.value }))}
      onBlur={async (e) => {
        const phone = e.target.value;
        if (phone.length >= 10 && selectedCategory) {
          const existingData = await getCustomerMeasurements(phone, selectedCategory);
          if (existingData) {
            setManualOrderForm(prev => ({
              ...prev,
              measurements: existingData.measurements,
              customerName: existingData.customerName || prev.customerName
            }));
            alert('Previous measurements loaded!');
          }
        }
      }}
      className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
      required
    />
    
              <input
                type="email"
                placeholder="Email (Optional)"
                value={manualOrderForm.customerEmail}
                onChange={(e) => setManualOrderForm(prev => ({ ...prev, customerEmail: e.target.value }))}
                className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Address (Optional)"
                value={manualOrderForm.customerAddress}
                onChange={(e) => setManualOrderForm(prev => ({ ...prev, customerAddress: e.target.value }))}
                className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Garment Category Selection */}
          <div className="bg-gradient-to-r from-green-50 to-teal-50 p-6 rounded-xl">
            <h4 className="font-semibold text-gray-900 mb-4">Select Garment Category</h4>
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
  {[
    ...Object.entries(measurementCategories).filter(([key]) => key !== 'add'),
    ...Object.entries(customCategories),
    ...Object.entries(measurementCategories).filter(([key]) => key === 'add')
  ].map(([key, category]) => (
    <div key={key} className="relative">
      <button
        type="button"
        onClick={() => handleCategoryChange(key)}
        className={`w-full p-4 rounded-lg border-2 transition-all ${
          selectedCategory === key
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-200 hover:border-gray-300'
        } ${key === 'add' ? 'border-green-200 hover:border-green-300 bg-green-50' : ''}`}
      >
        {key === 'add' ? (
          <div className="flex items-center justify-center">
            <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
            {category.name}
          </div>
        ) : (
          category.name
        )}
      </button>
      
      {/* Delete button for custom categories only */}
      {customCategories[key] && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteCustomCategory(key);
          }}
          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors text-xs"
          title="Delete custom category"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  ))}
</div>
          </div>

          {/* Dynamic Measurements */}
          {selectedCategory && (
             <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-xl">
              <h4 className="font-semibold text-gray-900 mb-4">
                {(measurementCategories[selectedCategory] || customCategories[selectedCategory])?.name} Measurements (inches)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(measurementCategories[selectedCategory] || customCategories[selectedCategory])?.measurements.map(measurement => (
                  <div key={measurement}>
                    <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                      {measurement.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      placeholder="0.00"
                      value={manualOrderForm.measurements[measurement] || ''}
                      onChange={(e) => handleMeasurementChange(measurement, e.target.value)}
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Details */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl">
            <h4 className="font-semibold text-gray-900 mb-4">Order Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Fabric Type"
                value={manualOrderForm.fabric}
                onChange={(e) => setManualOrderForm(prev => ({ ...prev, fabric: e.target.value }))}
                className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                placeholder="Total Amount ($)"
                value={manualOrderForm.totalAmount}
                onChange={(e) => setManualOrderForm(prev => ({ ...prev, totalAmount: e.target.value }))}
                className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={manualOrderForm.dueDate}
                onChange={(e) => setManualOrderForm(prev => ({ ...prev, dueDate: e.target.value }))}
                className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
              <select
                value={manualOrderForm.urgency}
                onChange={(e) => setManualOrderForm(prev => ({ ...prev, urgency: e.target.value }))}
                className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="rush">Rush</option>
              </select>
            </div>
  <textarea
  placeholder="Special Instructions (Optional)"
  value={manualOrderForm.specialInstructions}
  onChange={(e) => setManualOrderForm(prev => ({ ...prev, specialInstructions: e.target.value }))}
  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 mt-4"
  rows="3"
/>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <EnhancedButton
              type="button"
              variant="ghost"
              onClick={() => setShowManualOrderModal(false)}
            >
              Cancel
            </EnhancedButton>
            <EnhancedButton
              type="submit"
              variant="luxury"
              disabled={!selectedCategory || !manualOrderForm.customerName || !manualOrderForm.totalAmount}
            >
              Create Order
            </EnhancedButton>
          </div>
        </form>
      </div>
    </div>
  );
};

const CustomCategoryModal = ({ 
  showCustomCategoryModal, 
  setShowCustomCategoryModal,
  customCategoryForm,
  setCustomCategoryForm,
  customMeasurementInput,
  setCustomMeasurementInput,
  handleAddCustomMeasurement,
  handleRemoveCustomMeasurement,
  handleSaveCustomCategory
}) => {
  if (!showCustomCategoryModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl sm:rounded-2xl max-w-sm sm:max-w-xl lg:max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-2 sm:m-4">
        <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-bold text-gray-900">Create Custom Category</h3>
            <button onClick={() => setShowCustomCategoryModal(false)} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Category Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category Name</label>
            <input
              type="text"
              placeholder="e.g., Jacket, Kurti, etc."
              value={customCategoryForm.name}
              onChange={(e) => setCustomCategoryForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Add Measurements */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Add Measurements</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., chest, waist, length"
                value={customMeasurementInput}
                onChange={(e) => setCustomMeasurementInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddCustomMeasurement()}
                className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddCustomMeasurement}
                className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Add
              </button>
            </div>
          </div>

          {/* Measurements List */}
          {customCategoryForm.measurements.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Measurements</label>
              <div className="flex flex-wrap gap-2">
                {customCategoryForm.measurements.map((measurement, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                  >
                    {measurement}
                    <button
                      onClick={() => handleRemoveCustomMeasurement(measurement)}
                      className="ml-2 text-blue-600 hover:text-blue-800"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4 pt-4 border-t">
            <button
              onClick={() => setShowCustomCategoryModal(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCustomCategory}
              disabled={!customCategoryForm.name.trim() || customCategoryForm.measurements.length === 0}
              className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Category
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const getCustomerMeasurements = async (customerPhone, garmentType) => {
  try {
    // First try to find customer by phone
    const customersQuery = query(
      collection(db, 'customers'),
      where('phone', '==', customerPhone)
    );
    const querySnapshot = await getDocs(customersQuery);
    
    if (!querySnapshot.empty) {
      const customerDoc = querySnapshot.docs[0];
      const customerData = customerDoc.data();
      
      if (customerData.measurements && customerData.measurements[garmentType]) {
        return {
          customerId: customerDoc.id,
          measurements: customerData.measurements[garmentType],
          customerName: customerData.name
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error retrieving customer measurements:', error);
    return null;
  }
};

const EditMeasurementsModal = ({ 
  showEditMeasurementsModal, 
  setShowEditMeasurementsModal,
  editingMeasurements,
  setEditingMeasurements,
  handleSaveMeasurements
}) => {
  if (!showEditMeasurementsModal || !editingMeasurements) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl sm:rounded-2xl max-w-sm sm:max-w-xl lg:max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-2 sm:m-4">
        <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-bold text-gray-900">
  Edit {editingMeasurements.garmentType} Measurements
  {editingMeasurements.orderId && (
    <span className="text-sm font-normal text-gray-600 block">
      Order #{editingMeasurements.orderId.slice(-8)}
    </span>
  )}
</h3>
            <button onClick={() => setShowEditMeasurementsModal(false)} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Customer: {editingMeasurements.customer.name}
          </p>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(editingMeasurements.measurements).map(([measureName, value]) => (
              <div key={measureName}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                  {measureName.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={value || ''}
                  onChange={(e) => setEditingMeasurements(prev => ({
                    ...prev,
                    measurements: {
                      ...prev.measurements,
                      [measureName]: e.target.value
                    }
                  }))}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-4 pt-4 border-t">
            <button
              onClick={() => setShowEditMeasurementsModal(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveMeasurements}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TailorDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [userInfo, setUserInfo] = useState({
    name: 'Loading...',
    // businessName: '',
    email: ''
  });
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderFilter, setOrderFilter] = useState('all');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  
  // Notification states
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastChecked, setLastChecked] = useState(new Date());
  const [notifiedDueDates, setNotifiedDueDates] = useState(new Set());
  const [dueDateWarningDays, setDueDateWarningDays] = useState(2);


  const [phoneCheckStep, setPhoneCheckStep] = useState('phone'); // 'phone', 'existing-orders', 'relationship', 'form'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [existingOrders, setExistingOrders] = useState([]);
  const [selectedRelationship, setSelectedRelationship] = useState('');

// Add this state near other state declarations at the top
  const [dueDateSettings, setDueDateSettings] = useState({
  warningDays: 3,
  urgentDays: 1,
  enableNotifications: true
});
// Add these lines after line 103
const [showManualOrderModal, setShowManualOrderModal] = useState(false);
const [selectedCategory, setSelectedCategory] = useState('');
const [manualOrderForm, setManualOrderForm] = useState({
  customerPhone: '',
  customerName: '',
  customerEmail: '',
  customerAddress: '',
  garmentType: '',
  fabric: '',
  specialInstructions: '',
  urgency: 'normal',
  dueDate: '',
  totalAmount: '',
  measurements: {}
});

const [expandedCustomer, setExpandedCustomer] = useState(null);
const [customerMeasurementHistory, setCustomerMeasurementHistory] = useState({});

const [showCustomCategoryModal, setShowCustomCategoryModal] = useState(false);
const [customCategoryForm, setCustomCategoryForm] = useState({
  name: '',
  measurements: []
});
const [customMeasurementInput, setCustomMeasurementInput] = useState('');
const [customCategories, setCustomCategories] = useState({});
const [showEditMeasurementsModal, setShowEditMeasurementsModal] = useState(false);
const [editingMeasurements, setEditingMeasurements] = useState(null);


// Define measurement categories
const measurementCategories = {
  shirt: {
    name: 'Shirt',
    measurements: ['chest', 'shoulder', 'neck', 'armLength', 'shirtLength']
  },
  pants: {
    name: 'Pants',
    measurements: ['waist', 'hips', 'inseam', 'outseam', 'thigh']
  },
  dress: {
    name: 'Dress',
    measurements: ['bust', 'waist', 'hips', 'shoulder', 'dressLength']
  },
  suit: {
    name: 'Suit',
    measurements: ['chest', 'waist', 'shoulder', 'neck', 'armLength', 'jacketLength', 'pantWaist', 'inseam']
  },
  blouse: {
    name: 'Blouse',
    measurements: ['bust', 'shoulder', 'armLength', 'blouseLength']
  },
  add: {
    name: 'Add Custom Category',
    measurements: []
  }
};


//callback
const handleTextareaChange = useCallback((value) => {
  setManualOrderForm(prev => ({ ...prev, specialInstructions: value }));
}, []);

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

 // Replace the existing initializeDashboard useEffect with this fixed version:

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
      
      
      // await fetchCustomers(); 
      
      // Set up orders listener (this will call fetchCustomers when orders load)
      setupOrderListener();
      
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      // Set fallback user info
      setUserInfo({
        name: 'Tailor',
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
          // businessName: tailorData.businessName || '',
          email: tailorData.email || user.email
        });
      } else {
        setUserInfo({
          name: user.displayName || 'Tailor',
          // businessName: '',
          email: user.email
        });
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw error;
    }
  };

// Replace the existing fetchCustomers function with this fixed version:

const fetchCustomers = async (ordersArray = orders) => {
  try {
    const customerMap = new Map();
    
    // Build customer map with measurement counts
    ordersArray.forEach(order => {
      const customerKey = order.customerId || `${order.customerName}-${order.customerPhone}`;
      
      if (!customerMap.has(customerKey) && order.customerName) {
        customerMap.set(customerKey, {
          id: order.customerId || `customer-${Date.now()}-${Math.random()}`,
          name: order.customerName,
          phone: order.customerPhone || '',
          email: order.customerEmail || '',
          address: order.customerAddress || '',
          measurementCount: 0, // Initialize counter
          orderCount: 0
        });
      }
      
      // Count measurements and orders
      const customer = customerMap.get(customerKey);
      if (customer) {
        customer.orderCount++;
        if (order.measurements && Object.keys(order.measurements).length > 0) {
          customer.measurementCount++;
        }
      }
    });
    
    setCustomers(Array.from(customerMap.values()));
  } catch (error) {
    console.error('Error extracting customers:', error);
  }
};
// Replace the existing setupOrderListener function in your TailorDashboard component
// Find this function around line 191 and replace it with this improved version:

// Replace the existing setupOrderListener function with this fixed version:

const setupOrderListener = () => {
  try {
    // Clean up existing listener if any
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc')
    );
    
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
            //  FIX: Call fetchCustomers with the loaded orders
            fetchCustomers(allOrders);
            initialOrdersLoaded = true;
            return;
          }
          
          // Process changes only after initial load
          allOrders.forEach(currentOrder => {
            const orderId = currentOrder.id;
            const previousOrder = previousOrders.get(orderId);
            
            if (!previousOrder) {
              // NEW ORDER - Check if created by customer
              if (currentOrder.modifiedBy === 'customer' || currentOrder.createdBy === 'customer') {
                newNotifications.push({
                  id: `new-order-${orderId}-${Date.now()}`,
                  type: 'new_order',
                  title: 'New Order Received',
                  message: `New ${currentOrder.garmentType || 'order'} from ${currentOrder.customerName}`,
                  orderId: orderId,
                  timestamp: new Date(),
                  read: false,
                  urgent: true
                });
              }
            } else {
              // EXISTING ORDER - Check for customer updates
              if (currentOrder.modifiedBy === 'customer') {
                newNotifications.push({
                  id: `customer-update-${orderId}-${Date.now()}`,
                  type: 'customer_update',
                  title: 'Order Updated by Customer',
                  message: `${currentOrder.customerName} updated their ${currentOrder.garmentType || 'order'}`,
                  orderId: orderId,
                  timestamp: new Date(),
                  read: false,
                  urgent: false
                });
              }
            }
            
            // Update previous orders map
            previousOrders.set(orderId, currentOrder);
          });

          // Check for due date notifications
          checkDueDateNotifications(allOrders, newNotifications);

          // Update orders state
          setOrders(allOrders);
          
          // FIX: Update customers when orders change
          fetchCustomers(allOrders);

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
        setTimeout(() => {
          setupOrderListener();
        }, 5000);
      }
    );

    unsubscribeRef.current = unsubscribe;
    
  } catch (error) {
    console.error('Error setting up order listener:', error);
  }
};

const saveCustomerMeasurements = async (customerId, customerName, customerPhone, measurements, garmentType) => {
  try {
    const customerRef = doc(db, 'customers', customerId);
    
    // Check if customer document exists
    const customerDoc = await getDoc(customerRef);
    
    if (customerDoc.exists()) {
      // Update existing customer with new measurements
      await updateDoc(customerRef, {
        [`measurements.${garmentType}`]: measurements,
        updatedAt: serverTimestamp(),
        lastMeasurementUpdate: serverTimestamp()
      });
    } else {
      // Create new customer document
      await setDoc(customerRef, {
        name: customerName,
        phone: customerPhone,
        measurements: {
          [garmentType]: measurements
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMeasurementUpdate: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error saving customer measurements:', error);
  }
};

// Helper function to check for meaningful changes in orders
const checkForOrderChanges = (previousOrder, currentOrder) => {
  // Compare key fields that matter for customer updates
  const fieldsToCompare = [
    'garmentType', 'fabric', 'specialInstructions', 'urgency',
    'measurements', 'inspirationPhotos'
  ];
  
  for (const field of fieldsToCompare) {
    if (JSON.stringify(previousOrder[field]) !== JSON.stringify(currentOrder[field])) {
      return true;
    }
  }
  
  // Check if updatedAt timestamp changed significantly (more than 1 second)
  const prevTimestamp = getTimestamp(previousOrder.updatedAt);
  const currentTimestamp = getTimestamp(currentOrder.updatedAt);
  
  return Math.abs(currentTimestamp - prevTimestamp) > 1000; // 1 second threshold
};

  const checkDueDateNotifications = (allOrders, newNotifications) => {
  if (!dueDateSettings.enableNotifications) return;
  
  const today = new Date();
  const warningDate = new Date(today);
  warningDate.setDate(today.getDate() + dueDateSettings.warningDays);
  
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
      
      if (daysDiff <= dueDateSettings.warningDays && daysDiff >= 0) {
        const isUrgent = daysDiff <= dueDateSettings.urgentDays;
        
        newNotifications.push({
          id: `due-soon-${order.id}-${Date.now()}`,
          type: 'due_soon',
          title: isUrgent ? 'Order Due Soon!' : 'Order Due Warning',
          message: `${order.customerName || 'Customer'}'s order is due ${
            daysDiff === 0 ? 'today' : 
            daysDiff === 1 ? 'tomorrow' : 
            `in ${daysDiff} days`
          } - ${order.garmentType || 'Custom order'}`,
          orderId: order.id,
          timestamp: new Date(),
          read: false,
          urgent: isUrgent,
          daysUntilDue: daysDiff
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
  // Add these functions after line 
const handleCategoryChange = async (category) => {

  if (category === 'add') {
    setShowCustomCategoryModal(true);
    return;
  }
  setSelectedCategory(category);
  
  // Try to get existing measurements if customer phone is provided
  if (manualOrderForm.customerPhone && manualOrderForm.customerPhone.length >= 10) {
    const existingData = await getCustomerMeasurements(manualOrderForm.customerPhone, category);
    
    if (existingData) {
      setManualOrderForm(prev => ({
        ...prev,
        garmentType: measurementCategories[category]?.name || '',
        measurements: existingData.measurements,
        customerName: existingData.customerName || prev.customerName
      }));
      
      // Show a notification that measurements were loaded
      alert('Previous measurements loaded for this customer!');
    } else {
      setManualOrderForm(prev => ({
        ...prev,
        garmentType: measurementCategories[category]?.name || '',
        measurements: {}
      }));
    }
  } else {
    setManualOrderForm(prev => ({
      ...prev,
      garmentType: measurementCategories[category]?.name || '',
      measurements: {}
    }));
  }
};

const handleMeasurementChange = (measurementName, value) => {
  setManualOrderForm(prev => ({
    ...prev,
    measurements: {
      ...prev.measurements, // Keep existing measurements
      [measurementName]: value
    }
  }));
};

const handleSubmitOrder = async (e) => {
  e.preventDefault();
  try {
    const orderData = {
      ...manualOrderForm,
      status: 'confirmed',
      progress: 10,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: 'tailor',
      modifiedBy: 'tailor',
      tailorId: auth.currentUser?.uid,
      customerId: `manual-${Date.now()}-${Math.random()}`,
     dueDate: manualOrderForm.dueDate ? new Date(manualOrderForm.dueDate + 'T00:00:00') : null
    };

    await addDoc(collection(db, 'orders'), orderData);

    // Save customer measurements
if (selectedCategory && manualOrderForm.measurements && Object.keys(manualOrderForm.measurements).length > 0) {
  await saveCustomerMeasurements(
    orderData.customerId,
    manualOrderForm.customerName,
    manualOrderForm.customerPhone,
    manualOrderForm.measurements,
    selectedCategory
  );
}
    
    // Reset form
    setManualOrderForm({
      customerPhone: '', customerName: '', customerEmail: '', customerAddress: '',
      garmentType: '', fabric: '', specialInstructions: '', urgency: 'normal',
      dueDate: '', totalAmount: '', measurements: {}
    });
    setSelectedCategory('');
    setShowManualOrderModal(false);
    
    alert('Order created successfully!');
  } catch (error) {
    console.error('Error creating order:', error);
    alert('Failed to create order');
  }
};

const handleAddCustomMeasurement = () => {
  if (customMeasurementInput.trim() && !customCategoryForm.measurements.includes(customMeasurementInput.trim())) {
    setCustomCategoryForm(prev => ({
      ...prev,
      measurements: [...prev.measurements, customMeasurementInput.trim()]
    }));
    setCustomMeasurementInput('');
  }
};

const handleRemoveCustomMeasurement = (measurement) => {
  setCustomCategoryForm(prev => ({
    ...prev,
    measurements: prev.measurements.filter(m => m !== measurement)
  }));
};

// Replace your existing handleSaveCustomCategory function (around line 345)
const handleSaveCustomCategory = async () => {
  if (customCategoryForm.name.trim() && customCategoryForm.measurements.length > 0) {
    try {
      const categoryKey = customCategoryForm.name.toLowerCase().replace(/\s+/g, '_');
      
      const newCustomCategories = {
        ...customCategories,
        [categoryKey]: {
          name: customCategoryForm.name,
          measurements: customCategoryForm.measurements
        }
      };
      
      // Save to Firebase
      const user = auth.currentUser;
      if (user) {
        await updateDoc(doc(db, 'tailors', user.uid), {
          customCategories: newCustomCategories,
          updatedAt: serverTimestamp()
        });
      }
      
      // Update local state
      setCustomCategories(newCustomCategories);
      
      setSelectedCategory(categoryKey);
      setManualOrderForm(prev => ({
        ...prev,
        garmentType: customCategoryForm.name,
        measurements: {}
      }));
      
      setCustomCategoryForm({ name: '', measurements: [] });
      setShowCustomCategoryModal(false);
      
      alert('Custom category saved successfully!');
    } catch (error) {
      console.error('Error saving custom category:', error);
      alert('Failed to save custom category');
    }
  }
  
};


// ADD THE NEW FUNCTION RIGHT HERE ↓
const handleDeleteCustomCategory = async (categoryKey) => {
  if (window.confirm('Are you sure you want to delete this custom category? This action cannot be undone.')) {
    try {
      const newCustomCategories = { ...customCategories };
      delete newCustomCategories[categoryKey];
      
      // Save to Firebase
      const user = auth.currentUser;
      if (user) {
        await updateDoc(doc(db, 'tailors', user.uid), {
          customCategories: newCustomCategories,
          updatedAt: serverTimestamp()
        });
      }
      
      // Update local state
      setCustomCategories(newCustomCategories);
      
      // If currently selected category is being deleted, reset selection
      if (selectedCategory === categoryKey) {
        setSelectedCategory('');
        setManualOrderForm(prev => ({
          ...prev,
          garmentType: '',
          measurements: {}
        }));
      }
      
      alert('Custom category deleted successfully!');
    } catch (error) {
      console.error('Error deleting custom category:', error);
      alert('Failed to delete custom category');
    }
  }
};

const fetchCustomerMeasurementHistory = async (customerId, customerPhone) => {
  try {
    // First try to find by customerId
    let customerDoc = null;
    if (customerId && customerId !== `customer-${customerPhone}`) {
      customerDoc = await getDoc(doc(db, 'customers', customerId));
    }
    
    // If not found, try to find by phone
    if (!customerDoc || !customerDoc.exists()) {
      const customersQuery = query(
        collection(db, 'customers'),
        where('phone', '==', customerPhone)
      );
      const querySnapshot = await getDocs(customersQuery);
      if (!querySnapshot.empty) {
        customerDoc = querySnapshot.docs[0];
      }
    }
    
    if (customerDoc && customerDoc.exists()) {
      const customerData = customerDoc.data();
      
      // Get measurement history from orders
      const customerOrders = orders.filter(order => 
        order.customerPhone === customerPhone || order.customerId === customerId
      );
      
      const measurementHistory = {};
      
      // Group measurements by garment type
      customerOrders.forEach(order => {
        if (order.measurements && Object.keys(order.measurements).length > 0) {
          const garmentType = order.garmentType || 'unknown';
          if (!measurementHistory[garmentType]) {
            measurementHistory[garmentType] = [];
          }
          
          measurementHistory[garmentType].push({
            orderId: order.id,
            orderDate: order.createdAt,
            measurements: order.measurements,
            fabric: order.fabric,
            status: order.status
          });
        }
      });
      
      // Sort by date (newest first)
      Object.keys(measurementHistory).forEach(garmentType => {
        measurementHistory[garmentType].sort((a, b) => {
          const dateA = a.orderDate?.toDate ? a.orderDate.toDate() : new Date(a.orderDate);
          const dateB = b.orderDate?.toDate ? b.orderDate.toDate() : new Date(b.orderDate);
          return dateB - dateA;
        });
      });
      
      return {
        savedMeasurements: customerData.measurements || {},
        orderMeasurements: measurementHistory
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching customer measurement history:', error);
    return null;
  }
};

const buildMeasurementHistoryFromOrders = (customerId, customerPhone) => {
  const customerOrders = orders.filter(order => 
    order.customerId === customerId || order.customerPhone === customerPhone
  );
  
  const measurementHistory = {};
  
  customerOrders.forEach(order => {
    if (order.measurements && Object.keys(order.measurements).length > 0) {
      const garmentType = order.garmentType || 'unknown';
      if (!measurementHistory[garmentType]) {
        measurementHistory[garmentType] = [];
      }
      
      measurementHistory[garmentType].push({
        orderId: order.id,
        orderDate: order.createdAt,
        measurements: order.measurements,
        fabric: order.fabric,
        status: order.status
      });
    }
  });
  
  // Sort by date
  Object.keys(measurementHistory).forEach(garmentType => {
    measurementHistory[garmentType].sort((a, b) => {
      const dateA = a.orderDate?.toDate ? a.orderDate.toDate() : new Date(a.orderDate);
      const dateB = b.orderDate?.toDate ? b.orderDate.toDate() : new Date(b.orderDate);
      return dateB - dateA;
    });
  });
  
  return { orderMeasurements: measurementHistory };
};

const handleCustomerExpand = (customer) => {
  if (expandedCustomer?.id === customer.id) {
    setExpandedCustomer(null);
    return;
  }
  
  setExpandedCustomer(customer);
  
  // Build history from existing orders (no async needed)
  const history = buildMeasurementHistoryFromOrders(customer.id, customer.phone);
  setCustomerMeasurementHistory(prev => ({
    ...prev,
    [customer.id]: history
  }));
};


const handleEditMeasurements = async (customer, garmentType) => {
  // Check for active orders
  const activeOrders = orders.filter(order => 
    (order.customerId === customer.id || order.customerPhone === customer.phone) &&
    ['pending', 'confirmed', 'in_progress', 'ready'].includes(order.status)
  );

  if (activeOrders.length > 0) {
    const confirmEdit = window.confirm(
      `This customer has ${activeOrders.length} active order(s). Editing measurements may affect ongoing orders. Do you want to continue?`
    );
    if (!confirmEdit) return;
  }

  // Get the latest measurements for this garment type
  const measurementHistory = customerMeasurementHistory[customer.id];
  const latestMeasurement = measurementHistory?.orderMeasurements?.[garmentType]?.[0];
  
  if (latestMeasurement) {
    setEditingMeasurements({
      customer,
      garmentType,
      measurements: { ...latestMeasurement.measurements }
    });
    setShowEditMeasurementsModal(true);
  }
};

const handleDeleteMeasurements = async (customer, garmentType) => {
  // Check for active orders
  const activeOrders = orders.filter(order => 
    (order.customerId === customer.id || order.customerPhone === customer.phone) &&
    ['pending', 'confirmed', 'in_progress', 'ready'].includes(order.status)
  );

  if (activeOrders.length > 0) {
    const confirmDelete = window.confirm(
      `This customer has ${activeOrders.length} active order(s). Deleting measurements may affect ongoing orders. Do you want to continue?`
    );
    if (!confirmDelete) return;
  }

  const finalConfirm = window.confirm(
    `Are you sure you want to delete all ${garmentType} measurements for ${customer.name}? This action cannot be undone.`
  );
  
  if (finalConfirm) {
    try {
      // Delete from Firebase
      const customerRef = doc(db, 'customers', customer.id);
      await updateDoc(customerRef, {
        [`measurements.${garmentType}`]: null,
        updatedAt: serverTimestamp()
      });

      // Update local state
      setCustomerMeasurementHistory(prev => ({
        ...prev,
        [customer.id]: {
          ...prev[customer.id],
          orderMeasurements: {
            ...prev[customer.id].orderMeasurements,
            [garmentType]: undefined
          }
        }
      }));

      alert('Measurements deleted successfully!');
    } catch (error) {
      console.error('Error deleting measurements:', error);
      alert('Failed to delete measurements');
    }
  }
};

const handleSaveMeasurements = async () => {
  try {
    const { customer, garmentType, measurements, orderId } = editingMeasurements;
    
    if (orderId) {
      // Update specific order's measurements
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        measurements: measurements,
        updatedAt: serverTimestamp(),
        measurementsLastUpdated: serverTimestamp()
      });
    } else {
      // Fallback to customer document (for older records)
      const customerRef = doc(db, 'customers', customer.id);
      await updateDoc(customerRef, {
        [`measurements.${garmentType}`]: measurements,
        updatedAt: serverTimestamp(),
        lastMeasurementUpdate: serverTimestamp()
      });
    }

    // Refresh customer measurement history
    const history = buildMeasurementHistoryFromOrders(customer.id, customer.phone);
    setCustomerMeasurementHistory(prev => ({
      ...prev,
      [customer.id]: history
    }));

    setShowEditMeasurementsModal(false);
    setEditingMeasurements(null);
    alert('Measurements updated successfully!');
  } catch (error) {
    console.error('Error updating measurements:', error);
    alert('Failed to update measurements');
  }
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

useEffect(() => {
    const loadCustomCategories = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        
        const tailorDoc = await getDoc(doc(db, 'tailors', user.uid));
        if (tailorDoc.exists() && tailorDoc.data().customCategories) {
          setCustomCategories(tailorDoc.data().customCategories);
        }
      } catch (error) {
        console.error('Error loading custom categories:', error);
      }
    };
    
    loadCustomCategories();
  }, []);

  const handleEditSingleMeasurement = (customer, garmentType, record, recordIndex) => {

    const activeOrders = orders.filter(order => 
    (order.customerId === customer.id || order.customerPhone === customer.phone) &&
    ['pending', 'confirmed', 'in_progress', 'ready'].includes(order.status)
  );

  if (activeOrders.length > 0) {
    const confirmEdit = window.confirm(
      `This customer has ${activeOrders.length} active order(s). Editing measurements may affect ongoing orders. Do you want to continue?`
    );
    if (!confirmEdit) return;
  }



  setEditingMeasurements({
    customer,
    garmentType,
    measurements: { ...record.measurements },
    orderId: record.orderId,
    recordIndex
  });
  setShowEditMeasurementsModal(true);
};

const handleDeleteSingleMeasurement = async (customer, garmentType, orderId) => {

  const activeOrders = orders.filter(order => 
    (order.customerId === customer.id || order.customerPhone === customer.phone) &&
    ['pending', 'confirmed', 'in_progress', 'ready'].includes(order.status)
  );

  if (activeOrders.length > 0) {
    const confirmDelete = window.confirm(
      `This customer has ${activeOrders.length} active order(s). Deleting measurements may affect ongoing orders. Do you want to continue?`
    );
    if (!confirmDelete) return;
  }

  const finalConfirm = window.confirm(
    `Are you sure you want to delete the measurements for order #${orderId?.slice(-8)}? This action cannot be undone.`
  );
  
  if (finalConfirm) {
    try {
      // Find and update the specific order to remove measurements
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        measurements: {},
        measurementsDeleted: true,
        measurementsDeletedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Refresh the customer measurement history
      const history = buildMeasurementHistoryFromOrders(customer.id, customer.phone);
      setCustomerMeasurementHistory(prev => ({
        ...prev,
        [customer.id]: history
      }));

      alert('Measurement record deleted successfully!');
    } catch (error) {
      console.error('Error deleting measurement record:', error);
      alert('Failed to delete measurement record');
    }
  }
};


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
            lastModified: serverTimestamp(),
            modifiedBy: 'tailor', // ADD THIS LINE
            modificationReason: 'status_update',
            tailorUpdateId: `tailor-status-${Date.now()}-${Math.random()}`
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

        // Add this code after: await updateDoc(orderRef, updateData);

// Send email notifications for specific status changes
        if (newStatus === 'ready' || newStatus === 'delivered') {
            try {
                const order = orders.find(o => o.id === orderId);
                console.log(' Attempting to send email for order:', orderId);
                console.log(' Order data found:', order);
                
                if (order) {
                    // Prepare email data with fallbacks and validation
                    const emailData = {
                        customerName: order.customerName || order.name || 'Valued Customer',
                        customerEmail: order.customerEmail || order.email,
                        orderNumber: order.orderNumber || orderId.slice(-8),
                        items: order.garmentType || 
                               order.items?.[0]?.garmentType || 
                               order.item || 
                               order.description || 
                               'Custom tailored garment',
                        total: formatPrice(order.totalAmount || order.price || order.total || '0.00')
                    };

                    console.log('Email data prepared:', emailData);

                    // Validate email data
                    if (!emailData.customerEmail) {
                        console.error(' No customer email found for order:', orderId);
                        // Show user notification
                        alert(`Cannot send email: No email address found for order ${orderId}`);
                        return; // Exit email sending but don't break the status update
                    }

                    // Send appropriate email
                    let emailResult;
                    if (newStatus === 'ready') {
                        console.log('Sending "Order Ready" email...');
                        emailResult = await sendOrderReadyEmail(emailData);
                    } else if (newStatus === 'delivered') {
                        console.log('Sending "Order Delivered" email...');
                        emailResult = await sendOrderDeliveredEmail(emailData);
                    }

                    // Handle email result
                    if (emailResult && emailResult.success) {
                        console.log('Email sent successfully:', emailResult);
                        // Show success notification to tailor
                        alert(` Customer notified! Email sent to ${emailData.customerEmail}`);
                    } else {
                        console.error('Email failed:', emailResult);
                        // Show error notification to tailor
                        alert(` Failed to send email: ${emailResult?.error?.message || 'Unknown error'}`);
                    }
                } else {
                    console.error(' Order not found in local data:', orderId);
                    alert(` Order data not found for ${orderId}`);
                }
            } catch (emailError) {
                console.error(' Email notification error:', emailError);
                // Show detailed error to help with debugging
                alert(` Email Error: ${emailError.message}\n\nOrder status was updated successfully, but email failed.`);
                // Don't throw error - email failure shouldn't break the status update
            }
        }
        
        console.log('Order status updated successfully');

        // Notify the customer about the order status update
        const notification = {
            id: `tailor-update-${orderId}-${Date.now()}`,
            type: 'order_updated',
            title: 'Order Status Updated',
            message: `Your order has been updated to ${newStatus}`,
            orderId: orderId,
            timestamp: new Date(),
            read: false,
            urgent: newStatus === 'ready' || newStatus === 'cancelled'
        };
        // Send this notification to the customer
       const currentOrder = orders.find(o => o.id === orderId);
await sendNotificationToCustomer(notification, currentOrder?.customerId || `customer-${currentOrder?.customerName}`);


        
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


// Helper function to format price consistently
const formatPrice = (price) => {
    if (!price) return '$0.00';
    
    // If price is already formatted with currency symbol, return as is
    if (typeof price === 'string' && (price.includes('$') || price.includes('₹'))) {
        return price;
    }
    
    // Convert to number and format
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return `$${numPrice.toFixed(2)}`;
};
// Function to send notification to the customer
const sendNotificationToCustomer = async (notification, customerId) => {
  try {
    // Add to customer's notifications subcollection
    await addDoc(collection(db, 'customers', customerId, 'notifications'), {
      ...notification,
      targetType: 'customer',
      tailorId: auth.currentUser?.uid
    });
    
    // Also add to global notifications for backup
    await addDoc(collection(db, 'notifications'), {
      ...notification,
      customerId: customerId,
      targetType: 'customer',
      tailorId: auth.currentUser?.uid
    });
    
    console.log('Notification sent to customer:', customerId);
  } catch (error) {
    console.error('Error sending notification to customer:', error);
  }
};

const handleUpdateOrderProgress = async (orderId, progress) => {
    try {
        const orderRef = doc(db, 'orders', orderId);
        const updateData = {
            progress: parseInt(progress),
            updatedAt: serverTimestamp(),
            lastModified: serverTimestamp(),
            modifiedBy: 'tailor', // ADD THIS LINE
            modificationReason: 'progress_update',
            tailorUpdateId: `tailor-progress-${Date.now()}-${Math.random()}`
        };
        
        await updateDoc(orderRef, updateData);
        
        console.log('Order progress updated by tailor');

        // Notify the customer about the progress update
        const notification = {
            id: `tailor-progress-update-${orderId}-${Date.now()}`,
            type: 'progress_update',
            title: 'Order Progress Updated',
            message: `Your order progress is now at ${progress}%`,
            orderId: orderId,
            timestamp: new Date(),
            read: false,
            urgent: false
        };
        // Send this notification to the customer
        const currentOrder = orders.find(o => o.id === orderId);
await sendNotificationToCustomer(notification, currentOrder?.customerId || `customer-${currentOrder?.customerName}`);
        
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
  // Normalize both dates to local timezone
  const normalizeDate = (date) => {
    const normalized = new Date(date);
    return new Date(normalized.getFullYear(), normalized.getMonth(), normalized.getDate());
  };
  
  const norm1 = normalizeDate(date1);
  const norm2 = normalizeDate(date2);
  
  return norm1.getDate() === norm2.getDate() &&
         norm1.getMonth() === norm2.getMonth() &&
         norm1.getFullYear() === norm2.getFullYear();
};

  const getOrdersForDate = (date) => {
    return orders.filter(order => {
      if (!order.dueDate) return false;
      
      let dueDate;
if (order.dueDate?.toDate) {
  dueDate = order.dueDate.toDate();
} else if (typeof order.dueDate === 'string') {
  dueDate = new Date(order.dueDate + 'T00:00:00');
} else if (order.dueDate instanceof Date) {
  dueDate = order.dueDate;
} else if (order.expectedDelivery) {
  dueDate = new Date(order.expectedDelivery + 'T00:00:00');
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
  .reduce((sum, order) => {
    // Debug logging for ALL orders
    console.log('Order status and amount check:', {
      id: order.id,
      status: order.status,
      totalAmount: order.totalAmount,
      price: order.price,
      amount: order.amount,
      items: order.items
    });
    
    let amount = 0;
    if (order.totalAmount) {
      amount = parseFloat(order.totalAmount);
    } else if (order.price) {
      amount = parseFloat(order.price);
    } else if (order.amount) {
      amount = parseFloat(order.amount);
    } else if (order.items && Array.isArray(order.items)) {
      amount = order.items.reduce((itemSum, item) => {
        return itemSum + (parseFloat(item.price) || parseFloat(item.amount) || 0);
      }, 0);
    }
    
    console.log(`Order ${order.id}: Status=${order.status}, Amount=${amount}`);
    return sum + amount;
  }, 0);

console.log('Total Revenue Calculated:', totalRevenue);
  

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

  const filteredCustomers = customers.filter(customer => {
  if (!customerSearchTerm) return true;
  
  const searchLower = customerSearchTerm.toLowerCase();
  const name = (customer.name || '').toLowerCase();
  const phone = (customer.phone || '').toLowerCase();
  const email = (customer.email || '').toLowerCase();
  
  return name.includes(searchLower) || 
         phone.includes(searchLower) || 
         email.includes(searchLower);
});

const NotificationDropdown = () => {
  if (!showNotifications) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-25 z-[9998] sm:hidden" onClick={toggleNotifications} />
      
      {/* Notification dropdown */}
      <div className="absolute right-0 top-full mt-2 w-screen sm:w-80 md:w-96 bg-white rounded-none sm:rounded-lg shadow-xl border-0 sm:border border-gray-200 z-[9999] max-h-[80vh] sm:max-h-96 overflow-y-auto sm:mx-0 sm:max-w-sm md:max-w-md">
        <div className="p-4 sm:p-4 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-lg sm:text-lg font-semibold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={() => setNotifications([])}
                  className="text-sm sm:text-sm text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-100 rounded transition-colors"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={toggleNotifications}
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
        
        <div className="overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 sm:p-8 text-center text-gray-500">
              <Bell className="h-12 w-12 sm:h-12 sm:w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-base sm:text-base">No notifications</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 sm:p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                  !notification.read ? 'bg-blue-50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      {notification.type === 'new_order' ? (
                        <ShoppingBag className="h-5 w-5 sm:h-5 sm:w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      ) : notification.type === 'due_soon' ? (
                        <AlertCircle className={`h-5 w-5 sm:h-5 sm:w-5 mt-0.5 flex-shrink-0 ${notification.urgent ? 'text-red-500' : 'text-orange-500'}`} />
                      ) : (
                        <Edit className="h-5 w-5 sm:h-5 sm:w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-base sm:text-base font-medium text-gray-900 leading-tight pr-2">
                            {notification.title}
                          </h4>
                          {!notification.read && (
                            <div className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-2 break-words leading-relaxed pr-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          {notification.timestamp.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearNotification(notification.id);
                    }}
                    className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0 -mt-1 -mr-1"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
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
        <div className="bg-white rounded-lg max-w-sm sm:max-w-xl lg:max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-2 sm:m-4">
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
                        <StatusBadge status={order.status} />
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
                        <EnhancedButton
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowDayModal(false);
                            setShowOrderModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View Details
                        </EnhancedButton>
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
        <div className="bg-white rounded-xl sm:rounded-2xl max-w-sm sm:max-w-3xl lg:max-w-4xl w-full max-h-[95vh] overflow-y-auto mx-2 sm:m-4 shadow-luxury border border-gray-200">
          <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold text-gray-900">Order Details - #{selectedOrder.id?.slice(-8)}</h3>
              <button 
                onClick={() => setShowOrderModal(false)}
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border border-blue-100">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                <User className="h-5 w-5 mr-2 text-blue-600" />
                Customer Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Name</p>
                  <p className="font-medium text-gray-900">{customer.name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="font-medium text-gray-900">{customer.phone || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-medium text-gray-900">{customer.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Address</p>
                  <p className="font-medium text-gray-900">{customer.address || 'N/A'}</p>
                </div>
              </div>
            </div>

            {inspirationPhotos.length > 0 && (
              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-xl border border-green-100">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Image className="h-5 w-5 mr-2 text-green-600" />
                  Customer Inspiration Photos ({inspirationPhotos.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                  {inspirationPhotos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-square bg-gray-200 rounded-xl overflow-hidden cursor-pointer shadow-md hover:shadow-lg transition-all duration-300 group-hover:scale-105">
                        <img
                          src={photo.url || photo}
                          alt={photo.name || `Inspiration ${index + 1}`}
                          className="w-full h-full object-cover"
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
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-4 italic">
                  Click on any photo to view it in full size
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-xl border border-yellow-100">
                <h4 className="font-semibold text-gray-900 mb-4">Order Status</h4>
                <select 
                  value={selectedOrder.status}
                  onChange={(e) => handleUpdateOrderStatus(selectedOrder.id, e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="ready">Ready</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-100">
                <h4 className="font-semibold text-gray-900 mb-4">Progress (%)</h4>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={selectedOrder.progress || 0}
                  onChange={(e) => handleUpdateOrderProgress(selectedOrder.id, e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                />
                <div className="mt-3">
                  <ProgressRing progress={selectedOrder.progress || 0} size="md" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-gray-50 to-blue-50 p-6 rounded-xl border border-gray-100">
              <h4 className="font-semibold text-gray-900 mb-4">Order Details</h4>
              <div className="space-y-3">
                {selectedOrder.items?.length > 0 ? (
                  selectedOrder.items.map((item, index) => (
                    <div key={index} className="bg-white p-4 rounded-lg flex justify-between items-center shadow-sm">
                      <div>
                        <p className="font-medium text-gray-900">{item.garmentType}</p>
                        <p className="text-sm text-gray-600">Quantity: {item.quantity || 1}</p>
                      </div>
                      <p className="font-bold text-lg text-blue-600">${item.price}</p>
                    </div>
                  ))
                ) : (
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <p className="font-medium text-gray-900">{selectedOrder.garmentType || 'Custom Order'}</p>
                    <div className="flex justify-between items-center mt-2">
                      <p className="text-sm text-gray-600">Quantity: 1</p>
                      <p className="font-bold text-lg text-blue-600">${selectedOrder.totalAmount || selectedOrder.price || 0}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedOrder.measurements && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100">
                <h4 className="font-semibold text-gray-900 mb-4">Measurements</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                  {Object.entries(selectedOrder.measurements).map(([key, value]) => (
                    value && (
                      <div key={key} className="bg-white p-3 rounded-lg shadow-sm">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">{key}</p>
                        <p className="font-bold text-gray-900">{value}"</p>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {(selectedOrder.fabric || selectedOrder.specialInstructions) && (
              <div className="bg-gradient-to-r from-green-50 to-teal-50 p-6 rounded-xl border border-green-100">
                <h4 className="font-semibold text-gray-900 mb-4">Additional Details</h4>
                <div className="space-y-3">
                  {selectedOrder.fabric && (
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <p className="text-sm font-medium text-gray-700">Fabric</p>
                      <p className="text-gray-900">{selectedOrder.fabric}</p>
                    </div>
                  )}
                  {selectedOrder.specialInstructions && (
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <p className="text-sm font-medium text-gray-700">Special Instructions</p>
                      <p className="text-gray-900">{selectedOrder.specialInstructions}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-gradient-to-r from-slate-50 to-gray-50 p-6 rounded-xl border border-slate-100">
              <h4 className="font-semibold text-gray-900 mb-4">Order Timeline</h4>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600">Order Date</p>
                  <p className="font-medium text-gray-900">{formatOrderDate(selectedOrder.createdAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Due Date</p>
                  <p className="font-medium text-gray-900">{formatOrderDate(selectedOrder.dueDate || selectedOrder.expectedDelivery)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Amount</p>
                  <p className="font-bold text-xl text-green-600">${selectedOrder.totalAmount || selectedOrder.price || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Urgency</p>
                  <p className="font-medium text-gray-900 capitalize">{selectedOrder.urgency || 'Normal'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 text-lg">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
     <header className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white shadow-2xl overflow-visible z-10">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20" />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='m36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />
        
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 lg:gap-6">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
                xyz shop
                <span className="block text-lg lg:text-xl font-normal text-white/80 mt-1">
                  {userInfo.name}'s Dashboard
                </span>
              </h1>
              {userInfo.businessName && (
                <p className="text-white/70 text-lg">{userInfo.businessName}</p>
              )}
              <p className="text-white/70">
                Manage orders and track your business
              </p>
            </div>
            
            <div className="flex items-center gap-2 lg:gap-4">
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
                onClick={handleLogout}
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-8 pb-24 sm:pb-32">
        {activeTab === 'overview' && (
          <>
            {/* Stats Overview */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/50 p-8">
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-6">Business Overview</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
                <div className="relative overflow-hidden rounded-xl border p-6 transition-all duration-300 hover:shadow-xl hover:scale-105 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-600">Total Orders</p>
                      <p className="text-3xl font-bold text-blue-600">{orders.length}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-500/10 text-blue-600">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-xl border p-6 transition-all duration-300 hover:shadow-xl hover:scale-105 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-600">In Progress</p>
                      <p className="text-3xl font-bold text-purple-600">{inProgressOrders}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-purple-500/10 text-purple-600">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-xl border p-6 transition-all duration-300 hover:shadow-xl hover:scale-105 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-600">Completed</p>
                      <p className="text-3xl font-bold text-green-600">{completedOrders}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-500/10 text-green-600">
                      <Check className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-xl border p-6 transition-all duration-300 hover:shadow-xl hover:scale-105 bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-600">Revenue</p>
                      <p className="text-3xl font-bold text-yellow-600">${totalRevenue}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-yellow-500/10 text-yellow-600">
                      <DollarSign className="w-6 h-6" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Orders */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/50 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Recent Orders</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {orders.slice(0, 5).map((order, index) => {
                  const customer = customers.find(c => c.id === order.customerId) || 
                                 { name: order.customerName };
                  const inspirationPhotos = getInspirationPhotos(order);
                  return (
                    <div 
                      key={order.id} 
                      className="px-6 py-4 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-300 group"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                     <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0"> 
                        <div className="flex items-center space-x-2 md:space-x-4">
                          <div className="w-2 h-2 bg-blue-500 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
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
                        <div className="flex items-center justify-between md:justify-end space-x-2 md:space-x-4 w-full md:w-auto">
                          <div className="text-left md:text-right">
                            <p className="text-sm font-medium text-gray-900">
                              ${order.totalAmount || order.price || 0}
                            </p>
                            <div className="flex items-center space-x-2">
                              <StatusBadge status={order.status} />
                              <span className="text-xs text-gray-500">
                                {order.progress || 0}%
                              </span>
                            </div>
                          </div>
                          <EnhancedButton
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowOrderModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          >
                            <Eye size={16} />
                          </EnhancedButton>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-500 ${getProgressColor(order.progress || 0)}`}
                            style={{ width: `${order.progress || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === 'orders' && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/50 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-6 py-4 border-b border-gray-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h3 className="text-xl font-bold text-gray-900">Customer Orders</h3>
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4"></div>
                <div className="flex items-center gap-1 lg:gap-2 flex-wrap">
                  {[
                    { id: 'all', label: 'All Orders', count: orders.length },
                    { id: 'pending', label: 'Pending', count: orders.filter(o => o.status === 'pending').length },
                    { id: 'confirmed', label: 'Active', count: orders.filter(o => ['confirmed', 'in_progress'].includes(o.status)).length },
                    { id: 'ready', label: 'Ready', count: orders.filter(o => o.status === 'ready').length },
                    { id: 'delivered', label: 'Completed', count: orders.filter(o => o.status === 'delivered').length }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setOrderFilter(tab.id)}
                      className={`px-2 md:px-4 py-2 text-xs md:text-sm font-medium rounded-lg transition-all duration-300 ${
                        orderFilter === tab.id
                          ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                      }`}
                    >
                      {tab.label}
                      <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-current/20">
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredOrders.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-4">
                    <ShoppingBag className="w-12 h-12 text-gray-400" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">No orders found</h4>
                  <p className="text-gray-500">
                    {orderFilter === 'all' 
                      ? "No orders at the moment." 
                      : `No ${orderFilter.replace('_', ' ')} orders at the moment.`}
                  </p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                    <tr>
                     <th className="px-3 sm:px-4 lg:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap"> Order ID</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Customer</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Garment</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Status</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Progress</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Due Date</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {filteredOrders.map((order, index) => {
                      const customer = customers.find(c => c.id === order.customerId) || 
                                     { name: order.customerName, phone: order.customerPhone };
                      const inspirationPhotos = getInspirationPhotos(order);
                      return (
                        <tr 
                          key={order.id} 
                          className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-300 group"
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-2 h-2 bg-blue-500 rounded-full mr-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                              <span className="text-sm font-mono text-gray-900">#{order.id?.slice(-8)}</span>
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{customer.name || 'Unknown Customer'}</div>
                            <div className="text-xs text-gray-500">{customer.phone || 'No phone'}</div>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {order.garmentType || (order.items?.[0]?.garmentType) || 'Custom order'}
                                </div>
                                <div className="text-xs text-gray-500">{order.fabric || 'N/A'}</div>
                              </div>
                              {inspirationPhotos.length > 0 && (
                                <span className="ml-2 inline-flex items-center text-xs text-blue-600">
                                  <Image className="h-3 w-3 mr-1" />
                                  {inspirationPhotos.length}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <ProgressRing progress={order.progress || 0} size="sm" />
                              <span className="text-sm text-gray-600">{order.progress || 0}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatOrderDate(order.dueDate || order.expectedDelivery)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center gap-2">
                              <EnhancedButton
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setShowOrderModal(true);
                                }}
                                variant="ghost"
                                size="sm"
                                className="text-blue-600 hover:text-white hover:bg-blue-500"
                              >
                                View Details
                              </EnhancedButton>
                              
                              {order.status === 'pending' && (
                                <EnhancedButton
                                  onClick={() => handleUpdateOrderStatus(order.id, 'confirmed', 25)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-white hover:bg-green-500"
                                >
                                  Accept
                                </EnhancedButton>
                              )}
                              
                              {order.status === 'in_progress' && (
                                <EnhancedButton
                                  onClick={() => handleUpdateOrderStatus(order.id, 'ready', 100)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-purple-600 hover:text-white hover:bg-purple-500"
                                >
                                  Mark Ready
                                </EnhancedButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

    {activeTab === 'customers' && (
  <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/50 overflow-hidden">
    <div className="bg-gradient-to-r from-gray-50 to-purple-50 px-6 py-4 border-b border-gray-200">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Customers & Measurement History</h3>
          <p className="text-sm text-gray-600 mt-1">Click on any customer to view their measurement history</p>
        </div>
        
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, phone, or email..."
            value={customerSearchTerm}
            onChange={(e) => setCustomerSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 w-full sm:w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
          />
          <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          {customerSearchTerm && (
            <button
              onClick={() => setCustomerSearchTerm('')}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      
      {customerSearchTerm && (
        <div className="mt-2 text-sm text-gray-600">
          Showing {filteredCustomers.length} of {customers.length} customers
        </div>
      )}
    </div>
    <div className="divide-y divide-gray-100">

      {filteredCustomers.length > 0 ? (
  filteredCustomers.map((customer, index) => {
          const customerOrders = orders.filter(order => 
            order.customerId === customer.id || order.customerPhone === customer.phone
          );
          const totalSpent = customerOrders
            .filter(order => order.status === 'delivered')
            .reduce((sum, order) => sum + (parseFloat(order.totalAmount) || parseFloat(order.price) || 0), 0);
          
          const isExpanded = expandedCustomer?.id === customer.id;
          const measurementHistory = customerMeasurementHistory[customer.id];
          
          return (
            <div key={customer.id} className="transition-all duration-300">
              {/* Customer Header */}
              <div 
                className="px-6 py-4 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all duration-300 cursor-pointer"
                style={{ animationDelay: `${index * 0.1}s` }}
                onClick={() => handleCustomerExpand(customer)}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-0">
                  <div className="flex items-center space-x-3 md:space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {(customer.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 flex items-center">
                        {customer.name}
                        <ChevronRight 
                          className={`ml-2 h-4 w-4 text-gray-400 transition-transform duration-200 ${
                            isExpanded ? 'rotate-90' : ''
                          }`} 
                        />
                      </p>
                      <p className="text-sm text-gray-500">{customer.phone || 'No phone'}</p>
                      <p className="text-xs text-gray-400">{customer.email || 'No email'}</p>
                    </div>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {customerOrders.length} order{customerOrders.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-lg font-bold text-green-600">
                      ${totalSpent.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {measurementHistory ? 
                        `${Object.keys(measurementHistory.orderMeasurements || {}).length} garment types` : 
                        'Click to load history'
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Expanded Measurement History */}
              {isExpanded && (
                <div className="px-6 pb-6 bg-gradient-to-br from-gray-50 to-purple-50/30 border-t border-gray-100">
                  {measurementHistory ? (
                    <div className="mt-4 space-y-6">
                      {/* Recent Orders */}
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                          <ShoppingBag className="h-5 w-5 mr-2 text-blue-600" />
                          Recent Orders ({customerOrders.length})
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {customerOrders.slice(0, 4).map(order => (
                            <div key={order.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {order.garmentType || 'Custom Order'}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    #{order.id?.slice(-8)}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {formatOrderDate(order.createdAt)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <StatusBadge status={order.status} />
                                  <p className="text-sm font-bold text-green-600 mt-1">
                                    ${order.totalAmount || order.price || 0}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Measurement History by Garment Type */}
                      {Object.keys(measurementHistory.orderMeasurements || {}).length > 0 && (
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                            <Edit className="h-5 w-5 mr-2 text-purple-600" />
                            Measurement History
                          </h4>
                          <div className="space-y-4">
                            {Object.entries(measurementHistory.orderMeasurements).map(([garmentType, measurements]) => (
                              <div key={garmentType} className="bg-white rounded-xl shadow-sm border border-gray-200">
                                <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-4 py-3 rounded-t-xl border-b border-gray-200">
                                  <h5 className="font-semibold text-gray-900 capitalize">
                                    {garmentType} Measurements ({measurements.length} records)
                                  </h5>
                                </div>
                                {/* Edit/Delete buttons for garment type */}
  {/* Header for garment type - no edit/delete buttons here */}
                                <div className="p-4 space-y-3">
                                  {measurements.map((record, recordIndex) => (
                                    <div key={recordIndex} className="border border-gray-100 rounded-lg p-3">
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <p className="text-sm font-medium text-gray-900">
                                            Order #{record.orderId?.slice(-8)}
                                          </p>
                                          <p className="text-xs text-gray-500">
                                            {formatOrderDate(record.orderDate)}
                                          </p>
                                          {record.fabric && (
                                            <p className="text-xs text-gray-400">
                                              Fabric: {record.fabric}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex items-center space-x-2">
  <StatusBadge status={record.status} />
  <div className="flex space-x-1">
    <button
      onClick={() => handleEditSingleMeasurement(customer, garmentType, record, recordIndex)}
      className="px-2 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors text-xs"
      title="Edit this measurement"
    >
      Edit
    </button>
    <button
      onClick={() => handleDeleteSingleMeasurement(customer, garmentType, record.orderId)}
      className="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors text-xs"
      title="Delete this measurement"
    >
      Delete
    </button>
  </div>
</div>
                                      </div>
                                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-3">
                                        {Object.entries(record.measurements).map(([measureName, value]) => (
                                          value && (
                                            <div key={measureName} className="bg-gray-50 p-2 rounded text-center">
                                              <p className="text-xs text-gray-500 uppercase tracking-wide">
                                                {measureName.replace(/([A-Z])/g, ' $1').trim()}
                                              </p>
                                              <p className="font-bold text-gray-900">{value}"</p>
                                            </div>
                                          )
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No measurements message */}
                      {Object.keys(measurementHistory.orderMeasurements || {}).length === 0 && (
                        <div className="text-center py-8">
                          <Edit className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                          <p className="text-gray-500">No measurement history found</p>
                          <p className="text-sm text-gray-400">
                            Measurements will appear here when orders with measurements are created
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 text-center py-8">
                      <div className="animate-spin h-8 w-8 border-2 border-purple-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                      <p className="text-gray-500">Loading measurement history...</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="px-6 py-12 text-center">
  <div className="mx-auto w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-4">
    <User className="w-12 h-12 text-gray-400" />
  </div>
  <h4 className="text-lg font-semibold text-gray-900 mb-2">
    {customerSearchTerm ? 'No customers found' : 'No customers'}
  </h4>
  <p className="text-gray-500">
    {customerSearchTerm 
      ? `No customers match "${customerSearchTerm}". Try a different search term.`
      : 'Customers will appear here once you receive orders.'
    }
  </p>
  {customerSearchTerm && (
    <button
      onClick={() => setCustomerSearchTerm('')}
      className="mt-3 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
    >
      Clear search
    </button>
  )}
</div>
      )}
    </div>
  </div>
)}

        {activeTab === 'calendar' && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/50 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-green-50 px-6 py-4 border-b border-gray-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-0">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">
                  {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex items-center space-x-1 md:space-x-2 justify-end">
                  <EnhancedButton
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateMonth(-1)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  >
                    <ChevronLeft size={20} />
                  </EnhancedButton>
                  <EnhancedButton
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentDate(new Date())}
                    className="px-4 py-2 text-sm font-medium"
                  >
                    Today
                  </EnhancedButton>
                  <EnhancedButton
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateMonth(1)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  >
                    <ChevronRight size={20} />
                  </EnhancedButton>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden shadow-inner text-xs sm:text-sm">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="bg-gradient-to-br from-gray-50 to-gray-100 py-2 md:py-3 px-2 md:px-3 text-center text-xs md:text-sm font-semibold text-gray-600">
                    {day}
                  </div>
                ))}
                
                {Array.from({ length: getFirstDayOfMonth(currentDate) }, (_, i) => (
                  <div key={`empty-${i}`} className="bg-white p-1 sm:p-2 h-12 sm:h-16 lg:h-24"></div>
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
                      className={`bg-white p-1 sm:p-2 h-16 sm:h-24 border-b border-r cursor-pointer hover:bg-gradient-to-br hover:from-blue-50 hover:to-purple-50 transition-all duration-300 ${
                        isCurrentDay ? 'bg-gradient-to-br from-blue-100 to-purple-100 ring-2 ring-blue-500' : ''
                      }`}
                      onClick={() => {
                        setSelectedDate(date);
                        setShowDayModal(true);
                      }}
                    >
                      <div className={`text-sm font-semibold mb-1 ${
                        isCurrentDay ? 'text-blue-700' : 'text-gray-900'
                      } ${hasPastDueOrders ? 'text-red-600' : ''}`}>
                        {i + 1}
                      </div>
                      <div className="space-y-1">
                        {dayOrders.slice(0, 2).map(order => (
                          <div
                            key={order.id}
                            className={`text-xs p-1 rounded-md truncate font-medium ${
                              ['pending', 'confirmed', 'in_progress'].includes(order.status) && isPastDue(date)
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : getStatusColor(order.status)
                            }`}
                          >
                            {order.customerName?.split(' ')[0] || 'Customer'}
                          </div>
                        ))}
                        {dayOrders.length > 2 && (
                          <div className="text-xs text-gray-500 font-medium">
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

      {/* Navigation Tabs */}
<div className="fixed bottom-4 md:bottom-6 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-lg rounded-xl md:rounded-2xl shadow-2xl border border-white/50 p-1 md:p-2 max-w-[95vw] overflow-x-auto">
  <nav className="flex space-x-1 md:space-x-2 items-center min-w-max">
    {[
      { id: 'overview', name: 'Overview', icon: TrendingUp },
      { id: 'orders', name: 'Orders', icon: ShoppingBag },
      { id: 'customers', name: 'Customers', icon: User },
      { id: 'calendar', name: 'Calendar', icon: Calendar }
    ].map((tab) => (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className={`flex items-center px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-medium text-xs sm:text-sm transition-all duration-300 ${
          activeTab === tab.id
            ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg transform scale-105'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }`}
      >
        <tab.icon className="h-4 w-4 md:h-5 md:w-5 mr-1 md:mr-2" />
        <span className="hidden sm:inline">{tab.name}</span>
      </button>
    ))}
    
    {/* Add Order Button */}
    <button
      onClick={() => setShowManualOrderModal(true)}
      className="flex items-center px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-medium text-xs sm:text-sm transition-all duration-300 bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:from-green-600 hover:to-emerald-700 transform hover:scale-105"
    >
      <Plus className="h-5 w-5 mr-2" />
      <span className="hidden sm:inline">Add Order</span>
    </button>
  </nav>
</div>
      <ManualOrderModal 
  showManualOrderModal={showManualOrderModal}
  setShowManualOrderModal={setShowManualOrderModal}
  manualOrderForm={manualOrderForm}
  setManualOrderForm={setManualOrderForm}
  selectedCategory={selectedCategory}
  setSelectedCategory={setSelectedCategory}
  handleSubmitOrder={handleSubmitOrder}
  measurementCategories={measurementCategories}
  handleCategoryChange={handleCategoryChange}
  handleMeasurementChange={handleMeasurementChange}
  getCustomerMeasurements={getCustomerMeasurements}
  customCategories={customCategories}
  handleDeleteCustomCategory={handleDeleteCustomCategory}
/>

<CustomCategoryModal
  showCustomCategoryModal={showCustomCategoryModal}
  setShowCustomCategoryModal={setShowCustomCategoryModal}
  customCategoryForm={customCategoryForm}
  setCustomCategoryForm={setCustomCategoryForm}
  customMeasurementInput={customMeasurementInput}
  setCustomMeasurementInput={setCustomMeasurementInput}
  handleAddCustomMeasurement={handleAddCustomMeasurement}
  handleRemoveCustomMeasurement={handleRemoveCustomMeasurement}
  handleSaveCustomCategory={handleSaveCustomCategory}
/>

<EditMeasurementsModal
  showEditMeasurementsModal={showEditMeasurementsModal}
  setShowEditMeasurementsModal={setShowEditMeasurementsModal}
  editingMeasurements={editingMeasurements}
  setEditingMeasurements={setEditingMeasurements}
  handleSaveMeasurements={handleSaveMeasurements}
/>

      <OrderModal />
      <DayModal />
      <PhotoModal />
    </div>
  );
};

export default TailorDashboard;

