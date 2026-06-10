// @tier: community
/**
 * Organization Routes — thin aggregator
 *
 * The former ~2,800-line monolith is split into cohesive sub-routers under
 * ./organizations/ (shared helpers live in ./organizations/_helpers.js and
 * ./organizations/_importHelpers.js). This file only applies router-level
 * middleware and mounts the sub-routers in the SAME order the routes were
 * originally registered, so Express path matching is unchanged.
 *
 * Mount order matters:
 * - `authenticate` runs first for every route (as before).
 * - The static `/me/...` routers stay ahead of the param `/:orgId/...`
 *   routers, exactly matching the original registration order.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Sub-routers, in original registration order.
router.use(require('./organizations/profile')); // GET/PUT /me/profile
router.use(require('./organizations/systems')); // /me/systems CRUD
router.use(require('./organizations/cotsProducts')); // /me/cots-products CRUD
router.use(require('./organizations/contracts')); // /me/contracts CRUD
router.use(require('./organizations/frameworks')); // /:orgId/frameworks selection
router.use(require('./organizations/controls')); // /:orgId/controls list, export, import
router.use(require('./organizations/multiOrg')); // /me/new, /me/clone
router.use(require('./organizations/children')); // MSP parent-child hierarchy + delegation

module.exports = router;
