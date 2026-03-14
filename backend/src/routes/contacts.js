// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'contacts-route' }));

router.get('/', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM organization_contacts WHERE organization_id = $1 ORDER BY created_at DESC',
      [org]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing contacts:', error);
    return res.status(500).json({ success: false, error: 'Failed to list contacts' });
  }
});

router.post('/', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { name, email, role, phone, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO organization_contacts (organization_id, name, email, role, phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [org, name, email, role, phone, notes]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating contact:', error);
    return res.status(500).json({ success: false, error: 'Failed to create contact' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const { name, email, role, phone, notes } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email); }
    if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(role); }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(phone); }
    if (notes !== undefined) { fields.push(`notes = $${idx++}`); values.push(notes); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id, org);

    const result = await pool.query(
      `UPDATE organization_contacts SET ${fields.join(', ')}
       WHERE id = $${idx++} AND organization_id = $${idx}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating contact:', error);
    return res.status(500).json({ success: false, error: 'Failed to update contact' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM organization_contacts WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete contact' });
  }
});

module.exports = router;
