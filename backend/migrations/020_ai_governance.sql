-- Migration 020: Compatibility no-op
-- Earlier desktop builds added overlapping AI governance tables here, but the
-- later migration chain now owns the canonical schema definitions and desktop
-- reconciliation (see migration 083 for ai_reasoning_memory and migration 100
-- for the full desktop schema reconcile). Keep this filename as an idempotent
-- no-op so fresh installs continue through the chain without redefining tables
-- that later migrations already manage.

SELECT 'Migration 020 retained as a compatibility no-op.' AS result;
