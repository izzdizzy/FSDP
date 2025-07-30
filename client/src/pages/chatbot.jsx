// src/pages/chatbot.jsx
import React, { useState, useEffect, useRef } from 'react';
import '../css/chatbot.css';
import '../css/App.css';
import Navbar from '../components/Navbar';
// Translation object for UI text
const translations = {
  en: {
    greeting: "Hello! I'm your AI assistant. How can I help you today?",
    newChat: '+ New Chat',
    send: 'Send',
    sending: 'Sending...',
    like: 'Like',
    liked: 'Liked',
    dislike: 'Dislike',
    disliked: 'Disliked',
    quickStart: 'Quick Start Questions:',
    noChats: 'No chat sessions yet. Start a new conversation!',
    reactionsLoading: 'Reactions loading...'
  },
  zh: {
    greeting: '你好！我是您的AI助手。今天我能为您做些什么？',
    newChat: '+ 新对话',
    send: '发送',
    sending: '发送中...',
    like: '点赞',
    liked: '已点赞',
    dislike: '点踩',
    disliked: '已点踩',
    quickStart: '快速开始问题：',
    noChats: '暂无对话。请开始新会话！',
    reactionsLoading: '加载中...'
  }
};

// Get language from localStorage or default to 'en'
const getLanguage = () => localStorage.getItem('language') || 'en';

