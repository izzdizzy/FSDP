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
// Modular imports
const upload = require('./middleware/upload');
const helpers = require('./utils/helpers');
const { getDB, callBedrock, analyzeUserMessageForFiles, isFileRelatedQuery, readFileContent, extractRelevantText } = require('./utils/helpers');

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
                    db.run(`CREATE TABLE IF NOT EXISTS documents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        filename TEXT UNIQUE,
                        originalName TEXT,
                        uploadDate DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`, (createErr) => {
                        if (createErr) {
                            console.error('Documents table creation error:', createErr.message);
                            reject(createErr);
                        }
                    });

                    db.run(`CREATE TABLE IF NOT EXISTS chats (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        topic TEXT UNIQUE,
                        userId TEXT DEFAULT 'anonymous',
                        messageCount INTEGER DEFAULT 0,
                        totalLikes INTEGER DEFAULT 0,
                        totalDislikes INTEGER DEFAULT 0,
                        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                        lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`, (createErr) => {
                        if (createErr) {
                            console.error('Chats table creation error:', createErr.message);
                            reject(createErr);
                        }
                    });

                    db.run(`CREATE TABLE IF NOT EXISTS messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        chatId INTEGER,
                        sender TEXT,
                        text TEXT,
                        isLiked INTEGER DEFAULT NULL,
                        documentsReferenced TEXT DEFAULT NULL,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (chatId) REFERENCES chats(id)
                    )`, (createErr) => {
                        if (createErr) {
                            console.error('Messages table creation error:', createErr.message);
                            reject(createErr);
                        }
                    });

                    // Create settings table for app configuration
                    db.run(`CREATE TABLE IF NOT EXISTS settings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        setting_key TEXT UNIQUE NOT NULL,
                        setting_value TEXT,
                        updated_by TEXT DEFAULT 'Admin@email.com',
                        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`, (createErr) => {
                        if (createErr) {
                            console.error('Settings table creation error:', createErr.message);
                            reject(createErr);
                        } else {
                            // Insert default greeting message if it doesn't exist
                            db.run(`INSERT OR IGNORE INTO settings (setting_key, setting_value) 
                                   VALUES ('greeting_message', 'Hello! I''m your AI assistant. How can I help you today?')`,
                                (insertErr) => {
                                    if (insertErr) {
                                        console.error('Error inserting default greeting:', insertErr.message);
                                    }
                                });
                        }
                    });

                    // Create template questions table
                    db.run(`CREATE TABLE IF NOT EXISTS template_questions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        question TEXT NOT NULL,
                        answer TEXT NOT NULL,
                        updated_by TEXT DEFAULT 'Admin@email.com',
                        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                        is_active INTEGER DEFAULT 1
                    )`, (createErr) => {
                        if (createErr) {
                            console.error('Template questions table creation error:', createErr.message);
                            reject(createErr);
                        } else {
                            // Insert some default template questions
                            const defaultQuestions = [
                                {
                                    question: 'What documents are available?',
                                    answer: 'I can help you with any documents that have been uploaded to the system. You can ask me about specific files or request information from them.'
                                },
                                {
                                    question: 'How can you help me?',
                                    answer: 'I can assist you with document queries, answer questions based on uploaded files, and provide general information. Feel free to ask me anything!'
                                },
                                {
                                    question: 'What file formats do you support?',
                                    answer: 'I currently support PDF, Word documents (.doc/.docx), and Excel files (.xlsx). You can upload these formats and I will help you extract information from them.'
                                }
                            ];
                            
                            defaultQuestions.forEach(q => {
                                db.run(`INSERT OR IGNORE INTO template_questions (question, answer) VALUES (?, ?)`,
                                    [q.question, q.answer], (insertErr) => {
                                        if (insertErr) {
                                            console.error('Error inserting default template question:', insertErr.message);
                                        }
                                    });
                            });
                        }
                    });

                    resolve(db);
                });
            }
        });
    });
};

