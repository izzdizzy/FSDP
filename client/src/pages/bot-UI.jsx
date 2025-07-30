
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/bot-UI.css';


// Popup Chatbot UI with backend integration, greeting, template questions
// Requirements:
// 1. Same backend functionality as main chatbot (POST /chat)
// 2. Loads template questions and greeting from backend
// 3. Does NOT use chatId or save chats (no persistent chat system)
// 4. Still updates admin chat sessions (backend creates session per interaction)
// 5. Robust error handling, edge case management, performance optimization
// 6. Like/dislike system with anti-spam protection
const ChatUI = ({ onClose }) => {
  // Translation object
  const translations = {
    en: {
      chatbot: 'Chatbot',
      quickStart: 'Quick Start Questions:',
      typeMessage: 'Type a message...',
      send: 'Send',
      sending: 'Sending...',
      like: 'Like',
      liked: 'Liked',
      dislike: 'Dislike',
      disliked: 'Disliked',
      removeLike: 'Remove like',
      removeDislike: 'Remove dislike',
      likeThis: 'Like this response',
      dislikeThis: 'Dislike this response',
      referencedDocs: '📄 Referenced documents:',
      error: 'Sorry, I encountered an error. Please try again.',
      close: 'Close chatbot',
      fullscreen: 'Go to full chatbot page',
    },
    zh: {
      chatbot: '聊天机器人',
      quickStart: '快速开始问题：',
      typeMessage: '输入消息...',
      send: '发送',
      sending: '正在发送...',
      like: '点赞',
      liked: '已点赞',
      dislike: '点踩',
      disliked: '已点踩',
      removeLike: '取消点赞',
      removeDislike: '取消点踩',
      likeThis: '点赞此回复',
      dislikeThis: '点踩此回复',
      referencedDocs: '📄 参考文件：',
      error: '抱歉，发生错误。请重试。',
      close: '关闭聊天机器人',
      fullscreen: '前往完整聊天页面',
    }
  };
  // Get language from localStorage
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const t = translations[language];
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]); // Only current session messages
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Add translated greeting fallback
  const [greetingMessage, setGreetingMessage] = useState(language === 'zh' ? '您好！有什么可以帮您的吗？' : 'Hello! How can I assist you today?');
  const [templateQuestions, setTemplateQuestions] = useState([]);
  const [templateUsed, setTemplateUsed] = useState(false);
  const messagesEndRef = useRef(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for language change
  useEffect(() => {
    const handleLangChange = () => {
      const newLang = localStorage.getItem('language') || 'en';
      setLanguage(newLang);
      // Update greeting translation if not yet loaded from backend
      setGreetingMessage(prev => {
        // Only update if it's still the default
        if (prev === 'Hello! How can I assist you today?' || prev === '您好！有什么可以帮您的吗？') {
          return newLang === 'zh' ? '您好！有什么可以帮您的吗？' : 'Hello! How can I assist you today?';
        }
        return prev;
      });
    };
    window.addEventListener('languageChanged', handleLangChange);
    return () => window.removeEventListener('languageChanged', handleLangChange);
  }, []);

  // Load greeting and template questions from backend on mount
  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      try {
        const response = await fetch('http://localhost:3001/settings');
        if (response.ok) {
          const settings = await response.json();
          if (isMounted) {
            // Use translated greeting if available
            let greeting = settings.greetingMessage || (language === 'zh' ? '您好！有什么可以帮您的吗？' : 'Hello! How can I assist you today?');
            setGreetingMessage(greeting);
            setMessages([{ sender: 'bot', text: greeting, isLiked: null, id: null }]);
          }
        }
      } catch {
        // Fallback to default greeting
        if (isMounted) {
          const defaultGreeting = language === 'zh' ? '您好！有什么可以帮您的吗？' : 'Hello! How can I assist you today?';
          setGreetingMessage(defaultGreeting);
          setMessages([{ sender: 'bot', text: defaultGreeting, isLiked: null, id: null }]);
        }
      }
    };
    const loadTemplateQuestions = async () => {
      try {
        const response = await fetch('http://localhost:3001/template-questions');
        if (response.ok) {
          const data = await response.json();
          if (isMounted) setTemplateQuestions(data.questions || []);
        }
      } catch {
        if (isMounted) setTemplateQuestions([]);
      }
    };
    loadSettings();
    loadTemplateQuestions();
    return () => { isMounted = false; };
  }, [language]);

  // Function to handle like/dislike reactions - fixed spam prevention and state updates
  const handleReaction = async (messageIndex, isLiked) => {
    const message = messages[messageIndex];
    if (message.sender !== 'bot' || !message.id) {
      console.log('Cannot react to this message - missing ID or not a bot message');
      return;
    }

    // Fixed: Allow toggling reactions (remove existing reaction by passing null)
    const newReaction = message.isLiked === isLiked ? null : isLiked;

    try {
      const response = await fetch(`http://localhost:3001/messages/${message.id}/reaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isLiked: newReaction }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Reaction updated:', result);
        
        // Fixed: Update local state immediately with proper reaction state
        const updatedMessages = [...messages];
        updatedMessages[messageIndex] = {
          ...updatedMessages[messageIndex],
          isLiked: newReaction
        };
        setMessages(updatedMessages);
      } else {
        console.error('Error updating reaction');
      }
    } catch (error) {
      console.error('Error updating reaction:', error);
    }
  };

  // Send message to backend, update admin chat sessions
  // No chatId, no persistent chat system
  const sendMessage = async (messageOverride) => {
    const messageToSend = messageOverride !== undefined ? messageOverride : inputValue;
    if (!messageToSend.trim() || isLoading) return;
    const userMsg = { sender: 'user', text: messageToSend };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);
    try {
      // Send to backend (no chatId, no chat system) - mark as bot-UI session
      const response = await fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: messageToSend,
          fromBotUI: true // Mark this as bot-UI session
        }),
      });
      // Handle network errors and backend errors
      if (!response.ok) {
        let errorMsg = 'Error sending message';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          // Ignore error parsing error response
        }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      // Show bot response with metadata for reactions
      const botMessage = {
        sender: 'bot', 
        text: data.response,
        id: data.messageId || null, // Get message ID from response for reactions
        isLiked: null,
        documentsReferenced: data.documentsUsed || null
      };
      setMessages(prev => [...prev, botMessage]);
    } catch {
      // Robust error handling: show error to user, log for debugging
      setMessages(prev => [...prev, { sender: 'bot', text: t.error, isLiked: null, id: null }]);
      // Optionally log error for debugging
      // console.error('Chatbot error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Enter key for sending
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Fullscreen button navigates to main chatbot page
  // This does NOT show the popup, but navigates to the main chatbot page
  const handleFullscreen = () => {
    navigate('/chatbot');
  };

  // Handle template question click: prefill input and send immediately
  const handleTemplateClick = async (question) => {
    setTemplateUsed(true);
    sendMessage(question);
  };

  // Component for rendering like/dislike buttons - fixed to show reactions properly  
  const ReactionButtons = ({ message, messageIndex }) => {
    if (message.sender !== 'bot') return null;

    // Show reactions for bot messages with IDs (excluding greeting)
    if (!message.id) {
      return null; // No reactions for greeting or messages without IDs
    }

    return (
      <div className="reaction-buttons">
        <button 
          className={`reaction-btn ${message.isLiked === true ? 'liked' : ''}`}
          onClick={() => handleReaction(messageIndex, true)}
          title={message.isLiked === true ? t.removeLike : t.likeThis}
        >
          👍 {message.isLiked === true ? t.liked : t.like}
        </button>
        <button 
          className={`reaction-btn ${message.isLiked === false ? 'disliked' : ''}`}
          onClick={() => handleReaction(messageIndex, false)}
          title={message.isLiked === false ? t.removeDislike : t.dislikeThis}
        >
          👎 {message.isLiked === false ? t.disliked : t.dislike}
        </button>
      </div>
    );
  };

  // Component for rendering document references
  const DocumentReferences = ({ documents }) => {
    if (!documents || documents.length === 0) return null;

    return (
      <div className="document-references">
        <small>{t.referencedDocs} {documents.map(doc => doc.name).join(', ')}</small>
      </div>
    );
  };

  return (
    <div className="chat-ui">
      <div className="chat-header">
        <button className="close-button" onClick={onClose} aria-label={t.close}>×</button>
        <img src="/chatbot.png" alt="Chatbot Icon" className="chat-icon" />
        <h3>{t.chatbot}</h3>
        <button className="fullscreen-button" onClick={handleFullscreen} aria-label={t.fullscreen}>
          <img height="20px" width="20px" src="/fullscreen-icon.png" alt="Fullscreen Icon" className="fullscreen-icon" />
        </button>
      </div>
      <div className="chat-body">
        <div className="chat-messages">
          {/* Show greeting above template questions if only greeting message */}
          {messages.length === 1 && messages[0].sender === 'bot' && (
            <div className="welcome-section">
              <div className="message bot">
                <div className="message-content">{greetingMessage}</div>
              </div>
            </div>
          )}
          {/* Show all messages for current session */}
          {messages.map((msg, index) => (
            // Only show greeting in welcome-section, not in message list
            (index === 0 && messages.length === 1)
              ? null
              : (
                <div key={index} className={`smlmessage ${msg.sender}`}>
                  <p>{msg.text}</p>
                  {msg.sender === 'bot' && (
                    <>
                      <DocumentReferences documents={msg.documentsReferenced} />
                      <ReactionButtons message={msg} messageIndex={index} />
                    </>
                  )}
                </div>
              )
          ))}

          {/* Template questions at bottom right of message container */}
          {templateQuestions.length > 0 && !templateUsed && (
            <div className="template-questions-bottom">
              {templateQuestions
                .filter(q => q.question.trim() !== greetingMessage.trim())
                .slice(0, 4)
                .map((q) => (
                  <button
                    key={q.id}
                    className="template-question-btn"
                    onClick={() => handleTemplateClick(q.question)}
                    aria-label={`Ask: ${q.question}`}
                  >
                    {q.question}
                  </button>
                ))}
            </div>
          )}
          {isLoading && (
            <div className="smlmessage bot">
              <div className="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={t.typeMessage}
          disabled={isLoading}
          aria-label={t.typeMessage}
        />
        <button className="send-button" onClick={sendMessage} disabled={isLoading || !inputValue.trim()} aria-label={t.send}>
          {isLoading ? t.sending : t.send}
        </button>
      </div>
    </div>
  );
};

export default ChatUI;