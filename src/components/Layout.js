import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Layout = ({ children }) => {
  const { currentUser, userRole, logout } = useAuth();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {currentUser && (
        <nav className="bg-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-gray-900">
                  Tailor Shop
                </h1>
              </div>
              
              <div className="flex items-center space-x-4">
                {userRole === 'tailor' && (
                  <>
                    <Link 
                      to="/tailor-dashboard"
                      className={`px-3 py-2 rounded-md text-sm font-medium ${
                        location.pathname === '/tailor-dashboard'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Dashboard
                    </Link>
                   
                  </>
                )}
                {userRole === 'customer' && (
                  <>
                    <Link 
                      to="/customer-dashboard"
                      className={`px-3 py-2 rounded-md text-sm font-medium ${
                        location.pathname === '/customer-dashboard'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      My Orders
                    </Link>
                    <Link 
                      to="/new-order"
                      className={`px-3 py-2 rounded-md text-sm font-medium ${
                        location.pathname === '/new-order'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      New Order
                    </Link>
                  </>
                )}
                
                <span className="text-sm text-gray-500">
                  {currentUser.email} ({userRole})
                </span>
                
                <button
                  onClick={handleLogout}
                  className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded text-sm"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;