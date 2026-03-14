// @tier: community

// Helper stub handlers — exported for use by route modules.
// Authentication is applied per-router in each consuming file (premiumStubs.js, enterpriseStubs.js).

const stubList = (req, res) => res.json({ success: true, data: [] });
const stubCreate = (req, res) => res.status(201).json({ success: true, data: { id: null, message: 'This feature is not yet available in this edition' } });
const stubGet = (req, res) => res.json({ success: true, data: {} });
const stubAction = (req, res) => res.json({ success: true, data: { message: 'This feature is not yet available in this edition' } });

module.exports = { stubList, stubCreate, stubGet, stubAction };
