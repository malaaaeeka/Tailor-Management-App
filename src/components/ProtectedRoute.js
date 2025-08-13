import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { currentUser, userRole } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (requiredRole && userRole !== requiredRole) {
    if (userRole === 'tailor') {
      return <Navigate to="/tailor-dashboard" />;
    } else {
      return <Navigate to="/customer-dashboard" />;
    }
  }

  return children;
};

export default ProtectedRoute;