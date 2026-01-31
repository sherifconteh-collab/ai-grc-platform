# Phase 2 Feature Roadmap

## Overview
Building on Phase 1 (authentication, frameworks, controls, auto-crosswalk), Phase 2 focuses on advanced compliance automation and evidence management.

---

## 🎯 Priority Features

### 1. Auditor Assessment & Attestation Letters
**Problem**: Organizations need formal attestation reports (like SOC 2) for compliance verification

**Solution**:
- **Auditor Portal**: Separate login for external auditors
- **Assessment Workflow**:
  1. Organization invites auditor (email + role assignment)
  2. Auditor reviews control implementations
  3. Auditor marks controls as "verified", "not verified", or "requires remediation"
  4. Auditor adds assessment notes and evidence review comments
- **Attestation Report Generation**:
  - PDF report with auditor signature
  - SOC 2-style format (Type I or Type II)
  - Include: scope, controls tested, results, exceptions, recommendations
  - Customizable templates for different frameworks
- **Audit Trail**: All auditor actions logged with timestamps (AU-2 compliant)

**Database Changes**:
```sql
-- Auditor assessments table
CREATE TABLE control_assessments (
    id UUID PRIMARY KEY,
    control_id UUID REFERENCES framework_controls(id),
    organization_id UUID REFERENCES organizations(id),
    auditor_id UUID REFERENCES users(id),
    assessment_status VARCHAR(50), -- verified, not_verified, requires_remediation
    assessment_notes TEXT,
    evidence_reviewed JSONB, -- List of evidence files reviewed
    assessment_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attestation reports
CREATE TABLE attestation_reports (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    auditor_id UUID REFERENCES users(id),
    framework_ids UUID[], -- Which frameworks are covered
    report_type VARCHAR(50), -- soc2_type1, soc2_type2, iso27001_audit, custom
    scope TEXT, -- What was audited
    assessment_period_start DATE,
    assessment_period_end DATE,
    total_controls INTEGER,
    controls_verified INTEGER,
    controls_failed INTEGER,
    exceptions TEXT,
    recommendations TEXT,
    pdf_url TEXT, -- S3/storage location
    signed BOOLEAN DEFAULT FALSE,
    signature_data JSONB, -- Digital signature info
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints**:
- `POST /api/v1/auditors/invite` - Invite auditor
- `GET /api/v1/auditors/controls` - Get controls to assess
- `PUT /api/v1/auditors/controls/:id/assess` - Submit assessment
- `POST /api/v1/reports/attestation` - Generate report
- `GET /api/v1/reports/attestation/:id/pdf` - Download PDF

---

### 2. Readiness Mode with Evidence Upload
**Problem**: New companies without existing policies struggle with compliance from scratch

**Solution**: AI-powered policy & control generation from uploaded evidence

**How It Works**:

#### Step 1: Evidence Upload
Upload any of these evidence types:
- **STIG Checklist Results** (.ckl, .xml)
- **ACAS/Nessus Scans** (.nessus)
- **SBOM Files** (CycloneDX, SPDX formats)
- **Vulnerability Scan Reports** (Qualys, Rapid7, etc.)
- **Configuration Files** (AWS Config, Azure Policies, etc.)
- **Existing Documentation** (PDFs, Word docs)

#### Step 2: AI Analysis
System analyzes evidence and:
1. **Identifies current security posture**
   - What controls are already in place
   - What vulnerabilities exist
   - What components are in use

2. **Maps to frameworks**
   - STIG findings → NIST 800-53 controls
   - SBOM components → SR-family controls (supply chain)
   - Vuln scans → RA-family controls (risk assessment)

3. **Generates policies**
   - Access control policy (if IAM evidence found)
   - Vulnerability management policy (if scan data found)
   - Supply chain policy (if SBOM found)
   - Incident response plan (based on framework requirements)

#### Step 3: Policy Customization
- AI-generated drafts presented for review
- User can edit and customize
- Automatically linked to relevant controls

#### Step 4: Gap Analysis
System shows:
- ✅ Controls satisfied by existing evidence
- ⚠️  Controls partially satisfied (recommendations)
- ❌ Controls not satisfied (required actions)

**Technology Stack**:
- **File Upload**: Multipart form uploads to S3/Azure Blob
- **Parsing**:
  - STIG: XML parser for .ckl files
  - SBOM: CycloneDX/SPDX libraries
  - Nessus: .nessus XML parser
- **AI Analysis**: OpenAI GPT-4 or Claude for policy generation
- **Template Engine**: Handlebars/Mustache for policy templates

**Database Changes**:
```sql
-- Evidence files
CREATE TABLE evidence_files (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    file_type VARCHAR(50), -- stig, sbom, nessus, qualys, pdf, docx
    file_name VARCHAR(255),
    file_url TEXT, -- S3/storage location
    file_size BIGINT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    processing_status VARCHAR(50), -- pending, processing, completed, failed
    processing_results JSONB, -- AI analysis results
    linked_controls UUID[] -- Controls automatically satisfied by this evidence
);

