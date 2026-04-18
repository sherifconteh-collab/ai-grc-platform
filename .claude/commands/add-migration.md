# /add-migration

1. Find the next sequential number under `backend/migrations/` and create `NNN_short_name.sql`.
2. Header block:
   ```sql
   -- ============================================================================
   -- Migration NNN: <Title>
   -- Ships in: vX.Y.Z
   -- Why: <one-paragraph rationale>
   -- ============================================================================
   ```
3. Make every statement idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc.
4. Use `JSONB` (not `JSON`).
5. Annotate any uniqueness constraint that protects against cross-account leakage with `-- SECURITY: ...`.
6. Mention the new migration in the `### Database` section of the release notes entry.
7. Manually run the SQL against a scratch DB to confirm it executes; if you don't have one, document the assumption in the PR description.
