const express = require('express');
const router = express.Router();

module.exports = (db) => {
    // GET /template-questions
    router.get('/template-questions', async (req, res) => {
        try {
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

    // POST /template-questions (create)
    router.post('/template-questions', async (req, res) => {
        try {
            const { question, answer, updatedBy } = req.body;
            
            if (!question || !answer || question.trim().length === 0 || answer.trim().length === 0) {
                return res.status(400).json({ error: 'Question and answer are required' });
            }

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

    // PUT /template-questions/:id (update)
    router.put('/template-questions/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { question, answer, updatedBy } = req.body;
            
            if (!question || !answer || question.trim().length === 0 || answer.trim().length === 0) {
                return res.status(400).json({ error: 'Question and answer are required' });
            }

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

    // DELETE /template-questions/:id
    router.delete('/template-questions/:id', async (req, res) => {
        try {
            const { id } = req.params;
            
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

    return router;
};
