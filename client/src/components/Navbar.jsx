// src/components/Navbar.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../css/Navbar.css';

const Navbar = () => {
  // Translation object for navbar items
  const translations = {
    en: {
      home: 'Home',
      chatbot: 'Chatbot',
      documents: 'Documents',
      chatSessions: 'Chat Sessions',
      chatbotSettings: 'Chatbot Settings',
      templateQuestions: 'Template Questions',
      login: 'Login',
      loginUser: 'Login as User',
      loginAdmin: 'Login as Admin',
      logout: 'Log out',
    },
    zh: {
      home: '主页',
      chatbot: '聊天机器人',
      documents: '文件',
      chatSessions: '聊天会话',
      chatbotSettings: '机器人设置',
      templateQuestions: '模板问题',
      login: '登录',
      loginUser: '以用户身份登录',
      loginAdmin: '以管理员身份登录',
      logout: '登出',
    }
  };
  // Language state, default to localStorage or 'en'
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const t = translations[language];

  // Update language in localStorage and state
  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
    window.dispatchEvent(new Event('languageChanged'));
  };
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // Memoize role for performance, default to null (no role)
  const [role, setRole] = useState(() => localStorage.getItem('role') || null);

  // Sync role from localStorage on mount and when storage changes
  useEffect(() => {
    const handleStorage = () => {
      const storedRole = localStorage.getItem('role');
      setRole(storedRole || null);
    };
    window.addEventListener('storage', handleStorage);
    handleStorage();
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Toggle dropdown open/close
  const toggleDropdown = () => {
    setDropdownOpen((open) => !open);
  };

  // Handle login as user or admin
  const handleLogin = (newRole) => {
    try {
      if (!['admin', 'user'].includes(newRole)) throw new Error('Invalid role');
      localStorage.setItem('role', newRole);
      setRole(newRole);
      setDropdownOpen(false);
      if (newRole === 'admin') {
        navigate('/documents');
      } else {
        navigate('/');
      }
    } catch (err) {
      alert('Login error: ' + err.message);
    }
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('role');
    setRole(null);
    setDropdownOpen(false);
    navigate('/');
  };

  return (
    <div className="navbar-container">
      <div className="logo-container">
        <img id="logo" src="/SCCCI-logo.png" alt="Logo" className="logo" />
      {/* Language dropdown beside logo */}
      <select
        value={language}
        onChange={e => handleLanguageChange(e.target.value)}
        style={{ marginLeft: '16px', fontSize: '1rem', padding: '2px 8px' }}
        aria-label="Language selector"
      >
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
      </div>
      <div className="navbar">
        <div className='menu-items'>
          {/* Home is always visible */}
          <h2
            onClick={() => navigate('/')}
            style={{
              cursor: 'pointer',
              color: location.pathname === '/' ? '#FFB221' : '#FFCDCD',
            }}
            className={location.pathname === '/' ? 'active' : ''}
          >
            {t.home}
          </h2>
          {/* Chatbot is always visible */}
          <h2
            onClick={() => navigate('/chatbot')}
            style={{
              cursor: 'pointer',
              color: location.pathname === '/chatbot' ? '#FFB221' : '#FFCDCD',
            }}
            className={location.pathname === '/chatbot' ? 'active' : ''}
          >
            {t.chatbot}
          </h2>
        </div>
        {/* Top right dropdown for login/admin/user/logout */}
        <div className="login-dropdown">
          <button
            className="login-button"
            onClick={toggleDropdown}
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            aria-label="Account menu"
          >
            {/* Show role or Login (Admin/User not translated) */}
            {role === 'admin' ? <span>Admin</span> : role === 'user' ? <span>User</span> : <span>{t.login}</span>}
          </button>
          {dropdownOpen && (
            <div className="dropdown-menu" role="menu">
              {/* If logged in as admin, show all admin pages and logout */}
              {role === 'admin' && (
                <>
                  <button onClick={() => navigate('/documents')}>{t.documents}</button>
                  <button onClick={() => navigate('/chat-sessions')}>{t.chatSessions}</button>
                  <button onClick={() => navigate('/settings')}>{t.chatbotSettings}</button>
                  <button onClick={() => navigate('/template-questions')}>{t.templateQuestions}</button>
                  <button onClick={handleLogout}>{t.logout}</button>
                </>
              )}
              {/* If logged in as user, only show logout */}
              {role === 'user' && (
                <button onClick={handleLogout}>{t.logout}</button>
              )}
              {/* If no role, show login options for user and admin */}
              {!role && (
                <>
                  <button onClick={() => handleLogin('user')}>{t.loginUser}</button>
                  <button onClick={() => handleLogin('admin')}>{t.loginAdmin}</button>
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