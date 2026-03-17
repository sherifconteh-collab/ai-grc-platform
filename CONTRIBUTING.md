# Contributing to ControlWeave

Thank you for your interest in contributing to ControlWeave! We welcome contributions from the community and are excited to work with you.

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [How to Contribute](#-how-to-contribute)
- [Branch Naming Convention](#-branch-naming-convention)
- [Development Setup](#-development-setup)
- [Coding Standards](#-coding-standards)
- [What We Need Help With](#-what-we-need-help-with)
- [Reporting Bugs](#-reporting-bugs)
- [Suggesting Features](#-suggesting-features)
- [Contributing to the SDK](#-contributing-to-the-sdk)
- [Security Issues](#-security-issues)
- [Recognition](#-recognition)

## 📜 Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

In short:
- Be respectful and inclusive
- Accept constructive criticism
- Focus on what's best for the community
- Show empathy towards others

## 🤝 How to Contribute

### 1. Fork the Repository
Fork the repo on GitHub and clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/ControlWeave.git
cd ControlWeave
git remote add upstream https://github.com/sherifconteh-collab/ControlWeave.git
```

### 2. Create a Feature Branch
Follow the branch naming convention (see below) and create a branch for your contribution:

```bash
git checkout -b feature/GRC-42/add-gdpr-framework
```

### 3. Set Up Your Development Environment
See [Development Setup](#-development-setup) below for full instructions.

### 4. Make Your Changes
Write your code following our [Coding Standards](#-coding-standards).

### 5. Test Your Changes

```bash
# Backend: start the server and verify endpoints
cd backend
npm install
npm start

# Frontend: verify the UI builds and renders correctly
cd ../frontend
npm install
npm run build
npm run dev

# Database: test schema and seed changes
psql ai_grc_platform < db/schema.sql
for file in db/seeds/*.sql; do psql ai_grc_platform < "$file"; done
```

### 6. Commit Your Changes
Write clear, descriptive commit messages following [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat(frameworks): add GDPR Article 17 compliance checklist"
git commit -m "fix(auth): resolve missing Suspense boundary in register page"
git commit -m "docs(contributing): improve setup instructions"
```

Good commit messages:
- Start with a type: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- Include a scope in parentheses (optional but recommended)
- Be specific and descriptive
- Reference issue numbers when applicable: `fix(api): resolve #42`

### 7. Push to Your Fork

```bash
git push origin feature/GRC-42/add-gdpr-framework
```

### 8. Open a Pull Request
Go to GitHub and open a Pull Request from your fork to our `main` branch.

In your PR description:
- **What**: Explain what you changed
- **Why**: Explain the motivation or the issue it fixes (reference with `Fixes #42`)
- **How**: Brief technical explanation of your approach
- **Screenshots**: Include screenshots for any UI changes
- **Breaking change**: Note if this is a breaking change and what migration is needed

## 🌿 Branch Naming Convention

All branches must follow this pattern:

```
<type>/<short-desc>
```

Or, when referencing a GitHub issue:

```
<type>/GRC-<issue-number>/<short-desc>
```

**Types:**
| Type | Use for |
|------|---------|
| `feature/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation updates |
| `refactor/` | Code refactoring |
| `test/` | Test additions or fixes |
| `chore/` | Tooling, CI, dependency updates |
| `security/` | Security patches |

**Examples:**
```bash
feature/add-gdpr-framework
feature/GRC-42/add-gdpr-framework
fix/GRC-15/pagination-offset-bug
docs/GRC-7/improve-setup-guide
security/GRC-88/fix-ilike-injection
```

> **Note:** The branches `main`, `staging`, and `release/*` are protected and cannot be pushed to directly.

## 💻 Development Setup

### Prerequisites
- **Node.js 20+** (LTS recommended)
- **PostgreSQL 14+**
- **Git**

### Initial Setup

```bash
# 1. Clone your fork
git clone https://github.com/YOUR_USERNAME/ControlWeave.git
cd ControlWeave

# 2. Set up the database
createdb ai_grc_platform
psql ai_grc_platform < db/schema.sql
for file in db/seeds/*.sql; do psql ai_grc_platform < "$file"; done

# Verify: should return 1000+ controls
psql ai_grc_platform -c "SELECT COUNT(*) FROM framework_controls;"

# 3. Set up the backend
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL connection details
npm install
npm run seed        # Seed frameworks and assessment procedures
npm start           # API starts on http://localhost:3001

# 4. Set up the frontend (new terminal, from repo root)
cd ControlWeave/frontend
npm install
npm run dev         # UI starts on http://localhost:3000
```

**First login:** Visit http://localhost:3000/register to create your account.

### Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWTs (min 32 chars) |
| `JWT_REFRESH_SECRET` | ✅ | Secret for refresh tokens |
| `PORT` | ❌ | Backend port (default: 3001) |
| `CORS_ORIGINS` | ❌ | Allowed CORS origins (default: localhost:3000) |
| `SMTP_HOST` | ❌ | SMTP host for email notifications |
| `ANTHROPIC_API_KEY` | ❌ | For AI Copilot (or any supported LLM provider key) |

### Using the MCP Server (Optional)

The platform includes an MCP (Model Context Protocol) server for AI agent integration:

```bash
# Start the standard MCP server
node backend/scripts/mcp-server.js

# Start the secure MCP server (with authentication)
node backend/scripts/mcp-server-secure.js
```

### Working with the SDK

To develop or test the `controlweave-sdk`:

```bash
cd controlweave-sdk
# The SDK has no build step — edit src/index.js directly
# Test with:
node -e "
const { ControlWeaveLogger } = require('./src/index.js');
const logger = new ControlWeaveLogger({ apiKey: 'test', baseUrl: 'http://localhost:3001/api/v1' });
console.log('SDK loaded successfully');
"
```

## 📋 Coding Standards

### General
- Follow the existing code style in each file
- Write clear, self-documenting code
- Add comments for complex logic
- Include error handling — never swallow errors silently
- Use `const`/`let`, never `var`

### Backend (Node.js / CommonJS)
- Use CommonJS (`require`/`module.exports`), not ESM `import`/`export`
- Use the structured logger (`utils/logger.js`), not `console.log`/`console.error`
- All API routes must go through authentication middleware
- Use parameterized queries — **never** interpolate user input into SQL strings
- Follow existing route structure: validate input → call service → return response
- Write input validation using the `validate.js` middleware and schema objects

```javascript
// ✅ Good — parameterized query
const result = await pool.query('SELECT * FROM frameworks WHERE id = $1', [frameworkId]);

// ❌ Bad — SQL injection risk
const result = await pool.query(`SELECT * FROM frameworks WHERE id = '${frameworkId}'`);
```

### Database (SQL)
- Use `snake_case` for table and column names
- Always add `created_at` / `updated_at` timestamps to new tables
- Use `UUID` primary keys with `gen_random_uuid()` default
- Comment complex queries
- Test all SQL before committing
- Add a migration file in `backend/migrations/` for schema changes

### Frontend (Next.js / TypeScript)
- Use functional components with hooks
- Use TypeScript — add type annotations for all props and return values
- Follow accessibility best practices (ARIA attributes, keyboard navigation)
- Make components responsive (mobile-first with Tailwind CSS)
- Wrap pages that use `useSearchParams()` in a `<Suspense>` boundary
- Use `src/lib/api.ts` for all API calls (not raw `fetch`)

```typescript
// ✅ Good — use the API client
import { api } from '@/lib/api';
const frameworks = await api.get('/frameworks');

// ❌ Bad — bypasses auth token injection
const res = await fetch('/api/v1/frameworks');
```

### Documentation
- Use clear, concise language
- Include code examples for new features
- Add screenshots for UI features in your PR description
- Keep formatting consistent with existing docs
- Update `README.md` if adding a major new feature
- Update `RELEASE_NOTES.md` entry in your PR

## 🎯 What We Need Help With

### High Priority
- [ ] **Additional Frameworks**: GDPR, PCI DSS 4.0, CIS Controls v8, COBIT 2019, FedRAMP
- [ ] **Test Coverage**: Unit tests for backend services and route handlers
- [ ] **SBOM Integration**: AI model supply chain tracking
- [ ] **SSP Auto-Generation**: System Security Plans for NIST 800-171 / FedRAMP

### Medium Priority
- [ ] **Documentation**: Tutorials, guides, video walkthroughs
- [ ] **Framework Mappings**: More crosswalk mappings between frameworks
- [ ] **Internationalization**: Multi-language support (UI strings)
- [ ] **Deployment Guides**: Docker Compose, Kubernetes, cloud platform guides
- [ ] **SDK Enhancements**: Python SDK, Go SDK for `@controlweave/external-ai-logger`

### Always Welcome
- [ ] **Bug Fixes**: Found a bug? Submit a fix!
- [ ] **Documentation Improvements**: Typos, clarifications, examples
- [ ] **Performance Optimizations**: Query improvements, database indexing
- [ ] **Accessibility**: Improve keyboard navigation and screen reader support
- [ ] **Security Enhancements**: (Report privately first — see below)

## 🐛 Reporting Bugs

Use the [Bug Report issue template](https://github.com/sherifconteh-collab/ControlWeave/issues/new?template=bug_report.md) and include:

- **Clear title**: Describes the problem concisely
- **Description**: What happened vs. what should happen
- **Steps to reproduce**: Numbered, reproducible steps
- **Environment**: OS, Node.js version, PostgreSQL version, browser
- **Screenshots / logs**: If applicable

**Example:**
```
Title: Pagination returns duplicate records on page 2+

Description: When paginating through controls, page 2 returns the last
record of page 1 again, causing duplicates in the UI.

Steps to Reproduce:
1. Activate a framework with 30+ controls
2. Navigate to Controls → set page size to 20
3. Go to page 2
4. Notice the first record matches the last record of page 1

Environment:
- OS: Ubuntu 22.04
- Node.js: 20.11.0
- PostgreSQL: 15.2
- Browser: Chrome 122
```

## 💡 Suggesting Features

Use the [Feature Request issue template](https://github.com/sherifconteh-collab/ControlWeave/issues/new?template=feature_request.md) and include:

- **Clear title**: Describes the feature
- **Problem**: What problem does this solve?
- **Solution**: Your proposed solution
- **Alternatives**: Other solutions you considered
- **Impact**: Who benefits from this and how?

For larger features, open a [GitHub Discussion](https://github.com/sherifconteh-collab/ControlWeave/discussions) first to get community feedback before investing time in implementation.

## 📦 Contributing to the SDK

The `controlweave-sdk` (`@controlweave/external-ai-logger`) is a standalone package for logging external AI decisions into ControlWeave. Contributions welcome:

- **New methods**: e.g., `logAuditEvent()`, `logPolicyDecision()`
- **Python SDK**: A Python equivalent of the JS SDK
- **Go SDK**: A Go equivalent of the JS SDK
- **Type improvements**: Expand `ExternalDecisionPayload` in `index.d.ts`

SDK contribution guidelines:
- Keep the SDK dependency-free (no `npm install` required beyond Node.js built-ins)
- Maintain backward compatibility — don't remove or rename existing methods/fields
- Update `controlweave-sdk/README.md` for any new features
- Add a JSDoc comment for every new exported method

## 🔒 Security Issues

**IMPORTANT**: Do NOT open public issues for security vulnerabilities.

Instead, email **Contehconsulting@gmail.com** with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if you have one)

We'll acknowledge within 48 hours and aim to resolve critical issues within 7 days.

See [SECURITY.md](./SECURITY.md) for our full security policy and responsible disclosure guidelines.

## 📞 Questions?

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions, ideas, and general discussion
- **Email**: Contehconsulting@gmail.com

## 🙏 Recognition

All contributors are recognized in our release notes. Your contributions make this project better for everyone in the GRC community!

## 📝 Contributor License Agreement (CLA)

Before your first pull request can be merged you must sign the **Contributor License Agreement**.

- The agreement text is in [CLA.md](./CLA.md).
- Signing is automated: our CLA bot (powered by [`.github/workflows/cla.yml`](./.github/workflows/cla.yml)) will post a comment on your PR asking you to sign. Reply with the exact phrase shown in that comment and the bot marks you as signed.
- Signing is a **one-time** requirement — subsequent PRs are merged without any extra steps.

## 📄 License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](./LICENSE).

---

Thank you for contributing to ControlWeave! 🚀
