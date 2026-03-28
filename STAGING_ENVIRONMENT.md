# Staging Environment Guide

This guide documents a lightweight staging environment for ControlWeave Community Edition so changes can be validated before production deployment.

## Overview

A staging environment should mirror production closely enough to validate:

- application startup and health checks
- database migrations
- frontend production builds
- authentication and API connectivity
- release promotion readiness

## Recommended Architecture

| Component | Staging Recommendation | Notes |
| --- | --- | --- |
| Frontend | Next.js production build | Run with the same environment variables used in production |
| Backend | Node.js production startup (`npm run start:prod`) | Keep `NODE_ENV=production` for realistic behavior |
| Database | Dedicated PostgreSQL instance | Never share production data |
| Redis | Dedicated Redis instance | Match websocket/cache behavior where used |
| Secrets | Separate staging secrets | Do not reuse production credentials |

## Environment Variable Matrix

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes | Set to `production` for realistic staging behavior |
| `PORT` | Yes | Backend service port |
| `DATABASE_URL` | Yes* | Preferred database connection string |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Yes* | Alternative to `DATABASE_URL` |
| `JWT_SECRET` | Yes | Access-token signing |
| `JWT_REFRESH_SECRET` | Yes | Refresh-token signing |
| `CORS_ORIGINS` | Yes | Restrict frontend origins |
| `REDIS_URL` | Recommended | Enables Redis-backed realtime behavior |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Optional | Required only when validating corresponding AI features |

\* Provide either `DATABASE_URL` or the individual database variables.

## Local Docker-Based Staging

Use containers locally to validate a production-like setup without affecting development data.

### 1. Start PostgreSQL

```bash
docker run --name controlweave-staging-postgres \
  -e POSTGRES_DB=controlweave \
  -e POSTGRES_USER=controlweave \
  -e POSTGRES_PASSWORD=controlweave \
  -p 5432:5432 \
  -d postgres:17
```

### 2. Start Redis

```bash
docker run --name controlweave-staging-redis \
  -p 6379:6379 \
  -d redis:7
```

### 3. Configure the backend

```bash
cd backend
cp .env.example .env
```

Set at minimum:

```bash
NODE_ENV=production
DATABASE_URL=postgres://controlweave:controlweave@localhost:5432/controlweave
JWT_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-a-second-long-random-secret
REDIS_URL=redis://localhost:6379
```

### 4. Run migrations and start the API

```bash
cd backend
npm ci
npm run migrate
npm run start:prod
```

### 5. Build and start the frontend

```bash
cd frontend
npm ci
npm run build
npm start
```

## Promotion Workflow

1. Deploy the candidate commit to staging.
2. Run database migrations in staging first.
3. Verify `/health` and critical authentication flows.
4. Run targeted build, lint, and type/syntax checks.
5. Confirm release notes and package versions are in sync.
6. Promote the same validated commit to production.

## Operational Notes

- Use a dedicated staging database and secrets.
- Keep staging telemetry, SMTP, and webhooks isolated from production systems.
- If paid-tier modules are absent in the community mirror, expect those routes to remain unavailable in staging as well.
