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

For several people with their own logins, run this server deployment once
for the organization. People then use it from a browser or from the desktop
app on their own laptops; either way they sign in with their own account,
and the platform administrator manages who has access.

1. **Set the administrator and close sign-up.** In the backend environment:

   ```bash
   REGISTRATION_MODE=invite_only      # nobody can create an account or organization on their own
   PLATFORM_ADMIN_EMAIL=it-admin@yourcompany.com
   PLATFORM_ADMIN_PASSWORD=...        # first boot only; remove it afterwards
   PLATFORM_ADMIN_ORG=Your Company    # the organization everyone is invited into
   ```

   The administrator account is created on first boot. While
   `PLATFORM_ADMIN_PASSWORD` stays set, every restart resets that account to
   it, so remove it once you have signed in and changed the password. Any
   value of `REGISTRATION_MODE` other than `open` (the default, for a public
   service) is treated as `invite_only`.

2. **Serve it over HTTPS.** Put the frontend behind TLS (a reverse proxy or
   your platform's certificate) and set `CORS_ORIGIN` and `FRONTEND_URL` to
   that address. The desktop app refuses plain `http://` servers, and browsers
   do not send the secure sign-in cookie over them.

3. **Add people.** Signed in as the administrator, open **Settings → Users and
   roles** and either invite someone (they get a link, valid for 7 days, to
   choose their own password) or create the account directly. Roles set what
   each person can see and change; deactivating an account there ends that
   person's access.

4. **Point the desktop app at the server.** On first launch the app asks how
   it will be used; people choose **Connect to my organization's server** and
   enter the address, for example `https://grc.yourcompany.com`. To skip the
   question when you roll the app out, start it with
   `--server=https://grc.yourcompany.com` on the shortcut or set
   `CONTROLWEAVE_SERVER_URL` for the user; the app then always uses that
   server and offers no way to switch. In this mode the laptop keeps no
   ControlWeave data of its own: the server holds it and is what you back up.

## Load balancer and disaster recovery

Assume a company runs several backend servers behind a load balancer, plus a
standby copy in a second site. ControlWeave supports that as follows; each
item is required unless marked otherwise.

**Every backend server, in every site:**

- **The same secrets.** `JWT_SECRET`, `ENCRYPTION_KEY` and `HMAC_KEY` must be
  identical everywhere. A server with a different `JWT_SECRET` rejects
  everyone's sign-in. Without the same `ENCRYPTION_KEY` and `HMAC_KEY`,
  encrypted fields and email lookups can't be read after a failover. Keep
  them in your secret manager, never in a single site.
- **Redis** (`REDIS_URL`, plus `REDIS_REQUIRED=true`). Rate limits are then
  shared rather than counted per server, and live notifications reach people
  whichever server they are connected to. With `REDIS_REQUIRED=true` a server
  that cannot reach Redis stops instead of running half-connected. Give the
  DR site its own Redis; nothing in it needs to survive a failover.
- **Shared uploads.** Evidence and policy files are written to `UPLOADS_DIR`.
  Mount the same network share (NFS, EFS, Azure Files) at that path on every
  server, and replicate it to the DR site. On a local disk, a file uploaded
  through one server is missing on the others.
- `TRUST_PROXY=true` (or the number of proxy hops), so rate limits and audit
  logs see the user's address instead of the load balancer's.
- `CORS_ORIGIN` and `FRONTEND_URL` set to the one public address
  (for example `https://grc.yourcompany.com`), the same in both sites.

**The load balancer:**

- Put the public load balancer in front of the frontend servers. Each one
  forwards `/api/v1` and `/socket.io` to `BACKEND_ORIGIN`, which is read when
  the frontend is built. Build it with `BACKEND_ORIGIN` set to an internal
  load balancer in front of the backend servers, using the same internal
  name in both sites.
- Health check: `GET /ready` on the backend (port 3001). It returns 503 when
  that server cannot reach the database, when the database is a read-only
  replica, or when Redis is required but down. `/health` always returns 200,
  so use it only as a liveness check, never for routing.
- Allow WebSocket upgrades on `/socket.io`. If your load balancer cannot,
  enable sticky sessions instead, because the polling fallback needs them.
- Sessions need no stickiness. Sign-in uses signed tokens, and refresh
  tokens, passkey challenges and SSO state are kept in the database.

**Nothing to configure (already safe with several servers):**

- Migrations take a database lock, so servers starting together don't
  migrate twice.
- Background jobs (reminders, retention, scheduled reports and nightly
  backups) run on every server, but each run is claimed in the database
  (`scheduler_leases` table, using the database clock), so exactly one server
  does it. `BACKUP_ENABLED=true` can be set everywhere.
- Settings changed on one server (SMTP, feature flags) reach the others
  within 5 minutes.

**Disaster recovery:**

- Replicate the database to the DR site (PostgreSQL streaming replication
  or your provider's cross-region replica). Run the DR servers against that
  replica. Until it is promoted, `/ready` returns 503 and the background
  jobs skip themselves, so the standby takes no traffic and sends no
  reminders.
- Fail over by promoting the replica, then pointing the public address at
  the DR load balancer (DNS failover or a global load balancer). Browsers and
  desktop apps keep the same address, so nobody has to reconfigure anything.
  The TLS certificate must be valid for that address in both sites.
- Keep backups outside both sites: set `AWS_S3_BUCKET` (a bucket in a third
  region, or with cross-region replication), and include the uploads share in
  your file-level backups.
- Test failover: promote the replica in a test environment, check `/ready`
  returns 200 there, sign in, and open an uploaded file.

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
