import React, { useEffect, useState } from 'react';
import ChatUI from './bot-UI';
import '../css/doc.css';
import '../css/App.css';
import Navbar from '../components/Navbar';
import http from '../http'; 

const DocumentsPage = () => {
  // Translation object
  const translations = {
    en: {
      documents: 'Documents',
      upload: 'Upload',
      uploading: 'Uploading...',
      id: 'ID',
      fileName: 'File Name',
      name: 'Name',
      date: 'Date',
      actions: 'Actions',
      replaceFile: 'Replace File',
      save: 'Save',
      cancel: 'Cancel',
      edit: 'Edit',
      delete: 'Delete',
      noDocuments: 'No documents found',
      noSearchResults: 'No documents match your search criteria',
      confirmDelete: 'Are you sure you want to delete this document?',
      yes: 'Yes',
      chatbotIconAlt: 'Chatbot Icon',
      fileNotCompatible: 'File is not compatible',
      fileUploaded: 'File uploaded successfully',
      fileDeleted: 'File deleted successfully',
      fileRenamed: 'File renamed successfully',
      fileReplaced: 'File replaced successfully',
      failedToLoad: 'Failed to load documents',
      errorOccurred: 'Unknown error occurred',
      searchPlaceholder: 'Search by file name or name...',
      sortBy: 'Sort by:',
      sortName: 'Name',
      sortFileName: 'File Name',
      sortDate: 'Date',
      ascending: 'Ascending',
      descending: 'Descending',
    },
    zh: {
      documents: '文件',
      upload: '上传',
      uploading: '正在上传...',
      id: '编号',
      fileName: '文件名',
      name: '名称',
      date: '日期',
      actions: '操作',
      replaceFile: '替换文件',
      save: '保存',
      cancel: '取消',
      edit: '编辑',
      delete: '删除',
      noDocuments: '未找到文件',
      noSearchResults: '没有符合搜索条件的文件',
      confirmDelete: '您确定要删除此文件吗？',
      yes: '是',
      chatbotIconAlt: '聊天机器人图标',
      fileNotCompatible: '文件类型不兼容',
      fileUploaded: '文件上传成功',
      fileDeleted: '文件删除成功',
      fileRenamed: '文件重命名成功',
      fileReplaced: '文件替换成功',
      failedToLoad: '加载文件失败',
      errorOccurred: '发生未知错误',
      searchPlaceholder: '按文件名或名称搜索...',
      sortBy: '排序方式:',
      sortName: '名称',
      sortFileName: '文件名',
      sortDate: '日期',
      ascending: '升序',
      descending: '降序',
    }
  };
  // Get language from localStorage
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const t = translations[language];
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Sorting and filtering state
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');

  // Sorting and filtering functions
  const handleSort = (field) => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
  };

  const getDisplayDocs = () => {
    let result = [...docs];

    // Apply search filter
    if (searchTerm) {
      result = result.filter(doc =>
        doc.originalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.filename.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    if (sortField) {
      result.sort((a, b) => {
        let aValue, bValue;
        
        switch (sortField) {
          case 'name':
            aValue = a.originalName.toLowerCase();
            bValue = b.originalName.toLowerCase();
            break;
          case 'filename':
            aValue = a.filename.toLowerCase();
            bValue = b.filename.toLowerCase();
            break;
          case 'date':
            aValue = new Date(a.uploadDate);
            bValue = new Date(b.uploadDate);
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return <img src="/filter.png" alt="Sort" style={{ width: 16, height: 16, verticalAlign: 'middle' }} />;
    return sortDirection === 'asc'
      ? <span style={{ fontSize: 16, verticalAlign: 'middle' }}>↑</span>
      : <span style={{ fontSize: 16, verticalAlign: 'middle' }}>↓</span>;
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
      showError(t.fileNotCompatible);
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
      const newRes = await http.get('/documents');
      setDocs(newRes.data);
      showSuccess(t.fileUploaded);
    } catch (err) {
      // Check for duplicate error (customize this check based on backend response)
      if (err.response && (err.response.status === 409 || (err.response.data && err.response.data.error && err.response.data.error.toLowerCase().includes('duplicate')))) {
        showError('Duplicate file.');
      } else {
        console.error('Error uploading document:', err.message);
        showError(err.message || t.errorOccurred);
      }
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
      const newRes = await http.get('/documents');
      setDocs(newRes.data);
      showSuccess(t.fileDeleted);
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
      showSuccess(t.fileRenamed);
      }

      setEditingId(null);
      setEditValues((prev) => {
        const newState = { ...prev };
        delete newState[doc.id];
        return newState;
      });

      const newRes = await http.get('/documents');
      setDocs(newRes.data);
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
      showError(t.fileNotCompatible);
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
      const newRes = await http.get('/documents');
      setDocs(newRes.data);
      showSuccess(t.fileReplaced);
    } catch (err) {
      console.error('Error replacing document:', err.message);
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadDocs = async () => {
      try {
        const res = await http.get('/documents');
        console.log('Fetched documents:', res.data);
        setDocs(res.data);
      } catch (err) {
        console.error('Error fetching documents:', err.message);
        setErrorMessage(t.failedToLoad);
      } finally {
        setLoading(false);
      }
    };
    
    loadDocs();
    // Listen for language change
    const handleLangChange = () => {
      setLanguage(localStorage.getItem('language') || 'en');
    };
    window.addEventListener('languageChanged', handleLangChange);
    return () => window.removeEventListener('languageChanged', handleLangChange);
  }, [t.failedToLoad]);

  useEffect(() => {
    document.title = t.documents;
  }, [t.documents]);

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
          <h1>{t.documents}</h1>
        </div>
        

        <div className="file-upload">
          <label className="upload-label">
            <input type="file" onChange={uploadDoc} disabled={loading} hidden />
            <div className="upload-button">
              <span className="upload-icon">+</span>
              <span className="upload-text">{t.upload}</span>
            </div>
          </label>
          
          <button
            className="filter-toggle-btn"
            onClick={() => setShowFilters((prev) => !prev)}
            style={{ marginLeft: 25, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <img src="/filter.png" alt="Filter" style={{ width: 20, height: 20 }} />
            {showFilters ? (t.cancel + ' ' + t.sortBy) : t.sortBy}
          </button>
          {showFilters && (
            <div className="table-controls">
              <div className="search-container">
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <div className="sort-controls">
                <label>{t.sortBy}</label>
                <button type="button" className="sort-btn" onClick={() => handleSort('filename')}>{t.sortFileName} {getSortIcon('filename')}</button>
                <button type="button" className="sort-btn" onClick={() => handleSort('name')}>{t.sortName} {getSortIcon('name')}</button>
                <button type="button" className="sort-btn" onClick={() => handleSort('date')}>{t.sortDate} {getSortIcon('date')}</button>
              </div>
            </div>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th>{t.id}</th>
              <th>{t.fileName}</th>
              <th>{t.name}</th>
              <th>{t.date}</th>
              <th>{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {getDisplayDocs().length > 0 ? (
              getDisplayDocs().map((doc, idx) => (
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
                      {t.replaceFile}
                      <input
                        type="file"
                        hidden
                        onChange={(e) => handleUpdate(e, doc)}
                      />
                    </label>
                    {editingId === doc.id ? (
                      <>
                        <button className="button" onClick={() => saveEdit(doc)}>{t.save}</button>
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
                          {t.cancel}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="button" onClick={() => startEditing(doc)}>{t.edit}</button>
                        <button className="button-delete" onClick={() => handleDelete(doc.id)}>{t.delete}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5">
                  {docs.length === 0 ? t.noDocuments : t.noSearchResults}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {deletingId && (
          <>
            <div className="modal-backdrop"></div>
            <div className="modal">
              <p>{t.confirmDelete}</p>
              <button id='yes-delete' onClick={confirmDelete} style={{ marginRight: '10px' }}>{t.yes}</button>
              <button onClick={() => setDeletingId(null)}>{t.cancel}</button>
            </div>
          </>
        )}

        {!showChat && (
          <button className="chat-icon-button" onClick={() => setShowChat(true)}>
            <img src="/Chatbot-icon.png" alt={t.chatbotIconAlt} className="chat-icon" />
          </button>
        )}

        {showChat && <ChatUI onClose={() => setShowChat(false)} />}
      </div>
    </>
  );
};

export default DocumentsPage;