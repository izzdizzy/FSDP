// src/pages/Settings.jsx
import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import '../css/settings.css';

const Settings = () => {
  const [greetingMessage, setGreetingMessage] = useState('');
  const [originalGreeting, setOriginalGreeting] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [updatedBy, setUpdatedBy] = useState('Admin@email.com');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    document.title = 'Settings - Admin';
    loadSettings();
  }, []);

  // Load current settings from backend
  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/settings');
      if (response.ok) {
        const data = await response.json();
        setGreetingMessage(data.greetingMessage || 'Hello! I\'m your AI assistant. How can I help you today?');
        setOriginalGreeting(data.greetingMessage || 'Hello! I\'m your AI assistant. How can I help you today?');
        setLastUpdated(data.lastUpdated || new Date().toISOString());
        setUpdatedBy(data.updatedBy || 'Admin@email.com');
      } else {
        console.error('Failed to load settings');
        // Set default values if settings don't exist
        const defaultGreeting = 'Hello! I\'m your AI assistant. How can I help you today?';
        setGreetingMessage(defaultGreeting);
        setOriginalGreeting(defaultGreeting);
        setLastUpdated(new Date().toISOString());
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setErrorMessage('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  // Save settings to backend
  const saveSettings = async () => {
    try {
      setSaving(true);
      setErrorMessage('');
      
      const response = await fetch('http://localhost:3001/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          greetingMessage: greetingMessage.trim(),
          updatedBy: updatedBy
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setOriginalGreeting(greetingMessage);
        setLastUpdated(data.lastUpdated);
        setSuccessMessage('Settings saved successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setErrorMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Cancel changes
  const cancelChanges = () => {
    setGreetingMessage(originalGreeting);
    setErrorMessage('');
  };

  // Check if changes were made
  const hasChanges = greetingMessage.trim() !== originalGreeting.trim();

  // Format date for display
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="settings-container">
        <Navbar />
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <Navbar />
      
      {/* Success/Error Messages */}
      {successMessage && (
        <div className="toast tst-success">{successMessage}</div>
      )}
      {errorMessage && (
        <div className="toast tst-error">{errorMessage}</div>
      )}

      <div className="settings-content">
        <div className="header">
          <h1>Chatbot Settings</h1>
          <p>Configure your chatbot's behavior and greeting messages</p>
        </div>

        <div className="settings-form">
          {/* Read-only information */}
          <div className="info-section">
            <div className="info-row">
              <label>Updated By:</label>
              <input 
                type="text" 
                value={updatedBy} 
                readOnly 
                className="readonly-input"
              />
            </div>
            <div className="info-row">
              <label>Last Updated:</label>
              <input 
                type="text" 
                value={formatDate(lastUpdated)} 
                readOnly 
                className="readonly-input"
              />
            </div>
          </div>

          {/* Greeting message section */}
          <div className="greeting-section">
            <h3>Greeting Message</h3>
            <p className="section-description">
              This message will be displayed when users first open the chatbot or start a new chat session.
            </p>
            
            <textarea
              value={greetingMessage}
              onChange={(e) => setGreetingMessage(e.target.value)}
              placeholder="Enter the greeting message for the chatbot..."
              className="greeting-textarea"
              rows={4}
              maxLength={500}
            />
            
            <div className="character-count">
              {greetingMessage.length}/500 characters
            </div>

            {/* Action buttons */}
            <div className="action-buttons">
              <button 
                className="save-btn"
                onClick={saveSettings}
                disabled={saving || !hasChanges || greetingMessage.trim().length === 0}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button 
                className="cancel-btn"
                onClick={cancelChanges}
                disabled={saving || !hasChanges}
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Preview section */}
          <div className="preview-section">
            <h3>Preview</h3>
            <div className="preview-chatbot">
              <div className="preview-message">
                <div className="preview-avatar">🤖</div>
                <div className="preview-text">
                  {greetingMessage.trim() || 'Hello! I\'m your AI assistant. How can I help you today?'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
