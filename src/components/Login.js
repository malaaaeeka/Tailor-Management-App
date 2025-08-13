import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase-config';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
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

  // Check if user is already logged in
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User is signed in, check their role and redirect
        try {
          // Check if user is a tailor
          const tailorDoc = await getDoc(doc(db, 'tailors', user.uid));
          if (tailorDoc.exists()) {
            navigate('/');
            return;
          }
          
          // Check if user is a customer
          const customerDoc = await getDoc(doc(db, 'customers', user.uid));
          if (customerDoc.exists()) {
            navigate('/');
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
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      name: '',
      phone: '',
      businessName: ''
    });
  };

  const handleTailorAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (isSignup) {
        // Validate required fields for tailor signup
        if (!formData.name || !formData.businessName || !formData.phone) {
          setMessage('Please fill in all required fields.');
          setLoading(false);
          return;
        }

        // Create new tailor account
        const userCredential = await createUserWithEmailAndPassword(
          auth, 
          formData.email, 
          formData.password
        );
        
        // Save tailor data to Firestore
        await setDoc(doc(db, 'tailors', userCredential.user.uid), {
          name: formData.name.trim(),
          email: formData.email.toLowerCase().trim(),
          businessName: formData.businessName.trim(),
          phone: formData.phone.trim(),
          userType: 'tailor',
          createdAt: new Date(),
          isActive: true,
          uid: userCredential.user.uid
        });

        setMessage('Account created successfully! Redirecting to dashboard...');
        resetForm();
        
        // Redirect after successful signup
        setTimeout(() => {
          navigate('/');
        }, 2000);
      } else {
        // Sign in existing tailor
        const userCredential = await signInWithEmailAndPassword(
          auth, 
          formData.email.toLowerCase().trim(), 
          formData.password
        );
        
        // Check if user is a tailor
        const tailorDoc = await getDoc(doc(db, 'tailors', userCredential.user.uid));
        if (tailorDoc.exists()) {
          const tailorData = tailorDoc.data();
          setMessage(`Welcome back, ${tailorData.name}! Redirecting to dashboard...`);
          
          // Navigate to dashboard
          setTimeout(() => {
            navigate('/');
          }, 1500);
        } else {
          // User exists in auth but not in tailors collection
          await auth.signOut();
          setMessage('Error: This account is not registered as a tailor. Please sign up as a tailor or use the customer login.');
        }
      }
    } catch (error) {
      console.error('Tailor auth error:', error);
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

  const handleCustomerAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (isSignup) {
        // Validate required fields for customer signup
        if (!formData.name || !formData.phone) {
          setMessage('Please fill in all required fields.');
          setLoading(false);
          return;
        }

        // Create new customer account
        const userCredential = await createUserWithEmailAndPassword(
          auth, 
          formData.email, 
          formData.password
        );
        
        // Save customer data to Firestore
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
        
        // Auto-redirect to dashboard after successful signup
        setTimeout(() => {
          navigate('/');
        }, 2000);
      } else {
        // Sign in existing customer
        const userCredential = await signInWithEmailAndPassword(
          auth, 
          formData.email.toLowerCase().trim(), 
          formData.password
        );
        
        // Check if user is a customer
        const customerDoc = await getDoc(doc(db, 'customers', userCredential.user.uid));
        if (customerDoc.exists()) {
          const customerData = customerDoc.data();
          setMessage(`Welcome back, ${customerData.name}! Redirecting to dashboard...`);
          
          // Navigate to dashboard
          setTimeout(() => {
            navigate('/');
          }, 1500);
        } else {
          // User exists in auth but not in customers collection
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
  };

  const handleAuthToggle = (newIsSignup) => {
    setIsSignup(newIsSignup);
    resetForm();
    setMessage('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Tailor Management App</h1>
        
        {/* User Type Selector */}
        <div className="user-type-selector">
          <button 
            className={userType === 'customer' ? 'active' : ''}
            onClick={() => handleUserTypeChange('customer')}
          >
            Customer
          </button>
          <button 
            className={userType === 'tailor' ? 'active' : ''}
            onClick={() => handleUserTypeChange('tailor')}
          >
            Tailor (Admin)
          </button>
        </div>

        {/* Login/Signup Toggle */}
        <div className="auth-toggle">
          <button 
            className={!isSignup ? 'active' : ''}
            onClick={() => handleAuthToggle(false)}
          >
            Login
          </button>
          <button 
            className={isSignup ? 'active' : ''}
            onClick={() => handleAuthToggle(true)}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={userType === 'tailor' ? handleTailorAuth : handleCustomerAuth}>
          <h2>
            {userType === 'tailor' ? 'Tailor' : 'Customer'} 
            {isSignup ? ' Sign Up' : ' Login'}
          </h2>

          {isSignup && (
            <input
              type="text"
              name="name"
              placeholder="Full Name *"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          )}

          {isSignup && userType === 'tailor' && (
            <input
              type="text"
              name="businessName"
              placeholder="Business Name *"
              value={formData.businessName}
              onChange={handleInputChange}
              required
            />
          )}

          {isSignup && (
            <input
              type="tel"
              name="phone"
              placeholder="Phone Number *"
              value={formData.phone}
              onChange={handleInputChange}
              required
            />
          )}

          <input
            type="email"
            name="email"
            placeholder="Email Address *"
            value={formData.email}
            onChange={handleInputChange}
            required
          />

          <input
            type="password"
            name="password"
            placeholder="Password (min 6 characters) *"
            value={formData.password}
            onChange={handleInputChange}
            minLength="6"
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? 'Processing...' : (isSignup ? 'Create Account' : 'Login')}
          </button>

          {!isSignup && (
            <button 
              type="button" 
              onClick={handleForgotPassword}
              className="forgot-password"
              disabled={loading}
            >
              Forgot Password?
            </button>
          )}
        </form>

        {message && (
          <div className={`message ${message.includes('Error') || message.includes('error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        {isSignup && (
          <div className="signup-note">
            <small>* Required fields</small>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;