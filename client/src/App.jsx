// src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import './css/App.css';
import HomePage from './pages/Home-Page';
import DocumentsPage from './pages/doc-page';
import ChatbotPage from './pages/chatbot';

function App() {
  const [role, setRole] = useState(localStorage.getItem('role') || 'user');

  useEffect(() => {
    const storedRole = localStorage.getItem('role');
    if (storedRole) {
      setRole(storedRole);
    }
  }, []);

  const handleLogin = (role) => {
    localStorage.setItem('role', role);
    setRole(role);
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage role={role} handleLogin={handleLogin} />} />
        <Route
          path="/documents"
          element={
            role === 'admin' ? <DocumentsPage role={role} handleLogin={handleLogin} /> : <Navigate to="/" />
          }
        />
        <Route path="/chatbot" element={<ChatbotPage role={role} handleLogin={handleLogin} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;