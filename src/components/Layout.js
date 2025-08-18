import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Layout = ({ children }) => {
  const { currentUser, userRole } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-100">
      {currentUser && (
        <nav className="bg-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-indigo-700">
                  Tailor Shop
                </h1>
              </div>
              
              <div className="flex items-center space-x-4">
                {/* Change these to link to your HTML files */}
                <a 
                  href="/home.html"
                  className="px-3 py-2 rounded-md text-sm font-medium text-indigo-600 hover:text-indigo-900"
                >
                  Home
                </a>
                
                <a 
                  href="/about.html"
                  className="px-3 py-2 rounded-md text-sm font-medium text-indigo-600 hover:text-indigo-900"
                >
                  About
                </a>
                
                <a 
                  href="/contact.html"
                  className="px-3 py-2 rounded-md text-sm font-medium text-indigo-600 hover:text-indigo-900"
                >
                  Contact
                </a>

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