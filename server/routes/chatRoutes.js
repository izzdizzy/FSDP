const express = require('express');
const router = express.Router();

module.exports = (db, helpers) => {
  // POST /chat - Complete implementation moved from Server.js
  router.post('/chat', async (req, res) => {
    const { message, chatId: initialChatId, chatTopic } = req.body;
    console.log('Received message:', message);

    // Basic input validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Invalid message input' });
    }

    let chatId = initialChatId;
    try {
        // --- Section request detection and handling ---
        // Get all available documents for section parsing
        const allDocumentsForSection = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM documents', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        const sectionRequest = helpers.parseSectionRequest(message, allDocumentsForSection);
        if (sectionRequest) {
            // sectionRequest = { document, section }
            const filePath = require('path').join(__dirname, '../uploads', sectionRequest.document.filename);
            const sectionResult = await helpers.extractSectionFromDocument(filePath, sectionRequest.section);
            if (sectionResult.error) {
                // Respond with error message and source info
                return res.json({
                    response: `Sorry, I couldn't find section ${sectionRequest.section} in ${sectionRequest.document.originalName}.`,
                    documentsUsed: [{ id: sectionRequest.document.id, name: sectionRequest.document.originalName }],
                    error: sectionResult.error
                });
            }
            // Respond with quoted section and source
            return res.json({
                response: `Section ${sectionRequest.section} from ${sectionRequest.document.originalName}:\n\n"${sectionResult.text}"`,
                documentsUsed: [{ id: sectionRequest.document.id, name: sectionRequest.document.originalName }],
                quotedSection: sectionResult.text,
                quotedSectionRef: sectionRequest.section
            });
        }
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
            // New chat - generate topic using improved AI summarization
            const generateChatTopic = (message) => {
                // Clean and truncate the message for topic generation
                const cleanMessage = message.trim();
                
                // If message is short enough, use it as the topic
                if (cleanMessage.length <= 50) {
                    return cleanMessage;
                }
                
                // For longer messages, try to extract key terms or use first few words
                const words = cleanMessage.split(' ');
                if (words.length <= 8) {
                    return cleanMessage;
                }
                
                // Take first 8 words and add ellipsis
                return words.slice(0, 8).join(' ') + '...';
            };
            
            const generatedTopic = generateChatTopic(message);

            // Check if topic generation was successful
            if (!generatedTopic) {
                return res.status(500).json({ error: 'Failed to generate chat topic' });
            }

            // Always create new chat session for each interaction (no topic-based merging)
            // This ensures separate sessions even with identical topics
            // Mark bot-UI sessions differently so they don't appear in user chat list
            const userId = req.body.fromBotUI ? 'bot-ui-session' : 'anonymous';
            
            const result = await new Promise((resolve, reject) => {
                db.run('INSERT INTO chats (topic, userId, messageCount) VALUES (?, ?, ?)', 
                    [generatedTopic, userId, 0], function (err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });
            chatId = result.lastID;

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
                const requestedFiles = helpers.analyzeUserMessageForFiles(message, allDocuments);

                // If specific files are requested, use only those
                if (requestedFiles.length > 0) {
                    documentsToUse = requestedFiles;
                    console.log(`User requested specific files: ${requestedFiles.map(f => f.originalName).join(', ')}`);
                }
                // If the query is file-related but no specific files mentioned, use all
                else if (helpers.isFileRelatedQuery(message)) {
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
                            const filePath = require('path').join(__dirname, '../uploads', doc.filename);

                            // Check if file exists before trying to read
                            if (!require('fs').existsSync(filePath)) {
                                console.error(`File not found: ${filePath}`);
                                return {
                                    name: doc.originalName,
                                    content: '[File not found on server]',
                                    error: true
                                };
                            }

                            const content = await helpers.readFileContent(filePath, doc.originalName);

                            // Extract relevant text based on user query
                            const relevantContent = helpers.extractRelevantText(content, message);

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

        const responseText = await helpers.callBedrock(prompt, 0, responseMaxTokens);

        // Validate response before saving
        if (!responseText || responseText.trim().length === 0) {
            throw new Error('Empty response received from AI model');
        }

        // Save bot response with error handling and document references
        const documentsReferencedJson = documentsToUse.length > 0 ? 
            JSON.stringify(documentsToUse.map(d => ({ id: d.id, name: d.originalName }))) : null;
        
        let botMessageId = null;
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO messages (chatId, sender, text, documentsReferenced) VALUES (?, ?, ?, ?)',
                [chatId, 'bot', responseText, documentsReferencedJson],
                function (err) {
                    if (err) {
                        console.error('Error saving bot response:', err);
                        reject(err);
                    } else {
                        botMessageId = this.lastID; // Store the message ID for reactions
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
            messageId: botMessageId, // Include message ID for reactions
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

  // GET /chat/:topic - Get chat history by topic
  router.get('/chat/:topic', async (req, res) => {
    try {
        const { topic } = req.params;

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

  // GET /chats - Get all chats (topics) with enhanced metadata - excludes bot-UI sessions
  router.get('/chats', async (req, res) => {
    try {
        const chats = await new Promise((resolve, reject) => {
            // Exclude bot-UI sessions from user chat list
            db.all(`SELECT id, topic, userId, messageCount, totalLikes, totalDislikes, 
                    createdDate, lastActivity FROM chats 
                    WHERE userId != 'bot-ui-session'
                    ORDER BY lastActivity DESC`, [], (err, rows) => {
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

  // POST /messages/:messageId/reaction - Like/Dislike a bot response
  router.post('/messages/:messageId/reaction', async (req, res) => {
    try {
        const { messageId } = req.params;
        let { isLiked } = req.body; // 1 for like, 0 for dislike, null to remove reaction

        // Accept 1, 0, or null only
        if (isLiked === true) isLiked = 1;
        else if (isLiked === false) isLiked = 0;
        // Accept string values from frontend if any
        if (isLiked === '1') isLiked = 1;
        if (isLiked === '0') isLiked = 0;
        if (isLiked === 'null') isLiked = null;

        if (isLiked !== 1 && isLiked !== 0 && isLiked !== null) {
            return res.status(400).json({ error: 'isLiked must be 1, 0, or null' });
        }

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
        if (isLiked === 1) likeDelta += 1;
        if (isLiked === 0) dislikeDelta += 1;

        // Update the message reaction (handle null explicitly for SQLite)
        await new Promise((resolve, reject) => {
            if (isLiked === null) {
                db.run('UPDATE messages SET isLiked = NULL WHERE id = ?', [messageId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                db.run('UPDATE messages SET isLiked = ? WHERE id = ?', [isLiked, messageId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            }
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
            message: isLiked === 1 ? 'Message liked' : 
                     isLiked === 0 ? 'Message disliked' : 'Reaction removed'
        });
    } catch (error) {
        console.error('Error updating message reaction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /chat-sessions - Get detailed chat sessions for admin view
  router.get('/chat-sessions', async (req, res) => {
    try {
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

  // GET /chat-sessions/:chatId/messages - Get detailed messages for a specific chat session
  router.get('/chat-sessions/:chatId/messages', async (req, res) => {
    try {
        const { chatId } = req.params;
        
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

  return router;
};
