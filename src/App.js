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

// Direct redirect to home.html
const RedirectToHome = () => {
  // Immediate redirect - no useEffect delay
  window.location.href = '/home.html';
  
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white'
    }}>
      <div>Redirecting to home page...</div>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="App">
          <Routes>
            {/* Redirect to your static HTML home page */}
            <Route path="/" element={<RedirectToHome />} />
            <Route path="/home" element={<RedirectToHome />} />

            <Route path="/login" element={<Login />} />

            <Route path="/dashboard" element={
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

            <Route path="/create-order" element={
              <ProtectedRoute requiredRole="tailor">
                <Layout>
                  <OrderCreationForm />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Catch-all route - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
          