-- Migration 020: Compatibility no-op
-- Earlier desktop builds added overlapping AI governance tables here, but the
-- later migration chain now owns the canonical schema definitions and desktop
-- reconciliation. Keep this filename as an idempotent no-op so fresh installs
-- continue through the chain without redefining tables that later migrations
-- already manage.

SELECT 'Migration 020 retained as a compatibility no-op.' AS result;
