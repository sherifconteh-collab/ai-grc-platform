# ControlWeave - Framework Coverage

## Overview

This platform provides **comprehensive coverage of 7 major compliance and governance frameworks**, totaling over **429+ controls** across cybersecurity, AI governance, privacy, and industry-specific regulations.

---

## Frameworks Included

### 1. NIST Cybersecurity Framework (CSF) 2.0
**Status:** ✅ Complete  
**Published:** February 2024  
**Category:** Cybersecurity  
**Controls:** 106 controls across 6 functions  

**Coverage:**
- **GOVERN (GV):** 30 controls - Risk management strategy, roles, oversight, supply chain
- **IDENTIFY (ID):** 18 controls - Asset management, risk assessment, improvement
- **PROTECT (PR):** 20 controls - Access control, awareness, data security, platform security
- **DETECT (DE):** 12 controls - Continuous monitoring, adverse event analysis
- **RESPOND (RS):** 14 controls - Incident management, analysis, communication, mitigation
- **RECOVER (RC):** 12 controls - Recovery planning, communication

**Key Features:**
- New GOVERN function added in v2.0
- Expanded beyond critical infrastructure to all sectors
- Emphasizes organizational context and supply chain risk
- Maps to NIST AI RMF and ISO 27001

---

### 2. NIST AI Risk Management Framework (AI RMF) 1.0
**Status:** ✅ Complete  
**Published:** January 2023  
**Category:** AI Governance  
**Controls:** 70 AI-specific controls across 4 functions  

**Coverage:**
- **GOVERN:** 18 controls - Legal requirements, trustworthy AI principles, culture, accountability
- **MAP:** 16 controls - Context understanding, stakeholder identification, impact assessment
- **MEASURE:** 21 controls - Testing, validation, fairness assessment, trustworthiness metrics
- **MANAGE:** 15 controls - Risk treatment, monitoring, incident management, third-party risks

**Key Features:**
- **Trustworthy AI characteristics:** Validity, reliability, safety, security, resilience, accountability, transparency, explainability, interpretability, privacy, fairness
- Addresses AI-specific risks: bias, explainability, data quality, model drift
- Includes automated decision-making considerations
- DPIA and ethics review requirements
- Environmental sustainability metrics

**AI-Specific Control Examples:**
- MAP-4.2: Data cards/datasheets for training data
- MEASURE-2.11: Bias and fairness testing
- MEASURE-2.3: Out-of-distribution robustness testing
- MANAGE-3.2: Foundation model monitoring
- GOVERN-1.6: AI model inventory and tracking

---

### 3. ISO/IEC 27001:2022
**Status:** ✅ Complete  
**Published:** October 2022  
**Category:** Information Security  
**Controls:** 93 controls across 4 themes  

**Coverage:**
- **ORGANIZATIONAL (A.5):** 37 controls - Policies, roles, asset management, supplier management, incident response, business continuity, legal compliance
- **PEOPLE (A.6):** 8 controls - Screening, training, awareness, remote working, termination
- **PHYSICAL (A.7):** 14 controls - Physical security, access control, equipment protection, clear desk
- **TECHNOLOGICAL (A.8):** 34 controls - Access control, cryptography, network security, secure development, vulnerability management

**Key Features:**
- Complete restructure from 2013 version (114 controls → 93 controls)
- New controls: Threat intelligence (A.5.7), Cloud security (A.5.23), Configuration management (A.8.9), Web filtering (A.8.23)
- Emphasis on secure development lifecycle
- Comprehensive coverage of modern threats
- Maps directly to NIST CSF and SOC 2

---

### 4. SOC 2 Trust Services Criteria (TSC)
**Status:** ✅ Complete  
**Published:** 2017 (AICPA)  
**Category:** Service Organization Controls  
**Controls:** 60+ controls across 5 trust categories  

**Coverage:**
- **COMMON CRITERIA (CC):** 20 foundation controls
  - CC1: Control Environment (COSO Principles 1-5)
  - CC2: Communication and Information (COSO Principles 13-15)
  - CC3: Risk Assessment (COSO Principles 6-9)
  - CC4: Monitoring Activities (COSO Principles 16-17)
  - CC5: Control Activities (COSO Principles 10-12)
  - CC6: Logical and Physical Access Controls (8 controls)
  - CC7: System Operations (5 controls)
  - CC8: Change Management
  - CC9: Risk Mitigation

- **SECURITY (Additional Criteria A1):** 3 controls
- **AVAILABILITY (Additional Criteria A1):** 3 controls
- **PROCESSING INTEGRITY (P1-P7):** 7 controls (relevant for AI systems)
- **CONFIDENTIALITY (C1):** 2 controls
- **PRIVACY (P1-P8):** 13 controls

