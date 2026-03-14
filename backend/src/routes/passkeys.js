// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const { log } = require('../utils/logger');

// Public endpoints (no auth required)
router.post('/auth/options', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { challenge: 'stub', message: 'WebAuthn authentication not yet configured' }
    });
  } catch (error) {
    log('error', 'passkey.auth_options', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to generate authentication options' });
  }
});

router.post('/auth/verify', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { authenticated: false, message: 'WebAuthn authentication not yet configured' }
    });
  } catch (error) {
    log('error', 'passkey.auth_verify', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to verify authentication' });
  }
});

// Authenticated endpoints
router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 60, label: 'passkey-route' }));

router.get('/register/options', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        challenge: 'stub',
        rp: { name: 'ControlWeave' },
        user: { id: req.user.id, name: req.user.email }
      }
    });
  } catch (error) {
    log('error', 'passkey.register_options', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to generate registration options' });
  }
});

router.post('/register/verify', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { registered: false, message: 'WebAuthn registration not yet configured' }
    });
  } catch (error) {
    log('error', 'passkey.register_verify', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to verify registration' });
  }
});

router.get('/list', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, credential_id, name, sign_count, created_at, last_used_at
       FROM passkeys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'passkey.list', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list passkeys' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM passkeys WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Passkey not found' });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    log('error', 'passkey.delete', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete passkey' });
  }
});

router.patch('/:id/rename', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    const result = await pool.query(
      'UPDATE passkeys SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name',
      [name, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Passkey not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'passkey.rename', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to rename passkey' });
  }
});

module.exports = router;
