# MCP Server Setup

Guide for configuring the ControlWeave Model Context Protocol (MCP) server.

## Overview

ControlWeave includes an MCP server that exposes compliance data to AI assistants, enabling context-aware governance queries.
The server runs over stdio and proxies tool requests to the backend API using the authenticated MCP session file.

## Starting the MCP Server

```bash
cd controlweave/backend
npm run mcp
```

## Configuration

Set the following environment variables in your `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `GRC_API_BASE_URL` | Backend API base URL used by the MCP server | `http://localhost:3001/api/v1` |
| `GRC_HEALTH_URL` | Health endpoint checked by some MCP tooling | `${GRC_API_BASE_URL without /api/v1}/health` |
| `MCP_RATE_LIMIT` | Per-tool request limit per minute | `30` |
| `MCP_REQUEST_TIMEOUT_MS` | Upstream API timeout in milliseconds | `30000` |

The MCP server authenticates with the backend using the local session file at
`~/.controlweave/mcp-session.json`. Before using the server, run:

```bash
cd controlweave/backend
npm run mcp:login
```

## Available Tools

The MCP server exposes read-only access to:

- **Frameworks**: List and query compliance frameworks
- **Controls**: Search and filter controls by framework
- **Assessments**: View assessment results and procedures
- **Dashboard**: Retrieve compliance statistics
- **Assets**: Query CMDB asset inventory

## Integration

Connect your AI assistant (e.g., Claude Desktop, Cursor) to the MCP server command via stdio. Point the client at `npm run mcp` (or `node scripts/mcp-server-secure.js`) in `backend/`, and ensure `GRC_API_BASE_URL` plus a valid MCP login session are available in the environment.
