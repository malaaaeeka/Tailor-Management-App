import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase-config';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const Login = () => {
  const [userType, setUserType] = useState('customer');
  const [isSignup, setIsSignup] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    businessName: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});

  // Refs for input fields
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const businessNameRef = useRef(null);

  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const tailorDoc = await getDoc(doc(db, 'tailors', user.uid));
          if (tailorDoc.exists()) {
            navigate('/tailor-dashboard');
            return;
          }
          const customerDoc = await getDoc(doc(db, 'customers', user.uid));
          if (customerDoc.exists()) {
            navigate('/customer-dashboard');
            return;
          }
        } catch (error) {
          console.error('Error checking user role:', error);
        }
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors({ ...errors, [name]: false });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    let firstErrorField = null;

    // Always validate email and password
    if (!formData.email.trim()) {
      newErrors.email = true;
      if (!firstErrorField) firstErrorField = emailRef.current;
    }
    
    if (!formData.password.trim()) {
      newErrors.password = true;
      if (!firstErrorField) firstErrorField = passwordRef.current;
    }

    // Additional validation for customer signup
    if (isSignup && userType === 'customer') {
      if (!formData.name.trim()) {
        newErrors.name = true;
        if (!firstErrorField) firstErrorField = nameRef.current;
      }
      
      if (!formData.phone.trim()) {
        newErrors.phone = true;
        if (!firstErrorField) firstErrorField = phoneRef.current;
      }
    }

    // Additional validation for tailor signup
    if (isSignup && userType === 'tailor') {
      if (!formData.name.trim()) {
        newErrors.name = true;
        if (!firstErrorField) firstErrorField = nameRef.current;
      }
      
      if (!formData.phone.trim()) {
        newErrors.phone = true;
        if (!firstErrorField) firstErrorField = phoneRef.current;
      }

      if (!formData.businessName.trim()) {
        newErrors.businessName = true;
        if (!firstErrorField) firstErrorField = businessNameRef.current;
      }

    }

    setErrors(newErrors);

    // Focus on first error field
    if (firstErrorField) {
      firstErrorField.focus();
      firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      name: '',
      phone: '',
      businessName: ''
    });
    setErrors({});
  };

  const handleTailorAuth = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setMessage('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      if (isSignup) {
        // Tailor Signup
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email.toLowerCase().trim(), formData.password);
        
        await setDoc(doc(db, 'tailors', userCredential.user.uid), {
          name: formData.name.trim(),
          email: formData.email.toLowerCase().trim(),
          phone: formData.phone.trim(),
          businessName: formData.businessName.trim(),
          userType: 'tailor',
          createdAt: new Date(),
          isActive: true,
          isVerified: false, // Admin needs to verify new tailors
          orders: [], // Initialize empty orders array for specific orders
          completedOrders: [],
          totalEarnings: 0,
          rating: 0,
          totalReviews: 0,
          uid: userCredential.user.uid
        });

        setMessage(`Welcome ${formData.name}! Your tailor account has been created successfully. Please wait for admin verification before you can access your dashboard.`);
        resetForm();
        // Don't navigate immediately since account needs verification
      } else {
        // Tailor Login
        const userCredential = await signInWithEmailAndPassword(auth, formData.email.toLowerCase().trim(), formData.password);
        
        const tailorDoc = await getDoc(doc(db, 'tailors', userCredential.user.uid));
        if (tailorDoc.exists()) {
          const tailorData = tailorDoc.data();
          
          if (!tailorData.isActive) {
            await auth.signOut();
            setMessage('Your tailor account has been deactivated. Please contact admin.');
            setLoading(false);
            return;
          }
          
          if (!tailorData.isVerified) {
            await auth.signOut();
            setMessage('Your tailor account is pending verification. Please contact admin.');
            setLoading(false);
            return;
          }
          
          setMessage(`Welcome back, ${tailorData.name}! Redirecting to dashboard...`);
          setTimeout(() => navigate('/tailor-dashboard'), 1500);

        } else {
          await auth.signOut();
          setMessage('Access denied: This account is not authorized as a tailor. Please contact admin for tailor account creation.');
        }
      }
    } catch (error) {
      console.error('Tailor auth error:', error);
      let errorMessage = 'An error occurred. Please try again.';
      
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'Access denied: No authorized tailor account found with this email.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password. Please try again.';
          break;
        case 'auth/email-already-in-use':
          errorMessage = 'An account with this email already exists. Please login instead.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password should be at least 6 characters long.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later.';
          break;
        default:
          errorMessage = error.message;
      }
      
      setMessage(errorMessage);
    }
    
    setLoading(false);
  };

  const handleCustomerAuth = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setMessage('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      if (isSignup) {
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        
        await setDoc(doc(db, 'customers', userCredential.user.uid), {
          name: formData.name.trim(),
          email: formData.email.toLowerCase().trim(),
          phone: formData.phone.trim(),
          userType: 'customer',
          createdAt: new Date(),
          isActive: true,
          familyMembers: [],
          uid: userCredential.user.uid
        });

        setMessage(`Welcome ${formData.name}! Account created successfully. Redirecting...`);
        resetForm();
        setTimeout(() => navigate('/customer-dashboard'), 2000); 
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, formData.email.toLowerCase().trim(), formData.password);
        
        const customerDoc = await getDoc(doc(db, 'customers', userCredential.user.uid));
        if (customerDoc.exists()) {
          const customerData = customerDoc.data();
          setMessage(`Welcome back, ${customerData.name}! Redirecting to dashboard...`);
          setTimeout(() => navigate('/customer-dashboard'), 1500);
        } else {
          await auth.signOut();
          setMessage('Error: This account is not registered as a customer. Please sign up as a customer or use the tailor login.');
        }
      }
    } catch (error) {
      console.error('Customer auth error:', error);
      let errorMessage = 'An error occurred. Please try again.';
      
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email. Please sign up first.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password. Please try again.';
          break;
        case 'auth/email-already-in-use':
          errorMessage = 'An account with this email already exists. Please login instead.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password should be at least 6 characters long.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address.';
          break;
        default:
          errorMessage = error.message;
      }
      
      setMessage(errorMessage);
    }
    
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      setErrors({ email: true });
      emailRef.current?.focus();
      setMessage('Please enter your email first.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, formData.email.toLowerCase().trim());
      setMessage('Password reset email sent! Check your inbox.');
    } catch (error) {
      setMessage('Error sending reset email. Please check your email address.');
    }
  };

  const handleUserTypeChange = (newUserType) => {
    setUserType(newUserType);
    resetForm();
    setMessage('');
    // Don't force isSignup to false for tailors anymore
  };

  const handleAuthToggle = (newIsSignup) => {
    setIsSignup(newIsSignup);
    resetForm();
    setMessage('');
  };

  const getResponsiveStyles = () => {
    const isMobile = window.innerWidth <= 768;
    const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;

    return {
      container: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        padding: isMobile ? '1rem' : '2rem'
      },
      card: {
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.15)',
        overflow: 'hidden',
        width: '100%',
        maxWidth: isMobile ? '100%' : isTablet ? '700px' : '900px',
        minHeight: isMobile ? 'auto' : '500px'
      },
      leftPanel: {
        flex: isMobile ? 'none' : '1',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: isMobile ? '2rem 1.5rem' : isTablet ? '2.5rem 2rem' : '3rem 2rem',
        color: 'white',
        textAlign: 'center',
        minHeight: isMobile ? '200px' : 'auto'
      },
      rightPanel: {
        flex: isMobile ? 'none' : '1',
        padding: isMobile ? '2rem 1.5rem' : isTablet ? '2.5rem 2rem' : '3rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      },
      welcomeTitle: {
        fontSize: isMobile ? '1.8rem' : isTablet ? '2rem' : '2.5rem',
        fontWeight: '700',
        marginBottom: '1rem',
        textTransform: 'uppercase',
        letterSpacing: isMobile ? '1px' : '2px'
      },
      welcomeSubtitle: {
        fontSize: isMobile ? '0.875rem' : '1rem',
        marginBottom: '2rem',
        opacity: '0.9',
        lineHeight: '1.5'
      },
      toggleButton: {
        padding: isMobile ? '0.6rem 1.5rem' : '0.75rem 2rem',
        border: '2px solid white',
        borderRadius: '25px',
        background: 'transparent',
        color: 'white',
        fontSize: isMobile ? '0.75rem' : '0.875rem',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        textTransform: 'uppercase',
        letterSpacing: '1px'
      },
      formTitle: {
        fontSize: isMobile ? '1.5rem' : isTablet ? '1.75rem' : '2rem',
        fontWeight: '600',
        color: '#667eea',
        textAlign: 'center',
        marginBottom: isMobile ? '1.5rem' : '2rem'
      },
      tabs: {
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        justifyContent: 'center',
        flexWrap: 'wrap'
      },
      tab: {
        padding: isMobile ? '0.6rem 1.2rem' : '0.5rem 1rem',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        background: 'transparent',
        color: '#6b7280',
        fontWeight: '500',
        fontSize: isMobile ? '0.8rem' : '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        minWidth: isMobile ? '100px' : 'auto'
      },
      tabActive: {
        borderColor: '#667eea',
        background: '#667eea',
        color: 'white'
      },
      inputGroup: {
        marginBottom: '1rem'
      },
      input: {
        width: '100%',
        padding: isMobile ? '1rem' : '0.875rem 1rem',
        border: '2px solid #e5e7eb',
        borderRadius: '6px',
        fontSize: isMobile ? '1rem' : '0.875rem',
        background: 'white',
        transition: 'all 0.2s ease',
        fontFamily: 'inherit',
        boxSizing: 'border-box'
      },
      inputError: {
        borderColor: '#dc2626',
        backgroundColor: '#fef2f2',
        animation: 'shake 0.5s ease-in-out'
      },
      submitButton: {
        width: '100%',
        padding: isMobile ? '1rem' : '0.875rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontSize: isMobile ? '1rem' : '0.875rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginTop: '1rem'
      },
      submitButtonDisabled: {
        opacity: '0.7',
        cursor: 'not-allowed'
      },
      link: {
        color: '#667eea',
        textDecoration: 'none',
        fontSize: isMobile ? '1rem' : '0.875rem',
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        fontFamily: 'inherit',
        textAlign: 'center',
        marginTop: '1rem',
        padding: isMobile ? '0.5rem' : '0'
      },
      message: {
        padding: '0.75rem 1rem',
        borderRadius: '6px',
        fontSize: isMobile ? '1rem' : '0.875rem',
        textAlign: 'center',
        marginTop: '1rem'
      },
      messageSuccess: {
        background: '#f0fdf4',
        color: '#166534',
        border: '1px solid #bbf7d0'
      },
      messageError: {
        background: '#fef2f2',
        color: '#dc2626',
        border: '1px solid #fecaca'
      },
      mobileSignUpSection: {
        marginTop: '2rem',
        padding: '1.5rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        textAlign: 'center',
        color: 'white'
      },
      divider: {
        position: 'relative',
        margin: '1rem 0',
        textAlign: 'center'
      },
      dividerText: {
        background: 'white',
        padding: '0 1rem',
        color: '#9ca3af',
        fontSize: '0.875rem'
      },
      mobileSignUpTitle: {
        fontSize: '1.25rem',
        fontWeight: '600',
        marginBottom: '0.5rem',
        textTransform: 'uppercase',
        letterSpacing: '1px'
      },
      mobileSignUpSubtitle: {
        fontSize: '0.875rem',
        marginBottom: '1rem',
        opacity: '0.9',
        lineHeight: '1.4'
      },
      mobileSignUpButton: {
        padding: '0.75rem 2rem',
        border: '2px solid white',
        borderRadius: '25px',
        background: 'transparent',
        color: 'white',
        fontSize: '0.875rem',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        textTransform: 'uppercase',
        letterSpacing: '1px'
      }
    };
  };

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Add CSS for shake animation
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
      }
    `;
    document.head.appendChild(style);
    
    return () => document.head.removeChild(style);
  }, []);

  const styles = getResponsiveStyles();
  const isMobile = window.innerWidth <= 768;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Left Panel - Sign Up (Desktop/Tablet only) */}
        {!isMobile && (
          <div style={styles.leftPanel}>
            <h1 style={styles.welcomeTitle}>
              {isSignup ? 'Welcome!' : 'New Here?'}
            </h1>
            <p style={styles.welcomeSubtitle}>
              {isSignup 
                ? `Already have a ${userType} account? Sign in to access your dashboard.`
                : `Create your ${userType} account and start your journey with our tailoring service.`
              }
            </p>
            <button 
              style={styles.toggleButton}
              onClick={() => handleAuthToggle(!isSignup)}
            >
              {isSignup ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        )}

        {/* Right Panel - Form */}
        <div style={styles.rightPanel}>
          <h2 style={styles.formTitle}>
            {userType === 'tailor' ? 
              (isSignup ? 'Create Tailor Account' : 'Tailor Login') : 
              (isSignup ? 'Create Customer Account' : 'Customer Login')
            }
          </h2>

          {/* User Type Selection */}
          <div style={styles.tabs}>
            <button
              onClick={() => handleUserTypeChange('customer')}
              style={{
                ...styles.tab,
                ...(userType === 'customer' ? styles.tabActive : {})
              }}
            >
              Customer
            </button>
            <button
              onClick={() => handleUserTypeChange('tailor')}
              style={{
                ...styles.tab,
                ...(userType === 'tailor' ? styles.tabActive : {})
              }}
            >
              Tailor
            </button>
          </div>

          {/* Form Fields - Show signup fields for both customers and tailors */}
          {isSignup && (
            <div style={styles.inputGroup}>
              <input
                ref={nameRef}
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                style={{
                  ...styles.input,
                  ...(errors.name ? styles.inputError : {})
                }}
                placeholder="Full Name *"
                required
              />
            </div>
          )}

          {isSignup && (
            <div style={styles.inputGroup}>
              <input
                ref={phoneRef}
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                style={{
                  ...styles.input,
                  ...(errors.phone ? styles.inputError : {})
                }}
                placeholder="Phone Number *"
                required
              />
            </div>
          )}

          {/* Additional fields for tailor signup */}
          {isSignup && userType === 'tailor' && (
            <>
              <div style={styles.inputGroup}>
                <input
                  ref={businessNameRef}
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleInputChange}
                  style={{
                    ...styles.input,
                    ...(errors.businessName ? styles.inputError : {})
                  }}
                  placeholder="Business Name *"
                  required
                />
              </div>
            </>
          )}

          <div style={styles.inputGroup}>
            <input
              ref={emailRef}
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              style={{
                ...styles.input,
                ...(errors.email ? styles.inputError : {})
              }}
              placeholder="Email *"
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <input
              ref={passwordRef}
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              style={{
                ...styles.input,
                ...(errors.password ? styles.inputError : {})
              }}
              placeholder="Password *"
              minLength="6"
              required
            />
          </div>

          <button 
            onClick={userType === 'tailor' ? handleTailorAuth : handleCustomerAuth}
            disabled={loading} 
            style={{
              ...styles.submitButton,
              ...(loading ? styles.submitButtonDisabled : {})
            }}
          >
            {loading ? (
              userType === 'tailor' ? 
                (isSignup ? 'Creating Account...' : 'Signing In...') : 
                (isSignup ? 'Creating Account...' : 'Signing In...')
            ) : (
              userType === 'tailor' ? 
                (isSignup ? 'Create Tailor Account' : 'Sign In') : 
                (isSignup ? 'Create Account' : 'Sign In')
            )}
          </button>

          <button 
            type="button" 
            onClick={handleForgotPassword}
            style={styles.link}
            disabled={loading}
          >
            Forgot Password?
          </button>

          {/* Auth toggle for both user types */}
          <button 
            type="button"
            onClick={() => handleAuthToggle(!isSignup)}
            style={styles.link}
          >
            {isSignup ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>

          {/* Mobile Sign Up Section */}
          {isMobile && !isSignup && (
            <div style={styles.mobileSignUpSection}>
              <div style={styles.divider}>
                <span style={styles.dividerText}>or</span>
              </div>
              <h3 style={styles.mobileSignUpTitle}>New Here?</h3>
              <p style={styles.mobileSignUpSubtitle}>
                Create your {userType} account and start your journey with our tailoring service.
              </p>
              <button 
                style={styles.mobileSignUpButton}
                onClick={() => handleAuthToggle(true)}
              >
                Sign Up
              </button>
            </div>
          )}

          {message && (
            <div style={{
              ...styles.message,
              ...(message.includes('Error') || message.includes('error') || message.includes('Please fill') ? styles.messageError : styles.messageSuccess)
            }}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;