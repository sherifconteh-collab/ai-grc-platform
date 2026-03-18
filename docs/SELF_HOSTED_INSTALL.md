# Self-Hosted Installation Guide

This guide covers every supported self-hosting path for ControlWeave — from the
free Community Edition to fully commercial Pro/Enterprise/Gov Cloud deployments.

---

## Which build do I need?

| Scenario | Source | Cost |
|----------|--------|------|
| Community — personal / small team | Public mirror (open source) | Free (AGPL v3) |
| Pro / Enterprise / Gov Cloud — managed | Railway (ControlWeave-hosted) | Subscription |
| Pro / Enterprise / Gov Cloud — self-hosted | Commercial Docker image + license key | Subscription |

> **Key point:** The public mirror contains **only community-tier code**.
> A license key alone cannot enable Pro/Enterprise features on the community build —
> the paid-tier route handlers, services, and migrations are simply not present in
> that repository. To self-host a paid tier you need the **commercial build** (Docker
> image or private repository access) issued with your subscription.

---

## Community Edition — self-hosted

### Prerequisites

- Node.js 20.16.0+ and npm
- PostgreSQL 17+
- Git

### 1. Clone the public mirror

```bash
git clone https://github.com/sherifconteh-collab/ai-grc-platform.git controlweave
cd controlweave
```

### 2. Configure the backend

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
EDITION=community
JWT_SECRET=<long-random-string-at-least-32-chars>   # openssl rand -base64 48
CORS_ORIGIN=https://your-domain.com
FRONTEND_URL=https://your-domain.com
```

### 3. Run all migrations

```bash
npm run migrate
```

This runs **every** migration file in `backend/migrations/` in filename order.
Re-running is safe: the migration runner tracks applied filenames in the
`schema_migrations` table and skips any file that has already been recorded.
If a file does run and encounters an "already exists" error, the runner
baselines it automatically (controlled by `MIGRATION_BASELINE_ON_ERROR`,
which defaults to `true`).

### 4. Seed reference data

```bash
node scripts/seed-frameworks.js           # NIST, ISO 27001, SOC 2, HIPAA, …
node scripts/seed-missing-controls.js     # fill any gaps in control data
node scripts/seed-assessment-procedures.js
```

### 5. Configure the frontend

```bash
cd ../frontend
npm install
cp .env.example .env.local
```

```env
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
NEXT_PUBLIC_APP_NAME=ControlWeave
```

### 6. Build and start

```bash
# frontend
npm run build
npm start            # listens on port 3000

# backend (separate process or container)
cd ../backend
npm start            # listens on port 3001
```

### 7. Generate a community license key

A license key is optional for the Community Edition but confirms your deployment is
a legitimate licensed installation.

1. Create the first user — that user becomes the platform admin.
2. Navigate to **Settings → License**.
3. Click **Generate Community License** — the key is issued instantly at no cost.

---

## Paid Tier (Pro / Enterprise / Gov Cloud) — Railway-managed

Railway is the fastest path. No server management required.

1. Sign up at [controlweave.com](https://controlweave.com).
2. Your environment is provisioned automatically on Railway.
3. Activate your license key from **Settings → License**.

---

## Paid Tier — self-hosted (commercial build)

### What you receive with a paid subscription

| Deliverable | Format |
|-------------|--------|
| Commercial Docker image | Private Docker Hub repository |
| Private repository access (optional) | Invite to `sherifconteh-collab/ControlWeaver-Pro` |
| License key | Issued by ControlWeave sales |

Contact [contehconsulting@gmail.com](mailto:contehconsulting@gmail.com) to request your
deployment credentials.

### Deploying the commercial Docker image

```bash
# Authenticate to the private registry (credentials from ControlWeave)
echo "<your-docker-token>" | docker login -u <your-docker-user> --password-stdin

# Pull the commercial backend image
docker pull controlweave/controlweave-pro-backend:<version>

# Pull the frontend image
docker pull controlweave/controlweave-pro-frontend:<version>
```

Example `docker-compose.yml`:

```yaml
version: "3.9"
services:
  backend:
    image: controlweave/controlweave-pro-backend:latest
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/controlweave
      PORT: "3001"
      EDITION: pro           # or enterprise / govcloud
      JWT_SECRET: <secret>
      CORS_ORIGIN: https://your-domain.com
      FRONTEND_URL: https://your-domain.com
    ports:
      - "3001:3001"
    depends_on:
      - db

  frontend:
    image: controlweave/controlweave-pro-frontend:latest
    environment:
      NEXT_PUBLIC_API_URL: https://your-domain.com/api/v1
    ports:
      - "3000:3000"

  db:
    image: postgres:17
    environment:
      POSTGRES_DB: controlweave
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```bash
docker compose up -d
```

