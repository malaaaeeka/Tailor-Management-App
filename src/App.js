import './App.css'; 
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import TailorDashboard from './components/TailorDashboard';
import CustomerDashboard from './components/CustomerDashboard';
import OrderCreationForm from './components/OrderCreationForm'; 
import Login from './components/Login';

const Dashboard = () => {
  const { userRole } = useAuth();
  console.log("Debug - Current userRole:", userRole, "Type:", typeof userRole);
  
  if (userRole === 'tailor') {
    return <Navigate to="/tailor-dashboard" replace />;
  } else {
    return <Navigate to="/customer-dashboard" replace />;
  }
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/tailor-dashboard" element={
              <ProtectedRoute requiredRole="tailor">
                <Layout>
                  <TailorDashboard />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/customer-dashboard" element={
              <ProtectedRoute requiredRole="customer">
                <Layout>
                  <CustomerDashboard />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Add this new route for order creation */}
            <Route path="/create-order" element={
              <ProtectedRoute requiredRole="tailor">
                <Layout>
                  <OrderCreationForm />
                </Layout>
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;