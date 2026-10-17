# Self-Hosted Installation Guide

ControlWeave is a single, fully open source build — there is no separate paid
tier, no commercial Docker image, and no feature gating. Every deployment
runs the same code with the same features available to every authenticated
user.

ControlWeave is dual-licensed: AGPL v3 (open source, free) or a commercial
license for organizations that need different licensing terms. The license
you choose does not change which features you get — see the repository
`LICENSE` file for details.

---

## Prerequisites

- Node.js 24+ and npm
- PostgreSQL 17+
- Git

## 1. Clone the repository

```bash
git clone https://github.com/sherifconteh-collab/ai-grc-platform.git controlweave
cd controlweave
```

## 2. Configure the backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` at minimum:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/controlweave
PORT=3001
NODE_ENV=production
JWT_SECRET=<long-random-string-at-least-32-chars>   # openssl rand -base64 48
CORS_ORIGIN=https://your-domain.com
FRONTEND_URL=https://your-domain.com
```

## 3. Run all migrations

```bash
npm run migrate
```

This runs **every** migration file in `backend/migrations/` in filename order.
Re-running is safe: the migration runner tracks applied filenames in the
`schema_migrations` table and skips any file that has already been recorded.
If a file does run and encounters an "already exists" error, the runner
baselines it automatically (controlled by `MIGRATION_BASELINE_ON_ERROR`,
which defaults to `true`).

## 4. Seed reference data

```bash
node scripts/seed-frameworks.js           # NIST, ISO 27001, SOC 2, HIPAA, …
node scripts/seed-missing-controls.js     # fill any gaps in control data
node scripts/seed-assessment-procedures.js
```

## 5. Configure the frontend

```bash
cd ../frontend
npm install
cp .env.example .env.local
```

```env
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
NEXT_PUBLIC_APP_NAME=ControlWeave
```

## 6. Build and start

```bash
# frontend
npm run build
npm start            # listens on port 3000

# backend (separate process or container)
cd ../backend
npm start            # listens on port 3001
```

---

## Running for a team

The desktop app is for one person on one computer: it only accepts
connections from that computer. For several people with their own logins,
run this server deployment and invite them from **Settings → Users and roles**.

- **One backend instance** needs nothing more. Rate limits and caches are
  kept in memory.
- **More than one backend instance** behind a load balancer needs Redis
  (`REDIS_URL`), so every instance shares the same rate limits and cache.
  Without it each instance counts separately. Set `TRUST_PROXY=true` behind
  any proxy (see `.env.example`).

## Backups

Set these in the backend environment:

| Variable | Default | Meaning |
|---|---|---|
| `BACKUP_ENABLED` | unset | `true` runs `pg_dump` on a schedule; each run is recorded in `backup_logs` |
| `BACKUP_CRON_SCHEDULE` | `0 2 * * *` | When to run (cron syntax, server time) |
| `DB_BACKUP_DIR` | `backend/backups` | Where dumps are written; put it on another disk or volume |
| `DB_BACKUP_RETENTION_DAYS` | `7` | Dumps older than this are deleted after each run |
| `DB_BACKUP_FORMAT` | `custom` | `custom` (restore with `pg_restore`) or `plain` (SQL) |
| `PG_DUMP_PATH` | `pg_dump` | Path to `pg_dump`; it must be installed and the same major version as the server |
| `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_S3_PREFIX` | unset | Also upload each dump to S3; needs `npm install @aws-sdk/client-s3` in `backend/` |

Platform admins can also start a backup from **Platform Admin → Backups**.
Test a restore before you need one:

```bash
createdb controlweave_restore_test
pg_restore --no-owner --dbname=controlweave_restore_test backend/backups/grc_<stamp>.dump
```

A database dump does **not** include uploaded files. Back up the uploads
directory too: `backend/uploads`, or the folder `UPLOADS_DIR` points to.

## Upgrading an existing deployment

```bash
git pull
npm run migrate      # applies only new (not yet applied) migrations
node scripts/seed-frameworks.js    # picks up any new frameworks
```

The `schema_migrations` table tracks which files have been applied, so only
new files run on upgrade.

---

## Frequently asked questions

**Q: Is there a paid tier or commercial build?**

No. This repository is the only build — there is no separate Pro/Enterprise
image, no license-key feature unlock, and no `EDITION`/`tier` gating. The
`organizations.tier` column and license-related tables still exist in the
schema for historical/backward-compat reasons, but nothing in the application
checks them to restrict features.

**Q: What if migrations fail?**

Set `MIGRATION_BASELINE_ON_ERROR=true` (default) to baseline failed migrations
automatically. Check the `schema_migrations` table for applied files and the
server logs for the specific SQL error.

**Q: Do I need to re-seed frameworks on upgrade?**

Run `node scripts/seed-frameworks.js` — it is idempotent and picks up any
newly added frameworks without duplicating existing ones.
