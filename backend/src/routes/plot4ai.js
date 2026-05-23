// @tier: community
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

// Load PLOT4ai library data (static JSON — CC BY-SA 4.0 licensed)
const plot4aiLibrary = require('../data/plot4ai-library.json');

// Pre-compute flattened cards with category metadata for efficient filtering
const allCards = [];
for (const category of plot4aiLibrary) {
  for (const card of category.cards) {
    allCards.push({
      ...card,
      categoryId: category.id,
      categoryName: category.category,
      categoryColour: category.colour
    });
  }
}

// Extract unique filter values
const filterOptions = {
  categories: plot4aiLibrary.map(c => ({ id: c.id, name: c.category, colour: c.colour, cardCount: c.cards.length })),
  aiTypes: [...new Set(allCards.flatMap(c => c.aitypes))].sort(),
  roles: [...new Set(allCards.flatMap(c => c.roles))].sort(),
  phases: [...new Set(allCards.flatMap(c => c.phases))].sort()
};

// Pre-compute stats once at startup (data is static)
const precomputedStats = (() => {
  const counts = { aiTypes: {}, roles: {}, phases: {} };
  allCards.forEach(card => {
    card.aitypes.forEach(type => {
      counts.aiTypes[type] = (counts.aiTypes[type] || 0) + 1;
    });
    card.roles.forEach(role => {
      counts.roles[role] = (counts.roles[role] || 0) + 1;
    });
    card.phases.forEach(phase => {
      counts.phases[phase] = (counts.phases[phase] || 0) + 1;
    });
  });
  return {
    totalThreats: allCards.length,
    totalCategories: plot4aiLibrary.length,
    byCategory: filterOptions.categories,
    byAiType: filterOptions.aiTypes.map(t => ({ type: t, count: counts.aiTypes[t] || 0 })),
    byRole: filterOptions.roles.map(r => ({ role: r, count: counts.roles[r] || 0 })),
    byPhase: filterOptions.phases.map(p => ({ phase: p, count: counts.phases[p] || 0 })),
    source: 'PLOT4ai — Practical Library Of Threats 4 Artificial Intelligence',
    license: 'CC BY-SA 4.0',
    website: 'https://plot4.ai/'
  };
})();

// Rate limiter
const plot4aiRateLimiter = createRateLimiter({
  label: 'plot4ai',
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
});

router.use(authenticate);
router.use(plot4aiRateLimiter);

// GET /api/v1/plot4ai/threats - List threat cards with optional filtering
router.get('/threats', async (req, res) => {
  try {
    const { category, aitype, role, phase, search } = req.query;

    let filtered = allCards;

    if (category) {
      const catId = parseInt(category, 10);
      if (Number.isNaN(catId)) {
        return res.status(400).json({ success: false, error: 'Invalid category parameter — must be numeric' });
      }
      filtered = filtered.filter(c => c.categoryId === catId);
    }

    if (aitype) {
      filtered = filtered.filter(c => c.aitypes.includes(aitype));
    }

    if (role) {
      filtered = filtered.filter(c => c.roles.includes(role));
    }

    if (phase) {
      filtered = filtered.filter(c => c.phases.includes(phase));
    }

    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter(c =>
        c.label.toLowerCase().includes(term) ||
        c.question.toLowerCase().includes(term) ||
        c.explanation.toLowerCase().includes(term)
      );
    }

    res.json({
      success: true,
      data: filtered,
      count: filtered.length,
      total: allCards.length
    });
  } catch (error) {
    console.error('PLOT4ai list threats error:', error);
    res.status(500).json({ success: false, error: 'Failed to list PLOT4ai threats' });
  }
});

// GET /api/v1/plot4ai/categories - List all categories with card counts
router.get('/categories', async (req, res) => {
  try {
    res.json({ success: true, data: filterOptions.categories });
  } catch (error) {
    console.error('PLOT4ai list categories error:', error);
    res.status(500).json({ success: false, error: 'Failed to list PLOT4ai categories' });
  }
});

// GET /api/v1/plot4ai/filters - Get available filter options
router.get('/filters', async (req, res) => {
  try {
    res.json({ success: true, data: filterOptions });
  } catch (error) {
    console.error('PLOT4ai filters error:', error);
    res.status(500).json({ success: false, error: 'Failed to get PLOT4ai filter options' });
  }
});

// GET /api/v1/plot4ai/stats - Summary statistics (pre-computed at startup)
router.get('/stats', async (req, res) => {
  try {
    res.json({ success: true, data: precomputedStats });
  } catch (error) {
    console.error('PLOT4ai stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get PLOT4ai statistics' });
  }
});

module.exports = router;
