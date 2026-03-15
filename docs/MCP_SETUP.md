# MCP Server Setup

Guide for configuring the ControlWeave Model Context Protocol (MCP) server.

## Overview

ControlWeave includes an MCP server that exposes compliance data to AI
assistants (Claude Desktop, Cursor, and other MCP-compatible clients).
The MCP server communicates over **stdio** and delegates every request to the
ControlWeave backend API using JWT authentication — the same tokens your
browser session uses.

This guide covers **self-hosted** deployments.

---

## Quick Start

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js ≥ 18 | Required for native `fetch()` API |
| Running ControlWeave backend | Default: `http://localhost:3001` |
| A registered user account | Any role — permissions are enforced per-tool |

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Authenticate the MCP server

```bash
npm run mcp:login
```

This prompts for your email and password, authenticates against the backend,
and stores a session file at `~/.controlweave/mcp-session.json`.

> **Two-factor authentication (TOTP)** is supported — if enabled on your
> account, you will be prompted for an authenticator code after entering your
> password.

For non-interactive / CI usage you can pass credentials via environment
variables:

```bash
MCP_LOGIN_EMAIL=admin@example.com MCP_LOGIN_PASSWORD=secret npm run mcp:login
```

### 3. Verify authentication

```bash
npm run mcp:status
```

This shows your session state, token expiry, and verifies the token against
the running backend.

### 4. Start the MCP server

```bash
npm run mcp
```

Or point your AI client at the server (see [Client Configuration](#client-configuration) below).

### 5. Logout (optional)

```bash
npm run mcp:logout
```

Removes the stored session file.

---

## How Authentication Works

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. npm run mcp:login                                               │
│     → Prompts for email + password                                  │
│     → POST /api/v1/auth/login  →  receives accessToken + refresh    │
│     → Saves tokens to ~/.controlweave/mcp-session.json              │
│                                                                     │
│  2. npm run mcp   (or AI client launches the MCP server)            │
│     → Loads session file on startup                                 │
│     → Every tool call sends Authorization: Bearer <accessToken>     │
│     → If the access token expires, it is automatically refreshed    │
│       using the stored refresh token (POST /api/v1/auth/refresh)    │
│                                                                     │
│  3. Backend enforces role / tier / permission checks as usual       │
└─────────────────────────────────────────────────────────────────────┘
```

The session file is stored with **mode 0600** so only the current OS user can
read it.  Tokens are standard JWTs signed by the backend — access tokens
expire in 15 minutes (configurable via `JWT_ACCESS_EXPIRY`) and are silently
refreshed before expiry.

---

## Client Configuration

### Claude Desktop

Add the following to your Claude Desktop configuration file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "controlweave": {
      "command": "node",
      "args": ["/absolute/path/to/backend/scripts/mcp-server-secure.js"],
      "env": {
        "GRC_API_BASE_URL": "http://localhost:3001/api/v1"
      }
    }
  }
}
```

> Replace `/absolute/path/to/backend` with the actual path to the cloned
> repository's `backend` directory.

### Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json` in your project or global settings):

```json
{
  "mcpServers": {
    "controlweave": {
      "command": "node",
      "args": ["/absolute/path/to/backend/scripts/mcp-server-secure.js"],
      "env": {
        "GRC_API_BASE_URL": "http://localhost:3001/api/v1"
      }
    }
  }
}
```

### VS Code (Copilot MCP)

Add to your VS Code `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "controlweave": {
        "command": "node",
        "args": ["/absolute/path/to/backend/scripts/mcp-server-secure.js"],
        "env": {
          "GRC_API_BASE_URL": "http://localhost:3001/api/v1"
        }
      }
    }
  }
}
```

---

## Environment Variables

Add these to `backend/.env` (or export in your shell / AI client config):

| Variable | Description | Default |
|----------|-------------|---------|
| `GRC_API_BASE_URL` | Backend API endpoint | `http://localhost:3001/api/v1` |
| `GRC_HEALTH_URL` | Health check endpoint (auto-derived if omitted) | — |
| `MCP_SESSION_FILE` | Override session file path | `~/.controlweave/mcp-session.json` |
| `MCP_RATE_LIMIT` | Max requests per minute per tool | `30` |
| `MCP_REQUEST_TIMEOUT_MS` | Request timeout in milliseconds | `30000` |
| `MCP_MAX_INPUT_LENGTH` | Max characters for text inputs | `10000` |
| `MCP_MAX_RESULT_LIMIT` | Max results returned per query | `200` |
| `MCP_ENABLE_AUDIT_LOG` | Enable/disable audit logging | `true` |
| `MCP_CLIENT_NAME` | LLM client identifier (for audit trail) | — |
| `MCP_CLIENT_VERSION` | LLM client version (for audit trail) | — |

---

## Available Tools

The MCP server exposes 50+ tools organized by category:

| Category | Examples | Tier |
|----------|----------|------|
| **System** | Health check, auth verification | Community |
| **Compliance** | Frameworks, controls, crosswalks, assessments | Community |
| **POA&M** | Plan of Action & Milestones management | Community |
| **Reports** | Compliance reports (PDF, Excel, JSON) | Community |
| **Exceptions** | Risk acceptances, compensating controls | Community |
| **Audit** | Logging, AI decision tracking | Community |
| **Evidence** | File management, control linking | Community |
| **Assets / CMDB** | Inventory management | Pro |
| **TPRM** | Third-party risk management | Enterprise |
| **AI Governance** | Vendor assessment, supply chain | Enterprise |
| **Threat Intel** | CVE / indicator management | Enterprise |

Tools that require a higher tier will return a clear error message when invoked
on an insufficient plan.

---

## Troubleshooting

### "Missing MCP login session"

Run `npm run mcp:login` from the `backend` directory to authenticate.

### "Cannot connect to backend"

1. Ensure the backend is running (`npm run dev` or `npm start` in `backend/`).
2. Verify `GRC_API_BASE_URL` matches the running backend.

### "Token refresh failed"

Your refresh token may have expired (default: 7 days).  Run `npm run mcp:login`
again to re-authenticate.

### Session file not found after login

Check the path with `npm run mcp:status`.  Override the location with
`MCP_SESSION_FILE` if your home directory is non-standard.

### TOTP / 2FA issues

If your account has two-factor authentication enabled, `npm run mcp:login` will
prompt for the authenticator code.  Backup codes are also accepted.

---

## Security

- **Session file permissions**: Written with mode `0600` (owner read/write only).
- **Rate limiting**: 30 requests/minute per tool (configurable).
- **Prompt injection detection**: All free-text inputs are scanned using AIDEFEND.
- **Audit logging**: Every tool invocation is logged with user context.
- **Input validation**: All inputs are validated with Zod schemas.
- **Automatic token refresh**: Access tokens are refreshed before expiry.
- **No secrets in stdout**: All diagnostic output goes to stderr to avoid
  leaking data into the MCP protocol stream.

See the [OWASP Secure MCP Server Guide](https://genai.owasp.org/resource/a-practical-guide-for-secure-mcp-server-development/) for the security model this implementation follows.