**Key Features:**
- Based on COSO Internal Control Framework
- Used for SOC 2 Type I and Type II audits
- Processing Integrity category highly relevant for AI systems
- Flexible - organizations choose applicable categories
- Annual audit requirement for certification

---

### 5. HIPAA Security Rule
**Status:** ✅ Complete  
**Published:** 2003 (HHS)  
**Category:** Healthcare Compliance  
**Controls:** 45 controls (18 Required, 27 Addressable)  
**Mandatory:** Yes (for covered entities and business associates)

**Coverage:**
- **ADMINISTRATIVE SAFEGUARDS (164.308):** 23 controls
  - Security management process
  - Risk analysis and management (Required)
  - Workforce security
  - Access management
  - Security awareness and training
  - Incident response procedures
  - Contingency planning with backup and disaster recovery
  - Business associate agreements

- **PHYSICAL SAFEGUARDS (164.310):** 13 controls
  - Facility access controls
  - Workstation use and security
  - Device and media controls
  - Disposal and re-use procedures

- **TECHNICAL SAFEGUARDS (164.312):** 9 controls
  - Access control with unique user IDs
  - Audit controls (Required)
  - Integrity controls
  - Person/entity authentication
  - Transmission security with encryption

**Key Features:**
- Protects electronic Protected Health Information (ePHI)
- Addressable controls require documentation if not implemented
- Scalable based on organization size and complexity
- Civil penalties: $100-$50,000 per violation
- Criminal penalties possible for knowing violations

---

### 6. PCI DSS 4.0
**Status:** ✅ Complete (Core Requirements)  
**Published:** March 2022 (PCI SSC)  
**Category:** Payment Card Security  
**Controls:** 12 main requirements, 50+ sub-requirements  
**Mandatory:** Yes (for entities handling card data)

**Coverage:**
- **Goal 1 - Build and Maintain Secure Network:**
  - Req 1: Network security controls (firewalls)
  - Req 2: Secure configurations

- **Goal 2 - Protect Cardholder Data:**
  - Req 3: Protect stored account data
  - Req 4: Strong cryptography for transmission

- **Goal 3 - Vulnerability Management:**
  - Req 5: Malware protection
  - Req 6: Secure systems and applications

- **Goal 4 - Access Control:**
  - Req 7: Restrict access by business need-to-know
  - Req 8: Identify and authenticate access
  - Req 9: Restrict physical access

- **Goal 5 - Monitor and Test:**
  - Req 10: Log and monitor all access
  - Req 11: Test security systems and processes

- **Goal 6 - Information Security Policy:**
  - Req 12: Support information security with policy

**Key Features:**
- Version 4.0 introduces customized approach (vs defined approach)
- MFA requirement for all access to CDE (by March 2025)
- Annual on-site assessments required (Level 1 merchants)
- Quarterly network scans by ASV
- Severe penalties for non-compliance (fines, card acceptance termination)

---

### 7. GDPR (General Data Protection Regulation)
**Status:** ✅ Complete  
**Published:** April 2016 (Effective May 2018)  
**Category:** Privacy  
**Controls:** 40+ key requirements  
**Mandatory:** Yes (for processing EU personal data)

**Coverage:**
- **DATA PROTECTION PRINCIPLES (Art. 5-6):** 8 requirements
  - Lawfulness, fairness, transparency
  - Purpose limitation
  - Data minimization
  - Accuracy
  - Storage limitation
  - Integrity and confidentiality
  - Accountability
  - Legal bases for processing

- **DATA SUBJECT RIGHTS (Art. 12-23):** 11 rights
  - Transparent information
  - Right of access
  - Right to rectification
  - Right to erasure (right to be forgotten)
  - Right to restriction
  - Right to data portability
  - Right to object
  - Automated decision-making and profiling (highly relevant for AI)

- **ACCOUNTABILITY (Art. 24-39):** 7 key requirements
  - Data protection by design and by default (critical for AI)
  - Processor obligations and contracts
  - Records of processing activities
  - Security of processing
  - Data Protection Impact Assessment (DPIA) - required for high-risk AI
  - Data Protection Officer (when required)

- **SECURITY & BREACH (Art. 32-34):** 3 requirements
  - Appropriate technical and organizational measures
  - 72-hour breach notification to authority
  - Breach notification to data subjects

**Key Features:**
- Maximum fines: €20M or 4% of global annual turnover (whichever is higher)
- Extraterritorial scope - applies to non-EU organizations processing EU data
- DPIA mandatory for AI systems that result in high risk
- Article 22 restricts automated decision-making
- Data protection by design = privacy-first AI development

---

## Framework Comparison Matrix

