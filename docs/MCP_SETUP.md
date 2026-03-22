# MCP Server Setup

Guide for configuring the ControlWeave Model Context Protocol (MCP) server.

## Overview

ControlWeave includes an MCP server that exposes compliance data to AI assistants, enabling context-aware governance queries.

## Starting the MCP Server

```bash
cd controlweave/backend
npm run mcp
```

## Configuration

Set the following environment variables in your `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_PORT` | Port for the MCP server | `3002` |
| `DATABASE_URL` | PostgreSQL connection string | (required) |

## Available Tools

The MCP server exposes read-only access to:

- **Frameworks**: List and query compliance frameworks
- **Controls**: Search and filter controls by framework
- **Assessments**: View assessment results and procedures
- **Dashboard**: Retrieve compliance statistics
- **Assets**: Query CMDB asset inventory

## Integration

Connect your AI assistant (e.g., Claude Desktop, Cursor) to the MCP server endpoint. See the [MCP SDK documentation](https://modelcontextprotocol.io/) for client configuration.
