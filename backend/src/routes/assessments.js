// @tier: community
/**
 * Assessment Routes — thin aggregator
 *
 * The former ~3,500-line monolith is split into cohesive sub-routers under
 * ./assessments/ (shared helpers live in ./assessments/_shared.js). This file
 * only applies router-level middleware and mounts the sub-routers in the SAME
 * order the routes were originally registered, so Express path matching is
 * unchanged.
 *
 * Mount order matters:
 * - `authenticate` runs first for every route (as before).
 * - The multer error handler must sit between the routers above it (which
 *   include the template upload route) and the link routes below it, exactly
 *   matching the original registration order.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Sub-routers, in original registration order.
router.use(require('./assessments/procedures')); // procedures, results, stats, frameworks, plans
router.use(require('./assessments/templates')); // audit artifact templates
router.use(require('./assessments/engagements')); // engagement lifecycle + engagement procedures
router.use(require('./assessments/pbc')); // PBC auto-create, AI draft, CRUD
router.use(require('./assessments/workpapers')); // workpaper AI draft, CRUD
router.use(require('./assessments/findings')); // finding AI draft, CRUD
router.use(require('./assessments/signoffs')); // sign-offs, readiness, validation package

router.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ success: false, error: 'Template upload failed' });
  }
  return next(err);
});

router.use(require('./assessments/links')); // result evidence links, finding-control links

module.exports = router;
