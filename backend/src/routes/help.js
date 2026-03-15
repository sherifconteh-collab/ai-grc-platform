// @tier: community
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { normalizeTier, tierLevel } = require('../config/tierPolicy');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);

// Rate limit: 60 help requests per minute per org (generous for documentation browsing)
const helpRateLimiter = createOrgRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  label: 'help'
});

// Docs root is the docs/ directory relative to the backend package root
const DOCS_ROOT = path.resolve(__dirname, '../../../docs');

// Tier levels for comparison
const TIER_FREE = 0;
const TIER_STARTER = 1;
const TIER_PROFESSIONAL = 2;
const TIER_ENTERPRISE = 3;

// Help article catalog — each entry declares the minimum tier required to view it.
// The slug maps to a Markdown file path relative to DOCS_ROOT.
const ARTICLE_CATALOG = [
  // ── Getting Started ──────────────────────────────────────────────────────
  {
    slug: 'getting-started',
    title: 'Getting Started',
    description: 'Your first steps with ControlWeave — account creation, org setup, and initial framework selection.',
    icon: '🚀',
    category: 'Getting Started',
    file: 'guides/GETTING_STARTED.md',
    minTier: TIER_FREE
  },
  {
    slug: 'account-setup',
    title: 'Account Setup',
    description: 'Configure your profile, organization information, and security settings.',
    icon: '👤',
    category: 'Getting Started',
    file: 'guides/ACCOUNT_SETUP.md',
    minTier: TIER_FREE
  },
  {
    slug: 'quick-wins',
    title: 'Quick Wins',
    description: 'Get immediate value from ControlWeave in your first 30 minutes.',
    icon: '🎯',
    category: 'Getting Started',
    file: 'guides/QUICK_WINS.md',
    minTier: TIER_FREE
  },
  // ── Core Features ─────────────────────────────────────────────────────────
  {
    slug: 'frameworks',
    title: 'Framework Management',
    description: 'Select, activate, and manage compliance frameworks (NIST, ISO 27001, SOC 2, and more).',
    icon: '📋',
    category: 'Core Features',
    file: 'guides/FRAMEWORKS.md',
    minTier: TIER_FREE
  },
  {
    slug: 'controls',
    title: 'Controls & Implementation',
    description: 'Track security controls, assign owners, and record implementation evidence.',
    icon: '✅',
    category: 'Core Features',
    file: 'guides/CONTROLS.md',
    minTier: TIER_FREE
  },
  {
    slug: 'settings',
    title: 'Settings & Configuration',
    description: 'Configure users, roles, integrations, LLM providers, and notifications.',
    icon: '⚙️',
    category: 'Core Features',
    file: 'guides/SETTINGS.md',
    minTier: TIER_FREE
  },
  // ── AI Features ───────────────────────────────────────────────────────────
  {
    slug: 'ai-copilot',
    title: 'AI Copilot',
    description: 'Use the conversational AI assistant for GRC questions, guidance, and quick analysis.',
    icon: '🤖',
    category: 'AI Features',
    file: 'guides/AI_COPILOT.md',
    minTier: TIER_FREE
  },
  {
    slug: 'ai-analysis',
    title: 'AI Analysis',
    description: 'Run structured AI-powered analyses — gap analysis, risk heatmaps, forecasting, and more.',
    icon: '🔍',
    category: 'AI Features',
    file: 'guides/AI_ANALYSIS.md',
    minTier: TIER_FREE
  },
  // ── Advanced Features ─────────────────────────────────────────────────────
  {
    slug: 'vulnerabilities',
    title: 'Vulnerability Management',
    description: 'Import scan results (Nessus, STIG, SARIF, IAVM), track findings, and generate AI remediation plans.',
    icon: '🛡️',
    category: 'Advanced Features',
    file: 'guides/VULNERABILITIES.md',
    minTier: TIER_FREE
  },
  {
    slug: 'financial-services',
    title: 'Financial Services Compliance',
    description: 'Reg BI alignment, SR 11-7 model inventory, FINRA supervisory audit trail, and SEC explainability narratives.',
    icon: '🏦',
    category: 'Advanced Features',
    file: 'guides/FINANCIAL_SERVICES.md',
    minTier: TIER_ENTERPRISE
  },
  {
    slug: 'auto-evidence-collection',
    title: 'Auto-Evidence Collection',
    description: 'Schedule automated evidence collection from Splunk, Microsoft Sentinel, AWS CloudTrail, and other sources.',
    icon: '🤖',
    category: 'Advanced Features',
    file: 'guides/AUTO_EVIDENCE_COLLECTION.md',
    minTier: TIER_STARTER
  },
  // ── Reference ─────────────────────────────────────────────────────────────
  {
    slug: 'tier-comparison',
    title: 'Tier Comparison',
    description: 'Full feature-by-feature comparison across Community, Pro, Enterprise, and Gov Cloud tiers.',
    icon: '📊',
    category: 'Reference',
    file: 'TIER_COMPARISON.md',
    minTier: TIER_FREE
  },
  {
    slug: 'user-guide',
    title: 'Complete User Guide',
    description: 'Full navigation guide covering every feature area with learning paths by role.',
    icon: '📚',
    category: 'Reference',
    file: 'USER_GUIDE.md',
    minTier: TIER_FREE
  }
];

