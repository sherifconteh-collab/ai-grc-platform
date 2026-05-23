# ControlWeave — Quick Start

Three ways to run ControlWeave. Choose the one that fits your situation.

---

## Option 1: Desktop App (Recommended — no setup required)

Download the installer for your platform. PostgreSQL is bundled — nothing else to install.

| Platform | Download |
|---|---|
| Windows | [ControlWeave.Setup.exe](https://github.com/sherifconteh-collab/ai-grc-platform/releases/latest) |
| macOS (Apple Silicon) | [ControlWeave-arm64.dmg](https://github.com/sherifconteh-collab/ai-grc-platform/releases/latest) |
| macOS (Intel) | [ControlWeave-x64.dmg](https://github.com/sherifconteh-collab/ai-grc-platform/releases/latest) |
| Linux | [ControlWeave.AppImage](https://github.com/sherifconteh-collab/ai-grc-platform/releases/latest) |

Launch the app — it opens directly to the sign-in / registration page. Create your account and you're in.

---

## Option 2: Development from Source

For developers who want to modify the code or run against a local database.

### Prerequisites

- **Node.js** 20+ — [nodejs.org](https://nodejs.org)
- **PostgreSQL** 14+ — [postgresql.org](https://www.postgresql.org/download/)

### Steps

**1. Create the database**

```bash
# macOS (Homebrew)
brew services start postgresql
createdb controlweave

# Linux
sudo systemctl start postgresql
sudo -u postgres createdb controlweave
```

**2. Set up the backend**

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL`:
```
DATABASE_URL=postgresql://localhost:5432/controlweave
```

Then start the API:
```bash
npm run migrate    # creates all tables and seeds framework data
npm start          # API on http://localhost:3001
```

**3. Set up the frontend** (new terminal)

```bash
cd frontend
npm install
npm run dev        # Next.js on http://localhost:3000
```

Visit **http://localhost:3000/register** to create your first account.

---

## Option 3: Self-Hosted Server

See [docs/SELF_HOSTED_INSTALL.md](./docs/SELF_HOSTED_INSTALL.md) for production deployment including reverse proxy, TLS, and environment hardening.

---

## First Steps After Install

### 1. Configure an LLM provider

Go to **Settings → LLM Configuration** and enter an API key for any supported provider:

| Provider | Free tier available |
|---|---|
| Google Gemini | ✅ Yes (Gemini 2.0 Flash) |
| Groq | ✅ Yes |
| Ollama (local) | ✅ Yes (self-hosted) |
| Anthropic (Claude 4.x) | Pay-as-you-go |
| OpenAI (GPT-4.1 / o3 / o4-mini) | Pay-as-you-go |
| Grok | Pay-as-you-go |

Without a key, the AI Copilot, gap analysis, and policy generation features are unavailable. The rest of the platform works fine.

### 2. Activate a compliance framework

Go to **Frameworks** → click **Activate** on any framework. All 35+ frameworks are available with no restrictions.

Suggested starting point:
- **General compliance**: NIST CSF 2.0
- **Federal / DoD**: NIST SP 800-53 or NIST SP 800-171
- **AI governance**: NIST AI RMF or EU AI Act
- **Healthcare**: HIPAA Security Rule

### 3. Run the AI Copilot

Once an LLM key is configured, open **AI Analysis** from the sidebar. Try "Gap analysis against NIST CSF 2.0" to see your current compliance posture in seconds.

---

## Optional Services

### Redis (distributed rate limiting + response caching)

```bash
# macOS
brew install redis && brew services start redis

# Linux
sudo apt install redis-server && sudo systemctl start redis
```

Add to `backend/.env`:
```
REDIS_URL=redis://localhost:6379
```

Without Redis the platform falls back to in-memory rate limiting transparently.

### Sentry (error tracking)

Add to `backend/.env`:
```
SENTRY_DSN=<your-dsn-from-sentry.io>
```

### SSO / OIDC

Add to `backend/.env`:
```
OIDC_ISSUER=https://your-idp.example.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

---

## Validation Commands

Run these after any code change to verify nothing is broken:

```bash
cd backend  && npm run check:syntax   # fast syntax gate
cd backend  && npm run build          # full require check
cd backend  && npx jest               # unit tests (no DB required)
cd frontend && npm run typecheck      # TypeScript strict check
```
