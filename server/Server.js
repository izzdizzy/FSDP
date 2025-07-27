// server.js (updated portions)
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.APP_PORT || 3001;

// AWS Bedrock Configuration
const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

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
                db.serialize(() => {
                    // Create documents table
                    db.run(`
            CREATE TABLE IF NOT EXISTS documents (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              filename TEXT UNIQUE,
              originalName TEXT,
              uploadDate DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `, (createErr) => {
                        if (createErr) {
                            console.error('Documents table creation error:', createErr.message);
                            reject(createErr);
                        }
                    });

                    // Create chats table
                    db.run(`
            CREATE TABLE IF NOT EXISTS chats (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              topic TEXT UNIQUE,
              createdDate DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `, (createErr) => {
                        if (createErr) {
                            console.error('Chats table creation error:', createErr.message);
                            reject(createErr);
                        }
                    });

                    // Create messages table
                    db.run(`
            CREATE TABLE IF NOT EXISTS messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              chatId INTEGER,
              sender TEXT,
              text TEXT,
              timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (chatId) REFERENCES chats(id)
            )
          `, (createErr) => {
                        if (createErr) {
                            console.error('Messages table creation error:', createErr.message);
                            reject(createErr);
                        } else {
                            resolve(db);
                        }
                    });
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

// Helper function to read file content
// Add this helper function to read different file types
const readFileContent = async (filePath, originalName) => {
    try {
        const extension = path.extname(originalName).toLowerCase();

        // Handle PDF files
        if (extension === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        }

        // Handle DOCX files
        if (extension === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        }

        // Handle DOC files (basic support - may need additional library for full support)
        if (extension === '.doc') {
            return '[DOC file detected - full text extraction not supported in this implementation]';
        }

        // Handle TXT and other text-based files
        if (['.txt', '.md', '.csv'].includes(extension)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        if (extension === '.xlsx' || extension === '.xls') {
            const workbook = XLSX.readFile(filePath);
            let excelText = '';

            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                excelText += `\nSheet: ${sheetName}\n`;
                excelText += XLSX.utils.sheet_to_csv(sheet);
            });

            return excelText;
        }

        // Default case for unsupported formats
        return `[Unsupported file format: ${extension}]`;
    } catch (error) {
        console.error(`Error reading file ${originalName}:`, error);
        return `[Error reading file: ${error.message}]`;
    }
};

// Helper function to call AWS Bedrock with retry logic
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const callBedrock = async (prompt, retryCount = 0) => {
    try {
        const modelId = 'anthropic.claude-v2';

        const input = {
            modelId: modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 1000,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            })
        };

        const command = new InvokeModelCommand(input);
        const response = await bedrockClient.send(command);
        const decodedResponseBody = new TextDecoder().decode(response.body);
        const responseBody = JSON.parse(decodedResponseBody);

        return responseBody.content[0].text.trim();
    } catch (error) {
        console.error('Error calling Bedrock:', error);

        // Handle throttling with exponential backoff
        if (error.name === 'ThrottlingException' && retryCount < 3) {
            const delayMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            console.log(`Throttled! Retrying in ${delayMs}ms... (Attempt ${retryCount + 1})`);
            await delay(delayMs);
            return callBedrock(prompt, retryCount + 1);
        }

        throw new Error('Failed to get response from AI model');
    }
};

