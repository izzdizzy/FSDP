import React, { useEffect, useState } from 'react';
import '../css/home.css';
import Navbar from '../components/Navbar';
import ChatUI from './bot-UI';

const HomePage = ({ role, handleLogin }) => {
  const [showChat, setShowChat] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(() => {
    const storedChats = localStorage.getItem('chats');
    const chats = storedChats ? JSON.parse(storedChats) : [];
    return chats.length > 0 ? chats[chats.length - 1] : 'Chat_1';
  });

  useEffect(() => {

    document.title = 'Home';

  }, []);


  return (
    <div className="home-container">
      <Navbar role={role} handleLogin={handleLogin} />
      <br />
      <br />

      <div className="header">
        <h1>Welcome to Our Service</h1>
        <p>Feel free to interact with our chatbot for any assistance.</p>
      </div>

      {!showChat && (
        <button className="chat-icon-button" onClick={() => setShowChat(true)}>
          <img src="/Chatbot-icon.png" alt="Chatbot Icon" className="chat-icon" />
        </button>
      )}

      {showChat && <ChatUI onClose={() => setShowChat(false)} chatId={currentChatId} />}
    </div>
  );
};

export default HomePage;