const ChatbotPage = () => {
  // Handle template question click: send instantly and hide template questions
  const [templateUsed, setTemplateUsed] = useState(false);
  const handleTemplateClick = async (question) => {
    setTemplateUsed(true);
    sendMessage(question);
  };
  // Language state
  const [language, setLanguage] = useState(getLanguage());
  // List of chat sessions from backend
  const [chats, setChats] = useState([]);
  // Current chat object {id, topic, ...}
  const [activeChat, setActiveChat] = useState(null);
  // Messages for current chat, each with like/dislike state
  const [messages, setMessages] = useState([]);
  // Error state for reactions
  const [reactionError, setReactionError] = useState(null);
  // Debounce state for reaction clicks
  const [reactionPending, setReactionPending] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [greetingMessage, setGreetingMessage] = useState('Hello! I\'m your AI assistant. How can I help you today?');
  const [templateQuestions, setTemplateQuestions] = useState([]);
  const messagesEndRef = useRef(null);


  useEffect(() => {
    // Listen for language change event from Navbar
    const handleLangChange = () => setLanguage(getLanguage());
    window.addEventListener('languageChanged', handleLangChange);
    return () => window.removeEventListener('languageChanged', handleLangChange);
  // Use translation for greeting
  }, [messages]);

  useEffect(() => {
    document.title = 'Chatbot';
  }, []);

  // Load all chats from backend on component mount
  useEffect(() => {
    const loadChats = async () => {
      try {
        const response = await fetch('http://localhost:3001/chats');
        if (response.ok) {
          const chatData = await response.json();
          setChats(chatData); // Now chatData contains full chat objects with metadata
        }
      } catch (error) {
        console.error('Error loading chats:', error);
      }
    };

    const loadSettings = async () => {
      try {
        const response = await fetch('http://localhost:3001/settings');
        if (response.ok) {
          const settings = await response.json();
          // Use translation for greeting
          setGreetingMessage(language === 'zh' ? translations.zh.greeting : (settings.greetingMessage || translations.en.greeting));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    const loadTemplateQuestions = async () => {
      try {
        const response = await fetch('http://localhost:3001/template-questions');
        if (response.ok) {
          const data = await response.json();
          setTemplateQuestions(data.questions || []);
        }
      } catch (error) {
        console.error('Error loading template questions:', error);
      }
    };

    loadChats();
    loadSettings();
    loadTemplateQuestions();
  }, []);

  // Load messages when active chat changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!activeChat) {
        setMessages([]);
        return;
      }

      try {
        const response = await fetch(`http://localhost:3001/chat/${encodeURIComponent(activeChat.topic)}`);
        if (response.ok) {
          const data = await response.json();
          // Enhance messages with reaction handling
          const enhancedMessages = data.messages.map(msg => ({
            ...msg,
            isLiked: msg.isLiked !== undefined ? msg.isLiked : null,
            documentsReferenced: msg.documentsReferenced ? JSON.parse(msg.documentsReferenced) : null
          }));
          setMessages(enhancedMessages);
        } else if (response.status === 404) {
          // Chat doesn't exist yet, initialize with empty messages
          setMessages([]);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
        setMessages([]);
      }
    };

    loadMessages();
  }, [activeChat]);

  // Function to send message to backend
  // Send language to backend so chatbot replies in Chinese if selected
  const sendToBackend = async (message, chatId = null) => {
    try {
      const response = await fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message, 
          chatId: chatId,
          chatTopic: activeChat?.topic,
          language: language // Pass language to backend
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error sending message to backend:', error);
      throw error;
    }
  };

  // Function to handle like/dislike reactions - fixed spam prevention and state updates
  /**
   * Handles like/dislike reaction for a bot message.
   * Only allows one reaction at a time per message.
   * Debounces rapid clicks and shows error feedback.
   */
  const handleReaction = async (messageIndex, isLiked) => {
    setReactionError(null);
    if (reactionPending) return; // Prevent spamming
    setReactionPending(true);

    const message = messages[messageIndex];
    if (message.sender !== 'bot' || !message.id) {
      setReactionError('Cannot react to this message.');
      setReactionPending(false);
      return;
    }

    // Convert to integer for backend
    let newReaction;
    if (message.isLiked === 1 && isLiked === 1) {
      newReaction = null; // Remove like
    } else if (message.isLiked === 0 && isLiked === 0) {
      newReaction = null; // Remove dislike
    } else if (isLiked === 1) {
      newReaction = 1; // Like
    } else if (isLiked === 0) {
      newReaction = 0; // Dislike
    } else {
      newReaction = null;
    }

    try {
      const response = await fetch(`http://localhost:3001/messages/${message.id}/reaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isLiked: newReaction }),
      });

      if (response.ok) {
        // After successful reaction, reload messages and activeChat metadata from backend
        if (activeChat) {
          await loadMessages();
          // Fetch updated chat metadata
          const chatResponse = await fetch(`http://localhost:3001/chats`);
          if (chatResponse.ok) {
            const chatList = await chatResponse.json();
            const updatedChat = chatList.find(chat => chat.id === activeChat.id);
            if (updatedChat) {
              setActiveChat(updatedChat);
              setChats(prevChats => prevChats.map(chat => chat.id === updatedChat.id ? updatedChat : chat));
            }
          }
        }
      } else {
        const errorData = await response.json();
        setReactionError(errorData.error || 'Failed to update reaction.');
      }
    } catch  {
      setReactionError('Network error. Please try again.');
    } finally {
      setReactionPending(false);
    }
  };

  const sendMessage = async (messageOverride) => {
    const messageToSend = messageOverride !== undefined ? messageOverride : inputValue;
    if (!messageToSend.trim() || isLoading) return;
    const userMessage = { sender: 'user', text: messageToSend };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    const currentChatId = activeChat?.id;
    setInputValue('');
    setIsLoading(true);
    try {
      // Send message to backend
      const responseData = await sendToBackend(messageToSend, currentChatId);
      // Add bot response to chat with additional metadata
      const botMessage = { 
        sender: 'bot', 
        text: responseData.response,
        id: null, // Will be updated when messages are reloaded
        isLiked: null,
        documentsReferenced: responseData.documentsUsed
      };
      setMessages(prevMessages => [...prevMessages, botMessage]);
      // Handle new chat creation
      if (responseData.isNewChat) {
        const newChat = {
          id: responseData.chatId,
          topic: responseData.topic || responseData.chatInfo?.topic,
          messageCount: responseData.chatInfo?.messageCount || 1,
          totalLikes: responseData.chatInfo?.totalLikes || 0,
          totalDislikes: responseData.chatInfo?.totalDislikes || 0,
          createdDate: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        };
        setActiveChat(newChat);
        setChats(prevChats => [newChat, ...prevChats]);
        // Reload messages to get proper IDs for reactions
        setTimeout(() => {
          loadMessages();
        }, 500);
      } else if (activeChat) {
        // Update existing chat's last activity
        setChats(prevChats => prevChats.map(chat => 
          chat.id === activeChat.id 
            ? { ...chat, lastActivity: new Date().toISOString(), messageCount: chat.messageCount + 2 }
            : chat
        ));
      }
    } catch (error) {
      console.error('Error getting bot response:', error);
      const errorMessage = { 
        sender: 'bot', 
        text: "Sorry, I encountered an error while processing your request. Please try again.",
        isLiked: null,
        documentsReferenced: null
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to reload messages (for use after new chat creation)
  const loadMessages = async () => {
    if (!activeChat) return;
    
    try {
      const response = await fetch(`http://localhost:3001/chat/${encodeURIComponent(activeChat.topic)}`);
      if (response.ok) {
        const data = await response.json();
        const enhancedMessages = data.messages.map(msg => ({
          ...msg,
          isLiked: msg.isLiked !== undefined ? msg.isLiked : null,
          documentsReferenced: msg.documentsReferenced ? JSON.parse(msg.documentsReferenced) : null
        }));
        setMessages(enhancedMessages);
      }
    } catch (error) {
      console.error('Error reloading messages:', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = async () => {
    // Clear current chat state
    setActiveChat(null);
    setMessages([]);
    
    // Refresh chat list from backend to get latest chats
    try {
      const response = await fetch('http://localhost:3001/chats');
      if (response.ok) {
        const chatData = await response.json();
        setChats(chatData); // Full chat objects now
      }
    } catch (error) {
      console.error('Error refreshing chats:', error);
    }
  };

  const handleChatClick = (chat) => {
    setActiveChat(chat); // Now expects full chat object
  };

  // Component for rendering like/dislike buttons - fixed to show reactions properly
  /**
   * Renders like/dislike buttons for a bot message.
   * Shows loading state and disables buttons during pending reaction.
   */
  const ReactionButtons = ({ message, messageIndex }) => {
    if (message.sender !== 'bot') return null;
    if (!message.id) {
      return (
        <div className="reaction-buttons">
          <span className="reaction-disabled">{translations[language].reactionsLoading}</span>
        </div>
      );
    }
    // Only one reaction can be active at a time
    return (
      <div className="reaction-buttons">
        <button
          className={`reaction-btn ${message.isLiked === 1 ? 'liked' : ''}`}
          onClick={() => {
            if (message.isLiked === 1) {
              handleReaction(messageIndex, null);
            } else {
              handleReaction(messageIndex, 1);
            }
          }}
          title={message.isLiked === 1 ? translations[language].liked : translations[language].like}
          disabled={reactionPending}
        >
          👍 {message.isLiked === 1 ? translations[language].liked : translations[language].like}
        </button>
        <button
          className={`reaction-btn ${message.isLiked === 0 ? 'disliked' : ''}`}
          onClick={() => {
            if (message.isLiked === 0) {
              handleReaction(messageIndex, null);
            } else {
              handleReaction(messageIndex, 0);
            }
          }}
          title={message.isLiked === 0 ? translations[language].disliked : translations[language].dislike}
          disabled={reactionPending}
        >
          👎 {message.isLiked === 0 ? translations[language].disliked : translations[language].dislike}
        </button>
      </div>
    );
  };

  // Component for rendering document references
  const DocumentReferences = ({ documents }) => {
    if (!documents || documents.length === 0) return null;

    return (
      <div className="document-references">
        <small>📄 Referenced documents: {documents.map(doc => doc.name).join(', ')}</small>
      </div>
    );
  };

  return (
    <div className="chatbot-container">
      <Navbar />
      <div className="chatbot-main">
        <div className="chatbot-sidebar">
          <div className="sidebar-header">
            <button className="new-chat-button" onClick={startNewChat}>
              {translations[language].newChat}
            </button>
          </div>
          <div className="sidebar-chats">
            {chats.map((chat, index) => (
              <div
                key={chat.id || index}
                className={`chat-item ${activeChat?.id === chat.id ? 'active' : ''}`}
                onClick={() => handleChatClick(chat)}
              >
                <div className="chat-item-content">
                  <div className="chat-topic">{chat.topic}</div>
                </div>
              </div>
            ))}
            {chats.length === 0 && (
              <div className="no-chats">
                <p>{translations[language].noChats}</p>
              </div>
            )}
          </div>
        </div>
        <div className="chatbot-content">
          <div className="chatbot-header">
            <img className="chatbot-icon" src="/Chatbot-red.png" alt="Chatbot Icon" />
            <div className="header-content">
              <h2>{activeChat?.topic || (language === 'zh' ? '新对话' : 'New Chat')}</h2>
              {activeChat && (
                <div className="chat-stats">
                  <small>
                    {activeChat.messageCount} {language === 'zh' ? '条消息' : 'messages'} • 
                    {language === 'zh' ? '创建于' : 'Created'} {new Date(activeChat.createdDate).toLocaleDateString()}
                  </small>
                </div>
              )}
            </div>
          </div>
          <div className="chatbot-messages">
            {/* Show greeting message and template questions when no active chat */}
            {!activeChat && messages.length === 0 && (
              <div className="welcome-section">
                <div className="message bot">
                  <div className="message-content">
                    {greetingMessage}
                  </div>
                </div>
                {templateQuestions.length > 0 && !templateUsed && (
                  <div className="template-questions">
                    <h4>{translations[language].quickStart}</h4>
                    <div className="question-buttons">
                      {templateQuestions.slice(0, 4).map((question) => (
                        <button
                          key={question.id}
                          className="template-question-btn"
                          onClick={() => handleTemplateClick(question.question)}
                        >
                          {question.question}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Chat messages */}
            {/* Render each message, with reactions and error feedback for bot responses */}
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.sender}`}>
                <div className="message-content">
                  {msg.text}
                </div>
                {msg.sender === 'bot' && (
                  <>
                    <DocumentReferences documents={msg.documentsReferenced} />
                    <ReactionButtons message={msg} messageIndex={index} />
                    {/* Show error feedback for reactions */}
                    {reactionError && (
                      <div className="reaction-error">
                        <small style={{ color: 'red' }}>{reactionError}</small>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="message bot">
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="chatbot-input">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={language === 'zh' ? '请输入消息...' : 'Type a message...'}
              disabled={isLoading}
            />
            <button onClick={sendMessage} disabled={isLoading || !inputValue.trim()}>
              {isLoading ? translations[language].sending : translations[language].send}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatbotPage;