// @tier: community
/**
 * Seed Crosswalk Completion — closes frameworks with zero crosswalk mappings
 *
 * Adds real, individually-reasoned crosswalk mappings for every framework
 * that had zero control_mappings entries as of this audit: HITECH, ISO
 * 27002/27005/27017/27018/31000/42005, FISCAM, FFIEC, SR 11-7, SEC AI Risk
 * Management, FINRA Supervisory Controls for AI, and the International/
 * State AI Governance Law frameworks.
 *
 * Each mapping is a single best-match pair (not exhaustive many-to-many),
 * consistent with this codebase's existing crosswalk seed pattern. Entries
 * with only a weak/generic conceptual overlap are deliberately omitted
 * rather than forced — coverage breadth was prioritized over exhaustive
 * per-control mapping given the size of this backlog.
 *
 * Run after: seed-frameworks.js, seed-missing-controls.js,
 *            seed-iso27001-2022-crosswalks.js, seed-hipaa-crosswalks.js
 *
 * Flags:
 *   --strict   Fail (exit 1, ROLLBACK) if any non-duplicate mapping cannot
 *              be inserted because the source/target framework or control
 *              is missing. Without --strict (default) the script logs a
 *              warning and continues.
 */

require('dotenv').config();
const { Pool } = require('pg');

const STRICT = process.argv.includes('--strict') || process.env.STRICT_SEEDING === 'true';

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'grc_platform',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

// ============================================================
// HITECH → HIPAA
// ============================================================
const HITECH_TO_HIPAA = [
  { source: 'HITECH-13401d', target: 'HIPAA-164.312(e)(1)', score: 75, type: 'related' },    // ip-hygiene:ignore
  { source: 'HITECH-13402',  target: 'HIPAA-164.308(a)(6)', score: 70, type: 'related' },    // ip-hygiene:ignore
  { source: 'HITECH-13405a', target: 'HIPAA-164.312(a)(1)', score: 75, type: 'related' },    // ip-hygiene:ignore
  { source: 'HITECH-13405c', target: 'HIPAA-164.312(b)',    score: 75, type: 'related' },    // ip-hygiene:ignore
  { source: 'HITECH-13405d', target: 'HIPAA-164.308(a)(4)', score: 72, type: 'related' },    // ip-hygiene:ignore
  { source: 'HITECH-13405e', target: 'HIPAA-164.308(a)(4)', score: 80, type: 'related' },    // ip-hygiene:ignore
  { source: 'HITECH-13407',  target: 'HIPAA-164.308(a)(8)', score: 78, type: 'related' },    // ip-hygiene:ignore
  { source: 'HITECH-13408',  target: 'HIPAA-164.314(a)(1)', score: 88, type: 'equivalent' }, // ip-hygiene:ignore
  { source: 'HITECH-13410',  target: 'HIPAA-164.314(a)(1)', score: 90, type: 'equivalent' }, // ip-hygiene:ignore
  { source: 'HITECH-13410e', target: 'HIPAA-164.312(b)',    score: 92, type: 'equivalent' }, // ip-hygiene:ignore
  { source: 'HITECH-13411',  target: 'HIPAA-164.314(a)(1)', score: 85, type: 'related' },    // ip-hygiene:ignore
  { source: 'HITECH-13412',  target: 'HIPAA-164.308(a)(8)', score: 78, type: 'related' },    // ip-hygiene:ignore
  { source: 'HITECH-13412a', target: 'HIPAA-164.308(a)(1)', score: 78, type: 'related' },    // ip-hygiene:ignore
  { source: 'HITECH-13412b', target: 'HIPAA-164.312(e)(1)', score: 85, type: 'equivalent' }, // ip-hygiene:ignore
  { source: 'HITECH-13412c', target: 'HIPAA-164.312(b)',    score: 90, type: 'equivalent' }, // ip-hygiene:ignore
  { source: 'HITECH-13412d', target: 'HIPAA-164.312(c)(1)', score: 92, type: 'equivalent' }, // ip-hygiene:ignore
];

// ============================================================
// ISO/IEC 27002:2022 → ISO/IEC 27001:2022 Annex A
// ============================================================
const ISO27002_TO_ISO27001 = [
  { source: 'AC-1', target: 'A.5.15', score: 92, type: 'equivalent' },
  { source: 'AM-1', target: 'A.5.9',  score: 88, type: 'related' },
  { source: 'BC-1', target: 'A.5.30', score: 85, type: 'related' },
  { source: 'CL-1', target: 'A.5.31', score: 92, type: 'equivalent' },
  { source: 'CR-1', target: 'A.8.24', score: 95, type: 'equivalent' },
  { source: 'CS-1', target: 'A.8.20', score: 82, type: 'related' },
  { source: 'HR-1', target: 'A.6.3',  score: 78, type: 'related' },
  { source: 'ID-1', target: 'A.5.16', score: 95, type: 'equivalent' },
  { source: 'IM-1', target: 'A.5.24', score: 95, type: 'equivalent' },
  { source: 'IP-1', target: 'A.5.1',  score: 95, type: 'equivalent' },
  { source: 'OS-1', target: 'A.8.16', score: 88, type: 'related' },
  { source: 'PS-1', target: 'A.7.1',  score: 82, type: 'related' },
  { source: 'SD-1', target: 'A.8.25', score: 85, type: 'related' },
  { source: 'SR-1', target: 'A.5.19', score: 92, type: 'equivalent' },
  { source: 'TI-1', target: 'A.5.7',  score: 98, type: 'equivalent' },
];

// ============================================================
// ISO/IEC 27005:2022 ↔ ISO 31000:2018 (risk management lifecycle)
// plus → NIST SP 800-53 Rev 5 risk/program controls
// ============================================================
const ISO27005_TO_ISO31000 = [
  { source: 'IA-1',  target: 'RIT-1', score: 75, type: 'related' },
  { source: 'RA-1',  target: 'RAE-1', score: 90, type: 'equivalent' },
  { source: 'RAC-1', target: 'RTP-1', score: 75, type: 'related' },
  { source: 'RAI-1', target: 'RMC-1', score: 78, type: 'related' },
  { source: 'RC-1',  target: 'RMF-1', score: 82, type: 'related' },
  { source: 'RCP-1', target: 'RCC-1', score: 92, type: 'equivalent' },
  { source: 'RD-1',  target: 'RMI-1', score: 68, type: 'related' },
  { source: 'RE-1',  target: 'RAE-1', score: 80, type: 'related' },
  { source: 'RM-1',  target: 'RMC-1', score: 88, type: 'equivalent' },
  { source: 'RT-1',  target: 'RTP-1', score: 90, type: 'equivalent' },
  { source: 'TH-1',  target: 'RAP-1', score: 75, type: 'related' },
  { source: 'VI-1',  target: 'RAP-1', score: 72, type: 'related' },
];

const ISO27005_TO_NIST80053 = [
  { source: 'RA-1', target: 'RA-3', score: 85, type: 'equivalent' },
  { source: 'RM-1', target: 'RA-5', score: 75, type: 'related' },
];

const ISO31000_TO_NIST80053 = [
  { source: 'RMF-1', target: 'PM-9', score: 90, type: 'equivalent' },
  { source: 'RMP-1', target: 'RA-1', score: 92, type: 'equivalent' },
  { source: 'LCR-1', target: 'PM-2', score: 80, type: 'related' },
];

// ============================================================
// ISO/IEC 27017:2015 → ISO/IEC 27001:2022 Annex A (cloud security)
// ============================================================
const ISO27017_TO_ISO27001 = [
  { source: 'CAC-1', target: 'A.8.2',  score: 88, type: 'equivalent' },
  { source: 'CDL-1', target: 'A.5.14', score: 70, type: 'related' },
  { source: 'CDP-1', target: 'A.5.23', score: 92, type: 'equivalent' },
  { source: 'CDR-1', target: 'A.8.10', score: 88, type: 'equivalent' },
  { source: 'CIM-1', target: 'A.5.24', score: 90, type: 'equivalent' },
  { source: 'CML-1', target: 'A.8.16', score: 90, type: 'equivalent' },
  { source: 'CNS-1', target: 'A.8.22', score: 90, type: 'equivalent' },
  { source: 'CSA-1', target: 'A.5.20', score: 90, type: 'equivalent' },
  { source: 'CSP-1', target: 'A.5.21', score: 70, type: 'related' },
  { source: 'CSR-1', target: 'A.5.23', score: 82, type: 'related' },
  { source: 'VM-1',  target: 'A.8.9',  score: 88, type: 'related' },
  { source: 'VSM-1', target: 'A.8.27', score: 75, type: 'related' },
];

// ============================================================
// ISO/IEC 27018:2019 → ISO/IEC 27701:2019 + NIST Privacy Framework
// ============================================================
const ISO27018_TO_ISO27701 = [
  { source: 'CT-1', target: 'CBT-1', score: 92, type: 'equivalent' },
  { source: 'PB-1', target: 'PIR-1', score: 90, type: 'equivalent' },
  { source: 'PC-1', target: 'CMF-1', score: 88, type: 'equivalent' },
  { source: 'PD-1', target: 'DSR-1', score: 95, type: 'equivalent' },
  { source: 'PR-1', target: 'DRE-1', score: 92, type: 'equivalent' },
  { source: 'PT-1', target: 'PNT-1', score: 92, type: 'equivalent' },
  { source: 'PV-1', target: 'PAC-1', score: 80, type: 'related' },
  { source: 'SP-1', target: 'TPA-1', score: 90, type: 'equivalent' },
];

const ISO27018_TO_NIST_PRIVACY = [
  { source: 'PA-1', target: 'CT-P.02', score: 85, type: 'equivalent' },
  { source: 'PE-1', target: 'PR-P.01', score: 85, type: 'equivalent' },
  { source: 'PL-1', target: 'CT-P.01', score: 85, type: 'equivalent' },
];

// ============================================================
// ISO/IEC 42005:2025 → NIST AI RMF 1.0 (AI system impact assessment)
// ============================================================
const ISO42005_TO_NIST_AI_RMF = [
  { source: 'IA-1',  target: 'MAP-1',     score: 88, type: 'equivalent' },
  { source: 'IA-2',  target: 'GOVERN-2',  score: 72, type: 'related' },
  { source: 'IA-3',  target: 'MAP-1',     score: 90, type: 'equivalent' },
  { source: 'IA-4',  target: 'MAP-2',     score: 75, type: 'related' },
  { source: 'IA-5',  target: 'MAP-5',     score: 92, type: 'equivalent' },
  { source: 'IA-6',  target: 'MEASURE-1', score: 88, type: 'equivalent' },
  { source: 'IA-7',  target: 'MANAGE-1',  score: 90, type: 'equivalent' },
  { source: 'IA-8',  target: 'GOVERN-2',  score: 85, type: 'equivalent' },
  { source: 'IA-9',  target: 'MANAGE-4',  score: 88, type: 'equivalent' },
  { source: 'IA-10', target: 'MEASURE-3', score: 90, type: 'equivalent' },
];

// ============================================================
// FISCAM → NIST SP 800-53 Rev 5
// ============================================================
const FISCAM_TO_NIST80053 = [
  { source: 'AC-FM-1', target: 'AC-2', score: 92, type: 'equivalent' },
  { source: 'AC-FM-2', target: 'AC-3', score: 90, type: 'equivalent' },
  { source: 'AC-FM-3', target: 'IA-2', score: 92, type: 'equivalent' },
  { source: 'AC-FM-4', target: 'SC-7', score: 88, type: 'equivalent' },
  { source: 'CC-1',    target: 'CM-3', score: 90, type: 'equivalent' },
  { source: 'CC-2',    target: 'CM-2', score: 88, type: 'equivalent' },
  { source: 'CP-FM-1', target: 'CP-2', score: 92, type: 'equivalent' },
  { source: 'SC-1',    target: 'AC-5', score: 95, type: 'equivalent' },
  { source: 'SM-1',    target: 'PM-1', score: 92, type: 'equivalent' },
  { source: 'SM-2',    target: 'RA-3', score: 90, type: 'equivalent' },
  { source: 'SM-3',    target: 'PM-1', score: 80, type: 'related' },
  { source: 'SM-4',    target: 'PM-4', score: 90, type: 'equivalent' },
];

// ============================================================
// FFIEC IT Examination Handbook → NIST SP 800-53 Rev 5 / NIST CSF 2.0
// ============================================================
const FFIEC_TO_NIST80053 = [
  { source: 'FFIEC-AM-1',  target: 'AC-2', score: 85, type: 'related' },    // ip-hygiene:ignore
  { source: 'FFIEC-AUD-1', target: 'CA-2', score: 88, type: 'equivalent' }, // ip-hygiene:ignore
  { source: 'FFIEC-AUD-2', target: 'CA-2', score: 75, type: 'related' },   // ip-hygiene:ignore
  { source: 'FFIEC-BCP-1', target: 'CP-2', score: 92, type: 'equivalent' },// ip-hygiene:ignore
  { source: 'FFIEC-BCP-2', target: 'CP-4', score: 88, type: 'equivalent' },// ip-hygiene:ignore
  { source: 'FFIEC-IS-1',  target: 'PM-1', score: 90, type: 'equivalent' },// ip-hygiene:ignore
  { source: 'FFIEC-IS-2',  target: 'RA-3', score: 92, type: 'equivalent' },// ip-hygiene:ignore
  { source: 'FFIEC-OPS-2', target: 'CM-3', score: 88, type: 'equivalent' },// ip-hygiene:ignore
];

const FFIEC_TO_NIST_CSF = [
  { source: 'FFIEC-CYB-1', target: 'ID.RA-01', score: 82, type: 'related' },    // ip-hygiene:ignore
  { source: 'FFIEC-CYB-2', target: 'ID.RA-02', score: 90, type: 'equivalent' }, // ip-hygiene:ignore
  { source: 'FFIEC-IS-3',  target: 'PR.PS-01', score: 75, type: 'related' },    // ip-hygiene:ignore
  { source: 'FFIEC-OPS-1', target: 'PR.PS-01', score: 72, type: 'related' },    // ip-hygiene:ignore
];

// ============================================================
// SR 11-7 Model Risk Management → NIST AI RMF 1.0
// ============================================================
const SR117_TO_NIST_AI_RMF = [
  { source: 'SR117-D-1', target: 'MEASURE-2', score: 75, type: 'related' },
  { source: 'SR117-D-2', target: 'MAP-1',     score: 70, type: 'related' },
  { source: 'SR117-G-1', target: 'GOVERN-1',  score: 95, type: 'equivalent' },
  { source: 'SR117-G-2', target: 'GOVERN-1',  score: 82, type: 'related' },
  { source: 'SR117-G-3', target: 'GOVERN-6',  score: 92, type: 'equivalent' },
  { source: 'SR117-G-4', target: 'MEASURE-3', score: 90, type: 'equivalent' },
  { source: 'SR117-G-5', target: 'MANAGE-3',  score: 75, type: 'related' },
  { source: 'SR117-G-6', target: 'GOVERN-5',  score: 92, type: 'equivalent' },
  { source: 'SR117-I-1', target: 'MAP-1',     score: 75, type: 'related' },
  { source: 'SR117-I-2', target: 'MAP-2',     score: 88, type: 'equivalent' },
  { source: 'SR117-V-1', target: 'MEASURE-2', score: 88, type: 'equivalent' },
  { source: 'SR117-V-2', target: 'MEASURE-2', score: 78, type: 'related' },
  { source: 'SR117-V-3', target: 'MEASURE-4', score: 85, type: 'equivalent' },
];

// ============================================================
// SEC AI Risk Management for RIAs & Broker-Dealers → NIST AI RMF / SR 11-7
// ============================================================
const SEC_AI_TO_NIST_AI_RMF = [
  { source: 'SEC-AI-2',  target: 'MAP-5',     score: 72, type: 'related' },
  { source: 'SEC-AI-3',  target: 'MAP-5',     score: 75, type: 'related' },
  { source: 'SEC-AI-5',  target: 'GOVERN-1',  score: 90, type: 'equivalent' },
  { source: 'SEC-AI-7',  target: 'GOVERN-2',  score: 78, type: 'related' },
  { source: 'SEC-AI-10', target: 'MEASURE-3', score: 75, type: 'related' },
];
const SEC_AI_TO_SR117 = [
  { source: 'SEC-AI-8', target: 'SR117-V-1', score: 90, type: 'equivalent' },
];
const SEC_AI_TO_EU_AI_ACT = [
  { source: 'SEC-AI-7', target: 'AIA-Art14', score: 82, type: 'related' },
];

// ============================================================
// FINRA Supervisory Controls for AI → NIST AI RMF / SR 11-7 / EU AI Act
// ============================================================
const FINRA_AI_TO_NIST_AI_RMF = [
  { source: 'FINRA-SUP-1', target: 'GOVERN-1',  score: 88, type: 'equivalent' },
  { source: 'FINRA-SUP-3', target: 'MEASURE-2', score: 68, type: 'related' },
  { source: 'FINRA-SUP-4', target: 'MEASURE-3', score: 72, type: 'related' },
  { source: 'FINRA-SUP-5', target: 'GOVERN-5',  score: 90, type: 'equivalent' },
  { source: 'FINRA-SUP-6', target: 'MANAGE-3',  score: 75, type: 'related' },
  { source: 'FINRA-SUP-8', target: 'MEASURE-2', score: 85, type: 'equivalent' },
];
const FINRA_AI_TO_SR117 = [
  { source: 'FINRA-SUP-9', target: 'SR117-G-5', score: 88, type: 'equivalent' },
];
const FINRA_AI_TO_EU_AI_ACT = [
  { source: 'FINRA-SUP-10', target: 'AIA-Art12', score: 85, type: 'equivalent' },
];

// ============================================================
// International AI Governance Laws — EU-AIA-* subset → EU AI Act
// (near-duplicate content within this platform's own catalog)
// ============================================================
const INTL_EU_SUBSET_TO_EU_AI_ACT = [
  { source: 'EU-AIA-1',  target: 'AIA-Art52', score: 98, type: 'equivalent' },
  { source: 'EU-AIA-2',  target: 'AIA-Art6',  score: 98, type: 'equivalent' },
  { source: 'EU-AIA-3',  target: 'AIA-Art9',  score: 98, type: 'equivalent' },
  { source: 'EU-AIA-4',  target: 'AIA-Art10', score: 98, type: 'equivalent' },
  { source: 'EU-AIA-5',  target: 'AIA-Art11', score: 98, type: 'equivalent' },
  { source: 'EU-AIA-6',  target: 'AIA-Art12', score: 98, type: 'equivalent' },
  { source: 'EU-AIA-7',  target: 'AIA-Art13', score: 98, type: 'equivalent' },
  { source: 'EU-AIA-8',  target: 'AIA-Art14', score: 98, type: 'equivalent' },
  { source: 'EU-AIA-9',  target: 'AIA-Art50', score: 82, type: 'related' },
  { source: 'EU-AIA-10', target: 'AIA-Art27', score: 98, type: 'equivalent' },
];

// ============================================================
// International AI Governance Laws (non-EU-subset) → NIST AI RMF / EU AI Act / NIST Privacy
// ============================================================
const INTL_AI_TO_NIST_AI_RMF = [
  { source: 'AU-AI-2',     target: 'GOVERN-1',  score: 72, type: 'related' },
  { source: 'AU-AI-3',     target: 'GOVERN-2',  score: 72, type: 'related' },
  { source: 'BR-AI-3',     target: 'MAP-5',     score: 85, type: 'equivalent' },
  { source: 'BR-AI-4',     target: 'MEASURE-2', score: 78, type: 'related' },
  { source: 'CA-AIDA-1',   target: 'MAP-2',     score: 85, type: 'equivalent' },
  { source: 'CA-AIDA-2',   target: 'MANAGE-1',  score: 85, type: 'equivalent' },
  { source: 'CA-AIDA-4',   target: 'MEASURE-3', score: 78, type: 'related' },
  { source: 'INTL-CORE-1', target: 'GOVERN-1',  score: 75, type: 'related' },
  { source: 'INTL-CORE-2', target: 'MAP-1',     score: 72, type: 'related' },
  { source: 'INTL-CORE-3', target: 'MEASURE-2', score: 75, type: 'related' },
  { source: 'INTL-CORE-5', target: 'GOVERN-6',  score: 82, type: 'equivalent' },
  { source: 'INTL-CORE-6', target: 'GOVERN-1',  score: 70, type: 'related' },
  { source: 'JP-AI-2',     target: 'GOVERN-1',  score: 72, type: 'related' },
  { source: 'KR-AI-1',     target: 'MAP-5',     score: 82, type: 'equivalent' },
  { source: 'KR-AI-3',     target: 'GOVERN-2',  score: 78, type: 'related' },
  { source: 'SG-AI-1',     target: 'GOVERN-2',  score: 85, type: 'equivalent' },
  { source: 'SG-AI-3',     target: 'MEASURE-3', score: 78, type: 'related' },
  { source: 'UK-AI-3',     target: 'MEASURE-2', score: 78, type: 'related' },
  { source: 'UK-AI-4',     target: 'GOVERN-2',  score: 82, type: 'equivalent' },
];

const INTL_AI_TO_EU_AI_ACT = [
  { source: 'AU-AI-1',   target: 'AIA-Art13', score: 75, type: 'related' },
  { source: 'BR-AI-1',   target: 'AIA-Art13', score: 75, type: 'related' },
  { source: 'BR-AI-2',   target: 'AIA-Art14', score: 85, type: 'equivalent' },
  { source: 'CA-AIDA-3', target: 'AIA-Art13', score: 78, type: 'related' },
  { source: 'CN-AI-1',   target: 'AIA-Art50', score: 85, type: 'equivalent' },
  { source: 'CN-AI-2',   target: 'AIA-Art13', score: 75, type: 'related' },
  { source: 'CN-AI-3',   target: 'AIA-Art52', score: 70, type: 'related' },
  { source: 'CN-AI-4',   target: 'AIA-Art50', score: 75, type: 'related' },
  { source: 'INTL-CORE-4', target: 'AIA-Art50', score: 72, type: 'related' },
  { source: 'JP-AI-3',   target: 'AIA-Art50', score: 72, type: 'related' },
  { source: 'KR-AI-2',   target: 'AIA-Art13', score: 78, type: 'related' },
  { source: 'SG-AI-2',   target: 'AIA-Art14', score: 85, type: 'equivalent' },
  { source: 'UK-AI-1',   target: 'AIA-Art9',  score: 75, type: 'related' },
  { source: 'UK-AI-2',   target: 'AIA-Art13', score: 85, type: 'equivalent' },
  { source: 'UK-AI-5',   target: 'AIA-Art14', score: 72, type: 'related' },
];

const INTL_AI_TO_NIST_PRIVACY = [
  { source: 'IN-AI-1',  target: 'CM-P.02', score: 82, type: 'equivalent' },
  { source: 'IN-AI-2',  target: 'CT-P.02', score: 72, type: 'related' },
  { source: 'JP-AI-1',  target: 'GV-P.01', score: 75, type: 'related' },
  { source: 'SG-AI-4',  target: 'PR-P.01', score: 75, type: 'related' },
];

// ============================================================
// State AI Governance Laws → NIST AI RMF / EU AI Act / NIST Privacy /
// sibling International AI Governance controls (SAI-CORE ↔ INTL-CORE)
// ============================================================
const STATE_AI_TO_NIST_AI_RMF = [
  { source: 'CA-AI-3',  target: 'MAP-5',     score: 72, type: 'related' },
  { source: 'CO-AI-1',  target: 'MAP-5',     score: 85, type: 'equivalent' },
  { source: 'CO-AI-3',  target: 'MEASURE-2', score: 85, type: 'equivalent' },
  { source: 'CT-AI-1',  target: 'GOVERN-1',  score: 70, type: 'related' },
  { source: 'CT-AI-2',  target: 'MAP-5',     score: 75, type: 'related' },
  { source: 'CT-AI-3',  target: 'GOVERN-6',  score: 70, type: 'related' },
  { source: 'MD-AI-1',  target: 'MEASURE-2', score: 85, type: 'equivalent' },
  { source: 'NY-AI-2',  target: 'MEASURE-2', score: 75, type: 'related' },
  { source: 'NYC-AI-1', target: 'MEASURE-2', score: 85, type: 'equivalent' },
  { source: 'TX-AI-2',  target: 'MANAGE-1',  score: 82, type: 'equivalent' },
  { source: 'TX-AI-3',  target: 'MEASURE-3', score: 75, type: 'related' },
  { source: 'SAI-CORE-5', target: 'GOVERN-2', score: 70, type: 'related' },
  { source: 'VA-AI-1',  target: 'MAP-5',     score: 85, type: 'equivalent' },
  { source: 'VA-AI-3',  target: 'MANAGE-2',  score: 75, type: 'related' },
  { source: 'WA-AI-1',  target: 'MAP-1',     score: 82, type: 'equivalent' },
  { source: 'WA-AI-2',  target: 'MAP-5',     score: 78, type: 'related' },
];

const STATE_AI_TO_EU_AI_ACT = [
  { source: 'CA-AI-2',  target: 'AIA-Art10', score: 75, type: 'related' },
  { source: 'CA-AI-4',  target: 'AIA-Art13', score: 72, type: 'related' },
  { source: 'CO-AI-2',  target: 'AIA-Art13', score: 82, type: 'equivalent' },
  { source: 'CO-AI-4',  target: 'AIA-Art14', score: 75, type: 'related' },
  { source: 'CO-AI-5',  target: 'AIA-Art11', score: 78, type: 'related' },
  { source: 'IL-AI-3',  target: 'AIA-Art14', score: 72, type: 'related' },
  { source: 'IL-AI-4',  target: 'AIA-Art13', score: 75, type: 'related' },
  { source: 'NY-AI-1',  target: 'AIA-Art13', score: 75, type: 'related' },
  { source: 'TX-AI-1',  target: 'AIA-Art13', score: 75, type: 'related' },
  { source: 'UT-AI-1',  target: 'AIA-Art50', score: 75, type: 'related' },
  { source: 'UT-AI-2',  target: 'AIA-Art50', score: 72, type: 'related' },
  { source: 'VA-AI-3',  target: 'AIA-Art14', score: 78, type: 'related' },
  { source: 'WA-AI-3',  target: 'AIA-Art13', score: 75, type: 'related' },
];