setupDb().then((dbInstance) => {
    database = dbInstance;
    console.log('Database initialized successfully');

    // Import and use routes only after DB is ready
    const chatRoutes = require('./routes/chatRoutes');
    const documentRoutes = require('./routes/documentRoutes');
    app.use('/', chatRoutes(database, helpers));
    app.use('/', documentRoutes(database, upload, helpers));

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}).catch((err) => {
    console.error('Failed to initialize database:', err);
});

app.post('/chat', async (req, res) => {
    const { message, chatId: initialChatId, chatTopic } = req.body;
    console.log('Received message:', message);

    // Basic input validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Invalid message input' });
    }

    let db;
    let chatId = initialChatId; // Change from const to let to allow reassignment
    try {
        db = await getDB();

        // If chatId is provided, use existing chat
        if (chatId) {
            // Validate chatId
            const chat = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM chats WHERE id = ?', [chatId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!chat) {
                return res.status(404).json({ error: 'Chat not found' });
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
        } else {
            // New chat - generate topic using AI
            const generatedTopic = generateChatTopic(message);

            // Check if topic generation was successful
            if (!generatedTopic) {
                return res.status(500).json({ error: 'Failed to generate chat topic' });
            }

            // Check if chat with this topic already exists
            const existingChat = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM chats WHERE topic = ?', [generatedTopic], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (existingChat) {
                chatId = existingChat.id;
                // Update last activity for existing chat
                await new Promise((resolve, reject) => {
                    db.run('UPDATE chats SET lastActivity = CURRENT_TIMESTAMP WHERE id = ?', [chatId], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            } else {
                // Create new chat with generated topic
                const result = await new Promise((resolve, reject) => {
                    db.run('INSERT INTO chats (topic, userId, messageCount) VALUES (?, ?, ?)', 
                        [generatedTopic, 'anonymous', 0], function (err) {
                        if (err) reject(err);
                        else resolve(this);
                    });
                });
                chatId = result.lastID;
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

            // Update message count for the chat
            await new Promise((resolve, reject) => {
                db.run('UPDATE chats SET messageCount = messageCount + 1, lastActivity = CURRENT_TIMESTAMP WHERE id = ?', 
                    [chatId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

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
                db.all('SELECT id, sender, text, isLiked, documentsReferenced, timestamp FROM messages WHERE chatId = ? ORDER BY timestamp',
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

        // Save bot response with error handling and document references
        const documentsReferencedJson = documentsToUse.length > 0 ? 
            JSON.stringify(documentsToUse.map(d => ({ id: d.id, name: d.originalName }))) : null;
        
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO messages (chatId, sender, text, documentsReferenced) VALUES (?, ?, ?, ?)',
                [chatId, 'bot', responseText, documentsReferencedJson],
                function (err) {
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

        // Update message count for bot response
        await new Promise((resolve, reject) => {
            db.run('UPDATE chats SET messageCount = messageCount + 1, lastActivity = CURRENT_TIMESTAMP WHERE id = ?', 
                [chatId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Get the updated chat information for response
        const updatedChat = await new Promise((resolve, reject) => {
            db.get('SELECT topic, messageCount, totalLikes, totalDislikes FROM chats WHERE id = ?', 
                [chatId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Enhanced response with metadata
        const response = {
            response: responseText,
            chatId: chatId,
            topic: updatedChat ? updatedChat.topic : chatTopic,
            isNewChat: !initialChatId, // Flag to indicate if this is a new chat session
            chatInfo: updatedChat,
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
            db.all('SELECT id, sender, text, isLiked, documentsReferenced, timestamp FROM messages WHERE chatId = ? ORDER BY timestamp',
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

// Get all chats (topics) with enhanced metadata
app.get('/chats', async (req, res) => {
    try {
        const db = await getDB();
        const chats = await new Promise((resolve, reject) => {
            db.all(`SELECT id, topic, userId, messageCount, totalLikes, totalDislikes, 
                    createdDate, lastActivity FROM chats ORDER BY lastActivity DESC`, [], (err, rows) => {
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

// Like/Dislike a bot response
app.post('/messages/:messageId/reaction', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { isLiked } = req.body; // true for like, false for dislike, null to remove reaction
        
        if (isLiked !== null && typeof isLiked !== 'boolean') {
            return res.status(400).json({ error: 'isLiked must be true, false, or null' });
        }

        const db = await getDB();
        
        // Get the message to find its chat
        const message = await new Promise((resolve, reject) => {
            db.get('SELECT chatId, sender, isLiked as currentReaction FROM messages WHERE id = ?', 
                [messageId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.sender !== 'bot') {
            return res.status(400).json({ error: 'Can only react to bot messages' });
        }

        // Calculate the change in likes/dislikes for the chat totals
        let likeDelta = 0;
        let dislikeDelta = 0;

        // Remove previous reaction from totals
        if (message.currentReaction === 1) likeDelta -= 1;
        if (message.currentReaction === 0) dislikeDelta -= 1;

        // Add new reaction to totals
        if (isLiked === true) likeDelta += 1;
        if (isLiked === false) dislikeDelta += 1;

        // Update the message reaction
        await new Promise((resolve, reject) => {
            db.run('UPDATE messages SET isLiked = ? WHERE id = ?', 
                [isLiked], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Update chat totals
        await new Promise((resolve, reject) => {
            db.run('UPDATE chats SET totalLikes = totalLikes + ?, totalDislikes = totalDislikes + ? WHERE id = ?',
                [likeDelta, dislikeDelta, message.chatId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ 
            success: true, 
            reaction: isLiked,
            message: isLiked === true ? 'Message liked' : 
                     isLiked === false ? 'Message disliked' : 'Reaction removed'
        });
    } catch (error) {
        console.error('Error updating message reaction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get detailed chat sessions for admin view
app.get('/chat-sessions', async (req, res) => {
    try {
        const db = await getDB();
        
        // Get all chat sessions with metadata
        const chatSessions = await new Promise((resolve, reject) => {
            db.all(`SELECT 
                        c.id,
                        c.topic,
                        c.userId,
                        c.messageCount,
                        c.totalLikes,
                        c.totalDislikes,
                        c.createdDate,
                        c.lastActivity,
                        DATE(c.createdDate) as date,
                        TIME(c.createdDate) as time
                    FROM chats c 
                    ORDER BY c.lastActivity DESC`, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json({
            sessions: chatSessions,
            total: chatSessions.length
        });
    } catch (error) {
        console.error('Error fetching chat sessions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get detailed messages for a specific chat session
app.get('/chat-sessions/:chatId/messages', async (req, res) => {
    try {
        const { chatId } = req.params;
        const db = await getDB();
        
        // Verify chat exists
        const chat = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM chats WHERE id = ?', [chatId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!chat) {
            return res.status(404).json({ error: 'Chat session not found' });
        }

        // Get all messages with detailed information
        const messages = await new Promise((resolve, reject) => {
            db.all(`SELECT 
                        m.id,
                        m.sender,
                        m.text,
                        m.isLiked,
                        m.documentsReferenced,
                        m.timestamp,
                        DATE(m.timestamp) as date,
                        TIME(m.timestamp) as time
                    FROM messages m 
                    WHERE m.chatId = ? 
                    ORDER BY m.timestamp ASC`, [chatId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Parse document references
        const enhancedMessages = messages.map(msg => ({
            ...msg,
            documentsReferenced: msg.documentsReferenced ? 
                JSON.parse(msg.documentsReferenced) : null,
            reactionStatus: msg.isLiked === null ? 'none' : 
                           msg.isLiked === 1 ? 'liked' : 'disliked'
        }));

        res.json({
            chatInfo: chat,
            messages: enhancedMessages,
            messageCount: messages.length
        });
    } catch (error) {
        console.error('Error fetching chat session messages:', error);
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

// Settings endpoints
// GET settings
app.get('/settings', async (req, res) => {
    try {
        const db = await getDB();
        
        // Get greeting message setting
        const greetingSetting = await new Promise((resolve, reject) => {
            db.get('SELECT setting_value, updated_by, last_updated FROM settings WHERE setting_key = ?', 
                ['greeting_message'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        const settings = {
            greetingMessage: greetingSetting ? greetingSetting.setting_value : 'Hello! I\'m your AI assistant. How can I help you today?',
            updatedBy: greetingSetting ? greetingSetting.updated_by : 'Admin@email.com',
            lastUpdated: greetingSetting ? greetingSetting.last_updated : new Date().toISOString()
        };

        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST settings (save)
app.post('/settings', async (req, res) => {
    try {
        const { greetingMessage, updatedBy } = req.body;
        
        if (!greetingMessage || greetingMessage.trim().length === 0) {
            return res.status(400).json({ error: 'Greeting message is required' });
        }

        if (greetingMessage.length > 500) {
            return res.status(400).json({ error: 'Greeting message must be 500 characters or less' });
        }

        const db = await getDB();
        const now = new Date().toISOString();
        
        // Update or insert greeting message setting
        await new Promise((resolve, reject) => {
            db.run(`INSERT OR REPLACE INTO settings (setting_key, setting_value, updated_by, last_updated) 
                   VALUES ('greeting_message', ?, ?, ?)`,
                [greetingMessage.trim(), updatedBy || 'Admin@email.com', now],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({
            success: true,
            message: 'Settings updated successfully',
            lastUpdated: now
        });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Template questions endpoints
// GET template questions
app.get('/template-questions', async (req, res) => {
    try {
        const db = await getDB();
        
        const questions = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM template_questions WHERE is_active = 1 ORDER BY last_updated DESC', 
                [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json({
            questions: questions,
            total: questions.length
        });
    } catch (error) {
        console.error('Error fetching template questions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST template questions (create)
app.post('/template-questions', async (req, res) => {
    try {
        const { question, answer, updatedBy } = req.body;
        
        if (!question || !answer || question.trim().length === 0 || answer.trim().length === 0) {
            return res.status(400).json({ error: 'Question and answer are required' });
        }

        const db = await getDB();
        const now = new Date().toISOString();
        
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO template_questions (question, answer, updated_by, last_updated) VALUES (?, ?, ?, ?)',
                [question.trim(), answer.trim(), updatedBy || 'Admin@email.com', now],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        res.json({
            success: true,
            message: 'Template question created successfully'
        });
    } catch (error) {
        console.error('Error creating template question:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT template questions (update)
app.put('/template-questions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { question, answer, updatedBy } = req.body;
        
        if (!question || !answer || question.trim().length === 0 || answer.trim().length === 0) {
            return res.status(400).json({ error: 'Question and answer are required' });
        }

        const db = await getDB();
        const now = new Date().toISOString();
        
        await new Promise((resolve, reject) => {
            db.run('UPDATE template_questions SET question = ?, answer = ?, updated_by = ?, last_updated = ? WHERE id = ?',
                [question.trim(), answer.trim(), updatedBy || 'Admin@email.com', now, id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Template question not found'));
                    else resolve();
                }
            );
        });

        res.json({
            success: true,
            message: 'Template question updated successfully'
        });
    } catch (error) {
        if (error.message === 'Template question not found') {
            res.status(404).json({ error: 'Template question not found' });
        } else {
            console.error('Error updating template question:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// DELETE template questions
app.delete('/template-questions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDB();
        
        // Soft delete - mark as inactive
        await new Promise((resolve, reject) => {
            db.run('UPDATE template_questions SET is_active = 0 WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Template question not found'));
                    else resolve();
                }
            );
        });

        res.json({
            success: true,
            message: 'Template question deleted successfully'
        });
    } catch (error) {
        if (error.message === 'Template question not found') {
            res.status(404).json({ error: 'Template question not found' });
        } else {
            console.error('Error deleting template question:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Add a helper function to generate chat topics
const generateChatTopic = (message) => {
    // Simple logic to generate a topic based on the message
    // Replace this with AI or more complex logic if needed
    return message.split(' ').slice(0, 3).join(' ').trim() || 'General';
};