function getUserTierLevel(req) {
  const tier = normalizeTier(req.user?.effectiveTier || req.user?.organization_tier);
  return tierLevel(tier);
}

/**
 * GET /api/v1/help
 * Returns the list of help articles the current user is entitled to view,
 * grouped by category.  Articles requiring a higher tier are returned but
 * marked as `locked: true` so the UI can show an upgrade prompt.
 */
router.get('/', helpRateLimiter, (req, res) => {
  const userTier = getUserTierLevel(req);

  const articles = ARTICLE_CATALOG.map(({ slug, title, description, icon, category, minTier }) => ({
    slug,
    title,
    description,
    icon,
    category,
    locked: userTier < minTier,
    minTierRequired: Object.entries({ community: 0, pro: 1, enterprise: 2, govcloud: 3 })
      .find(([, v]) => v === minTier)?.[0] || 'community'
  }));

  // Group by category preserving declaration order
  const grouped = {};
  for (const article of articles) {
    if (!grouped[article.category]) grouped[article.category] = [];
    grouped[article.category].push(article);
  }

  res.json({ success: true, data: { categories: grouped } });
});

/**
 * GET /api/v1/help/:slug
 * Returns the Markdown content of a specific help article.
 * Returns 403 if the article requires a higher tier than the user has.
 */
router.get('/:slug', helpRateLimiter, (req, res) => {
  const { slug } = req.params;
  const article = ARTICLE_CATALOG.find((a) => a.slug === slug);

  if (!article) {
    return res.status(404).json({ success: false, error: 'Article not found' });
  }

  const userTier = getUserTierLevel(req);
  if (userTier < article.minTier) {
    return res.status(403).json({
      success: false,
      error: 'This article requires a higher subscription tier.',
      minTierRequired: Object.entries({ community: 0, pro: 1, enterprise: 2, govcloud: 3 })
        .find(([, v]) => v === article.minTier)?.[0] || 'community'
    });
  }

  const filePath = path.resolve(DOCS_ROOT, article.file);

  // Prevent path traversal: resolved path must be inside DOCS_ROOT
  const relative = path.relative(DOCS_ROOT, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return res.status(400).json({ success: false, error: 'Invalid article path' });
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    // Docs directory may not be present in production deployment — serve embedded fallback
    console.warn(`Help article file not found (${article.file}), using embedded fallback:`, err.message);
    content = EMBEDDED_ARTICLES[article.slug] || null;
  }

  if (!content) {
    return res.status(404).json({ success: false, error: 'Article content not available' });
  }

  res.json({
    success: true,
    data: {
      slug: article.slug,
      title: article.title,
      icon: article.icon,
      category: article.category,
      content
    }
  });
});