const STATE_AI_TO_NIST_PRIVACY = [
  { source: 'CA-AI-6', target: 'ID-P.01', score: 72, type: 'related' },
];

// State AI Governance "core" controls mirror the International AI
// Governance "core" controls almost exactly (both are the platform's own
// multi-jurisdiction program-management scaffolding controls).
const STATE_AI_CORE_TO_INTL_AI_CORE = [
  { source: 'SAI-CORE-1', target: 'INTL-CORE-1', score: 90, type: 'equivalent' },
  { source: 'SAI-CORE-2', target: 'INTL-CORE-2', score: 92, type: 'equivalent' },
  { source: 'SAI-CORE-3', target: 'INTL-CORE-3', score: 90, type: 'equivalent' },
  { source: 'SAI-CORE-4', target: 'INTL-CORE-4', score: 88, type: 'equivalent' },
  { source: 'SAI-CORE-6', target: 'INTL-CORE-6', score: 92, type: 'equivalent' },
];

async function insertCrosswalk(client, mapping, sourceFwCode, targetFwCode) {
  const srcFw = await client.query('SELECT id FROM frameworks WHERE code = $1 LIMIT 1', [sourceFwCode]);
  if (srcFw.rows.length === 0) return { inserted: false, reason: `framework not found: ${sourceFwCode}` };

  const srcCtrl = await client.query(
    'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2 LIMIT 1',
    [srcFw.rows[0].id, mapping.source]
  );
  if (srcCtrl.rows.length === 0) return { inserted: false, reason: `control not found: ${sourceFwCode}/${mapping.source}` };

  const tgtFw = await client.query('SELECT id FROM frameworks WHERE code = $1 LIMIT 1', [targetFwCode]);
  if (tgtFw.rows.length === 0) return { inserted: false, reason: `framework not found: ${targetFwCode}` };

  const tgtCtrl = await client.query(
    'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2 LIMIT 1',
    [tgtFw.rows[0].id, mapping.target]
  );
  if (tgtCtrl.rows.length === 0) return { inserted: false, reason: `control not found: ${targetFwCode}/${mapping.target}` };

  const existing = await client.query(
    `SELECT id FROM control_mappings
     WHERE (source_control_id = $1 AND target_control_id = $2)
        OR (source_control_id = $2 AND target_control_id = $1)
     LIMIT 1`,
    [srcCtrl.rows[0].id, tgtCtrl.rows[0].id]
  );
  if (existing.rows.length > 0) return { inserted: false, reason: 'duplicate' };

  await client.query(
    `INSERT INTO control_mappings (source_control_id, target_control_id, similarity_score, mapping_type)
     VALUES ($1, $2, $3, $4)`,
    [srcCtrl.rows[0].id, tgtCtrl.rows[0].id, mapping.score, mapping.type]
  );
  return { inserted: true };
}

async function processMappings(client, label, mappings, sourceFw, targetFw) {
  let inserted = 0;
  let skipped = 0;
  const failures = [];

  for (const mapping of mappings) {
    const result = await insertCrosswalk(client, mapping, sourceFw, targetFw);
    if (result.inserted) {
      inserted++;
    } else {
      skipped++;
      if (result.reason !== 'duplicate') {
        const detail = `${sourceFw}/${mapping.source} -> ${targetFw}/${mapping.target}: ${result.reason}`;
        console.warn(`  [SKIP] ${detail}`);
        failures.push(detail);
      }
    }
  }

  console.log(`  [OK] ${label}: ${inserted} inserted, ${skipped} skipped/already exist`);

  if (STRICT && failures.length > 0) {
    throw new Error(
      `Strict seeding failed: ${failures.length} non-duplicate mapping(s) could not be inserted for ${label}.`
    );
  }

  return inserted;
}

