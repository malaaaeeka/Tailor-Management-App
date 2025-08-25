
import emailjs from '@emailjs/browser';
// Initialize EmailJS with your public key
if (typeof emailjs !== 'undefined') {
  emailjs.init("CQ-79LFMpMa0KXNxx");
} else {
  console.error('EmailJS not loaded. Make sure to include the EmailJS script in your HTML.');
}

// Email service configuration
const EMAIL_CONFIG = {
  serviceID: "service_mmhdz7f",
  templateID: "template_avzu0uc",
  publicKey: "CQ-79LFMpMa0KXNxx"
};

// Main function to send order status emails
export const sendOrderStatusEmail = async (orderData) => {
  try {
    // Check if EmailJS is available
    if (typeof emailjs === 'undefined') {
      throw new Error('EmailJS is not loaded. Please include the EmailJS script in your HTML.');
    }

    // Validate data before sending
    console.log('Validating order data:', orderData);
    validateOrderData(orderData);
    
    const templateParams = {
      // Variables that match your EmailJS template exactly
      customer_name: orderData.customerName,
      order_number: orderData.orderNumber,
      status: orderData.status,
      name: "Tailor Shop", // This matches {{name}} in your template
      email: orderData.customerEmail, // This matches {{email}} in your template
      
      // Additional data for your template content
      order_items: orderData.items,
      order_total: orderData.total,
      status_message: getTailorStatusMessage(orderData.status)
    };

    console.log(' Sending email with params:', templateParams);

    const response = await emailjs.send(
      EMAIL_CONFIG.serviceID,
      EMAIL_CONFIG.templateID,
      templateParams,
      EMAIL_CONFIG.publicKey
    );

    console.log('Email sent successfully:', response);
    return { success: true, response };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error };
  }
};

// Tailor-specific status messages
const getTailorStatusMessage = (status) => {
  const messages = {
    'ready': 'Excellent news! Your custom tailored garment is now ready for pickup. Our master tailor has put the finishing touches on your piece, and we\'re excited for you to see the result.',
    
    'delivered': 'Your custom tailored garment has been successfully delivered! We hope you absolutely love how it fits and looks. Thank you for trusting us with your tailoring needs.',
    
    'in_progress': 'Your tailoring order is currently being worked on by our skilled craftsmen. We\'re taking great care to ensure every detail meets our high standards.',

    'cancelled': 'Your tailoring order has been cancelled. If this was unexpected or you have any questions, please don\'t hesitate to contact us immediately.',
    
    'alterations_needed': 'We\'ve reviewed your garment and some minor alterations are needed to ensure the perfect fit. We\'ll contact you shortly to schedule a fitting.',
    
    'measurements_required': 'We need to schedule a measurement session to proceed with your custom tailoring. Please contact us to arrange an appointment.'
  };
  
  return messages[status.toLowerCase()] || 'Your tailoring order status has been updated. Please contact us if you have any questions.';
};

// Specific functions for different order statuses
export const sendOrderReadyEmail = async (orderData) => {
  console.log('Sending "Order Ready" email for order:', orderData.orderNumber);
  return sendOrderStatusEmail({
    ...orderData,
    status: 'ready'
  });
};

export const sendOrderDeliveredEmail = async (orderData) => {
  console.log('Sending "Order Delivered" email for order:', orderData.orderNumber);
  return sendOrderStatusEmail({
    ...orderData,
    status: 'delivered'
  });
};

export const sendOrderInProgressEmail = async (orderData) => {
  console.log('Sending "Order In Progress" email for order:', orderData.orderNumber);
  return sendOrderStatusEmail({
    ...orderData,
    status: 'in_progress'
  });
};

export const sendAlterationsNeededEmail = async (orderData) => {
  console.log('Sending "Alterations Needed" email for order:', orderData.orderNumber);
  return sendOrderStatusEmail({
    ...orderData,
    status: 'alterations_needed'
  });
};

// Helper function to validate email data before sending
export const validateOrderData = (orderData) => {
  console.log(' Validating order data...');
  
  const required = ['customerName', 'customerEmail', 'orderNumber', 'items', 'total'];
  const missing = required.filter(field => !orderData[field]);
  
  if (missing.length > 0) {
    const error = `Missing required fields: ${missing.join(', ')}`;
    console.error('Validation failed:', error);
    throw new Error(error);
  }
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(orderData.customerEmail)) {
    const error = 'Invalid email address';
    console.error('Email validation failed:', error);
    throw new Error(error);
  }
  
  console.log(' Validation passed');
  return true;
};