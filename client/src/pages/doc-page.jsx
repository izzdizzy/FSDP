import React, { useEffect, useState } from 'react';
import ChatUI from './bot-UI';
import '../css/doc.css';
import '../css/App.css';
import Navbar from '../components/Navbar';
import http from '../http'; 

const DocumentsPage = ( {pagetitle} ) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [showChat, setShowChat] = useState(false);

  const fetchDocs = async () => {
    try {
      const res = await http.get('/documents');
      console.log('Fetched documents:', res.data);
      setDocs(res.data);
    } catch (err) {
      console.error('Error fetching documents:', err.message);
      setErrorMessage('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const showError = (message) => {
    setErrorMessage(message);
    setTimeout(() => setErrorMessage(''), 3000);
  };

  const uploadDoc = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      showError('File is not compatible');
      return;
    }

    const formData = new FormData();
    formData.append('document', file);

    setLoading(true);
    setErrorMessage('');

    try {
      const res = await http.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      console.log('Document uploaded successfully:', res.data);
      await fetchDocs();
      showSuccess('File uploaded successfully');
    } catch (err) {
      console.error('Error uploading document:', err.message);
      showError(err.message || 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
  };

  const confirmDelete = async () => {
    const id = deletingId;
    if (!id) return;

    try {
      const res = await http.delete(`/documents/${id}`);
      console.log('Document deleted successfully:', res.data);
      await fetchDocs();
      showSuccess('File deleted successfully');
    } catch (err) {
      console.error('Error deleting document:', err.message);
      showError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const startEditing = (doc) => {
    setEditingId(doc.id);
    setEditValues({
      ...editValues,
      [doc.id]: doc.originalName,
    });
  };

  const saveEdit = async (doc) => {
    try {
      const res = await http.put(`/documents/${doc.id}`, {
        originalName: editValues[doc.id],
      });
      console.log('Document updated successfully:', res.data);
      if (editValues[doc.id] !== doc.originalName) {
        showSuccess('File renamed successfully');
      }

      setEditingId(null);
      setEditValues((prev) => {
        const newState = { ...prev };
        delete newState[doc.id];
        return newState;
      });

      await fetchDocs();
    } catch (err) {
      console.error('Error saving edit:', err.message);
      showError(err.message);
    }
  };

  const handleInputChange = (id, value) => {
    setEditValues({
      ...editValues,
      [id]: value,
    });
  };

  const handleUpdate = async (e, doc) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      showError('File is not compatible');
      return;
    }

    const formData = new FormData();
    formData.append('document', file);

    setLoading(true);
    setErrorMessage('');

    try {
      const res = await http.put(`/documents/${doc.id}/update`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      console.log('File replaced successfully:', res.data);
      await fetchDocs();
      showSuccess('File replaced successfully');
    } catch (err) {
      console.error('Error replacing document:', err.message);
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  useEffect(() => {
    document.title = 'Documents'
  }, [pagetitle]);

  return (
    <>
      {successMessage && (
        <div className="toast tst-success">{successMessage}</div>
      )}

      {errorMessage && (
        <div className="toast tst-error">{errorMessage}</div>
      )}

      <div className="container">
        <Navbar />
        <br />
        <br />

        <div className="header">
          <h1>Documents</h1>
        </div>

        <div className="file-upload">
          <label className="upload-label">
            <input type="file" onChange={uploadDoc} disabled={loading} hidden />
            <div className="upload-button">
              <span className="upload-icon">+</span>
              <span className="upload-text">Upload</span>
            </div>
          </label>
          {loading && <p className="uploading">Uploading...</p>}
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>File Name</th>
              <th>Name</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.length > 0 ? (
              docs.map((doc, idx) => (
                <tr key={doc.id}>
                  <td>{idx + 1}</td>
                  <td>{doc.filename}</td>
                  <td>
                    {editingId === doc.id ? (
                      <input
                        type="text"
                        value={editValues[doc.id] || ''}
                        onChange={(e) => handleInputChange(doc.id, e.target.value)}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      <a
                        href={`${import.meta.env.VITE_API_BASE_URL}/documents/${doc.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="document-link"
                      >
                        {doc.originalName}
                      </a>
                    )}
                  </td>
                  <td>{new Date(doc.uploadDate).toLocaleString()}</td>
                  <td className="actions">
                    <label className="button">
                      Replace File
                      <input
                        type="file"
                        hidden
                        onChange={(e) => handleUpdate(e, doc)}
                      />
                    </label>
                    {editingId === doc.id ? (
                      <>
                        <button className="button" onClick={() => saveEdit(doc)}>Save</button>
                        <button
                          className="button-delete"
                          onClick={() => {
                            setEditingId(null);
                            setEditValues((prev) => {
                              const newState = { ...prev };
                              delete newState[doc.id];
                              return newState;
                            });
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="button" onClick={() => startEditing(doc)}>Edit</button>
                        <button className="button-delete" onClick={() => handleDelete(doc.id)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4">No documents found</td>
              </tr>
            )}
          </tbody>
        </table>

        {deletingId && (
          <>
            <div className="modal-backdrop"></div>
            <div className="modal">
              <p>Are you sure you want to delete this document?</p>
              <button id='yes-delete' onClick={confirmDelete} style={{ marginRight: '10px' }}>Yes</button>
              <button onClick={() => setDeletingId(null)}>Cancel</button>
            </div>
          </>
        )}

        {!showChat && (
          <button className="chat-icon-button" onClick={() => setShowChat(true)}>
            <img src="/Chatbot-icon.png" alt="Chatbot Icon" className="chat-icon" />
          </button>
        )}

        {showChat && <ChatUI onClose={() => setShowChat(false)} />}
      </div>
    </>
  );
};

export default DocumentsPage;