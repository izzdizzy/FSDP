import React, { useEffect, useState } from 'react';
import '../css/home.css';
import Navbar from '../components/Navbar';
import ChatUI from './bot-UI';

const HomePage = ({ role, handleLogin }) => {
  // Translation object
  const translations = {
    en: {
      welcome: 'Welcome to Our Service',
      interact: 'Feel free to interact with our chatbot for any assistance.',
      chatbotIconAlt: 'Chatbot Icon',
    },
    zh: {
      welcome: '欢迎使用我们的服务',
      interact: '如需帮助，请随时与我们的聊天机器人互动。',
      chatbotIconAlt: '聊天机器人图标',
    }
  };
  // Get language from localStorage
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const t = translations[language];
  const [showChat, setShowChat] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(() => {
    const storedChats = localStorage.getItem('chats');
    const chats = storedChats ? JSON.parse(storedChats) : [];
    return chats.length > 0 ? chats[chats.length - 1] : 'Chat_1';
  });

  useEffect(() => {
    document.title = t.welcome;
    // Listen for language change
    const handleLangChange = () => {
      setLanguage(localStorage.getItem('language') || 'en');
    };
    window.addEventListener('languageChanged', handleLangChange);
    return () => window.removeEventListener('languageChanged', handleLangChange);
  }, [t.welcome]);


  return (
    <div className="home-container">
      <Navbar role={role} handleLogin={handleLogin} />
      <br />
      <br />

      <div className="header">
        <h1>{t.welcome}</h1>
        <p>{t.interact}</p>
      </div>

      {!showChat && (
        <button className="chat-icon-button" onClick={() => setShowChat(true)}>
          <img src="/Chatbot-icon.png" alt={t.chatbotIconAlt} className="chat-icon" />
        </button>
      )}

      {showChat && <ChatUI onClose={() => setShowChat(false)} chatId={currentChatId} />}
    </div>
  );
};

export default HomePage;