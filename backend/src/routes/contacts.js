// @tier: pro
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validateBody, requireFields, isUuid } = require('../middleware/validate');
const { normalizeTier, getContactLimit } = require('../config/tierPolicy');

router.use(authenticate);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return EMAIL_REGEX.test(String(email || '').trim());
}

// GET /contacts
router.get('/', requirePermission('controls.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, full_name, email, title, team, notes, is_active, created_at
      FROM organization_contacts
      WHERE organization_id = $1
      ORDER BY full_name
    `, [req.user.organization_id]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ success: false, error: 'Failed to load contacts' });
  }
});

// POST /contacts
router.post('/', requirePermission('users.manage'), validateBody((body) => {
  const errors = requireFields(body, ['full_name']);
  if (body.email && !isValidEmail(body.email)) {
    errors.push('email must be a valid email address');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const fullName = String(req.body.full_name).trim();
    const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
    const title = req.body.title ? String(req.body.title).trim() : null;
    const team = req.body.team ? String(req.body.team).trim() : null;
    const notes = req.body.notes ? String(req.body.notes).trim() : null;

    const result = await pool.query(`
      INSERT INTO organization_contacts (organization_id, full_name, email, title, team, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, full_name, email, title, team, notes, is_active, created_at
    `, [orgId, fullName, email, title, team, notes, req.user.id]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ success: false, error: 'Failed to create contact' });
  }
});

// PATCH /contacts/:contactId
router.patch('/:contactId', requirePermission('users.manage'), validateBody((body, req) => {
  const errors = [];
  if (!isUuid(req.params.contactId)) {
    errors.push('contactId must be a valid UUID');
  }
  const noUpdatableFields = (
    body.full_name === undefined &&
    body.email === undefined &&
    body.title === undefined &&
    body.team === undefined &&
    body.notes === undefined &&
    body.is_active === undefined
  );
  if (noUpdatableFields) {
    errors.push('Provide at least one of: full_name, email, title, team, notes, is_active');
  }
  if (body.email !== undefined && body.email !== null && body.email !== '' && !isValidEmail(body.email)) {
    errors.push('email must be a valid email address');
  }
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    errors.push('is_active must be a boolean');
  }
  return errors;
}), async (req, res) => {
  try {
    const contactId = req.params.contactId;
    const orgId = req.user.organization_id;
    const updates = [];
    const params = [];
    let idx = 1;

    if (req.body.full_name !== undefined) {
      updates.push(`full_name = $${idx++}`);
      params.push(String(req.body.full_name).trim());
    }
    if (req.body.email !== undefined) {
      updates.push(`email = $${idx++}`);
      params.push(req.body.email ? String(req.body.email).trim().toLowerCase() : null);
    }
    if (req.body.title !== undefined) {
      updates.push(`title = $${idx++}`);
      params.push(req.body.title ? String(req.body.title).trim() : null);
    }
    if (req.body.team !== undefined) {
      updates.push(`team = $${idx++}`);
      params.push(req.body.team ? String(req.body.team).trim() : null);
    }
    if (req.body.notes !== undefined) {
      updates.push(`notes = $${idx++}`);
      params.push(req.body.notes ? String(req.body.notes).trim() : null);
    }
    if (req.body.is_active !== undefined) {
      updates.push(`is_active = $${idx++}`);
      params.push(Boolean(req.body.is_active));
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    params.push(contactId);
    const contactIdIdx = idx++;
    params.push(orgId);
    const orgIdIdx = idx++;

    const result = await pool.query(`
      UPDATE organization_contacts
      SET ${updates.join(', ')}
      WHERE id = $${contactIdIdx} AND organization_id = $${orgIdIdx}
      RETURNING id, full_name, email, title, team, notes, is_active, created_at, updated_at
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found in your organization' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ success: false, error: 'Failed to update contact' });
  }
});

// DELETE /contacts/:contactId
router.delete('/:contactId', requirePermission('users.manage'), async (req, res) => {
  try {
    if (!isUuid(req.params.contactId)) {
      return res.status(400).json({ success: false, error: 'contactId must be a valid UUID' });
    }

    const orgId = req.user.organization_id;

    // Soft-delete: mark inactive so historical assignments remain visible
    const result = await pool.query(`
      UPDATE organization_contacts SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING id, full_name
    `, [req.params.contactId, orgId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    res.json({ success: true, message: 'Contact removed' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete contact' });
  }
});

module.exports = router;