const BATCHES = [
  ['HITECH → HIPAA', HITECH_TO_HIPAA, 'hitech', 'hipaa'],
  ['ISO 27002 → ISO 27001', ISO27002_TO_ISO27001, 'iso_27002', 'iso_27001'],
  ['ISO 27005 → ISO 31000', ISO27005_TO_ISO31000, 'iso_27005', 'iso_31000'],
  ['ISO 27005 → NIST 800-53', ISO27005_TO_NIST80053, 'iso_27005', 'nist_800_53'],
  ['ISO 31000 → NIST 800-53', ISO31000_TO_NIST80053, 'iso_31000', 'nist_800_53'],
  ['ISO 27017 → ISO 27001', ISO27017_TO_ISO27001, 'iso_27017', 'iso_27001'],
  ['ISO 27018 → ISO 27701', ISO27018_TO_ISO27701, 'iso_27018', 'iso_27701'],
  ['ISO 27018 → NIST Privacy', ISO27018_TO_NIST_PRIVACY, 'iso_27018', 'nist_privacy'],
  ['ISO 42005 → NIST AI RMF', ISO42005_TO_NIST_AI_RMF, 'iso_42005', 'nist_ai_rmf'],
  ['FISCAM → NIST 800-53', FISCAM_TO_NIST80053, 'fiscam', 'nist_800_53'],
  ['FFIEC → NIST 800-53', FFIEC_TO_NIST80053, 'ffiec', 'nist_800_53'],
  ['FFIEC → NIST CSF 2.0', FFIEC_TO_NIST_CSF, 'ffiec', 'nist_csf_2.0'],
  ['SR 11-7 → NIST AI RMF', SR117_TO_NIST_AI_RMF, 'sr_11_7', 'nist_ai_rmf'],
  ['SEC AI Risk → NIST AI RMF', SEC_AI_TO_NIST_AI_RMF, 'sec_markets_ai_risk', 'nist_ai_rmf'],
  ['SEC AI Risk → SR 11-7', SEC_AI_TO_SR117, 'sec_markets_ai_risk', 'sr_11_7'],
  ['SEC AI Risk → EU AI Act', SEC_AI_TO_EU_AI_ACT, 'sec_markets_ai_risk', 'eu_ai_act'],
  ['FINRA Supervisory AI → NIST AI RMF', FINRA_AI_TO_NIST_AI_RMF, 'finra_supervisory_ai', 'nist_ai_rmf'],
  ['FINRA Supervisory AI → SR 11-7', FINRA_AI_TO_SR117, 'finra_supervisory_ai', 'sr_11_7'],
  ['FINRA Supervisory AI → EU AI Act', FINRA_AI_TO_EU_AI_ACT, 'finra_supervisory_ai', 'eu_ai_act'],
  ['Intl AI Gov (EU subset) → EU AI Act', INTL_EU_SUBSET_TO_EU_AI_ACT, 'international_ai_governance', 'eu_ai_act'],
  ['Intl AI Gov → NIST AI RMF', INTL_AI_TO_NIST_AI_RMF, 'international_ai_governance', 'nist_ai_rmf'],
  ['Intl AI Gov → EU AI Act', INTL_AI_TO_EU_AI_ACT, 'international_ai_governance', 'eu_ai_act'],
  ['Intl AI Gov → NIST Privacy', INTL_AI_TO_NIST_PRIVACY, 'international_ai_governance', 'nist_privacy'],
  ['State AI Gov → NIST AI RMF', STATE_AI_TO_NIST_AI_RMF, 'state_ai_governance', 'nist_ai_rmf'],
  ['State AI Gov → EU AI Act', STATE_AI_TO_EU_AI_ACT, 'state_ai_governance', 'eu_ai_act'],
  ['State AI Gov → NIST Privacy', STATE_AI_TO_NIST_PRIVACY, 'state_ai_governance', 'nist_privacy'],
  ['State AI Gov (core) → Intl AI Gov (core)', STATE_AI_CORE_TO_INTL_AI_CORE, 'state_ai_governance', 'international_ai_governance'],
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('\n=== Crosswalk Completion — zero-mapped frameworks ===\n');

    let total = 0;
    for (const [label, mappings, sourceFw, targetFw] of BATCHES) {
      total += await processMappings(client, label, mappings, sourceFw, targetFw);
    }

    await client.query('COMMIT');

    const count = await client.query('SELECT COUNT(*) AS n FROM control_mappings');
    console.log('\n========================================');
    console.log(`New crosswalk mappings added: ${total}`);
    console.log(`Total crosswalk mappings in platform: ${count.rows[0].n}`);
    console.log('========================================\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { BATCHES };
