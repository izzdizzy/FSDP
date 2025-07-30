const sqlite3 = require('sqlite3').verbose();

const setupDb = () => {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database('./database.sqlite', (err) => {
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
                        topic TEXT,
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
                            // Insert default template questions only if the count is below the maximum limit
                            const maxTemplateQuestions = 4; // Adjust this value based on the chatbot page limit
                            db.get('SELECT COUNT(*) as count FROM template_questions', (countErr, row) => {
                                if (countErr) {
                                    console.error('Error checking template questions count:', countErr.message);
                                } else if (row.count < maxTemplateQuestions) {
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
                                        },
                                        {
                                            question: 'What should I know first as a new-hire?',
                                            answer: 'As a new hire, you should familiarize yourself with the company policies, your team structure, and the tools you\'ll be using. Don\'t hesitate to ask questions and seek help from your colleagues. Use Me as a assistant, not your main source of information.'
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
                                } else {
                                    console.log('Template questions already at maximum limit. No new questions added.');
                                }
                            });
                        }
                    });

                    resolve(db);
                });
            }
        });
    });
};

module.exports = setupDb;
