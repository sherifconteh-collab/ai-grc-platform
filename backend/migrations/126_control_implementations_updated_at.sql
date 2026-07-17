-- Migration 126: Add missing updated_at column to control_implementations
--
-- Live end-to-end QA (real Postgres + real browser, not Jest's mocked
-- pg.Pool) surfaced a 500 on every PATCH /implementations/:id/test-result
-- call: "column \"updated_at\" does not exist". control_implementations
-- never had that column -- only created_at (see migrations/001_initial_schema.sql)
-- -- but three route handlers in src/routes/implementations.js (PATCH
-- /:id/test-result, PUT /:id/narrative, PUT /:id/review-status) all SET and
-- RETURN it regardless. Every call to these three routes threw a 500,
-- meaning the Control Testing verdict, implementation narrative, and
-- review-status features have never actually worked end-to-end despite
-- passing unit tests -- confirmed fixed by re-running the same live browser
-- flow used to verify the sibling ControlWeaver-Pro repo (fix/CW-580,
-- migration 120 there) after applying this migration.
--
-- Adding the column (rather than stripping updated_at from three route
-- handlers) restores the last-modified tracking these routes were clearly
-- designed to have.

ALTER TABLE control_implementations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

SELECT 'Migration 126 completed.' AS result;