| Framework | Controls | AI-Specific | Mandatory | Audit Req'd | Primary Focus |
|-----------|----------|-------------|-----------|-------------|---------------|
| NIST CSF 2.0 | 106 | Some | No | No | Cybersecurity Risk |
| NIST AI RMF | 70 | Yes | No | No | AI Governance |
| ISO 27001 | 93 | Some | No | Yes (for cert) | Information Security |
| SOC 2 | 60+ | No | No | Yes (annual) | Service Organizations |
| HIPAA | 45 | No | Yes* | Yes | Healthcare Data |
| PCI DSS | 50+ | No | Yes* | Yes (annual) | Payment Card Data |
| GDPR | 40+ | Yes (Art. 22) | Yes* | Variable | Privacy |

*Mandatory for specific industries/data types

---

## Control Overlap and Mapping

### High Overlap Areas (90%+ similarity):
- **Access Control:** All frameworks require identity management, authentication, authorization
- **Logging & Monitoring:** All frameworks require audit trails and security monitoring
- **Encryption:** All frameworks require data protection at rest and in transit
- **Incident Response:** All frameworks require documented incident procedures
- **Risk Assessment:** All frameworks require periodic risk analysis

### Framework-Specific Areas:
- **NIST AI RMF:** Only framework with AI model testing, fairness metrics, explainability
- **HIPAA:** Only framework with ePHI-specific controls
- **PCI DSS:** Only framework with cardholder data environment (CDE) segmentation
- **GDPR:** Only framework with data subject rights and automated decision-making restrictions
- **SOC 2:** Only framework with COSO-based control environment structure

### Cross-Framework Control Mapping Examples:

**Example 1: Access Control**
- NIST CSF 2.0: PR.AA-01 (Identity management)
- ISO 27001: A.5.15, A.5.16, A.5.17 (Access control, identity, authentication)
- SOC 2: CC6.1, CC6.2 (Logical access, authentication)
- HIPAA: 164.312(a)(1), 164.312(a)(2)(i) (Access control, unique user ID)
- PCI DSS: Req-7, Req-8 (Access control, authentication)
- GDPR: Art. 32 (Security of processing)

**Example 2: Data Protection**
- NIST CSF 2.0: PR.DS-01, PR.DS-02 (Data at rest, in transit)
- ISO 27001: A.8.24 (Cryptography)
- SOC 2: CC6.7 (Encryption)
- HIPAA: 164.312(a)(2)(iv), 164.312(e)(2)(ii) (Encryption addressable)
- PCI DSS: Req-3, Req-4 (Protect stored data, protect transmission)
- GDPR: Art. 32 (Pseudonymization and encryption)

**Example 3: AI-Specific Controls**
- NIST AI RMF: MEASURE-2.11 (Fairness and bias testing)
- GDPR: Art. 22 (Automated decision-making)
- SOC 2: PI controls (Processing integrity - relevant for AI outputs)
- ISO 27001: A.8.25-A.8.28 (Secure development - applies to AI systems)

---

## Implementation Priority by Industry

### Technology/SaaS Companies:
1. **Start:** SOC 2 (customer requirement), ISO 27001 (global standard)
2. **Add AI capabilities:** NIST AI RMF, relevant GDPR articles
3. **If handling sensitive data:** HIPAA (healthcare), PCI DSS (payments)

### Healthcare Organizations:
1. **Start:** HIPAA (mandatory), NIST CSF 2.0 (foundation)
2. **Add:** ISO 27001 (for international), SOC 2 (if service provider)
3. **Add AI:** NIST AI RMF, GDPR Art. 22 (automated decisions)

### Financial Services:
1. **Start:** PCI DSS (if cards), NIST CSF 2.0, ISO 27001
2. **Add:** SOC 2 (for fintech), GDPR (if EU customers)
3. **Add AI:** NIST AI RMF (fraud detection, credit decisions)

### AI Product Companies:
1. **Start:** NIST AI RMF (core), NIST CSF 2.0 (foundation)
2. **Add:** GDPR Art. 22, 35 (automated decisions, DPIA)
3. **Add:** ISO 27001 (security), SOC 2 (customer trust)

---

## MCP/Agentic AI Integration Points

This platform is designed to be **MCP-ready** for AI agent integration:

### 1. Automated Control Assessment
**Capability:** AI agents can analyze system configurations and evidence to automatically assess control implementation status.

**Example MCP Functions:**
```typescript
// Check if MFA is enabled across all accounts
async function assessControlImplementation(controlId: "PR.AA-03") {
  // Agent calls APIs, checks IAM configs, analyzes logs
  return {
    status: "implemented",
    coverage: "98%",
    gaps: ["2 service accounts without MFA"],
    evidence: [...]
  }
}
```

### 2. Continuous Compliance Monitoring
**Capability:** AI agents continuously monitor systems and alert on control violations.

**Example MCP Functions:**
```typescript
// Monitor for unauthorized access attempts
async function monitorControl(controlId: "DE.CM-01") {
  // Stream logs, detect anomalies, correlate events
  return {
    status: "compliant",
    alerts: [],
    metrics: { failedLogins: 3, blockedIPs: 1 }
  }
}
```

