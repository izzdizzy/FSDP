// src/pages/TemplateQuestions.jsx
import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import '../css/template-questions.css';

const TemplateQuestions = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Template Questions - Admin';
    loadQuestions();
  }, []);

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

  // Toggle question expansion
  const toggleQuestion = (questionId) => {
    if (expandedQuestion === questionId) {
      setExpandedQuestion(null);
    } else {
      setExpandedQuestion(questionId);
    }
  };

  // Start editing a question
  const startEditing = (question) => {
    setEditingQuestion(question.id);
    setEditValues({
      question: question.question,
      answer: question.answer
    });
  };

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

  // Add new question
  const addNewQuestion = async () => {
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
          <p>Loading template questions...</p>
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
          <h1>Template Questions</h1>
          <p>Manage pre-defined questions that users can select when starting a new chat</p>
        </div>

        {/* Add new question button */}
        <div className="add-question-section">
          <button className="add-question-btn" onClick={addNewQuestion}>
            + Add New Question
          </button>
        </div>

        {/* Questions table */}
        <table className="questions-table">
          <thead>
            <tr>
              <th>Last Updated</th>
              <th>Updated By</th>
              <th>Question</th>
              <th>Answer Preview</th>
              <th>Actions</th>
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
                          {isExpanded ? '▼ Collapse' : '▶ Expand'}
                        </button>
                        <button 
                          className="edit-btn"
                          onClick={() => startEditing(question)}
                          disabled={isEditing}
                        >
                          Edit
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
                  <p>No template questions found. Add some questions to get started!</p>
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
