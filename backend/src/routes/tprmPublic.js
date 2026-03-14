// @tier: community
const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../config/database');
const { createRateLimiter } = require('../middleware/rateLimit');

// Public route - no auth, just rate limiting
router.use(createRateLimiter({ windowMs: 60 * 1000, max: 60, label: 'tprm-public-route' }));

// Configure multer for evidence uploads (memory storage for DB persistence)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Helper: validate token and return questionnaire
async function getQuestionnaireByToken(token) {
  const result = await pool.query(
    `SELECT * FROM tprm_questionnaires WHERE access_token = $1 AND status IN ('sent', 'in_progress')`,
    [token]
  );
  return result.rows[0] || null;
}

router.get('/respond/:token', async (req, res) => {
  try {
    const questionnaire = await getQuestionnaireByToken(req.params.token);
    if (!questionnaire) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found or no longer accepting responses' });
    }
    res.json({
      success: true,
      data: {
        id: questionnaire.id,
        title: questionnaire.title,
        description: questionnaire.description,
        questions: questionnaire.questions,
        responses: questionnaire.responses,
        due_date: questionnaire.due_date,
        status: questionnaire.status
      }
    });
  } catch (error) {
    console.error('Get questionnaire by token error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch questionnaire' });
  }
});

router.patch('/respond/:token', async (req, res) => {
  try {
    const questionnaire = await getQuestionnaireByToken(req.params.token);
    if (!questionnaire) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found or no longer accepting responses' });
    }

    const { responses, completed } = req.body;
    const newStatus = completed ? 'completed' : 'in_progress';

    const result = await pool.query(
      `UPDATE tprm_questionnaires
       SET responses = $1, status = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, title, status, responses`,
      [responses ? JSON.stringify(responses) : null, newStatus, questionnaire.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Submit responses error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit responses' });
  }
});

router.post('/respond/:token/evidence', upload.single('file'), async (req, res) => {
  try {
    const questionnaire = await getQuestionnaireByToken(req.params.token);
    if (!questionnaire) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found or no longer accepting responses' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await pool.query(
      `INSERT INTO tprm_evidence (questionnaire_id, organization_id, original_filename, file_size_bytes, mime_type, file_content)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        questionnaire.id,
        questionnaire.organization_id,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        req.file.buffer.toString('base64')
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Upload evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload evidence' });
  }
});

router.get('/respond/:token/evidence', async (req, res) => {
  try {
    const questionnaire = await getQuestionnaireByToken(req.params.token);
    if (!questionnaire) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found or no longer accepting responses' });
    }

    const result = await pool.query(
      'SELECT * FROM tprm_evidence WHERE questionnaire_id = $1 ORDER BY created_at DESC',
      [questionnaire.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to list evidence' });
  }
});

module.exports = router;
