// src/pages/ChatSessions.jsx
import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import '../css/chat-sessions.css';

const ChatSessions = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState(null);
  const [sessionMessages, setSessionMessages] = useState({});
  const [loadingMessages, setLoadingMessages] = useState({});

  useEffect(() => {
    document.title = 'Chat Sessions - Admin';
    loadSessions();
  }, []);

  // Load all chat sessions
  const loadSessions = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/chat-sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions);
      } else {
        console.error('Failed to load chat sessions');
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load messages for a specific session
  const loadSessionMessages = async (sessionId) => {
    if (sessionMessages[sessionId]) return; // Already loaded

    try {
      setLoadingMessages(prev => ({ ...prev, [sessionId]: true }));
      const response = await fetch(`http://localhost:3001/chat-sessions/${sessionId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setSessionMessages(prev => ({
          ...prev,
          [sessionId]: data.messages
        }));
      } else {
        console.error('Failed to load session messages');
      }
    } catch (error) {
      console.error('Error loading session messages:', error);
    } finally {
      setLoadingMessages(prev => ({ ...prev, [sessionId]: false }));
    }
  };

  // Toggle session expansion
  const toggleSession = async (sessionId) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
    } else {
      setExpandedSession(sessionId);
      await loadSessionMessages(sessionId);
    }
  };

  // Format date and time
  const formatDateTime = (dateStr) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  // Get reaction status display
  const getReactionDisplay = (isLiked) => {
    if (isLiked === null || isLiked === undefined) return '';
    return isLiked ? ' 👍' : ' 👎';
  };

  if (loading) {
    return (
      <div className="chat-sessions-container">
        <Navbar />
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading chat sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-sessions-container">
      <Navbar />
      <div className="sessions-content">
         <div className="header">
          <h1>Chat Sessions</h1>
        </div>

        {/* Table layout for chat sessions, similar to doc-page */}
        <table className="sessions-table">
          <thead>
            <tr>
              <th>Session Topic</th>
              <th>Date</th>
              <th>Time</th>
              <th>Messages</th>
              <th>Likes</th>
              <th>Dislikes</th>
              <th>Last Activity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => {
              const createdDateTime = formatDateTime(session.createdDate);
              const lastActivityDateTime = formatDateTime(session.lastActivity);
              const isExpanded = expandedSession === session.id;
              const messages = sessionMessages[session.id] || [];
              const isLoadingMsg = loadingMessages[session.id];

              return (
                <React.Fragment key={session.id}>
                  <tr className={`session-row${isExpanded ? ' expanded' : ''}`}> {/* Main session row */}
                    <td>{session.topic}</td>
                    <td>{createdDateTime.date}</td>
                    <td>{createdDateTime.time}</td>
                    <td>{session.messageCount}</td>
                    <td className="likes">{session.totalLikes}</td>
                    <td className="dislikes">{session.totalDislikes}</td>
                    <td>{lastActivityDateTime.time}</td>
                    <td>
                      <button 
                        className="expand-btn"
                        onClick={() => toggleSession(session.id)}
                      >
                        {isExpanded ? '▼ Collapse' : '▶ Expand'}
                      </button>
                    </td>
                  </tr>
                  {/* Expanded details row */}
                  {isExpanded && (
                    <tr className="session-details-row">
                      <td colSpan={8}>
                        <div className="session-details">
                          <div className="details-header">
                            <h3>Messages in this session:</h3>
                            <div className="session-metadata">
                              <span>User: {session.userId}</span>
                              <span>Session ID: {session.id}</span>
                            </div>
                          </div>
                          {isLoadingMsg ? (
                            <div className="messages-loading">
                              <div className="loading-spinner"></div>
                              <p>Loading messages...</p>
                            </div>
                          ) : (
                            <div className="messages-list">
                              {messages.map((message, index) => {
                                const msgDateTime = formatDateTime(message.timestamp);
                                return (
                                  <div key={message.id || index} className={`message-item ${message.sender}`}>
                                    <div className="message-header">
                                      <span className="sender">{message.sender === 'user' ? '👤 User' : '🤖 Bot'}</span>
                                      <span className="timestamp">{msgDateTime.date} at {msgDateTime.time}</span>
                                      {message.sender === 'bot' && (
                                        <span className="reaction">
                                          {getReactionDisplay(message.isLiked)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="message-text">{message.text}</div>
                                    {message.documentsReferenced && (
                                      <div className="message-documents">
                                        <strong>📄 Referenced Documents:</strong>
                                        <ul>
                                          {message.documentsReferenced.map((doc, docIndex) => (
                                            <li key={docIndex}>{doc.name}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {messages.length === 0 && (
                                <div className="no-messages">
                                  <p>No messages found for this session.</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={8} className="no-sessions">
                  <p>No chat sessions found. Users haven't started any conversations yet.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ChatSessions;