### Activating your license key

After first startup:

1. Create the first user (becomes platform admin).
2. Navigate to **Settings → License**.
3. Paste your license key and click **Activate**.

The server validates the key, upgrades its in-process edition immediately, and
persists the key to the database so the edition survives restarts — no `.env`
editing required.

---

## How migrations work

### All editions

`npm run migrate` (or the equivalent command at container startup) applies every
`.sql` file in `backend/migrations/` in alphabetical order. Re-running is safe
via two mechanisms:

- **`schema_migrations` tracking** — each applied filename is recorded; the
  runner skips files it has already processed.
- **`MIGRATION_BASELINE_ON_ERROR`** (defaults to `true`) — if a migration runs
  and hits an "already exists" error (e.g., because the table was created by an
  earlier partial run), the runner records it as applied and moves on instead of
  aborting the entire migration sequence.

### Community edition

The community build's `backend/migrations/` directory contains **all** migration
files synced from the private repository. This includes migrations for paid-tier
features (CMDB, SBOM, SIEM, etc.). Including them is safe and necessary:

- Many migrations reference foreign keys across tables created by other migrations.
  Excluding a migration in the chain causes the next one to fail.
- Extra tables (e.g., `cmdb_assets`, `sbom_components`) simply exist unused on
  community deployments — no harm.

### Upgrading an existing deployment

```bash
git pull             # or docker pull for the new image
npm run migrate      # applies only new (not yet applied) migrations
node scripts/seed-frameworks.js    # picks up any new frameworks
```

The `schema_migrations` table tracks which files have been applied, so only new
files run on upgrade.

---

## Edition and feature gating

ControlWeave uses two independent layers to gate paid features:

| Layer | Mechanism | Who sets it |
|-------|-----------|-------------|
| **Edition** | `EDITION` env var (`community` / `pro` / `enterprise`) + `requireProEdition` middleware | Operator / license activation |
| **Tier** | `organization.tier` column in the database + `requireTier` middleware | License key or ControlWeave billing |

When a paid license key is activated (`POST /api/v1/license/activate`):

1. The key is validated (RS256/ES256 JWT).
2. `upgradeEdition()` updates the in-process `EDITION` immediately — tier-gate
   middleware (e.g., `requireProEdition`, `requireTier`) passes from this point
   forward without a restart.
3. The key is persisted to the `server_license` database table so the upgrade
   survives restarts.
4. **Route handlers are NOT dynamically loaded at this point.** Express registers
   routes once at process startup from whatever files are on disk. If you are running
   the community build (public mirror), paid route files were never present on disk,
   so the corresponding API endpoints were never mounted and cannot be added at
   runtime — even though the edition has been upgraded in memory.
   To get paid API routes you must deploy the commercial build (which includes all
   route files) and restart the server.

---

## Frequently asked questions

**Q: Can I start on the community edition and upgrade later?**

Yes. The database schema is identical — all migrations run regardless of edition.
When you are ready to upgrade:
1. Deploy the commercial Docker image alongside your existing PostgreSQL database.
2. Run `npm run migrate` (only new migrations apply).
3. Activate your license key from Settings.

**Q: Can I self-host without a paid license key?**

Community tier is free and does not require a license key. A license key generates
audit-log proof of a legitimate licensed installation, but the features work without
one.

**Q: Do I need to re-seed frameworks on upgrade?**

Run `node scripts/seed-frameworks.js` — it is idempotent and picks up any newly
added frameworks without duplicating existing ones.

**Q: What if migrations fail?**

Set `MIGRATION_BASELINE_ON_ERROR=true` (default) to baseline failed migrations
automatically. Check the `schema_migrations` table for applied files and the server
logs for the specific SQL error.

**Q: How do I get the private Docker image?**

Contact [contehconsulting@gmail.com](mailto:contehconsulting@gmail.com) with your subscription
details. Docker Hub credentials and private repository access are issued per subscription.