-- Generated policies
CREATE TABLE generated_policies (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    policy_type VARCHAR(100), -- access_control, vuln_mgmt, supply_chain, etc.
    policy_title VARCHAR(255),
    policy_content TEXT, -- Generated policy text
    framework_mappings JSONB, -- Which frameworks this policy addresses
    evidence_source UUID[], -- Which evidence files were used to generate this
    ai_generated BOOLEAN DEFAULT TRUE,
    reviewed BOOLEAN DEFAULT FALSE,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Policy templates
CREATE TABLE policy_templates (
    id UUID PRIMARY KEY,
    template_name VARCHAR(255),
    template_type VARCHAR(100),
    framework_id UUID REFERENCES frameworks(id),
    template_content TEXT, -- Handlebars template
    variables JSONB, -- Required variables: {org_name, industry, etc.}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints**:
- `POST /api/v1/evidence/upload` - Upload evidence file
- `GET /api/v1/evidence/:id/status` - Check processing status
- `GET /api/v1/evidence/:id/results` - Get AI analysis results
- `POST /api/v1/policies/generate` - Trigger policy generation from evidence
- `GET /api/v1/policies` - List generated policies
- `PUT /api/v1/policies/:id` - Edit policy
- `POST /api/v1/policies/:id/approve` - Approve policy
- `GET /api/v1/readiness/gap-analysis` - Get gap analysis report

---

### 3. SBOM Integration (NIST 800-53 SR Controls)
**Part of Readiness Mode, but deserves special focus**

**SR Control Family Coverage**:
- **SR-3**: Supply Chain Controls
  - Ingest SBOM → Identify all components
  - Track component versions
  - Alert on vulnerable components (CVE matching)
- **SR-4**: Provenance
  - Verify component origins from SBOM metadata
  - Check signatures (if SBOM is signed)
- **SR-5**: Acquisition Strategies
  - Recommend secure alternatives for risky components
- **SR-11**: Component Authenticity
  - Validate checksums from SBOM

**SBOM Features**:
- **Ingestion**: Parse CycloneDX and SPDX formats
- **Visualization**: Dependency tree view
- **Vulnerability Scanning**: Match components against NVD
- **License Compliance**: Flag GPL/copyleft issues
- **Continuous Monitoring**: Re-scan on new CVE disclosures

**Database Changes**:
```sql
-- SBOM records
CREATE TABLE sboms (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    sbom_format VARCHAR(20), -- cyclonedx, spdx
    sbom_version VARCHAR(20),
    software_name VARCHAR(255),
    software_version VARCHAR(100),
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sbom_data JSONB, -- Full SBOM content
    component_count INTEGER,
    vulnerability_count INTEGER
);

-- Components from SBOM
CREATE TABLE sbom_components (
    id UUID PRIMARY KEY,
    sbom_id UUID REFERENCES sboms(id),
    component_name VARCHAR(255),
    component_version VARCHAR(100),
    component_type VARCHAR(50), -- library, application, framework
    supplier VARCHAR(255),
    license VARCHAR(100),
    purl TEXT, -- Package URL
    cpe TEXT, -- Common Platform Enumeration
    vulnerabilities JSONB, -- Array of CVEs
    risk_level VARCHAR(20) -- critical, high, medium, low
);
```

---

### 4. Privacy Frameworks (GDPR, NIST Privacy Framework)
**Requested by user for open-source compliance needs**

**Frameworks to Add**:
1. **GDPR** (EU General Data Protection Regulation)
   - ~50 controls covering: lawfulness, consent, data subject rights, breach notification
2. **NIST Privacy Framework** (5 functions: Identify-P, Govern-P, Control-P, Communicate-P, Protect-P)
   - ~100 controls

**Privacy-Specific Features**:
- **Data Inventory**: Track what PII/PHI is collected
- **Data Flow Mapping**: Where data moves
- **Consent Management**: Track user consents
- **Data Subject Rights**: Handle access/deletion requests
- **Privacy Impact Assessments (PIAs)**

---

### 5. CMDB (Configuration Management Database)
**Problem**: Organizations need to track full software/hardware lifecycles for compliance and asset management

**Solution**: Comprehensive asset tracking integrated with compliance controls

**Asset Types**:
1. **Hardware Assets**
   - Servers, workstations, network devices, mobile devices
2. **Software Assets**
   - Applications, databases, middleware, SaaS tools
3. **AI/ML Systems** (Special focus given AI RMF framework)
   - Models, datasets, training infrastructure
4. **Cloud Resources**
   - AWS/Azure/GCP instances, containers, serverless functions

**Tracking Fields Per Asset**:
```
- Asset Name & ID
- Owner (individual/team)
- Location (physical/virtual/cloud)
- Environment (dev/test/staging/prod)
- Purpose/Function (what it does)
- Criticality Level (critical/high/medium/low)
- Status (active/inactive/decommissioned)
- Privileges & Access (admin accounts, service accounts)
- Dependencies (what it connects to)
- Password Vault Integration (link to credentials)
- Compliance Mappings (which controls this asset satisfies)
- Vulnerability Status (from scans)
- Patch Level
- End-of-Life Date
- Cost/License Info
```

**AI System-Specific Fields**:
```
- Model Type (LLM, computer vision, etc.)
- Training Data Source & Lineage
- Inference Environment
- Model Version & Registry
- Bias Testing Results
- Explainability Method
- Data Retention Policy
- Third-Party Model Dependencies (OpenAI, Anthropic, etc.)
```

**CMDB ↔ Controls Integration**:
- **CM-8 (System Component Inventory)**: Auto-populate from CMDB
- **CM-2 (Baseline Configuration)**: Track configuration baselines per asset
- **SA-9 (External System Services)**: Flag third-party/SaaS assets
- **SR-3 (Supply Chain Controls)**: Link to SBOM for software assets
- **AI-RMF GOVERN**: Track AI system governance

**Database Schema**:
```sql
-- Assets table
CREATE TABLE assets (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    asset_type VARCHAR(50), -- hardware, software, ai_system, cloud_resource
    asset_name VARCHAR(255) NOT NULL,
    asset_id VARCHAR(100) UNIQUE, -- User-defined asset ID
    owner_id UUID REFERENCES users(id),
    location VARCHAR(255), -- Physical location or cloud region
    environment VARCHAR(50), -- dev, test, staging, prod
    purpose TEXT, -- What this asset does
    criticality_level VARCHAR(20), -- critical, high, medium, low
    status VARCHAR(50), -- active, inactive, decommissioned
    privileges JSONB, -- {admin_accounts: [], service_accounts: []}
    dependencies UUID[], -- Array of related asset IDs
    password_vault_ref TEXT, -- Reference to password vault entry
    compliance_controls UUID[], -- Controls this asset helps satisfy
    vulnerability_summary JSONB, -- {critical: 2, high: 5, medium: 10}
    patch_level VARCHAR(100),
    eol_date DATE, -- End of life
    cost_center VARCHAR(100),
    license_info TEXT,
    metadata JSONB, -- Flexible field for asset-specific data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI-specific asset details
CREATE TABLE ai_systems (
    id UUID PRIMARY KEY,
    asset_id UUID REFERENCES assets(id),
    model_type VARCHAR(100), -- llm, computer_vision, nlp, etc.
    model_name VARCHAR(255),
    model_version VARCHAR(50),
    model_registry_url TEXT,
    training_data_source TEXT,
    data_lineage JSONB,
    inference_environment VARCHAR(100),
    third_party_dependencies JSONB, -- OpenAI, Anthropic, Hugging Face, etc.
    bias_testing_date DATE,
    bias_test_results JSONB,
    explainability_method VARCHAR(100), -- SHAP, LIME, attention, etc.
    data_retention_days INTEGER,
    privacy_preserving_tech VARCHAR(100), -- differential_privacy, federated_learning, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Asset relationships (for dependency tracking)
CREATE TABLE asset_relationships (
    id UUID PRIMARY KEY,
    asset_id UUID REFERENCES assets(id),
    related_asset_id UUID REFERENCES assets(id),
    relationship_type VARCHAR(50), -- depends_on, communicates_with, runs_on, etc.
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Asset configuration baselines (CM-2)
CREATE TABLE asset_baselines (
    id UUID PRIMARY KEY,
    asset_id UUID REFERENCES assets(id),
    baseline_name VARCHAR(255),
    baseline_version VARCHAR(50),
    configuration_data JSONB, -- Actual configuration settings
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints**:
- `POST /api/v1/assets` - Create asset
- `GET /api/v1/assets` - List assets (with filters)
- `GET /api/v1/assets/:id` - Get asset details
- `PUT /api/v1/assets/:id` - Update asset
- `DELETE /api/v1/assets/:id` - Decommission asset
- `GET /api/v1/assets/:id/dependencies` - Get dependency graph
- `GET /api/v1/assets/:id/controls` - Get linked compliance controls
- `POST /api/v1/assets/:id/baseline` - Create configuration baseline
- `GET /api/v1/ai-systems` - List AI systems
- `GET /api/v1/assets/reports/inventory` - Generate CM-8 inventory report

**UI Features**:
- **Asset Dashboard**: Visual inventory with filters
- **Dependency Graph**: Interactive visualization (D3.js/vis.js)
- **AI System Registry**: Dedicated view for AI/ML assets
- **Lifecycle Timeline**: Show asset history
- **Vulnerability Heatmap**: Color-coded by risk level
- **Password Vault Integration**: Link to 1Password, LastPass, CyberArk, etc.

---

### 6. SSP (System Security Plan) Generation
**Problem**: Creating SSP documents is time-consuming and requires consolidating control implementations

**Solution**: Auto-generate SSP from control implementation notes with one click

**SSP Document Includes**:
1. **System Information**
   - System name, owner, description
   - Environment (cloud, on-prem, hybrid)
   - System boundary diagram
2. **Security Controls**
   - For each control:
     - Control ID & Title
     - Implementation Status (implemented, planned, risk accepted, not applicable)
     - Implementation Description (from user notes)
     - Responsible Party
     - Evidence References
3. **Risk Acceptance**
   - List of risk-accepted controls with justification
4. **Planned Controls**
   - Controls in progress with expected completion dates
5. **Appendices**
   - Crosswalk mappings
   - Evidence inventory
   - Change log

**SSP Templates**:
- **NIST 800-53 SSP** (federal systems)
- **FedRAMP SSP** (cloud services)
- **ISO 27001 SOA** (Statement of Applicability)
- **Custom Template** (user-defined)

**Generation Logic**:
```
For each selected framework:
  For each control in framework:
    1. Fetch control_implementation record
    2. Extract:
       - Status (implemented, planned, risk_accepted, not_applicable)
       - Implementation details
       - Assigned owner
       - Evidence links
       - Notes
    3. If auto-crosswalked:
       - Note: "Satisfied via crosswalk from [source control]"
    4. Format into SSP section
```

**Database Schema**:
```sql
-- SSP documents
CREATE TABLE ssp_documents (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    framework_ids UUID[], -- Which frameworks are covered
    ssp_template VARCHAR(50), -- nist_800_53, fedramp, iso27001_soa, custom
    system_name VARCHAR(255),
    system_owner UUID REFERENCES users(id),
    system_description TEXT,
    system_environment VARCHAR(100), -- cloud, on_prem, hybrid
    system_boundary_diagram_url TEXT,
    generated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    generated_by UUID REFERENCES users(id),
    pdf_url TEXT, -- S3 location of generated PDF
    docx_url TEXT, -- S3 location of editable Word doc
    version VARCHAR(20),
    status VARCHAR(50), -- draft, under_review, approved
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SSP change log
CREATE TABLE ssp_changes (
    id UUID PRIMARY KEY,
    ssp_id UUID REFERENCES ssp_documents(id),
    change_type VARCHAR(50), -- control_added, control_updated, status_changed
    change_description TEXT,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints**:
- `POST /api/v1/ssp/generate` - Trigger SSP generation
- `GET /api/v1/ssp` - List SSP documents
- `GET /api/v1/ssp/:id` - Get SSP details
- `GET /api/v1/ssp/:id/pdf` - Download PDF
- `GET /api/v1/ssp/:id/docx` - Download Word doc
- `PUT /api/v1/ssp/:id/approve` - Approve SSP
- `GET /api/v1/ssp/:id/changelog` - Get change history

**SSP Generation Process**:
1. **User triggers generation**: Selects frameworks, system info
2. **Backend queries all controls**: Fetch implementation records
3. **Template rendering**: Use Handlebars/Mustache with SSP template
4. **PDF generation**: HTML → PDF (Puppeteer)
5. **Word doc generation**: Use officegen or docxtemplater
6. **Upload to S3**: Store documents
7. **Return URLs**: User downloads

**UI Features**:
- **SSP Generator Wizard**:
  - Step 1: Select frameworks
  - Step 2: Enter system info
  - Step 3: Choose template
  - Step 4: Review & generate
- **SSP Dashboard**: List all SSPs with version history
- **Live Preview**: Show SSP content before generating
- **Comparison View**: Diff between SSP versions

**Example SSP Section (NIST 800-53)**:
```
3.1 ACCESS CONTROL (AC)

AC-2: Account Management
Control Implementation Status: Implemented
Responsible Party: IT Security Team

Implementation Description:
The organization implements automated account management using Azure AD
with the following capabilities:
- Automated user provisioning and de-provisioning
- Role-based access control (RBAC) with 5 defined roles
- Account review conducted quarterly
- Privileged accounts logged via AU-2 audit system

Evidence:
- Azure AD configuration export (evidence_1234.json)
- Account review spreadsheet (Q1-2026-review.xlsx)

Crosswalk Mappings:
- Automatically satisfies ISO 27001: A.9.2.1 (92% similarity)
- Automatically satisfies SOC 2: CC6.1 (95% similarity)

---

AC-3: Access Enforcement
Control Implementation Status: Planned
Responsible Party: DevOps Team
Expected Completion: 2026-03-15

Implementation Description:
Planning to implement network segmentation using VPC security groups
to enforce least-privilege access between microservices.

---

AC-5: Separation of Duties
Control Implementation Status: Risk Accepted
Responsible Party: Management
Risk Acceptance Date: 2026-01-15
Risk Acceptance Justification:
Small team size (5 developers) makes complete separation of duties
impractical. Compensating controls: code review required, all actions
logged, quarterly access reviews.
```

---

## 🗓️ Implementation Timeline

### Month 1: Auditor Assessment
- Week 1-2: Database schema, API endpoints
- Week 3: Auditor portal UI
- Week 4: PDF report generation with templates

### Month 2: Evidence Upload & Parsing
- Week 1: File upload infrastructure (S3)
- Week 2: STIG, SBOM, Nessus parsers
- Week 3: AI integration for policy generation
- Week 4: UI for evidence upload and review

### Month 3: SBOM Deep Dive
- Week 1-2: SBOM component tracking
- Week 3: CVE matching and alerts
- Week 4: Dependency visualization

### Month 4: Privacy Frameworks
- Week 1-2: GDPR control seed data
- Week 3-4: NIST Privacy Framework seed data
- Week 4: Privacy dashboard

---

## 💡 Technical Considerations

### File Storage
- **Local Dev**: Store in `/uploads` folder
- **Production**: AWS S3, Azure Blob, or Cloudflare R2
- **Security**: Pre-signed URLs, encryption at rest

### AI/LLM Integration
- **Policy Generation**: OpenAI GPT-4-turbo or Claude 3.5 Sonnet
- **Prompts**: Store in database for versioning
- **Cost**: ~$0.01-0.03 per policy generated
- **Fallback**: Pre-built templates if AI unavailable

### PDF Generation
- **Library**: Puppeteer (headless Chrome) or wkhtmltopdf
- **Templates**: HTML/CSS → PDF
- **Digital Signatures**: PDF signing with X.509 certs

### SBOM Parsing
- **CycloneDX**: Use `@cyclonedx/cyclonedx-library` (Node.js)
- **SPDX**: Use `spdx-tools` (Python) or `spdx-js` (Node.js)
- **CVE Matching**: NVD API or Snyk/GitHub Advisory Database

---

## 📈 Success Metrics

### Auditor Assessment
- ✓ External auditors can log in and assess controls
- ✓ Attestation reports generated in < 5 minutes
- ✓ PDF reports match SOC 2 format standards

### Readiness Mode
- ✓ SBOM uploaded and parsed in < 30 seconds
- ✓ Policy generated in < 2 minutes
- ✓ Gap analysis shows control coverage improvement

### User Adoption
- Target: 50% of users upload at least 1 evidence file
- Target: 30% of users generate at least 1 policy
- Target: 10% of users complete full attestation report

---

## 🚀 Competitive Advantage

**Why This Matters**:
1. **Auditor Portal** → Competing with Vanta, Drata (both $$$)
2. **Evidence-to-Policy AI** → Nobody does this yet!
3. **SBOM Integration** → Critical for government/DoD customers
4. **Open Source** → Free alternative to $50k/year GRC tools

This positions the AI GRC Platform as the most comprehensive open-source compliance tool.

---

**Phase 1**: Core platform (DONE!)
**Phase 2**: These features (4-6 months)
**Phase 3**: AI recommendations, predictive compliance, integrations (Jira, Slack, etc.)
