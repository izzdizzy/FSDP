import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/bot-UI.css';

const ChatUI = ({ onClose }) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([{ sender: 'bot', text: 'Hello! How can I assist you today?' }]);
  const [inputValue, setInputValue] = useState('');

  const sendMessage = () => {
    if (inputValue.trim()) {
      setMessages([...messages, { sender: 'user', text: inputValue }]);
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

  const handleFullscreen = () => {
    navigate('/chatbot');
  };

  return (
    <div className="chat-ui">
      <div className="chat-header">
        <button className="close-button" onClick={onClose}>×</button>
        <img src="/chatbot.png" alt="Chatbot Icon" className="chat-icon" />
        <h3>Chatbot</h3>
        <button className="fullscreen-button" onClick={handleFullscreen}>
          <img height="20px" width="20px" src="/fullscreen-icon.png" alt="Fullscreen Icon" className="fullscreen-icon" />
        </button>
      </div>
      <div className="chat-body">
        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div key={index} className={`smlmessage ${msg.sender}`}>
              <p>{msg.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyUp={handleKeyPress}
          placeholder="Type a message..."
        />
        <button className="send-button" onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
};

export default ChatUI;  