const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import modules
const setupDb = require('./database/setupDb');
const upload = require('./middleware/upload');
const helpers = require('./utils/helpers');

// Import routes
const chatRoutes = require('./routes/chatRoutes');
const documentRoutes = require('./routes/documentRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const templateQuestionRoutes = require('./routes/templateQuestionRoutes');

const app = express();
const PORT = process.env.APP_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
const dir = './uploads';
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    console.log(`Created uploads directory: ${dir}`);
}

// Initialize database and start server
setupDb().then((db) => {
    console.log('Database initialized successfully');

    // Mount routes with database instance
    app.use('/', chatRoutes(db, helpers));
    app.use('/', documentRoutes(db, upload, helpers));
    app.use('/', settingsRoutes(db));
    app.use('/', templateQuestionRoutes(db));

    // Start server
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}).catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

