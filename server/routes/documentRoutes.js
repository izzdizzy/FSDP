const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

module.exports = (db, upload, helpers) => {
  // GET /documents
  router.get('/documents', async (req, res) => {
    try {
      db.all('SELECT * FROM documents', [], (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows);
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /documents/available
  router.get('/documents/available', async (req, res) => {
    try {
      const documents = await new Promise((resolve, reject) => {
        db.all('SELECT id, originalName, uploadDate, filename FROM documents ORDER BY uploadDate DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      const documentsWithMetadata = await Promise.all(documents.map(async (doc, index) => {
        try {
          const filePath = path.join(__dirname, '../uploads', doc.filename || doc.originalName);
          const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
          const extension = path.extname(doc.originalName).toLowerCase();
          return {
            id: doc.id,
            name: doc.originalName,
            uploadDate: doc.uploadDate,
            size: stats ? stats.size : 0,
            type: extension,
            index: index + 1,
            available: !!stats
          };
        } catch (err) {
          return {
            id: doc.id,
            name: doc.originalName,
            uploadDate: doc.uploadDate,
            size: 0,
            type: path.extname(doc.originalName).toLowerCase(),
            index: index + 1,
            available: false
          };
        }
      }));
      res.json({
        documents: documentsWithMetadata,
        total: documentsWithMetadata.length,
        message: "To reference a specific document in your question, mention its name or use 'file 1', 'file 2', etc."
      });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /upload
  router.post('/upload', upload.single('document'), async (req, res) => {
    try {
      const { filename, originalname } = req.file;
      db.run(
        'INSERT INTO documents (filename, originalName) VALUES (?, ?)',
        [filename, originalname],
        function (err) {
          if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
              return res.status(400).json({ error: 'Duplicate document' });
            }
            return res.status(500).json({ error: err.message });
          }
          res.status(201).json({ message: 'Uploaded', id: this.lastID });
        }
      );
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /documents/:id
  router.delete('/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      db.run('DELETE FROM documents WHERE id = ?', [id], function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Document not found' });
        }
        res.json({ message: 'Document deleted' });
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /documents/:id
  router.put('/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { originalName } = req.body;
      db.run(
        'UPDATE documents SET originalName = ? WHERE id = ?',
        [originalName, id],
        function (err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'Document not found' });
          }
          res.json({ message: 'Document updated' });
        }
      );
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /documents/:id/update
  router.put('/documents/:id/update', upload.single('document'), async (req, res) => {
    try {
      const { id } = req.params;
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      db.get('SELECT * FROM documents WHERE id = ?', [id], async (err, doc) => {
        if (err || !doc) {
          return res.status(404).json({ error: 'Document not found' });
        }
        const oldFilePath = path.join(__dirname, '../uploads', doc.filename);
        const newStoredFilename = req.file.filename;
        const newFilePath = path.join(__dirname, '../uploads', newStoredFilename);
        fs.renameSync(path.join(__dirname, '../uploads', req.file.filename), newFilePath);
        db.run(
          'UPDATE documents SET filename = ?, uploadDate = CURRENT_TIMESTAMP WHERE id = ?',
          [newStoredFilename, id],
          function (updateErr) {
            if (updateErr) {
              if (updateErr.code === 'SQLITE_CONSTRAINT') {
                return res.status(400).json({ error: 'Duplicate document' });
              }
              return res.status(500).json({ error: updateErr.message });
            }
            res.json({ message: 'File replaced successfully' });
          }
        );
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /documents/:id/file
  router.get('/documents/:id/file', async (req, res) => {
    try {
      const { id } = req.params;
      db.get('SELECT * FROM documents WHERE id = ?', [id], (err, doc) => {
        if (err || !doc) {
          return res.status(404).json({ error: 'Document not found' });
        }
        const filePath = path.join(__dirname, '../uploads', doc.filename);
        res.sendFile(filePath);
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