// Chat routes
app.post('/chat', async (req, res) => {
    try {
        const { message, topic } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const db = await getDB();

        // If topic is provided, get or create chat
        let chatId;
        let chatTopic;
        if (topic) {
            // Get existing chat by topic or create new one
            const chat = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM chats WHERE topic = ?', [topic], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (chat) {
                chatId = chat.id;
                chatTopic = topic;
            } else {
                // Create new chat with the provided topic
                const result = await new Promise((resolve, reject) => {
                    db.run('INSERT INTO chats (topic) VALUES (?)', [topic], function (err) {
                        if (err) reject(err);
                        else resolve(this);
                    });
                });
                chatId = result.lastID;
                chatTopic = topic;
            }
        } else {
            // If no topic provided, generate one based on first message
            const generatedTopic = message.substring(0, 50) + (message.length > 50 ? '...' : '');
            chatTopic = generatedTopic;

            // Check if chat with this topic already exists
            const existingChat = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM chats WHERE topic = ?', [generatedTopic], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (existingChat) {
                chatId = existingChat.id;
            } else {
                // Create new chat with generated topic
                const result = await new Promise((resolve, reject) => {
                    db.run('INSERT INTO chats (topic) VALUES (?)', [generatedTopic], function (err) {
                        if (err) reject(err);
                        else resolve(this);
                    });
                });
                chatId = result.lastID;
            }
        }

        // Save user message
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO messages (chatId, sender, text) VALUES (?, ?, ?)',
                [chatId, 'user', message],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Get context from documents
        let context = 'No documents available.';
        try {
            // Get all documents
            const documents = await new Promise((resolve, reject) => {
                db.all('SELECT * FROM documents', [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            if (documents.length > 0) {
                context = 'Relevant documents:\n';
                for (const doc of documents) {
                    try {
                        const filePath = path.join(__dirname, 'uploads', doc.filename);
                        const content = await readFileContent(filePath, doc.originalName);
                        context += `\nDocument: ${doc.originalName}\nContent: ${content.substring(0, 1000)}...\n`;
                    } catch (err) {
                        console.error(`Error reading file ${doc.filename}:`, err);
                        context += `\nDocument: ${doc.originalName}\nContent: [Error reading file]\n`;
                    }
                }
            }
        } catch (err) {
            console.error('Error reading documents:', err);
            context = 'Error accessing documents.';
        }

        // Get chat history for context
        let chatHistory = '';
        try {
            const messages = await new Promise((resolve, reject) => {
                db.all('SELECT sender, text FROM messages WHERE chatId = ? ORDER BY timestamp',
                    [chatId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            if (messages.length > 1) { // Exclude the current message
                chatHistory = 'Previous conversation:\n';
                // Take last 5 messages for context (excluding current)
                const recentMessages = messages.slice(-6, -1);
                for (const msg of recentMessages) {
                    chatHistory += `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}\n`;
                }
            }
        } catch (err) {
            console.error('Error fetching chat history:', err);
        }

        // Generate response using Bedrock with full context
        const prompt = `
    You are a helpful AI assistant. Answer the user's question based on the provided context.
    If the context doesn't contain relevant information, use your general knowledge but clearly state that you're doing so.
    If the question is completely unrelated to the context and outside your knowledge, explicitly state that it's out of scope.
    
    Document Context:
    ${context}
    
    Conversation History:
    ${chatHistory}
    
    Current User Question: ${message}
    
    Assistant:`;

        const responseText = await callBedrock(prompt);

        // Save bot response
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO messages (chatId, sender, text) VALUES (?, ?, ?)',
                [chatId, 'bot', responseText],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({
            response: responseText,
            chatId: chatId,
            topic: chatTopic
        });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get chat history by topic
app.get('/chat/:topic', async (req, res) => {
    try {
        const { topic } = req.params;
        const db = await getDB();

        // Get chat by topic
        const chat = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM chats WHERE topic = ?', [topic], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // Get messages for this chat
        const messages = await new Promise((resolve, reject) => {
            db.all('SELECT sender, text FROM messages WHERE chatId = ? ORDER BY timestamp',
                [chat.id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json({ messages });
    } catch (error) {
        console.error('Error fetching chat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all chats (topics)
app.get('/chats', async (req, res) => {
    try {
        const db = await getDB();
        const chats = await new Promise((resolve, reject) => {
            db.all('SELECT topic FROM chats ORDER BY createdDate DESC', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(chats);
    } catch (error) {
        console.error('Error fetching chats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Document routes (keeping existing functionality)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    },
});

const upload = multer({ storage });

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