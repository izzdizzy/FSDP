// src/pages/ChatSessions.jsx
import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import '../css/chat-sessions.css';

const ChatSessions = () => {
  // Translation object
  const translations = {
    en: {
      title: 'Chat Sessions',
      loading: 'Loading chat sessions...',
      sessionTopic: 'Session Topic',
      date: 'Date',
      time: 'Time',
      messages: 'Messages',
      likes: 'Likes',
      dislikes: 'Dislikes',
      lastActivity: 'Last Activity',
      actions: 'Actions',
      expand: '▶ Expand',
      collapse: '▼ Collapse',
      messagesInSession: 'Messages in this session:',
      user: 'User',
      sessionId: 'Session ID',
      loadingMessages: 'Loading messages...',
      noMessages: 'No messages found for this session.',
      noSessions: "No chat sessions found. Users haven't started any conversations yet.",
      noSearchResults: "No sessions match your search criteria.",
      bot: '🤖 Bot',
      userIcon: '👤 User',
      referencedDocs: '📄 Referenced Documents:',
      noReaction: '⚪ No reaction',
      liked: '👍 Liked',
      disliked: '👎 Disliked',
      searchPlaceholder: 'Search by session topic...',
      sortBy: 'Sort by:',
      sortTopic: 'Topic',
      sortDate: 'Date',
      sortTime: 'Time',
      sortMessages: 'Messages',
      sortLikes: 'Likes',
      sortDislikes: 'Dislikes',
      sortLastActivity: 'Last Activity',
      ascending: 'Ascending',
      descending: 'Descending',
    },
    zh: {
      title: '聊天会话',
      loading: '正在加载聊天会话...',
      sessionTopic: '会话主题',
      date: '日期',
      time: '时间',
      messages: '消息',
      likes: '点赞',
      dislikes: '点踩',
      lastActivity: '最后活动',
      actions: '操作',
      expand: '▶ 展开',
      collapse: '▼ 收起',
      messagesInSession: '本会话中的消息：',
      user: '用户',
      sessionId: '会话编号',
      loadingMessages: '正在加载消息...',
      noMessages: '本会话未找到消息。',
      noSessions: '未找到聊天会话。用户尚未开始任何对话。',
      noSearchResults: '没有符合搜索条件的会话。',
      bot: '🤖 机器人',
      userIcon: '👤 用户',
      referencedDocs: '📄 参考文件：',
      noReaction: '⚪ 无反馈',
      liked: '👍 已点赞',
      disliked: '👎 已点踩',
      searchPlaceholder: '按会话主题搜索...',
      sortBy: '排序方式:',
      sortTopic: '主题',
      sortDate: '日期',
      sortTime: '时间',
      sortMessages: '消息',
      sortLikes: '点赞',
      sortDislikes: '点踩',
      sortLastActivity: '最后活动',
      ascending: '升序',
      descending: '降序',
    }
  };
  // Get language from localStorage
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const t = translations[language];
  // List of chat sessions from backend
  const [sessions, setSessions] = useState([]);
  // Loading state for sessions
  const [loading, setLoading] = useState(true);
  // Which session is currently expanded
  const [expandedSession, setExpandedSession] = useState(null);
  // Messages for each session, keyed by sessionId
  const [sessionMessages, setSessionMessages] = useState({});
  // Loading state for messages per session
  const [loadingMessages, setLoadingMessages] = useState({});
  
  // Sorting and filtering state
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    document.title = t.title;
    loadSessions();
    // Listen for language change
    const handleLangChange = () => {
      setLanguage(localStorage.getItem('language') || 'en');
    };
    window.addEventListener('languageChanged', handleLangChange);
    return () => window.removeEventListener('languageChanged', handleLangChange);
  }, [t.title]);

  // Sorting and filtering functions
  const handleSort = (field) => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
  };

  const getDisplaySessions = () => {
    let result = [...sessions];

    // Apply search filter
    if (searchTerm) {
      result = result.filter(session =>
        session.topic.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    if (sortField) {
      result.sort((a, b) => {
        let aValue, bValue;
        
        switch (sortField) {
          case 'date':
            aValue = new Date(a.createdDate);
            bValue = new Date(b.createdDate);
            break;
          case 'time':
            aValue = new Date(a.createdDate);
            bValue = new Date(b.createdDate);
            break;
          case 'messages':
            aValue = a.messageCount;
            bValue = b.messageCount;
            break;
          case 'likes':
            aValue = a.totalLikes;
            bValue = b.totalLikes;
            break;
          case 'dislikes':
            aValue = a.totalDislikes;
            bValue = b.totalDislikes;
            break;
          case 'lastActivity':
            aValue = new Date(a.lastActivity);
            bValue = new Date(b.lastActivity);
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return <img src="/filter.png" alt="Sort" style={{ width: 16, height: 16, verticalAlign: 'middle' }} />;
    return sortDirection === 'asc'
      ? <span style={{ fontSize: 16, verticalAlign: 'middle' }}>↑</span>
      : <span style={{ fontSize: 16, verticalAlign: 'middle' }}>↓</span>;
  };

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

  // Get reaction status display - shows like/dislike status on bot responses
  /**
   * Returns a string describing the reaction status for a bot message.
   * Used to show liked/disliked/none in the session details.
   */
  const getReactionDisplay = (isLiked) => {
    if (isLiked === null || isLiked === undefined) return t.noReaction;
    return isLiked ? t.liked : t.disliked;
  };

  if (loading) {
    return (
      <div className="chat-sessions-container">
        <Navbar />
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-sessions-container">
      <Navbar />
      <div className="sessions-content">
        <div className="header">
          <h1>{t.title}</h1>
        </div>
        <button
          className="filter-toggle-btn"
          onClick={() => setShowFilters((prev) => !prev)}
          style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <img src="/filter.png" alt="Filter" style={{ width: 20, height: 20 }} />
          {showFilters ? t.cancel : t.sortBy}
        </button>
        {showFilters && (
          <div className="table-controls" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div className="search-container">
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="sort-controls">
              <label>{t.sortBy}</label>
              <button type="button" className="sort-btn" onClick={() => handleSort('date')}>{t.sortDate} {getSortIcon('date')}</button>
              <button type="button" className="sort-btn" onClick={() => handleSort('time')}>{t.sortTime} {getSortIcon('time')}</button>
              <button type="button" className="sort-btn" onClick={() => handleSort('messages')}>{t.sortMessages} {getSortIcon('messages')}</button>
              <button type="button" className="sort-btn" onClick={() => handleSort('likes')}>{t.sortLikes} {getSortIcon('likes')}</button>
              <button type="button" className="sort-btn" onClick={() => handleSort('dislikes')}>{t.sortDislikes} {getSortIcon('dislikes')}</button>
            </div>
          </div>
        )}
        {/* Table layout for chat sessions, showing likes/dislikes for each session */}
        <table className="sessions-table">
          <thead>
            <tr>
              <th>{t.sessionTopic}</th>
              <th>{t.date}</th>
              <th>{t.time}</th>
              <th>{t.messages}</th>
              <th>{t.likes}</th>
              <th>{t.dislikes}</th>
              <th>{t.lastActivity}</th>
              <th>{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {/* Render each session row, and expand to show messages with reaction status */}
            {getDisplaySessions().map((session) => {
              const createdDateTime = formatDateTime(session.createdDate);
              const lastActivityDateTime = formatDateTime(session.lastActivity);
              const isExpanded = expandedSession === session.id;
              const messages = sessionMessages[session.id] || [];
              const isLoadingMsg = loadingMessages[session.id];

              return (
                <React.Fragment key={session.id}>
                  {/* Main session row */}
                  <tr className={`session-row${isExpanded ? ' expanded' : ''}`}>
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
                        {isExpanded ? t.collapse : t.expand}
                      </button>
                    </td>
                  </tr>
                  {/* Expanded details row: shows all messages and their like/dislike status */}
                  {isExpanded && (
                    <tr className="session-details-row">
                      <td colSpan={8}>
                        <div className="session-details">
                          <div className="details-header">
                            <h3>{t.messagesInSession}</h3>
                            <div className="session-metadata">
                              <span>{t.user}: {session.userId}</span>
                              <span>{t.sessionId}: {session.id}</span>
                            </div>
                          </div>
                          {isLoadingMsg ? (
                            <div className="messages-loading">
                              <div className="loading-spinner"></div>
                              <p>{t.loadingMessages}</p>
                            </div>
                          ) : (
                            <div className="messages-list">
                              {/* Show each message, with like/dislike status for bot responses */}
                              {messages.map((message, index) => {
                                const msgDateTime = formatDateTime(message.timestamp);
                                return (
                                  <div key={message.id || index} className={`message-item ${message.sender}`}>
                                    <div className="message-header">
                                      <span className="sender">{message.sender === 'user' ? t.userIcon : t.bot}</span>
                                      <span className="timestamp">{msgDateTime.date} {t.time} {msgDateTime.time}</span>
                                      {message.sender === 'bot' && (
                                        <span className={`reaction ${message.isLiked === true ? 'liked' : message.isLiked === false ? 'disliked' : 'no-reaction'}`}>
                                          {getReactionDisplay(message.isLiked)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="message-text">{message.text}</div>
                                    {message.documentsReferenced && (
                                      <div className="message-documents">
                                        <strong>{t.referencedDocs}</strong>
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
                                  <p>{t.noMessages}</p>
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
            {/* Show message if no sessions exist */}
            {getDisplaySessions().length === 0 && sessions.length > 0 && (
              <tr>
                <td colSpan={8} className="no-sessions">
                  <p>{t.noSearchResults}</p>
                </td>
              </tr>
            )}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={8} className="no-sessions">
                  <p>{t.noSessions}</p>
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
