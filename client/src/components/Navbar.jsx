// src/components/Navbar.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../css/Navbar.css';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [role, setRole] = useState(localStorage.getItem('role') || 'user');

  useEffect(() => {
    const storedRole = localStorage.getItem('role');
    if (storedRole) {
      setRole(storedRole);
    }
  }, []);

  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
  };

  const handleLogin = (role) => {
    localStorage.setItem('role', role);
    setRole(role);
    setDropdownOpen(false);
    if (role === 'admin') {
      navigate('/documents');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="navbar-container">
      <div className="logo-container">
        <img id="logo" src="/SCCCI-logo.png" alt="Logo" className="logo" />
      </div>
      <div className="navbar">
        <div className='menu-items'>
          <h2
            onClick={() => navigate('/')}
            style={{
              cursor: 'pointer',
              color: location.pathname === '/' ? '#FFB221' : '#FFCDCD',
            }}
            className={location.pathname === '/' ? 'active' : ''}
          >
            Home
          </h2>
          {role === 'admin' && (
            <>
              <h2
                onClick={() => navigate('/documents')}
                style={{
                  cursor: 'pointer',
                  color: location.pathname === '/documents' ? '#FFB221' : '#FFCDCD',
                }}
                className={location.pathname === '/documents' ? 'active' : ''}
              >
                Documents
              </h2>
              <h2
                onClick={() => navigate('/chat-sessions')}
                style={{
                  cursor: 'pointer',
                  color: location.pathname === '/chat-sessions' ? '#FFB221' : '#FFCDCD',
                }}
                className={location.pathname === '/chat-sessions' ? 'active' : ''}
              >
                Chat Sessions
              </h2>
              <h2
                onClick={() => navigate('/settings')}
                style={{
                  cursor: 'pointer',
                  color: location.pathname === '/settings' ? '#FFB221' : '#FFCDCD',
                }}
                className={location.pathname === '/settings' ? 'active' : ''}
              >
                Settings
              </h2>
              <h2
                onClick={() => navigate('/template-questions')}
                style={{
                  cursor: 'pointer',
                  color: location.pathname === '/template-questions' ? '#FFB221' : '#FFCDCD',
                }}
                className={location.pathname === '/template-questions' ? 'active' : ''}
              >
                Templates
              </h2>
            </>
          )}
          <h2
            onClick={() => navigate('/chatbot')}
            style={{
              cursor: 'pointer',
              color: location.pathname === '/chatbot' ? '#FFB221' : '#FFCDCD',
            }}
            className={location.pathname === '/chatbot' ? 'active' : ''}
          >
            Chatbot
          </h2>
        </div>
        <div className="login-dropdown">
          <button className="login-button" onClick={toggleDropdown}>
            {role === 'admin' ? (
              <span>Admin</span>
            ) : role === 'user' ? (
              <span>User</span>
            ) : (
              <span>Login</span>
            )}
          </button>
          {dropdownOpen && (
            <div className="dropdown-menu">
              {role === 'admin' && (
                <button onClick={() => handleLogin('user')}>User</button>
              )}
             {role !== 'admin' && (
                <button onClick={() => handleLogin('admin')}>Admin</button>
              )}
              {!role && (
                <>
                  <button onClick={() => handleLogin('user')}>User</button>
                  <button onClick={() => handleLogin('admin')}>Admin</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Navbar;