### 3. Evidence Collection & Documentation
**Capability:** AI agents automatically collect and organize audit evidence.

**Example MCP Functions:**
```typescript
// Collect evidence for annual SOC 2 audit
async function collectEvidence(framework: "soc2", period: "2025-Q1") {
  // Pull logs, configs, screenshots, reports
  return {
    evidence_packages: [...],
    coverage: "94%",
    missing: ["Penetration test report"]
  }
}
```

### 4. Risk Assessment Automation
**Capability:** AI agents perform automated risk assessments based on threat intelligence and system data.

**Example MCP Functions:**
```typescript
// Assess AI model risk using NIST AI RMF
async function assessAIRisk(modelId: "customer-churn-predictor") {
  // Analyze training data, test for bias, check explainability
  return {
    riskLevel: "medium",
    concerns: ["Fairness: 3% disparity in protected group"],
    recommendations: ["Re-train with balanced dataset"]
  }
}
```

### 5. Policy & Procedure Generation
**Capability:** AI agents draft policy documents based on framework requirements.

**Example MCP Functions:**
```typescript
// Generate incident response plan per NIST CSF
async function generatePolicy(framework: "nist_csf_2", control: "RS.MA-01") {
  // Draft policy from templates, customize to org context
  return {
    policy_document: "...",
    approval_workflow: [...],
    training_materials: [...]
  }
}
```

---

## Database Schema Highlights

### Key Tables:
- **frameworks:** 7 frameworks with metadata
- **framework_functions:** 25+ categories (GOVERN, IDENTIFY, PROTECT, etc.)
- **framework_categories:** 60+ subcategories (GV.RM, ID.AM, PR.AC, etc.)
- **controls:** 429+ individual control requirements
- **control_mappings:** Cross-framework control relationships
- **control_implementations:** Org-specific implementation tracking
- **ai_models:** Special asset type for AI systems
- **risks:** Risk register with likelihood/impact
- **risk_mitigations:** Links risks to controls
- **evidence:** Audit evidence storage

### AI-Specific Fields:
- `controls.ai_relevance`: Boolean flag for AI-specific controls
- `controls.automation_potential`: High/medium/low for AI agent automation
- `ai_models.explainability_score`: 1-10 rating
- `ai_models.bias_assessment_status`: Tracking fairness testing

---

## Getting Started

### Prerequisites:
- PostgreSQL 12+ with UUID extension
- 500MB disk space (for full control library)
- (Optional) Python 3.9+ for data analysis

### Installation:
```bash
# 1. Set environment variables
export DB_NAME=ai_grc_platform
export DB_USER=postgres
export DB_PASSWORD=yourpassword
export DB_HOST=localhost
export DB_PORT=5432

# 2. Run initialization script
cd db/
chmod +x init_db.sh
./init_db.sh

# Expected output:
# ✓ Database created
# ✓ Schema loaded
# ✓ 7 frameworks loaded
# ✓ 429+ controls loaded
```

### Verification:
```sql
-- Check framework counts
SELECT name, version, COUNT(c.id) as controls
FROM frameworks f
LEFT JOIN controls c ON f.id = c.framework_id
GROUP BY f.id, f.name, f.version;

-- Find AI-specific controls
SELECT f.code, c.control_id, c.title
FROM controls c
JOIN frameworks f ON c.framework_id = f.id
WHERE c.ai_relevance = true
ORDER BY f.code, c.control_id;
```

---

## Next Steps

1. **Review this document** to understand full framework coverage
2. **Run database initialization** to load all controls
3. **Build the backend API** (Node.js/Python) to expose controls via REST/GraphQL
4. **Create the frontend** (React) for control implementation tracking
5. **Implement MCP integration** for AI agent capabilities
6. **Start documenting** your organization's control implementations

---

## License & Usage

This control library is compiled from publicly available framework documentation:
- NIST frameworks: Public domain (US Government)
- ISO 27001: Abbreviated controls (full standard requires purchase)
- SOC 2: Based on AICPA published criteria
- HIPAA: Public law (45 CFR)
- PCI DSS: Freely available from PCI SSC
- GDPR: EU Regulation 2016/679 (public)

**For Production Use:** Verify control text against official framework publications. Some controls are paraphrased for space/clarity.

---

**Last Updated:** January 2026  
**Frameworks Version:**
- NIST CSF 2.0 (Feb 2024)
- NIST AI RMF 1.0 (Jan 2023)
- ISO 27001:2022 (Oct 2022)
- SOC 2 TSC 2017
- HIPAA Security Rule (2003, as amended)
- PCI DSS 4.0 (Mar 2022)
- GDPR (May 2018)
