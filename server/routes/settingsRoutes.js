const express = require('express');
const router = express.Router();

module.exports = (db) => {
    // GET /settings
    router.get('/settings', async (req, res) => {
        try {
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

    // POST /settings (save)
    router.post('/settings', async (req, res) => {
        try {
            const { greetingMessage, updatedBy } = req.body;
            
            if (!greetingMessage || greetingMessage.trim().length === 0) {
                return res.status(400).json({ error: 'Greeting message is required' });
            }

            if (greetingMessage.length > 500) {
                return res.status(400).json({ error: 'Greeting message must be 500 characters or less' });
            }

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

    return router;
};
