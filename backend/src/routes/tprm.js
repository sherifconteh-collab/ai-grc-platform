// @tier: community
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'tprm-route' }));

// --- Summary ---
router.get('/summary', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const totalResult = await pool.query(
      'SELECT COUNT(*) AS total FROM tprm_vendors WHERE organization_id = $1',
      [orgId]
    );
    const tierResult = await pool.query(
      'SELECT risk_tier, COUNT(*) AS count FROM tprm_vendors WHERE organization_id = $1 GROUP BY risk_tier',
      [orgId]
    );
    const pendingResult = await pool.query(
      `SELECT COUNT(*) AS count FROM tprm_vendors WHERE organization_id = $1 AND review_status = 'pending'`,
      [orgId]
    );
    res.json({
      success: true,
      data: {
        total_vendors: parseInt(totalResult.rows[0].total, 10),
        by_risk_tier: tierResult.rows,
        pending_reviews: parseInt(pendingResult.rows[0].count, 10)
      }
    });
  } catch (error) {
    console.error('TPRM summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch TPRM summary' });
  }
});

// --- Vendors ---
router.get('/vendors', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { risk_tier, review_status, search } = req.query;
    const conditions = ['organization_id = $1'];
    const params = [orgId];
    let idx = 2;

    if (risk_tier) {
      conditions.push(`risk_tier = $${idx++}`);
      params.push(risk_tier);
    }
    if (review_status) {
      conditions.push(`review_status = $${idx++}`);
      params.push(review_status);
    }
    if (search) {
      conditions.push(`vendor_name ILIKE $${idx++}`);
      params.push(`%${search}%`);
    }

    const result = await pool.query(
      `SELECT * FROM tprm_vendors WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List vendors error:', error);
    res.status(500).json({ success: false, error: 'Failed to list vendors' });
  }
});

router.get('/vendors/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tprm_vendors WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch vendor' });
  }
});

router.post('/vendors', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_name, vendor_type, risk_tier, review_status, contact_email, contact_name, metadata } = req.body;
    if (!vendor_name) {
      return res.status(400).json({ success: false, error: 'vendor_name is required' });
    }
    const result = await pool.query(
      `INSERT INTO tprm_vendors (organization_id, vendor_name, vendor_type, risk_tier, review_status, contact_email, contact_name, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [orgId, vendor_name, vendor_type || null, risk_tier || null, review_status || 'pending', contact_email || null, contact_name || null, metadata ? JSON.stringify(metadata) : null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ success: false, error: 'Failed to create vendor' });
  }
});

router.patch('/vendors/:id', async (req, res) => {
  try {
    const allowedFields = ['vendor_name', 'vendor_type', 'risk_tier', 'review_status', 'contact_email', 'contact_name', 'metadata'];
    const updates = [];
    const params = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const value = field === 'metadata' ? JSON.stringify(req.body[field]) : req.body[field];
        updates.push(`${field} = $${idx++}`);
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id, req.user.organization_id);

    const result = await pool.query(
      `UPDATE tprm_vendors SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({ success: false, error: 'Failed to update vendor' });
  }
});

router.delete('/vendors/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM tprm_vendors WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete vendor' });
  }
});

router.post('/vendors/:id/store-ai-assessment', async (req, res) => {
  try {
    const { ai_risk_score, ai_risk_summary } = req.body;
    const result = await pool.query(
      `UPDATE tprm_vendors SET ai_risk_score = $1, ai_risk_summary = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4 RETURNING *`,
      [ai_risk_score, ai_risk_summary, req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Store AI assessment error:', error);
    res.status(500).json({ success: false, error: 'Failed to store AI assessment' });
  }
});

// --- CMDB Assets ---
router.get('/cmdb-assets', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { search } = req.query;
    const conditions = ['organization_id = $1'];
    const params = [orgId];

    if (search) {
      conditions.push('(name ILIKE $2 OR asset_type ILIKE $2)');
      params.push(`%${search}%`);
    }

    const result = await pool.query(
      `SELECT * FROM cmdb_assets WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List CMDB assets error:', error);
    res.status(500).json({ success: false, error: 'Failed to list CMDB assets' });
  }
});

router.get('/cmdb-assets/:assetId/vendors', async (req, res) => {
  try {
    // Stub: vendor-to-asset linking not yet implemented
    res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Get asset vendors error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch asset vendors' });
  }
});

// --- Questionnaires ---
router.get('/questionnaires', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_id, status } = req.query;
    const conditions = ['organization_id = $1'];
    const params = [orgId];
    let idx = 2;

    if (vendor_id) {
      conditions.push(`vendor_id = $${idx++}`);
      params.push(vendor_id);
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }

    const result = await pool.query(
      `SELECT * FROM tprm_questionnaires WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List questionnaires error:', error);
    res.status(500).json({ success: false, error: 'Failed to list questionnaires' });
  }
});

router.get('/questionnaires/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tprm_questionnaires WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch questionnaire' });
  }
});

router.post('/questionnaires', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_id, title, description, questions, due_date } = req.body;
    if (!vendor_id || !title) {
      return res.status(400).json({ success: false, error: 'vendor_id and title are required' });
    }
    const vendorCheck = await pool.query(
      'SELECT id FROM tprm_vendors WHERE id = $1 AND organization_id = $2',
      [vendor_id, orgId]
    );
    if (vendorCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    const responseToken = crypto.randomBytes(32).toString('hex');
    const result = await pool.query(
      `INSERT INTO tprm_questionnaires (organization_id, vendor_id, title, description, questions, due_date, response_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [orgId, vendor_id, title, description || null, questions ? JSON.stringify(questions) : null, due_date || null, responseToken]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to create questionnaire' });
  }
});