// ── Embedded fallback articles ──────────────────────────────────────────────
// Served when the docs/ directory isn't mounted in the production container.
const EMBEDDED_ARTICLES = {
  'getting-started': `# 🚀 Getting Started with ControlWeave

Welcome! This guide walks you through your first steps with ControlWeave.

## Quick Setup (~10 minutes)

### 1. Create Your Account
- Navigate to the registration page and fill in your email, password, full name, and organization name
- Verify your email and log in

### 2. Select Compliance Frameworks
- Go to **Frameworks** in the sidebar
- Choose the frameworks your organization needs (e.g. NIST CSF 2.0, ISO 27001, SOC 2)
- Community tier supports up to 2 frameworks

### 3. Review Your Controls
- Navigate to **Controls** to see all controls from your selected frameworks
- Controls are grouped by family for easy navigation
- Use the search bar to find specific controls

### 4. Start Implementing
- Click on any control to expand its details
- Update the status (Not Started → In Progress → Implemented)
- When you mark a control as **Implemented**, Auto-Crosswalk automatically satisfies similar controls across other frameworks

### 5. Try AI Features
- Click **AI Analysis** for gap analysis, risk heatmaps, and compliance forecasting
- Use the **AI Copilot** (bottom-right) for quick GRC questions
- All AI features work with the platform key — no configuration needed

## Next Steps
- **Evidence**: Upload compliance artifacts and documentation
- **Assessments**: Run structured assessment procedures
- **Reports**: Generate compliance reports for stakeholders
- **Settings**: Configure users, roles, and integrations`,

  'account-setup': `# 👤 Account Setup

Configure your profile, organization, and security settings.

## Profile Settings
- Navigate to **Settings → Account**
- Update your display name, email, and notification preferences
- Update your sign-in credentials under the Security section

## Organization Profile
- Go to **Organization Profile** in the sidebar
- Set your organization name, industry, and size
- Define your compliance scope and boundary

## User Management
- Navigate to **Settings → Roles & Permissions**
- Invite team members and assign roles (Admin, Analyst, Auditor, Viewer)
- Each role has specific permissions for controls, evidence, and reporting

## Security
- Enable multi-factor authentication for enhanced security
- Configure session timeout and credential policies
- Review audit logs under **Settings → Audit Logs**`,

  'quick-wins': `# 🎯 Quick Wins

Get immediate value from ControlWeave in your first 30 minutes.

## 5-Minute Wins
1. **Select your top framework** — Go to Frameworks and activate your primary compliance framework
2. **Run AI Gap Analysis** — Click AI Analysis → Gap Analysis for an instant compliance assessment
3. **Ask the AI Copilot** — Use the chat widget to ask "What are my highest priority controls?"

## 15-Minute Wins
4. **Implement 3 controls** — Mark your easiest controls as Implemented and watch Auto-Crosswalk work
5. **Upload evidence** — Drop a policy document into the Evidence section
6. **Review your dashboard** — Check compliance percentage and maturity score

## 30-Minute Wins
7. **Set up your team** — Invite colleagues and assign control owners
8. **Run a full assessment** — Use Assessments to test controls against procedures
9. **Generate a report** — Export a compliance summary for management`,

  'frameworks': `# 📋 Framework Management

Select, activate, and manage compliance frameworks.

## Selecting Frameworks
- Navigate to **Frameworks** in the sidebar
- Browse available frameworks by category (Cybersecurity, Privacy, Financial, AI Governance)
- Click **Activate** to add a framework to your organization
- Community tier: up to 2 frameworks | Pro+: unlimited

## Supported Frameworks
- **NIST CSF 2.0** — Cybersecurity Framework with 6 core functions
- **NIST 800-53 Rev 5** — Security and privacy controls for information systems
- **ISO 27001:2022** — Information security management system
- **SOC 2** — Trust Service Criteria for service organizations
- **NIST 800-171** — Protecting CUI in non-federal systems
- **CMMC Level 2** — DoD contractor cybersecurity maturity
- **GDPR** — EU data protection regulation
- **HIPAA** — Healthcare security requirements
- And 15+ more frameworks

## Auto-Crosswalk
When you implement a control in one framework, ControlWeave automatically finds matching controls (90%+ similarity) in other frameworks and marks them as satisfied. This dramatically reduces duplicate work across multi-framework environments.

## Framework Progress
Track implementation progress per framework on the Dashboard with real-time percentage completion.`,

  'controls': `# ✅ Controls & Implementation

Track security controls, assign owners, and record implementation evidence.

## Viewing Controls
- Controls are organized by **Control Family** (e.g., AC - Access Control, AU - Audit)
- Filter by framework, status, or search by ID/title
- Expand any control to see its full description and implementation details

## Control Statuses
- **Not Started** — Control has not been addressed
- **In Progress** — Implementation is underway
- **Implemented** — Control is fully implemented (triggers Auto-Crosswalk)
- **Needs Review** — Implementation complete, awaiting review
- **Verified** — Implementation verified by assessor
- **Satisfied via Crosswalk** — Automatically satisfied by a related control
- **Not Applicable** — Control does not apply to your environment

## Implementing Controls
1. Click a control to expand its details
2. Select a new status from the dropdown
3. Add implementation notes describing how the control is met
4. Assign an owner responsible for the control
5. Link evidence artifacts from the Evidence section

## Auto-Crosswalk
When you mark a control as **Implemented**, Auto-Crosswalk automatically finds matching controls (90%+ similarity) across other active frameworks and marks them as **Satisfied via Crosswalk**. Use the 🔗 Crosswalk button to re-run inheritance manually.

## Import / Export
- **Export XLSX/CSV** — Download all controls with current statuses for offline review
- **Import** — Upload updated statuses and notes back into ControlWeave
- Use Merge mode to preserve existing data while updating changed fields`,

  'settings': `# ⚙️ Settings & Configuration

Configure users, roles, integrations, LLM providers, and notifications.

## Plan & Billing
View your current tier, usage limits, and upgrade options.

## Roles & Permissions
- **Admin** — Full access to all features and settings
- **Analyst** — Read/write access to controls, evidence, and assessments
- **Auditor** — Read access with assessment and finding capabilities
- **Viewer** — Read-only access to dashboards and reports

## AI / LLM Configuration
- Configure AI providers (OpenAI, Anthropic, Google, etc.)
- Set organization-level BYOK (Bring Your Own Key) for AI features
- Manage AI usage limits per tier

## Integrations
- Connect external tools and services
- Configure webhook endpoints for event notifications
- Set up SSO/SAML for enterprise authentication

## Notifications
- Configure email notification preferences
- Set alert thresholds for compliance changes
- Enable real-time notifications for control updates`,

  'ai-copilot': `# 🤖 AI Copilot

Use the conversational AI assistant for GRC questions, guidance, and quick analysis.

## Getting Started
The AI Copilot is available via the chat widget in the bottom-right corner of every page. It has full context about your organization's compliance posture.

## What You Can Ask
- "What are my highest risk controls?"
- "Draft a policy for access control"
- "Explain the difference between NIST 800-53 AC-2 and ISO 27001 A.5.15"
- "What evidence do I need for SOC 2 CC6.1?"
- "Summarize my compliance gaps"

## How It Works
The Copilot uses your organization's data (frameworks, controls, evidence, assessments) to provide contextual, accurate answers. It supports multiple AI providers and respects your BYOK configuration.

## Tips
- Be specific in your questions for better answers
- Reference control IDs when asking about specific requirements
- Use "Draft a policy for..." to generate policy templates
- The Copilot remembers context within a conversation session`,

  'ai-analysis': `# 🔍 AI Analysis

Run structured AI-powered analyses for compliance insights.

## Available Analyses
- **Gap Analysis** — Identify unaddressed controls and compliance gaps
- **Risk Heatmap** — Visual risk assessment across control families
- **Compliance Forecast** — Predict compliance trajectory based on current progress
- **Audit Readiness** — Assess preparedness for upcoming audits
- **Crosswalk Optimizer** — Find opportunities to reduce duplicate compliance work
- **Evidence Mapper** — Map evidence artifacts to control requirements

## Parallel AI Analysis (Pro+)
Run multiple analyses simultaneously in a single click:
- **Full Assessment** — Gap analysis + forecast + risk heatmap + audit readiness
- **Risk Assessment** — Risk heatmap + gap analysis
- **Audit Preparation** — Audit readiness + gap analysis + crosswalk optimization

## Using AI Analysis
1. Navigate to **AI Analysis** in the sidebar
2. Select the analysis type you want to run
3. Click **Run** and wait for results (typically 10-30 seconds)
4. Review the detailed findings and recommendations
5. Export or share results with your team`,

  'vulnerabilities': `# 🛡️ Vulnerability Management

Import scan results, track findings, and generate AI-powered remediation plans.

## Importing Vulnerabilities
Supported formats:
- **Nessus** (.nessus XML files)
- **STIG** (STIG Viewer checklists)
- **SARIF** (Static analysis results)
- **IAVM** (Information Assurance Vulnerability Management)
- **CSV** (Generic vulnerability data)

## Tracking Findings
- View all vulnerabilities with CVSS scores and severity ratings
- Filter by severity (Critical, High, Medium, Low, Informational)
- Link vulnerabilities to affected assets in the CMDB
- Track remediation status and due dates

## AI Remediation Plans
- Click **Generate Remediation Plan** on any vulnerability
- AI analyzes the vulnerability context and suggests specific remediation steps
- Plans include priority, estimated effort, and control mappings

## Requirements
- Vulnerability features require Pro tier or higher
- AI remediation plans use your configured AI provider`,

  'tier-comparison': `# 📊 Tier Comparison

Feature-by-feature comparison across all ControlWeave tiers.

## Community Tier (Free / AGPL)
- Up to 2 compliance frameworks
- Unlimited AI requests (BYOK — bring your own API key)
- Core dashboard, controls, and assessments
- AI Copilot with basic context
- Community support
- Full source code access

## Pro Tier ($499/mo)
- Unlimited frameworks
- Unlimited AI requests per month
- Full CMDB with unlimited assets
- Vulnerability management
- Evidence management and reporting
- Auto-evidence collection (Splunk; connectors coming soon)
- AI-powered evidence suggestions with approve/reject workflow
- SSO (SAML / OIDC)
- 48-hour support SLA

## Enterprise Tier ($3,500–$12,000/mo)
- Everything in Pro
- AI impact assessment (ISO 42005)
- Auditor workspace
- Knowledge Base (RAG) for AI enrichment
- Advanced AI analysis features
- Parallel multi-agent AI analysis
- TPRM module
- Custom SLAs
- Dedicated CSM
- Priority support

## Gov Cloud Tier (Custom)
- Everything in Enterprise
- FedRAMP / FISMA / StateRAMP compliance
- IL4 / IL5 data sovereignty
- ITAR-compliant hosting
- Dedicated infrastructure
- SLA-backed uptime guarantee
- Financial Services AI Governance workspace
- FINRA / SEC / SR 11-7 compliance frameworks`,

  'user-guide': `# 📚 Complete User Guide

Full navigation guide covering every feature area.

## Dashboard
Your compliance command center showing KPIs, maturity score, framework progress, and recent activity. The Auto-Crosswalk counter shows how many controls are automatically satisfied.

## Controls
Browse, search, and manage all compliance controls. Group by framework or control family. Update implementation status and assign owners. Statuses: Not Started, In Progress, Implemented, Needs Review, Verified, Satisfied via Crosswalk, Not Applicable.

## Frameworks
Select and manage your active compliance frameworks. View framework-specific progress and requirements. Supported: NIST 800-53, ISO 27001, SOC 2, NIST CSF, CMMC, GDPR, HIPAA, PCI-DSS, and 15+ more.

## Evidence
Upload, organize, and link compliance evidence to controls. Supports 19+ file formats including PDF, DOCX, XLSX, CSV, JSON, and FPR (Fortify). Auto-Evidence Collection supports Splunk, Microsoft Sentinel, AWS CloudTrail, CrowdStrike, Jira, ITSM platforms, and GitHub.

### AI Evidence Suggestions
ControlWeave's AI can scan your connected integrations (e.g., Splunk), analyze logs and events against your active compliance frameworks, and suggest evidence items mapped to the correct controls. Each suggestion includes a confidence score and control mappings.

**How it works:**
1. Go to the Evidence page → AI Evidence Suggestions section
2. Click **🔍 Scan Integrations** — AI scans Splunk audit logs, authentication events, and auto-collection rule data
3. Review each suggestion's title, description, confidence score, and mapped controls
4. Click **✓ Approve** to promote to your official evidence library, or **✗ Reject** to dismiss

Token-efficient: AI evidence scans use a lightweight prompt that sends only the data needed for control mapping — no unnecessary overhead on your API credits.

Available for **Pro+** tiers. API: \`POST /api/v1/pending-evidence/scan\`

## Assets (CMDB)
Track hardware, software, AI agents, and service accounts. Link assets to controls for complete traceability.

## Assessments
Run structured assessment procedures against controls. Document findings and track remediation.

## Reports
Generate compliance reports, export data, and share progress with stakeholders.

## AI Features
- **AI Copilot** — Conversational GRC assistant
- **AI Analysis** — Gap analysis, crosswalk optimizer, compliance forecast, audit readiness, risk heatmap, vendor risk, evidence suggestions, and more
- **AI Evidence Suggestions** — Scan integrations and suggest evidence mapped to controls (Pro+)
- **AI Monitoring** — Track AI usage, decisions, and bias reviews
- **AI Governance** — Third-party AI vendor risk, model risk, supply chain tracking (Enterprise+)
- **Knowledge Base** — Organization document search with RAG (Enterprise+)

All AI features use a token-efficient modular prompt system — each feature receives only the reference context it needs, reducing token usage by 50–80%.

## Settings
Configure users, roles, integrations, AI providers, and notifications.

## Vendor & Third-Party Risk
- **Vendor Risk** — Track vendor contracts, SLAs, and risk assessments
- **Third-Party Risk (TPRM)** — Questionnaires, document requests, AI-generated security assessments
- **Threat Intelligence** — CVE tracking, CISA KEV, and threat feeds

## Financial Services Compliance
Gov Cloud-tier workspace for financial institutions: Reg BI alignment, SR 11-7 model inventory, FINRA supervisory audit trail, and SEC explainability narratives.

## Report an Issue
Use the **Report Issue** link in the sidebar or the **Issues** tab in the Help Center to submit bugs, feature requests, or problems. Reports are automatically forwarded to our development team for review.`,

  'financial-services': `# 🏦 Financial Services Compliance Workspace

Specialized compliance tools for financial institutions using AI in advisory, trading, and client-facing operations.

## Access
The Financial Services Compliance Workspace is available on the **Gov Cloud** tier. Navigate to **Financial Compliance** in the sidebar or **Assets → Financial Compliance Workspace** in the CMDB.

## Reg BI Alignment
Track best-interest obligation alignment for AI-powered recommendations:
- **Best-Interest Obligation Disclosure** — AI recommendations include conflicts-of-interest disclosure
- **Care Obligation — Suitability** — Model validates customer risk profile before recommendation
- **Conflict of Interest Identification** — Automated detection of proprietary product bias
- **Customer Communication Review** — Supervisory pre-review of AI-generated communications
- **Algorithmic Trading Surveillance** — Real-time monitoring of AI trading decisions

## SR 11-7 Model Inventory
Maintain a model risk inventory per Federal Reserve SR 11-7 guidance:
- Track model name, risk tier (critical/high/medium/low), last validation date, and validation status
- Identify overdue validations and pending reviews
- Link models to CMDB AI Agent records for traceability

## FINRA Supervisory Audit Trail
Log supervisory review actions for AI-generated content per FINRA Notice 24-09:
- Enter supervisory review notes describing actions taken and AI output reviewed
- Each entry is timestamped, attributed to the reviewer, and immutable once logged
- View the full audit trail of logged entries directly in the workspace
- Entries are stored in the organization audit log for regulatory examination

## SEC Explainability Narrative Generator
Generate compliance narratives for SEC filings and examinations:
- AI-powered narrative generation explaining how AI is used in operations
- Covers Reg BI alignment, SR 11-7 model risk, and FINRA obligations
- Narratives are generated using the configured LLM provider
- Review and edit before submission

## Cross-Framework Crosswalk
Financial services frameworks (FINRA, SEC, SR 11-7) are pre-crosswalked to NIST AI RMF. Evidence collected for your AI RMF programme automatically satisfies overlapping requirements.

## Tips
- Use the FINRA Audit Trail regularly to document every supervisory review of AI-generated content
- Run the SEC Narrative Generator before regulatory examinations
- Check SR 11-7 validation statuses monthly to avoid overdue reviews`,

  'auto-evidence-collection': `# 🤖 Auto-Evidence Collection

Schedule automated evidence collection from integrated sources on a recurring basis.

## Source Categories

### 🛡️ SIEM & Security
- **Splunk** — Import search results from Splunk Enterprise or Splunk Cloud. Evidence: failed login reports, firewall deny logs, privileged access audits, correlation search results.
- **Microsoft Sentinel** — Collect security incidents, analytics rule matches, and hunting query results from Azure Sentinel. Evidence: security incidents, analytics rule matches, threat hunting results, watchlist alerts.
- **CrowdStrike Falcon** — Collect endpoint detection and response (EDR) data. Evidence: threat detections, endpoint compliance status, vulnerability assessments, device inventory snapshots.

### ☁️ Cloud Platforms
- **AWS CloudTrail** — Import API activity logs, resource change events, and governance evidence from AWS. Evidence: IAM policy changes, S3 bucket access logs, EC2 instance lifecycle events, root account activity.

### 🔧 DevOps & SCM
- **Jira** — Import issues, epics, and project tracking data. Evidence: change request tickets, risk register issues, remediation task status, sprint completion reports.
- **GitHub** — Import repository audit logs, PR review approvals, code scanning alerts, and Dependabot vulnerability data. Evidence: PR review approvals (code review evidence), Dependabot security alerts, CodeQL results (SAST evidence), repository audit log (access changes, branch protections).

### 🎫 IT Service Management
- **ITSM Platform** — Collect ITSM records including incidents, change requests, and configuration items. Evidence: incident records, change request approvals, CMDB configuration items, problem management records.

### 🔌 Custom
- **Custom Connector** — Use webhooks or API integrations to push evidence from any external source.

## Creating a Rule
1. Navigate to **Evidence** in the sidebar
2. Scroll to **Auto-Collection Rules**
3. Click **+ New Rule**
4. Configure:
   - **Name**: Descriptive rule name
   - **Source**: Select from SIEM, Cloud, DevOps, ITSM, or Custom category
   - **Schedule**: Manual, Daily, Weekly, or Monthly
   - **Source Config**: Fill in source-specific fields (queries, filters, repositories, etc.)
   - **Tags**: Add tags for organization
5. Click **Create Rule**

## How It Works
Evidence is collected as a JSON file containing the search/query results and metadata (rule name, timestamp, source, category). Files are stored in your evidence library and can be linked to controls. For scheduled rules, the next run is computed automatically after each collection.

## Requirements
- Auto-Evidence Collection requires Pro tier or higher
- Each source must be configured in **Settings → Integrations** before use
- Splunk requires base URL and API token
- Cloud sources (Sentinel, CloudTrail) require appropriate API credentials
- GitHub requires a personal access token with appropriate scopes`
};

module.exports = router;
