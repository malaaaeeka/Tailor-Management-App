import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase-config'; // Your firebase config file
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setUserRole(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        
        try {
          // First check if user is a tailor
          const tailorDoc = await getDoc(doc(db, 'tailors', user.uid));
          if (tailorDoc.exists()) {
            const tailorData = tailorDoc.data();
            setUserRole(tailorData.userType); // This will be 'tailor'
          } else {
            // Then check if user is a customer
            const customerDoc = await getDoc(doc(db, 'customers', user.uid));
            if (customerDoc.exists()) {
              const customerData = customerDoc.data();
              setUserRole(customerData.userType); // This will be 'customer'
            } else {
              // Default fallback
              setUserRole('customer');
            }
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
          setUserRole('customer');
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};