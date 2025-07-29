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
const XLSX = require('xlsx'); // Added for Excel file support

const app = express();
const PORT = process.env.APP_PORT || 3001;

// AWS Bedrock Configuration
const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
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
// Enhanced function to read different file types with full content access
const readFileContent = async (filePath, originalName) => {
    try {
        const extension = path.extname(originalName).toLowerCase();

        // Handle PDF files - Get full content, not truncated
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
        
        // Handle Excel files with full content extraction
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

// Helper function to analyze user message for specific file requests
const analyzeUserMessageForFiles = (message, availableDocuments) => {
    const requestedFiles = [];
    const messageLower = message.toLowerCase();
    
    // Look for explicit file mentions
    for (const doc of availableDocuments) {
        const fileNameLower = doc.originalName.toLowerCase();
        const fileNameWithoutExt = path.parse(doc.originalName).name.toLowerCase();
        
        // Check if user mentions the file by name (with or without extension)
        if (messageLower.includes(fileNameLower) || 
            messageLower.includes(fileNameWithoutExt) ||
            messageLower.includes(doc.originalName.toLowerCase())) {
            requestedFiles.push(doc);
        }
    }
    
    // Look for patterns like "file 1", "document 2", etc.
    const fileNumberMatch = messageLower.match(/(?:file|document|doc)\s*(\d+)/g);
    if (fileNumberMatch && availableDocuments.length > 0) {
        fileNumberMatch.forEach(match => {
            const numberMatch = match.match(/(\d+)/);
            if (numberMatch) {
                const fileIndex = parseInt(numberMatch[1]) - 1; // Convert to 0-based index
                if (fileIndex >= 0 && fileIndex < availableDocuments.length) {
                    if (!requestedFiles.find(f => f.id === availableDocuments[fileIndex].id)) {
                        requestedFiles.push(availableDocuments[fileIndex]);
                    }
                }
            }
        });
    }
    
    return requestedFiles;
};

// Helper function to check if message requests file information
const isFileRelatedQuery = (message) => {
    const fileKeywords = [
        'document', 'file', 'pdf', 'upload', 'handbook', 'manual', 'report', 
        'policy', 'procedure', 'guideline', 'attachment', 'doc', 'sheet'
    ];
    const messageLower = message.toLowerCase();
    return fileKeywords.some(keyword => messageLower.includes(keyword));
};

// Helper function to call AWS Bedrock with retry logic 
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const callBedrock = async (prompt, retryCount = 0, maxTokens = 1000) => {
    try {
        const modelId = 'anthropic.claude-v2';

        const input = {
            modelId: modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: maxTokens, // Now configurable to control response length
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
            return callBedrock(prompt, retryCount + 1, maxTokens);
        }

        throw new Error('Failed to get response from AI model');
    }
};

// Helper function to extract relevant text from a document based on user query
const extractRelevantText = (content, query) => {
    try {
        const queryWords = query.toLowerCase().split(/\s+/);
        const contentLines = content.split('\n');

        // Find lines containing query words
        const relevantLines = contentLines.filter(line => {
            const lineLower = line.toLowerCase();
            return queryWords.some(word => lineLower.includes(word));
        });

        // Combine relevant lines into a single string
        const relevantText = relevantLines.join('\n');

        // Limit the size of the relevant text to prevent excessive characters
        const maxLength = 2000; // Adjust as needed
        return relevantText.length > maxLength ? relevantText.substring(0, maxLength) + '... [truncated]' : relevantText;
    } catch (error) {
        console.error('Error extracting relevant text:', error);
        return '[Error extracting relevant text]';
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

        // Get context from documents - Enhanced selective file loading
        let context = 'No documents available.';
        let documentsToUse = [];
        
        try {
            // Get all available documents
            const allDocuments = await new Promise((resolve, reject) => {
                db.all('SELECT * FROM documents', [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            if (allDocuments.length > 0) {
                // Check if user specifically requested certain files
                const requestedFiles = analyzeUserMessageForFiles(message, allDocuments);
                
                // If specific files are requested, use only those
                if (requestedFiles.length > 0) {
                    documentsToUse = requestedFiles;
                    console.log(`User requested specific files: ${requestedFiles.map(f => f.originalName).join(', ')}`);
                } 
                // If the query is file-related but no specific files mentioned, use all
                else if (isFileRelatedQuery(message)) {
                    documentsToUse = allDocuments;
                    console.log('File-related query detected, using all available documents');
                }
                // For general queries, don't load documents unless specifically requested
                else {
                    documentsToUse = [];
                    console.log('General query detected, not loading documents unless specifically requested');
                }

                // Load content for selected documents
                if (documentsToUse.length > 0) {
                    context = 'Available documents:\n';
                    
                    // Process documents with performance optimization
                    const documentPromises = documentsToUse.map(async (doc) => {
                        try {
                            const filePath = path.join(__dirname, 'uploads', doc.filename);
                            
                            // Check if file exists before trying to read
                            if (!fs.existsSync(filePath)) {
                                console.error(`File not found: ${filePath}`);
                                return {
                                    name: doc.originalName,
                                    content: '[File not found on server]',
                                    error: true
                                };
                            }
                            
                            const content = await readFileContent(filePath, doc.originalName);
                            
                            // Extract relevant text based on user query
                            const relevantContent = extractRelevantText(content, message);
                            
                            return {
                                name: doc.originalName,
                                content: relevantContent,
                                error: false
                            };
                        } catch (err) {
                            console.error(`Error reading file ${doc.filename}:`, err);
                            return {
                                name: doc.originalName,
                                content: `[Error reading file: ${err.message}]`,
                                error: true
                            };
                        }
                    });
                    
                    // Wait for all documents to be processed
                    const documentResults = await Promise.all(documentPromises);
                    
                    // Build context string
                    documentResults.forEach(result => {
                        context += `\nDocument: ${result.name}\n`;
                        if (result.error) {
                            context += `Content: ${result.content}\n`;
                        } else {
                            context += `Content: ${result.content}\n`;
                        }
                        context += '---\n';
                    });
                    
                    // Add document listing for user reference
                    context += `\nDocuments used in this response: ${documentResults.map(r => r.name).join(', ')}\n`;
                }
            }
        } catch (err) {
            console.error('Error reading documents:', err);
            context = 'Error accessing documents. Please try again later.';
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

        // Generate response using Bedrock with enhanced context and response control
        let responseMaxTokens = 800; // Default shorter responses
        
        // Adjust response length based on query complexity
        if (documentsToUse.length > 0 || message.length > 200) {
            responseMaxTokens = 1200; // Longer responses for document-based or complex queries
        }
        
        // Enhanced prompt with better instructions
        const prompt = `You are a helpful AI assistant. Follow these guidelines:

RESPONSE LENGTH: Keep responses concise and to the point. Aim for 2-4 paragraphs maximum unless the user specifically asks for detailed information.

DOCUMENT USAGE: ${documentsToUse.length > 0 ? 
    `The user has access to specific documents. Use ONLY the provided document content to answer questions about those documents. Documents available: ${documentsToUse.map(d => d.originalName).join(', ')}` : 
    'Only use documents if the user specifically mentions them or asks about uploaded files.'
}

INSTRUCTIONS:
1. Answer directly and concisely
2. If using document information, cite the document name
3. If information isn't in the provided context, clearly state this
4. Don't repeat information unnecessarily
5. Focus on the specific question asked

Document Context:
${context}

Conversation History:
${chatHistory}

Current User Question: ${message}

Provide a helpful, concise response:`;

        const responseText = await callBedrock(prompt, 0, responseMaxTokens);

        // Validate response before saving
        if (!responseText || responseText.trim().length === 0) {
            throw new Error('Empty response received from AI model');
        }

        // Save bot response with error handling
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO messages (chatId, sender, text) VALUES (?, ?, ?)',
                [chatId, 'bot', responseText],
                function(err) {
                    if (err) {
                        console.error('Error saving bot response:', err);
                        reject(err);
                    } else {
                        console.log(`Bot response saved for chat ${chatId}, message ID: ${this.lastID}`);
                        resolve();
                    }
                }
            );
        });

        // Enhanced response with metadata
        const response = {
            response: responseText,
            chatId: chatId,
            topic: chatTopic,
            documentsUsed: documentsToUse.map(d => ({
                id: d.id,
                name: d.originalName
            })),
            responseMetadata: {
                documentsAnalyzed: documentsToUse.length,
                responseLength: responseText.length,
                maxTokensUsed: responseMaxTokens
            }
        };

        console.log(`Chat response generated - Topic: ${chatTopic}, Documents used: ${documentsToUse.length}, Response length: ${responseText.length}`);
        
        res.json(response);
    } catch (error) {
        console.error('Chat error:', error);
        
        // Enhanced error handling with specific error types
        let errorMessage = 'Internal server error';
        let statusCode = 500;
        
        if (error.message.includes('Database did not initialize')) {
            errorMessage = 'Database connection error. Please try again later.';
            statusCode = 503;
        } else if (error.message.includes('Failed to get response from AI model')) {
            errorMessage = 'AI service temporarily unavailable. Please try again.';
            statusCode = 503;
        } else if (error.message.includes('Empty response received')) {
            errorMessage = 'Invalid response from AI. Please rephrase your question.';
            statusCode = 422;
        } else if (error.name === 'ThrottlingException') {
            errorMessage = 'Service is busy. Please wait a moment and try again.';
            statusCode = 429;
        }
        
        // Log error details for debugging
        console.error(`Chat error details - User message: "${message}", Error: ${error.message}, Stack: ${error.stack}`);
        
        res.status(statusCode).json({ 
            error: errorMessage,
            timestamp: new Date().toISOString(),
            chatId: chatId || null
        });
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

// Enhanced endpoint to get available documents with metadata
app.get('/documents/available', async (req, res) => {
    try {
        const db = await getDB();
        const documents = await new Promise((resolve, reject) => {
            db.all('SELECT id, originalName, uploadDate FROM documents ORDER BY uploadDate DESC', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Add file size and type information
        const documentsWithMetadata = await Promise.all(documents.map(async (doc, index) => {
            try {
                const filePath = path.join(__dirname, 'uploads', doc.filename || doc.originalName);
                const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
                const extension = path.extname(doc.originalName).toLowerCase();
                
                return {
                    id: doc.id,
                    name: doc.originalName,
                    uploadDate: doc.uploadDate,
                    size: stats ? stats.size : 0,
                    type: extension,
                    index: index + 1, // For user reference (file 1, file 2, etc.)
                    available: !!stats
                };
            } catch (err) {
                console.error(`Error getting metadata for ${doc.originalName}:`, err);
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
        console.error('Error fetching available documents:', error);
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