// src/pages/chatbot.jsx
import React, { useState, useEffect, useRef } from 'react';
import '../css/chatbot.css';
import '../css/App.css';
import Navbar from '../components/Navbar';

const ChatbotPage = () => {
  const [chats, setChats] = useState([]); // List of chat topics from backend
  const [activeChat, setActiveChat] = useState(null); // Current chat topic
  const [messages, setMessages] = useState([]); // Messages for current chat
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
          setChats(chatData.map(chat => chat.topic));
        }
      } catch (error) {
        console.error('Error loading chats:', error);
      }
    };

    loadChats();
  }, []);

  // Load messages when active chat changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!activeChat) {
        setMessages([]);
        return;
      }

      try {
        const response = await fetch(`http://localhost:3001/chat/${encodeURIComponent(activeChat)}`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages);
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
  const sendToBackend = async (message, topic = null) => {
    try {
      const response = await fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, topic }),
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

  const sendMessage = async () => {
    if (inputValue.trim() && !isLoading) {
      const userMessage = { sender: 'user', text: inputValue };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      
      const currentTopic = activeChat;
      const isFirstMessage = messages.length === 0;
      
      setInputValue('');
      setIsLoading(true);

      try {
        // Send message to backend
        const responseData = await sendToBackend(inputValue, currentTopic);
        
        // Add bot response to chat
        const botMessage = { sender: 'bot', text: responseData.response };
        setMessages(prevMessages => [...prevMessages, botMessage]);
        
        // If this was the first message, set the chat topic and add to chat list
        if (isFirstMessage) {
          const newTopic = responseData.topic;
          setActiveChat(newTopic);
          if (!chats.includes(newTopic)) {
            setChats(prevChats => [newTopic, ...prevChats]);
          }
        }
      } catch (error) {
        console.error('Error getting bot response:', error);
        const errorMessage = { 
          sender: 'bot', 
          text: "Sorry, I encountered an error while processing your request. Please try again." 
        };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
      } finally {
        setIsLoading(false);
      }
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
    
    // Refresh chat list from backend
    try {
      const response = await fetch('http://localhost:3001/chats');
      if (response.ok) {
        const chatData = await response.json();
        setChats(chatData.map(chat => chat.topic));
      }
    } catch (error) {
      console.error('Error refreshing chats:', error);
    }
  };

  const handleChatClick = (topic) => {
    setActiveChat(topic);
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
            {chats.map((topic, index) => (
              <div
                key={index}
                className={`chat-item ${activeChat === topic ? 'active' : ''}`}
                onClick={() => handleChatClick(topic)}
              >
                <div className="chat-item-content">
                  <span>{topic}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="chatbot-content">
          <div className="chatbot-header">
            <img className="chatbot-icon" src="/Chatbot-red.png" alt="Chatbot Icon" />
            <h2>{activeChat || 'New Chat'}</h2>
          </div>
          <div className="chatbot-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.sender}`}>
                {msg.text}
              </div>
            ))}
            {isLoading && (
              <div className="message bot">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
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