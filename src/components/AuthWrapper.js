// Create a new file: src/components/AuthWrapper.js
import React, { useState, useEffect } from 'react';
import './AuthWrapper.css';

const AuthWrapper = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is already authenticated (session storage)
  useEffect(() => {
    const authStatus = sessionStorage.getItem('audiobook_auth');
    if (authStatus === 'authenticated') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');

    // Get password from environment variable
    const correctPassword = process.env.REACT_APP_ACCESS_PASSWORD;
    
    if (!correctPassword) {
      setError('Access password not configured');
      return;
    }

    if (password === correctPassword) {
      setIsAuthenticated(true);
      sessionStorage.setItem('audiobook_auth', 'authenticated');
      setPassword(''); // Clear password input
    } else {
      setError('Incorrect password');
      setPassword(''); // Clear password input on error
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('audiobook_auth');
    setPassword('');
    setError('');
  };

  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>🎧 Audiobook Access</h2>
          <p>Please enter the access password</p>
          
          <form onSubmit={handleLogin} className="auth-form">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="auth-input"
              autoFocus
            />
            <button type="submit" className="auth-button">
              Access App
            </button>
          </form>
          
          {error && <div className="auth-error">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="auth-header">
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>
      {children}
    </div>
  );
};

export default AuthWrapper;