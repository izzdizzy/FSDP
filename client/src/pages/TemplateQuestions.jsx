// src/pages/TemplateQuestions.jsx
import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import '../css/template-questions.css';

const TemplateQuestions = () => {
  // Translation object
  const translations = {
    en: {
      title: 'Template Questions',
      loading: 'Loading template questions...',
      manage: 'Manage pre-defined questions that users can select when starting a new chat',
      max: 'Maximum: 4 questions allowed',
      current: 'Current',
      addNew: '+ Add New Question',
      maxReached: '(Max Reached)',
      lastUpdated: 'Last Updated',
      updatedBy: 'Updated By',
      question: 'Question',
      answerPreview: 'Answer Preview',
      actions: 'Actions',
      noQuestions: 'No template questions found. Add some questions to get started!',
      save: 'Save',
      cancel: 'Cancel',
      edit: 'Edit',
      delete: 'Delete',
      confirmDelete: 'Are you sure you want to delete this template question?',
    },
    zh: {
      title: '模板问题',
      loading: '正在加载模板问题...',
      manage: '管理用户在开始新聊天时可选择的预设问题',
      max: '最多：允许4个问题',
      current: '当前',
      addNew: '+ 添加新问题',
      maxReached: '(已达上限)',
      lastUpdated: '最后更新',
      updatedBy: '更新者',
      question: '问题',
      answerPreview: '答案预览',
      actions: '操作',
      noQuestions: '未找到模板问题。请添加一些问题以开始！',
      save: '保存',
      cancel: '取消',
      edit: '编辑',
      delete: '删除',
      confirmDelete: '您确定要删除此模板问题吗？',
    }
  };
  // Get language from localStorage
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const t = translations[language];
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = t.title + ' - Admin';
    loadQuestions();
    // Listen for language change
    const handleLangChange = () => {
      setLanguage(localStorage.getItem('language') || 'en');
    };
    window.addEventListener('languageChanged', handleLangChange);
    return () => window.removeEventListener('languageChanged', handleLangChange);
  }, [t.title]);

  // Load all template questions
  const loadQuestions = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/template-questions');
      if (response.ok) {
        const data = await response.json();
        setQuestions(data.questions);
      } else {
        console.error('Failed to load template questions');
        setErrorMessage('Failed to load template questions');
      }
    } catch (error) {
      console.error('Error loading template questions:', error);
      setErrorMessage('Error loading template questions');
    } finally {
      setLoading(false);
    }
  };

  // Toggle question expansion - clicking expand allows editing
  const toggleQuestion = (questionId) => {
    if (expandedQuestion === questionId) {
      setExpandedQuestion(null);
      // Stop editing when collapsing
      if (editingQuestion === questionId) {
        setEditingQuestion(null);
        setEditValues({});
      }
    } else {
      setExpandedQuestion(questionId);
      // Start editing when expanding
      const question = questions.find(q => q.id === questionId);
      if (question) {
        setEditingQuestion(questionId);
        setEditValues({
          question: question.question,
          answer: question.answer
        });
      }
    }
  };

  // Start editing a question
  // (Removed unused startEditing function)

  // Cancel editing
  const cancelEditing = () => {
    setEditingQuestion(null);
    setEditValues({});
    setErrorMessage('');
  };

  // Save edited question
  const saveQuestion = async (questionId) => {
    try {
      setSaving(true);
      setErrorMessage('');

      if (!editValues.question || !editValues.answer || 
          editValues.question.trim().length === 0 || editValues.answer.trim().length === 0) {
        setErrorMessage('Question and answer are required');
        return;
      }

      const response = await fetch(`http://localhost:3001/template-questions/${questionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: editValues.question.trim(),
          answer: editValues.answer.trim(),
          updatedBy: 'Admin@email.com'
        }),
      });

      if (response.ok) {
        setSuccessMessage('Template question updated successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
        setEditingQuestion(null);
        setEditValues({});
        await loadQuestions(); // Reload to get updated data
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error || 'Failed to update template question');
      }
    } catch (error) {
      console.error('Error saving template question:', error);
      setErrorMessage('Error saving template question');
    } finally {
      setSaving(false);
    }
  };

  // Delete a question
  const deleteQuestion = async (questionId) => {
    if (!confirm('Are you sure you want to delete this template question?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/template-questions/${questionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSuccessMessage('Template question deleted successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
        await loadQuestions(); // Reload to get updated data
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error || 'Failed to delete template question');
      }
    } catch (error) {
      console.error('Error deleting template question:', error);
      setErrorMessage('Error deleting template question');
    }
  };

  // Add new question with 4-question limit
  const addNewQuestion = async () => {
    // Check if already at 4 questions limit
    if (questions.length >= 4) {
      setErrorMessage('Maximum of 4 template questions allowed. Please delete an existing question first.');
      setTimeout(() => setErrorMessage(''), 5000);
      return;
    }

    const question = prompt('Enter the new question:');
    if (!question || question.trim().length === 0) return;

    const answer = prompt('Enter the answer for this question:');
    if (!answer || answer.trim().length === 0) return;

    try {
      const response = await fetch('http://localhost:3001/template-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: question.trim(),
          answer: answer.trim(),
          updatedBy: 'Admin@email.com'
        }),
      });

      if (response.ok) {
        setSuccessMessage('Template question created successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
        await loadQuestions(); // Reload to get updated data
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error || 'Failed to create template question');
      }
    } catch (error) {
      console.error('Error creating template question:', error);
      setErrorMessage('Error creating template question');
    }
  };

  // Handle input changes
  const handleInputChange = (field, value) => {
    setEditValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Format date for display
  const formatDateTime = (dateStr) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  if (loading) {
    return (
      <div className="template-questions-container">
        <Navbar />
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="template-questions-container">
      <Navbar />
      
      {/* Success/Error Messages */}
      {successMessage && (
        <div className="toast tst-success">{successMessage}</div>
      )}
      {errorMessage && (
        <div className="toast tst-error">{errorMessage}</div>
      )}

      <div className="questions-content">
        <div className="header">
          <h1>{t.title}</h1>
          <p>{t.manage}</p>
          <p className="question-limit">{t.max} | {t.current}: {questions.length}/4</p>
        </div>

        {/* Add new question button */}
        <div className="add-question-section">
          <button 
            className="add-question-btn" 
            onClick={addNewQuestion}
            disabled={questions.length >= 4}
            title={questions.length >= 4 ? t.max + t.maxReached : t.addNew}
          >
            {t.addNew} {questions.length >= 4 && t.maxReached}
          </button>
        </div>

        {/* Questions table */}
        <table className="questions-table">
          <thead>
            <tr>
              <th>{t.lastUpdated}</th>
              <th>{t.updatedBy}</th>
              <th>{t.question}</th>
              <th>{t.answerPreview}</th>
              <th>{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question) => {
              const updatedDateTime = formatDateTime(question.last_updated);
              const isExpanded = expandedQuestion === question.id;
              const isEditing = editingQuestion === question.id;

              return (
                <React.Fragment key={question.id}>
                  <tr className={`question-row${isExpanded ? ' expanded' : ''}`}>
                    <td>{updatedDateTime.time}<br/><small>{updatedDateTime.date}</small></td>
                    <td>{question.updated_by}</td>
                    <td className="question-text">{question.question}</td>
                    <td className="answer-preview">
                      {question.answer.length > 100 
                        ? question.answer.substring(0, 100) + '...' 
                        : question.answer}
                    </td>
                    <td>
                      <div className="actions">
                        <button 
                          className="expand-btn"
                          onClick={() => toggleQuestion(question.id)}
                        >
                          {isExpanded ? '▼ Collapse' : '▶ Expand & Edit'}
                        </button>
                        <button 
                          className="delete-btn"
                          onClick={() => deleteQuestion(question.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {/* Expanded details row */}
                  {isExpanded && (
                    <tr className="question-details-row">
                      <td colSpan={5}>
                        <div className="question-details">
                          {isEditing ? (
                            // Edit mode
                            <div className="edit-form">
                              <div className="edit-section">
                                <label>Question:</label>
                                <textarea
                                  value={editValues.question || ''}
                                  onChange={(e) => handleInputChange('question', e.target.value)}
                                  rows={3}
                                  maxLength={500}
                                />
                                <div className="character-count">
                                  {(editValues.question || '').length}/500 characters
                                </div>
                              </div>
                              
                              <div className="edit-section">
                                <label>Answer:</label>
                                <textarea
                                  value={editValues.answer || ''}
                                  onChange={(e) => handleInputChange('answer', e.target.value)}
                                  rows={5}
                                  maxLength={1000}
                                />
                                <div className="character-count">
                                  {(editValues.answer || '').length}/1000 characters
                                </div>
                              </div>
                              
                              <div className="edit-actions">
                                <button 
                                  className="save-btn"
                                  onClick={() => saveQuestion(question.id)}
                                  disabled={saving || !editValues.question || !editValues.answer}
                                >
                                  {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button 
                                  className="cancel-btn"
                                  onClick={cancelEditing}
                                  disabled={saving}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            // View mode
                            <div className="view-form">
                              <div className="view-section">
                                <h4>Question:</h4>
                                <p>{question.question}</p>
                              </div>
                              
                              <div className="view-section">
                                <h4>Answer:</h4>
                                <p>{question.answer}</p>
                              </div>
                              
                              <div className="question-metadata">
                                <small>
                                  ID: {question.id} • 
                                  Created: {formatDateTime(question.last_updated).date} at {formatDateTime(question.last_updated).time} • 
                                  Updated by: {question.updated_by}
                                </small>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            
            {questions.length === 0 && (
              <tr>
                <td colSpan={5} className="no-questions">
                  <p>{t.noQuestions}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TemplateQuestions;
