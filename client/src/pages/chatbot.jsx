// src/pages/chatbot.jsx
import React, { useState, useEffect, useRef } from 'react';
import '../css/chatbot.css';
import '../css/App.css';
import Navbar from '../components/Navbar';

const ChatbotPage = () => {
  const [chats, setChats] = useState([]); // List of chat sessions from backend
  const [activeChat, setActiveChat] = useState(null); // Current chat object {id, topic}
  const [messages, setMessages] = useState([]); // Messages for current chat with reaction states
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [greetingMessage, setGreetingMessage] = useState('Hello! I\'m your AI assistant. How can I help you today?');
  const [templateQuestions, setTemplateQuestions] = useState([]);
  const messagesEndRef = useRef(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
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
          setGreetingMessage(settings.greetingMessage || 'Hello! I\'m your AI assistant. How can I help you today?');
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
          chatTopic: activeChat?.topic 
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

  // Function to handle like/dislike reactions
  const handleReaction = async (messageIndex, isLiked) => {
    const message = messages[messageIndex];
    if (message.sender !== 'bot' || !message.id) {
      console.error('Cannot react to this message - missing ID or not a bot message');
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/messages/${message.id}/reaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isLiked }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Reaction updated:', result);
        
        // Update local state for immediate visual feedback
        const updatedMessages = [...messages];
        updatedMessages[messageIndex] = {
          ...updatedMessages[messageIndex],
          isLiked: isLiked
        };
        setMessages(updatedMessages);

        // Update chat totals in local state
        if (activeChat) {
          const previousReaction = message.isLiked;
          let likeDelta = 0;
          let dislikeDelta = 0;
          
          // Remove previous reaction from totals
          if (previousReaction === true) likeDelta -= 1;
          if (previousReaction === false) dislikeDelta -= 1;
          
          // Add new reaction to totals
          if (isLiked === true) likeDelta += 1;
          if (isLiked === false) dislikeDelta += 1;
          
          setChats(prevChats => prevChats.map(chat => 
            chat.id === activeChat.id 
              ? { 
                  ...chat, 
                  totalLikes: chat.totalLikes + likeDelta,
                  totalDislikes: chat.totalDislikes + dislikeDelta
                }
              : chat
          ));
          
          setActiveChat(prev => ({
            ...prev,
            totalLikes: prev.totalLikes + likeDelta,
            totalDislikes: prev.totalDislikes + dislikeDelta
          }));
        }
      } else {
        const errorData = await response.json();
        console.error('Error updating reaction:', errorData.error);
      }
    } catch (error) {
      console.error('Error updating reaction:', error);
    }
  };

  const sendMessage = async () => {
    if (inputValue.trim() && !isLoading) {
      const userMessage = { sender: 'user', text: inputValue };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      
      const currentChatId = activeChat?.id;
      
      setInputValue('');
      setIsLoading(true);

      try {
        // Send message to backend
        const responseData = await sendToBackend(inputValue, currentChatId);
        
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

  // Component for rendering like/dislike buttons
  const ReactionButtons = ({ message, messageIndex }) => {
    if (message.sender !== 'bot') return null;

    // Check if message has an ID (required for reactions)
    if (!message.id) {
      return (
        <div className="reaction-buttons">
          <span className="reaction-disabled">Reactions loading...</span>
        </div>
      );
    }

    return (
      <div className="reaction-buttons">
        <button 
          className={`reaction-btn ${message.isLiked === true ? 'liked' : ''}`}
          onClick={() => handleReaction(messageIndex, message.isLiked === true ? null : true)}
          title={message.isLiked === true ? 'Remove like' : 'Like this response'}
        >
          👍 {message.isLiked === true ? 'Liked' : 'Like'}
        </button>
        <button 
          className={`reaction-btn ${message.isLiked === false ? 'disliked' : ''}`}
          onClick={() => handleReaction(messageIndex, message.isLiked === false ? null : false)}
          title={message.isLiked === false ? 'Remove dislike' : 'Dislike this response'}
        >
          👎 {message.isLiked === false ? 'Disliked' : 'Dislike'}
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
              + New Chat
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
                  <div className="chat-metadata">
                    <small>
                      {chat.messageCount} messages • 
                      {chat.totalLikes > 0 && ` 👍${chat.totalLikes}`}
                      {chat.totalDislikes > 0 && ` 👎${chat.totalDislikes}`}
                      {chat.totalLikes === 0 && chat.totalDislikes === 0 && ' No reactions yet'}
                    </small>
                  </div>
                </div>
              </div>
            ))}
            {chats.length === 0 && (
              <div className="no-chats">
                <p>No chat sessions yet. Start a new conversation!</p>
              </div>
            )}
          </div>
        </div>
        <div className="chatbot-content">
          <div className="chatbot-header">
            <img className="chatbot-icon" src="/Chatbot-red.png" alt="Chatbot Icon" />
            <div className="header-content">
              <h2>{activeChat?.topic || 'New Chat'}</h2>
              {activeChat && (
                <div className="chat-stats">
                  <small>
                    {activeChat.messageCount} messages • 
                    Created {new Date(activeChat.createdDate).toLocaleDateString()}
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
                {templateQuestions.length > 0 && (
                  <div className="template-questions">
                    <h4>Quick Start Questions:</h4>
                    <div className="question-buttons">
                      {templateQuestions.slice(0, 4).map((question) => (
                        <button
                          key={question.id}
                          className="template-question-btn"
                          onClick={() => setInputValue(question.question)}
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
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.sender}`}>
                <div className="message-content">
                  {msg.text}
                </div>
                {msg.sender === 'bot' && (
                  <>
                    <DocumentReferences documents={msg.documentsReferenced} />
                    <ReactionButtons message={msg} messageIndex={index} />
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
              placeholder="Type a message..."
              disabled={isLoading}
            />
            <button onClick={sendMessage} disabled={isLoading || !inputValue.trim()}>
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatbotPage;