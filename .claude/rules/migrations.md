# Migrations

- File pattern: `backend/migrations/NNN_short_name.sql`. Numbers are sequential; never renumber.
- Each migration is **idempotent**: use `IF NOT EXISTS` / `IF EXISTS` and `DO $$ ... END$$` guards.
- Use `JSONB` (not `JSON`) for structured columns.
- Add an explanatory header comment block describing why the migration exists and which release it ships in.
- Uniqueness constraints that protect against cross-account data leaks should be annotated with a `SECURITY:` comment (see `104_device_push_tokens.sql`).
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is preferred over destructive alters.
