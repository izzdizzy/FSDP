const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.APP_PORT || 3001;

app.use(cors());
app.use(express.json());


const dir = './uploads';
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    console.log(`Created uploads directory: ${dir}`);
}


let db;

const setupDb = () => {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database('./database.sqlite', (err) => {
            if (err) {
                console.error('Database connection error:', err.message);
                reject(err);
            } else {
                console.log('Connected to SQLite database');
                db.run(`
                    CREATE TABLE IF NOT EXISTS documents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        filename TEXT UNIQUE,
                        originalName TEXT,
                        uploadDate DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (createErr) => {
                    if (createErr) {
                        console.error('Table creation error:', createErr.message);
                        reject(createErr);
                    } else {
                        resolve(db);
                    }
                });
            }
        });
    });
};

let database;
setupDb().then((dbInstance) => {
    database = dbInstance;
    console.log('Database initialized successfully');
}).catch((err) => {
    console.error('Failed to initialize database:', err);
});

const getDB = () => {
    return new Promise((resolve, reject) => {
        if (database) return resolve(database);
        let attempts = 0;
        const interval = setInterval(() => {
            if (database) {
                clearInterval(interval);
                resolve(database);
            } else if (attempts++ > 20) {
                clearInterval(interval);
                reject(new Error("Database did not initialize"));
            }
        }, 100);
    });
};

// File upload config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        // Let client control final name during replace
        cb(null, file.originalname);
    },
});
const upload = multer({ storage });

// Routes
app.post('/upload', upload.single('document'), async (req, res) => {
    try {
        const { filename, originalname } = req.file;
        const db = await getDB();
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
        console.error('Error uploading document:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/documents', async (req, res) => {
    try {
        const db = await getDB();
        db.all('SELECT * FROM documents', [], (err, rows) => {
            if (err) {
                console.error('Error fetching documents:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        });
    } catch (e) {
        console.error('Error fetching documents:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/documents/:id', async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;

        db.run('DELETE FROM documents WHERE id = ?', [id], function (err) {
            if (err) {
                console.error('Error deleting document:', err.message);
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                console.error('Document not found:', id);
                return res.status(404).json({ error: 'Document not found' });
            }
            res.json({ message: 'Document deleted' });
        });
    } catch (e) {
        console.error('Error deleting document:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.put('/documents/:id', async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const { originalName } = req.body;

        db.run(
            'UPDATE documents SET originalName = ? WHERE id = ?',
            [originalName, id],
            function (err) {
                if (err) {
                    console.error('Error updating document:', err.message);
                    return res.status(500).json({ error: err.message });
                }
                if (this.changes === 0) {
                    console.error('Document not found:', id);
                    return res.status(404).json({ error: 'Document not found' });
                }
                res.json({ message: 'Document updated' });
            }
        );
    } catch (e) {
        console.error('Error updating document:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.put('/documents/:id/update', upload.single('document'), async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        db.get('SELECT * FROM documents WHERE id = ?', [id], async (err, doc) => {
            if (err || !doc) {
                console.error('Document not found:', id);
                return res.status(404).json({ error: 'Document not found' });
            }

            const oldFilePath = `./uploads/${doc.filename}`;

            const newStoredFilename = req.file.filename;
            const newFilePath = `./uploads/${newStoredFilename}`;

            fs.renameSync(`./uploads/${req.file.filename}`, newFilePath);

            db.run(
                'UPDATE documents SET filename = ?, uploadDate = CURRENT_TIMESTAMP WHERE id = ?',
                [newStoredFilename, id],
                function (updateErr) {
                    if (updateErr) {
                        console.error('Error updating document:', updateErr.message);
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
        console.error('Error replacing document:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/documents/:id/file', async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;

        db.get('SELECT * FROM documents WHERE id = ?', [id], (err, doc) => {
            if (err || !doc) {
                console.error('Document not found:', id);
                return res.status(404).json({ error: 'Document not found' });
            }

            const filePath = path.join(__dirname, 'uploads', doc.filename);
            res.sendFile(filePath);
        });
    } catch (e) {
        console.error('Error sending file:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});