router.patch('/questionnaires/:id', async (req, res) => {
  try {
    const allowedFields = ['title', 'description', 'questions', 'due_date', 'status'];
    const updates = [];
    const params = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const value = field === 'questions' ? JSON.stringify(req.body[field]) : req.body[field];
        updates.push(`${field} = $${idx++}`);
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id, req.user.organization_id);

    const result = await pool.query(
      `UPDATE tprm_questionnaires SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to update questionnaire' });
  }
});

router.delete('/questionnaires/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM tprm_questionnaires WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Delete questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete questionnaire' });
  }
});

router.post('/questionnaires/:id/send', async (req, res) => {
  try {
    const { recipient_email, due_date } = req.body;
    if (!recipient_email) {
      return res.status(400).json({ success: false, error: 'recipient_email is required' });
    }
    const result = await pool.query(
      `UPDATE tprm_questionnaires
       SET status = 'sent', sent_at = NOW(), recipient_email = $1, due_date = COALESCE($2, due_date), updated_at = NOW()
       WHERE id = $3 AND organization_id = $4
       RETURNING *`,
      [recipient_email, due_date || null, req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Send questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to send questionnaire' });
  }
});

router.post('/questionnaires/:id/remind', async (req, res) => {
  try {
    res.json({ success: true, data: { reminded: true } });
  } catch (error) {
    console.error('Remind questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to send reminder' });
  }
});

// --- Evidence ---
router.get('/questionnaires/:questionnaireId/evidence', async (req, res) => {
  try {
    // Verify questionnaire belongs to org
    const qCheck = await pool.query(
      'SELECT id FROM tprm_questionnaires WHERE id = $1 AND organization_id = $2',
      [req.params.questionnaireId, req.user.organization_id]
    );
    if (qCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }
    const result = await pool.query(
      'SELECT * FROM tprm_evidence WHERE questionnaire_id = $1 ORDER BY created_at DESC',
      [req.params.questionnaireId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to list evidence' });
  }
});

router.delete('/evidence/:evidenceId', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM tprm_evidence
       WHERE id = $1 AND questionnaire_id IN (
         SELECT id FROM tprm_questionnaires WHERE organization_id = $2
       )
       RETURNING id`,
      [req.params.evidenceId, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Delete evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete evidence' });
  }
});

router.post('/evidence/:evidenceId/store-ai-analysis', async (req, res) => {
  try {
    const { ai_analysis, ai_risk_flags } = req.body;
    const result = await pool.query(
      `UPDATE tprm_evidence
       SET ai_analysis = $1, ai_risk_flags = $2, updated_at = NOW()
       WHERE id = $3 AND questionnaire_id IN (
         SELECT id FROM tprm_questionnaires WHERE organization_id = $4
       )
       RETURNING *`,
      [ai_analysis ? JSON.stringify(ai_analysis) : null, ai_risk_flags ? JSON.stringify(ai_risk_flags) : null, req.params.evidenceId, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Store AI analysis error:', error);
    res.status(500).json({ success: false, error: 'Failed to store AI analysis' });
  }
});

// --- Documents ---
router.get('/documents', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_id, status, document_type } = req.query;
    const conditions = ['organization_id = $1'];
    const params = [orgId];
    let idx = 2;

    if (vendor_id) {
      conditions.push(`vendor_id = $${idx++}`);
      params.push(vendor_id);
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (document_type) {
      conditions.push(`document_type = $${idx++}`);
      params.push(document_type);
    }

    const result = await pool.query(
      `SELECT * FROM tprm_documents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ success: false, error: 'Failed to list documents' });
  }
});

router.post('/documents', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_id, title, document_type, status, file_path, metadata } = req.body;
    if (!vendor_id || !title) {
      return res.status(400).json({ success: false, error: 'vendor_id and title are required' });
    }
    const vendorCheck = await pool.query(
      'SELECT id FROM tprm_vendors WHERE id = $1 AND organization_id = $2',
      [vendor_id, orgId]
    );
    if (vendorCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    const result = await pool.query(
      `INSERT INTO tprm_documents (organization_id, vendor_id, title, document_type, status, file_path, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [orgId, vendor_id, title, document_type || null, status || 'pending', file_path || null, metadata ? JSON.stringify(metadata) : null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ success: false, error: 'Failed to create document' });
  }
});

router.patch('/documents/:id', async (req, res) => {
  try {
    const allowedFields = ['title', 'document_type', 'status', 'file_path', 'metadata'];
    const updates = [];
    const params = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const value = field === 'metadata' ? JSON.stringify(req.body[field]) : req.body[field];
        updates.push(`${field} = $${idx++}`);
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id, req.user.organization_id);

    const result = await pool.query(
      `UPDATE tprm_documents SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ success: false, error: 'Failed to update document' });
  }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM tprm_documents WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
});

module.exports = router;
