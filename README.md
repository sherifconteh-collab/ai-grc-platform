# ControlWeave - Community Edition

**Open-source multi-framework Governance, Risk, and Compliance platform with AI governance support**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Edition: Community](https://img.shields.io/badge/Edition-Community-green.svg)](./EDITIONS.md)

## What is ControlWeave?

ControlWeave is a comprehensive GRC (Governance, Risk & Compliance) platform designed for modern organizations managing multiple compliance frameworks. Built to be:

- **Multi-Framework**: Supports 8+ major frameworks out of the box (528+ controls)
- **AI-Ready**: Deep integration with NIST AI RMF and ISO 42001
- **Open Source**: MIT licensed, self-hostable, transparent
- **Enterprise-Grade**: Designed for real compliance workflows with RBAC and audit logging

> **Looking for managed hosting, SSO, advanced integrations, or enterprise support?**
> Check out [ControlWeaver-Pro](https://github.com/sherifconteh-collab/ControlWeaver-Pro) - our professional edition. See [EDITIONS.md](./EDITIONS.md) for a full comparison.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/sherifconteh-collab/ControlWeave.git controlweave
cd controlweave

# Backend setup
cd backend
npm install
cp .env.example .env    # Configure your database connection
npm run seed            # Seeds database with frameworks and controls
npm start               # Starts on port 3001

# Frontend setup (in new terminal)
cd frontend
npm install
npm run dev             # Starts on port 3000
```

**First login:** Visit http://localhost:3000/register to create your account.

## Supported Frameworks

### Fully Implemented
| Framework | Controls | Description |
|-----------|----------|-------------|
| **NIST CSF 2.0** | 106 | Cybersecurity Framework 2.0 (6 functions) |
| **NIST AI RMF** | 97 | AI Risk Management Framework (4 functions) |
| **NIST SP 800-171** | 110 | Protecting Controlled Unclassified Information |
| **NIST SP 800-53 Rev 5** | 90+ | Security and Privacy Controls (MODERATE baseline) |
| **ISO 27001:2022** | 93 | Information Security Management |
| **SOC 2** | 64+ | Trust Service Criteria |
| **FISCAM** | 50+ | Federal Information System Controls |
| **FFIEC** | 50+ | Financial Institutions Examination |

### Coming Soon
- HIPAA Security Rule
- GDPR
- PCI DSS 4.0
- CIS Controls v8

## Key Features

### Auto-Crosswalk Technology
When you implement ONE control, ControlWeave automatically identifies and satisfies similar controls across other frameworks. With 80+ pre-built mappings at 90%+ similarity, this reduces your compliance workload by 40-60%.

Example: Implement NIST CSF "GV.OC-01" and auto-satisfy ISO 27001 "A.5.1.1" + SOC 2 "CC1.1".

### Compliance Dashboard
- Overall compliance percentage with per-framework breakdown
- Control implementation status tracking
- Priority controls and action items
- Activity feed and insights

### Control Management
- Browse and search across all 528+ controls
- Filter by framework, status, priority, control type
- View crosswalk mappings for each control
- Track implementation status (not_started, in_progress, implemented, verified)

### Evidence Management
- Upload and link evidence files to controls
- Tag and describe evidence
- Version tracking
- Multi-control linking

### Role-Based Access Control
| Role | Access |
|------|--------|
| **Admin** | Full access - user management, settings, audit logs |
| **Auditor** | Read-only controls/evidence, audit log export |
| **Implementer** | Create/update implementations, upload evidence |
| **Viewer** | Read-only dashboard access |

### Security
- JWT authentication with refresh token rotation
- bcrypt password hashing (12 rounds)
- Helmet.js HTTP security headers
- CORS with configurable origins
- Rate limiting (5 auth / 100 API requests per 15 min)
- AU-2 compliant audit logging

## Architecture

```
controlweave/
├── backend/              # Express.js API server (Node.js)
│   ├── src/
│   │   ├── index.js     # Main server entry point
│   │   ├── routes/      # API route handlers
│   │   ├── middleware/   # Auth, RBAC middleware
│   │   ├── services/    # Business logic
│   │   ├── config/      # Database configuration
│   │   └── utils/       # Audit logger, helpers
│   └── migrations/      # Database migrations
├── frontend/             # Next.js 16 + React 19 + TypeScript
│   └── src/
│       ├── app/         # Pages (dashboard, controls, evidence, etc.)
│       ├── components/  # Shared components
│       ├── contexts/    # Auth context
│       └── lib/         # API client
├── db/                   # PostgreSQL schema + seed data
│   ├── schema.sql       # 25+ tables
│   └── seeds/           # 8 framework seed files (528+ controls)
└── docs/                 # Additional documentation
```

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js, Express 5, PostgreSQL 14+ |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| State | Zustand, TanStack React Query |
| Auth | JWT (jsonwebtoken), bcrypt |
| Charts | Recharts |
| Forms | React Hook Form + Zod |

## API Endpoints

All endpoints require JWT authentication (except `/api/v1/auth/*`).

```
Auth:           POST /api/v1/auth/register, /login, /logout, /refresh
Frameworks:     GET  /api/v1/frameworks, /:code, /:code/controls
Controls:       GET  /api/v1/controls/:id/mappings
Search:         GET  /api/v1/search/controls?q=mfa
Implementations: GET/POST/PUT/DELETE /api/v1/implementations
Evidence:       GET/POST/PUT/DELETE /api/v1/evidence
Dashboard:      GET  /api/v1/dashboard/stats
Organizations:  GET/POST /api/v1/organizations/:orgId/frameworks
Roles:          GET/POST/PUT/DELETE /api/v1/roles
Users:          GET/POST/DELETE /api/v1/users
Audit:          GET  /api/v1/audit/logs, /logs/export
Crosswalks:     GET  /api/v1/stats/crosswalks
```

## What Makes This Different?

| Feature | ControlWeave | Vanta/Drata | Hyperproof | OneTrust |
|---------|-------------|-------------|------------|----------|
| Cost | **Free** | $30K-200K/yr | $50K-150K/yr | $100K+/yr |
| Open Source | Yes | No | No | No |
| Self-Hosted | Yes | No | No | No |
| Auto-Crosswalk | Yes | No | No | No |
| AI Governance (NIST AI RMF) | Yes | No | No | No |
| Framework Count | 8+ | Varies | Varies | Varies |

## ControlWeave vs ControlWeaver-Pro

This is the **Community Edition** - free, open-source, fully functional for self-hosting.

For managed hosting, enterprise features, and professional support, see [ControlWeaver-Pro](https://github.com/sherifconteh-collab/ControlWeaver-Pro).

| Feature | Community (Free) | Pro (Paid) |
|---------|-----------------|------------|
| All 8+ frameworks & 528+ controls | Included | Included |
| Auto-crosswalk mappings | Included | Included |
| Dashboard & RBAC | Included | Included |
| Evidence management | Included | Included |
| Audit logging | Included | Included |
| Self-hosting | Yes | Yes + Managed |
| SSO (SAML, OAuth, Okta) | - | Included |
| Jira/ServiceNow/Slack integrations | - | Included |
| SSP auto-generation | - | Included |
| SBOM & CMDB integration | - | Included |
| Custom framework builder | - | Included |
| Advanced analytics & reports | - | Included |
| AI-powered policy generation | - | Included |
| Priority support & SLA | - | Included |
| White-label / custom branding | - | Included |

See [EDITIONS.md](./EDITIONS.md) for the full comparison.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Areas We Need Help
- Additional framework implementations (HIPAA, GDPR, PCI DSS)
- Frontend improvements
- API development
- Documentation
- Testing
- Control mapping between frameworks

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/sherifconteh-collab/ControlWeave/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sherifconteh-collab/ControlWeave/discussions)
- **Email**: Contehconsulting@gmail.com
- **Pro Support**: Available with [ControlWeaver-Pro](https://github.com/sherifconteh-collab/ControlWeaver-Pro)

## Stats

- **Frameworks**: 8+ fully implemented
- **Controls**: 528+ in database
- **Crosswalk Mappings**: 80+
- **Database Tables**: 25+
- **API Endpoints**: 50+
- **License**: MIT (free forever)

---

**Built by Conteh Consulting LLC**

*Making compliance accessible to everyone*
