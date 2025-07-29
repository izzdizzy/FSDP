const express = require('express');
const router = express.Router();

module.exports = (db, helpers) => {
  // POST /chat
  router.post('/chat', async (req, res) => {
    try {
      const { message, topic } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Get or create chat
      let chatId;
      let chatTopic;
      if (topic) {
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
        const generatedTopic = message.substring(0, 50) + (message.length > 50 ? '...' : '');
        chatTopic = generatedTopic;
        const existingChat = await new Promise((resolve, reject) => {
          db.get('SELECT id FROM chats WHERE topic = ?', [generatedTopic], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        if (existingChat) {
          chatId = existingChat.id;
        } else {
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
      let documentsToUse = [];
      try {
        const allDocuments = await new Promise((resolve, reject) => {
          db.all('SELECT * FROM documents', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        if (allDocuments.length > 0) {
          const requestedFiles = helpers.analyzeUserMessageForFiles(message, allDocuments);
          if (requestedFiles.length > 0) {
            documentsToUse = requestedFiles;
          } else if (helpers.isFileRelatedQuery(message)) {
            documentsToUse = allDocuments;
          } else {
            documentsToUse = [];
          }
          if (documentsToUse.length > 0) {
            context = 'Available documents:\n';
            const documentPromises = documentsToUse.map(async (doc) => {
              try {
                const filePath = require('path').join(__dirname, '../uploads', doc.filename);
                if (!require('fs').existsSync(filePath)) {
                  return {
                    name: doc.originalName,
                    content: '[File not found on server]',
                    error: true
                  };
                }
                const content = await helpers.readFileContent(filePath, doc.originalName);
                const relevantContent = helpers.extractRelevantText(content, message);
                return {
                  name: doc.originalName,
                  content: relevantContent,
                  error: false
                };
              } catch (err) {
                return {
                  name: doc.originalName,
                  content: `[Error reading file: ${err.message}]`,
                  error: true
                };
              }
            });
            const documentResults = await Promise.all(documentPromises);
            documentResults.forEach(result => {
              context += `\nDocument: ${result.name}\n`;
              context += `Content: ${result.content}\n`;
              context += '---\n';
            });
            context += `\nDocuments used in this response: ${documentResults.map(r => r.name).join(', ')}\n`;
          }
        }
      } catch (err) {
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
        if (messages.length > 1) {
          chatHistory = 'Previous conversation:\n';
          const recentMessages = messages.slice(-6, -1);
          for (const msg of recentMessages) {
            chatHistory += `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}\n`;
          }
        }
      } catch (err) {}

      // Generate response using Bedrock
      let responseMaxTokens = 800;
      if (documentsToUse.length > 0 || message.length > 200) {
        responseMaxTokens = 1200;
      }
      const prompt = `You are a helpful AI assistant. Follow these guidelines:\n\nRESPONSE LENGTH: Keep responses concise and to the point. Aim for 2-4 paragraphs maximum unless the user specifically asks for detailed information.\n\nDOCUMENT USAGE: ${documentsToUse.length > 0 ? `The user has access to specific documents. Use ONLY the provided document content to answer questions about those documents. Documents available: ${documentsToUse.map(d => d.originalName).join(', ')}` : 'Only use documents if the user specifically mentions them or asks about uploaded files.'}\n\nINSTRUCTIONS:\n1. Answer directly and concisely\n2. If using document information, cite the document name\n3. If information isn't in the provided context, clearly state this\n4. Don't repeat information unnecessarily\n5. Focus on the specific question asked\n\nDocument Context:\n${context}\n\nConversation History:\n${chatHistory}\n\nCurrent User Question: ${message}\n\nProvide a helpful, concise response:`;

      // Call Bedrock
      const responseText = await helpers.callBedrock(prompt, 0, responseMaxTokens);
      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response received from AI model');
      }

      // Save bot response
      await new Promise((resolve, reject) => {
        db.run('INSERT INTO messages (chatId, sender, text) VALUES (?, ?, ?)',
          [chatId, 'bot', responseText],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Enhanced response
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
      res.json(response);
    } catch (error) {
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
      res.status(statusCode).json({ 
        error: errorMessage,
        timestamp: new Date().toISOString(),
        chatId: null
      });
    }
  });

  // GET /chat/:topic
  router.get('/chat/:topic', async (req, res) => {
    try {
      const { topic } = req.params;
      const chat = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM chats WHERE topic = ?', [topic], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
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
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /chats
  router.get('/chats', async (req, res) => {
    try {
      const chats = await new Promise((resolve, reject) => {
        db.all('SELECT topic FROM chats ORDER BY createdDate DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      res.json(chats);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
