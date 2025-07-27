// src/pages/chatbot.jsx
import React, { useState, useEffect } from 'react';
import '../css/chatbot.css';
import '../css/App.css';
import Navbar from '../components/Navbar';

const ChatbotPage = () => {
  const [chats, setChats] = useState(() => {
    const storedChats = localStorage.getItem('chats');
    return storedChats ? JSON.parse(storedChats) : ['Chat 1', 'Chat 2'];
  });
  const [activeChat, setActiveChat] = useState(chats[0]);
  const [messages, setMessages] = useState(() => {
    const storedMessages = localStorage.getItem(`messages_${activeChat}`);
    return storedMessages ? JSON.parse(storedMessages) : [{ sender: 'bot', text: 'Hello! How can I assist you today?' }];
  });
  const [inputValue, setInputValue] = useState('');
  const [editingChat, setEditingChat] = useState(null);
  const [editChatName, setEditChatName] = useState('');

  useEffect(() => {
    document.title = 'Chatbot';
  }, []);

  useEffect(() => {
    // Save chats to local storage
    localStorage.setItem('chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    // Save messages for the active chat to local storage
    localStorage.setItem(`messages_${activeChat}`, JSON.stringify(messages));
  }, [messages, activeChat]);

  const sendMessage = () => {
    if (inputValue.trim()) {
      const newMessages = [...messages, { sender: 'user', text: inputValue }];
      setMessages(newMessages);
      setInputValue('');
      setTimeout(() => {
        setMessages(prevMessages => [
          ...prevMessages,
          { sender: 'bot', text: 'This is a simulated response.' }
        ]);
      }, 1000);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  const addNewChat = () => {
    const newChatId = `Chat_${Date.now()}`;
    setChats([...chats, newChatId]);
    setActiveChat(newChatId);
    setMessages([{ sender: 'bot', text: 'Hello! How can I assist you today?' }]);
  };

  const handleChatClick = (chat) => {
    setActiveChat(chat);
    const storedMessages = localStorage.getItem(`messages_${chat}`);
    setMessages(storedMessages ? JSON.parse(storedMessages) : [{ sender: 'bot', text: 'Hello! How can I assist you today?' }]);
    setEditingChat(null); // Clear editing state when switching chats
  };

  const handleDeleteChat = (chatToDelete) => {
    const updatedChats = chats.filter(chat => chat !== chatToDelete);
    localStorage.removeItem(`messages_${chatToDelete}`);
    setChats(updatedChats);
    if (updatedChats.length > 0) {
      setActiveChat(updatedChats[0]);
      const storedMessages = localStorage.getItem(`messages_${updatedChats[0]}`);
      setMessages(storedMessages ? JSON.parse(storedMessages) : [{ sender: 'bot', text: 'Hello! How can I assist you today?' }]);
    } else {
      setActiveChat(null);
      setMessages([{ sender: 'bot', text: 'Hello! How can I assist you today?' }]);
    }
  };

  const startEditingChatName = (chat) => {
    setEditingChat(chat);
    setEditChatName(chat);
  };

  const saveEditChatName = (chat) => {
    const updatedChats = chats.map(c => (c === chat ? editChatName : c));
    setChats(updatedChats);
    localStorage.setItem('chats', JSON.stringify(updatedChats));
    setEditingChat(null);
  };

  const cancelEditChatName = () => {
    setEditingChat(null);
  };

  const handleEditChatNameChange = (e) => {
    setEditChatName(e.target.value);
  };

  return (
    <div className="chatbot-container">
      <Navbar />
      <div className="chatbot-main">
        <div className="chatbot-sidebar">
          <div className="sidebar-header">
            <button className="new-chat-button" onClick={addNewChat}>New chat +</button>
          </div>
          <div className="sidebar-chats">
            {chats.map((chat, index) => (
              <div
                key={index}
                className={`chat-item ${activeChat === chat ? 'active' : ''}`}
                onClick={() => {
                  if (!editingChat) {
                    handleChatClick(chat);
                  }
                }}
              >
                {editingChat === chat ? (
                  <div className="chat-edit-container">
                    <input
                      type="text"
                      value={editChatName}
                      onChange={handleEditChatNameChange}
                      autoFocus
                    />
                    <div className="chat-edit-buttons">
                      <button className="small-button" onClick={() => saveEditChatName(chat)}>Save</button>
                      <button className="small-button" onClick={cancelEditChatName}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="chat-item-content">
                    <span>{chat}</span>
                    <div className="chat-item-actions">
                      <button className="small-button edit-chat-button" onClick={(e) => {
                        e.stopPropagation(); // Prevent click event from propagating to parent div
                        startEditingChatName(chat);
                      }}>Edit</button>
                      <button className="small-button delete-chat-button" onClick={(e) => {
                        e.stopPropagation(); // Prevent click event from propagating to parent div
                        handleDeleteChat(chat);
                      }}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="chatbot-content">
          <div className="chatbot-header">
            <img className="chatbot-icon" src="/Chatbot-red.png" alt="Chatbot Icon" />
            <h2>Chatbot</h2>
          </div>
          <div className="chatbot-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.sender}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <div className="chatbot-input">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyUp={handleKeyPress}
              placeholder="Type a message..."
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatbotPage;