// @tier: pro
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createHash } = require('crypto');
const xml2js = require('xml2js');
const pool = require('../config/database');
const { authenticate, requirePermission, requireTier } = require('../middleware/auth');
const { getConfigValue } = require('../services/dynamicConfigService');
const { vulnerabilityCreated } = require('../services/realtimeEventService');
const { mapCweToOwasp2025 } = require('../utils/owaspMapping');

router.use(authenticate);
router.use(requireTier('pro'));

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const STATUS_ORDER = ['open', 'in_progress', 'remediated', 'risk_accepted', 'false_positive'];
const ACTION_TYPE_ORDER = ['poam', 'close_control_gap', 'risk_acceptance', 'false_positive_review'];
const ACTION_STATUS_ORDER = ['open', 'in_progress', 'resolved', 'accepted', 'closed'];
const CONTROL_EFFECT_ORDER = ['non_compliant', 'partial', 'compliant'];

const CONTROL_IMPACT_BY_FRAMEWORK = {
  nist_800_53: ['RA-5', 'SI-2', 'CA-7', 'CA-5'],
  'nist_csf_2.0': ['ID.RA-01', 'DE.CM-01', 'PR.PS-02'],
  iso_27001: ['A.8.8', 'A.8.9', 'A.5.7'],
  soc2: ['CC7.1', 'CC7.2', 'CC7.3', 'CC8.1'],
  hipaa: ['164.308(a)(1)(ii)(A)', '164.308(a)(8)'],
  nist_ai_rmf: ['MEASURE', 'MANAGE'],
  owasp_top10_2025: [
    'A01:2025', 'A02:2025', 'A03:2025', 'A04:2025', 'A05:2025',
    'A06:2025', 'A07:2025', 'A08:2025', 'A09:2025', 'A10:2025'
  ]
};

const FALLBACK_CONTROL_KEYWORDS = ['vulnerab', 'patch', 'remedi', 'scan', 'hardening', 'configuration'];

const FRAMEWORK_ALIGNED_STANDARDS = [
  { key: 'cve_nvd', label: 'CVE / NVD', aligns_with: ['NIST CSF 2.0', 'NIST 800-53 RA-5', 'ISO 27001 A.8.8', 'SOC 2 CC7'] },
  { key: 'cvss', label: 'CVSS', aligns_with: ['NIST RMF', 'ISO 27001 risk treatment', 'HIPAA risk analysis'] },
  { key: 'cwe', label: 'CWE', aligns_with: ['Secure SDLC controls', 'SOC 2 CC8'] },
  { key: 'disa_stig', label: 'DISA STIG', aligns_with: ['DoD/NIST control hardening', 'NERC CIP baseline hardening'] },
  { key: 'iavm', label: 'IAVM (DoD IA Vulnerability Alerts)', aligns_with: ['NIST 800-53 SI-2', 'NIST 800-53 RA-5', 'DoD 8500.01', 'FedRAMP continuous monitoring'] },
  { key: 'scap', label: 'SCAP', aligns_with: ['Automated vulnerability/compliance checks', 'NIST 800-53 RA-5'] },
  { key: 'spdx_cyclonedx', label: 'SBOM (SPDX / CycloneDX)', aligns_with: ['Supply chain controls', 'NIST SSDF', 'EU AI Act transparency'] },
  { key: 'cisa_kev', label: 'CISA KEV', aligns_with: ['Threat-informed prioritization', 'NIST CSF Detect/Respond'] },
  { key: 'cis_benchmarks', label: 'CIS Benchmarks', aligns_with: ['Configuration hardening', 'ISO 27001 A.8.9'] },
  { key: 'owasp', label: 'OWASP (Top 10 / ASVS)', aligns_with: ['Application security controls', 'SOC 2 CC7/CC8'] },
  { key: 'pci_asv', label: 'PCI DSS ASV / Pen Test Artifacts', aligns_with: ['PCI DSS v4 Req. 11'] },
  { key: 'fedramp_sar_poam', label: 'FedRAMP SAR / POA&M', aligns_with: ['FedRAMP continuous monitoring', 'NIST 800-53 RA/CA families'] },
  { key: 'hitrust', label: 'HITRUST Vulnerability Evidence', aligns_with: ['HITRUST 09.x vulnerability management'] },
  { key: 'iso_42001', label: 'AI Vulnerability & Model Security Evidence', aligns_with: ['ISO/IEC 42001 AI management controls', 'ISO/IEC 42005 impact assessments', 'NIST AI RMF'] }, // ip-hygiene:ignore
];

const FRAMEWORK_REQUIRED_ARTIFACTS = [
  {
    framework: 'NIST 800-53 / RMF',
    controls: ['RA-5', 'SI-2', 'CA-7'],
    required_artifacts: ['Authenticated scan reports (ACAS/Nessus/etc.)', 'POA&M with due dates', 'STIG/SCAP hardening evidence', 'Remediation/patch closure evidence']
  },
  {
    framework: 'NIST CSF 2.0',
    controls: ['DE.CM', 'ID.RA', 'PR.PS'],
    required_artifacts: ['Risk-prioritized vulnerability backlog', 'KEV exposure tracking', 'Asset-to-finding mapping', 'Trend metrics and executive reporting']
  },
  {
    framework: 'ISO 27001:2022',
    controls: ['A.8.8', 'A.8.9', 'A.5.7'],
    required_artifacts: ['Vulnerability assessment records', 'Patch/change records', 'Supplier/component vulnerability evidence (SBOM)', 'Risk treatment decisions']
  },
  {
    framework: 'SOC 2',
    controls: ['CC7.1', 'CC7.2', 'CC7.3', 'CC8.1'],
    required_artifacts: ['Detection monitoring outputs', 'Ticketed remediation workflow', 'Exception/risk acceptance approvals', 'Evidence of secure change validation']
  },
  {
    framework: 'HIPAA Security Rule',
    controls: ['164.308(a)(1)(ii)(A)', '164.308(a)(8)'],
    required_artifacts: ['Risk analysis including technical vulnerabilities', 'Risk management plan', 'Periodic technical evaluation evidence', 'Corrective action documentation']
  },
  {
    framework: 'PCI DSS v4',
    controls: ['11.3', '11.5', '6.3'],
    required_artifacts: ['External/internal scan evidence', 'Pen test and retest evidence', 'Change-driven vulnerability assessment', 'Remediation timelines for critical findings']
  },
  {
    framework: 'FedRAMP',
    controls: ['RA-5', 'CA-7', 'SI-2'],
    required_artifacts: ['Monthly scan data', 'System Assessment Report deltas', 'POA&M updates', 'Continuous monitoring submissions']
  },
  {
    framework: 'AI Governance (NIST AI RMF / ISO 42001 / ISO 42005)',
    controls: ['MAP', 'MEASURE', 'MANAGE'],
    required_artifacts: ['AI system impact assessment record(s)', 'Model/software bill of materials', 'Dependency and model vulnerability scans', 'Adversarial/test findings', 'Risk response and approval records']
  }
];

async function getVulnerabilityDynamicConfig(orgId) {
  const config = {
    controlImpactByFramework: CONTROL_IMPACT_BY_FRAMEWORK,
    fallbackControlKeywords: FALLBACK_CONTROL_KEYWORDS,
    frameworkAlignedStandards: FRAMEWORK_ALIGNED_STANDARDS,
    frameworkRequiredArtifacts: FRAMEWORK_REQUIRED_ARTIFACTS
  };

  const controlImpactByFramework = await getConfigValue(orgId, 'vulnerability', 'control_impact_by_framework', null);
  if (controlImpactByFramework && typeof controlImpactByFramework === 'object' && !Array.isArray(controlImpactByFramework)) {
    config.controlImpactByFramework = controlImpactByFramework;
  }

  const fallbackControlKeywords = await getConfigValue(orgId, 'vulnerability', 'fallback_control_keywords', null);
  if (Array.isArray(fallbackControlKeywords) && fallbackControlKeywords.length > 0) {
    config.fallbackControlKeywords = fallbackControlKeywords.map((item) => String(item).toLowerCase());
  }

  const frameworkAlignedStandards = await getConfigValue(orgId, 'vulnerability', 'framework_aligned_standards', null);
  if (Array.isArray(frameworkAlignedStandards) && frameworkAlignedStandards.length > 0) {
    config.frameworkAlignedStandards = frameworkAlignedStandards;
  }

  const frameworkRequiredArtifacts = await getConfigValue(orgId, 'vulnerability', 'framework_required_artifacts', null);
  if (Array.isArray(frameworkRequiredArtifacts) && frameworkRequiredArtifacts.length > 0) {
    config.frameworkRequiredArtifacts = frameworkRequiredArtifacts;
  }

  return config;
}

function parseListParam(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function buildWhereClause(orgId, queryParams) {
  const where = ['vf.organization_id = $1'];
  const params = [orgId];
  let idx = 2;

  const sourceList = parseListParam(queryParams.source).filter((v) => v.toLowerCase() !== 'all');
  if (sourceList.length > 0) {
    where.push(`vf.source = ANY($${idx}::text[])`);
    params.push(sourceList);
    idx++;
  }

  const standardList = parseListParam(queryParams.standard).filter((v) => v.toLowerCase() !== 'all');
  if (standardList.length > 0) {
    where.push(`vf.standard = ANY($${idx}::text[])`);
    params.push(standardList);
    idx++;
  }

  const severityList = parseListParam(queryParams.severity).filter((v) => v.toLowerCase() !== 'all');
  if (severityList.length > 0) {
    where.push(`vf.severity = ANY($${idx}::text[])`);
    params.push(severityList);
    idx++;
  }

  const statusList = parseListParam(queryParams.status).filter((v) => v.toLowerCase() !== 'all');
  if (statusList.length > 0) {
    where.push(`vf.status = ANY($${idx}::text[])`);
    params.push(statusList);
    idx++;
  }

  if (queryParams.assetId) {
    where.push(`vf.asset_id = $${idx}`);
    params.push(queryParams.assetId);
    idx++;
  }

  if (queryParams.minCvss) {
    where.push(`COALESCE(vf.cvss_score, 0) >= $${idx}`);
    params.push(Number(queryParams.minCvss));
    idx++;
  }

  if (queryParams.maxCvss) {
    where.push(`COALESCE(vf.cvss_score, 0) <= $${idx}`);
    params.push(Number(queryParams.maxCvss));
    idx++;
  }

  if (queryParams.search) {
    where.push(`(
      vf.vulnerability_id ILIKE $${idx}
      OR vf.title ILIKE $${idx}
      OR vf.finding_key ILIKE $${idx}
      OR COALESCE(vf.package_name, '') ILIKE $${idx}
      OR COALESCE(vf.component_name, '') ILIKE $${idx}
      OR COALESCE(a.name, '') ILIKE $${idx}
      OR COALESCE(a.hostname, '') ILIKE $${idx}
    )`);
    params.push(`%${queryParams.search}%`);
    idx++;
  }

  return { whereClause: where.join(' AND '), params };
}

function normalizeControlId(value) {
  return String(value || '').trim().toUpperCase();
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function inferActionType(finding) {
  if (finding.status === 'risk_accepted') return 'risk_acceptance';
  if (finding.status === 'false_positive') return 'false_positive_review';
  return 'poam';
}

function inferActionStatus(finding) {
  if (finding.status === 'remediated') return 'resolved';
  if (finding.status === 'risk_accepted') return 'accepted';
  if (finding.status === 'false_positive') return 'closed';
  return 'open';
}

function inferControlEffect(finding) {
  if (finding.status === 'remediated' || finding.status === 'false_positive') return 'compliant';
  if (finding.status === 'risk_accepted') return 'partial';
  if (String(finding.severity || '').toLowerCase() === 'critical' || String(finding.severity || '').toLowerCase() === 'high') {
    return 'non_compliant';
  }
  return 'partial';
}

function defaultDueDate(finding) {
  const provided = parseDateOnly(finding.due_date);
  if (provided) return provided;
  const days = String(finding.severity || '').toLowerCase() === 'critical' ? 14 : 30;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildWorkflowSummary(finding, control) {
  return `Control ${control.control_id} requires vulnerability response for ${finding.vulnerability_id} (${finding.severity}).`;
}

async function resolveControlImpacts(client, orgId, controlImpactByFramework, fallbackControlKeywords) {
  const controlRows = await client.query(
    `SELECT
       fc.id AS framework_control_id,
       fc.control_id,
       fc.title,
       f.code AS framework_code,
       f.name AS framework_name
     FROM organization_frameworks ofw
     JOIN frameworks f ON f.id = ofw.framework_id
     JOIN framework_controls fc ON fc.framework_id = f.id
     WHERE ofw.organization_id = $1`,
    [orgId]
  );

  const byFramework = new Map();
  for (const row of controlRows.rows) {
    const code = row.framework_code || 'unknown';
    if (!byFramework.has(code)) byFramework.set(code, []);
    byFramework.get(code).push(row);
  }

  const selected = [];
  for (const [frameworkCode, controls] of byFramework.entries()) {
    const mappedControlIds = ((controlImpactByFramework && controlImpactByFramework[frameworkCode]) || []).map(normalizeControlId);
    let candidates = controls.filter((control) => mappedControlIds.includes(normalizeControlId(control.control_id)));

    if (candidates.length === 0) {
      candidates = controls.filter((control) => {
        const haystack = `${control.control_id || ''} ${control.title || ''}`.toLowerCase();
        return fallbackControlKeywords.some((keyword) => haystack.includes(keyword));
      }).slice(0, 3);
    }

    selected.push(...candidates);
  }

  const deduped = new Map();
  for (const control of selected) {
    deduped.set(control.framework_control_id, control);
  }
  return Array.from(deduped.values());
}

async function upsertControlImplementationImpact(client, orgId, userId, finding, control) {
  const noteLine = `Vulnerability impact flagged: ${finding.vulnerability_id} (${finding.finding_key}).`;
  const shouldFlagNeedsReview = ['open', 'in_progress', 'risk_accepted'].includes(String(finding.status || '').toLowerCase());

  const existing = await client.query(
    `SELECT id, status, notes
     FROM control_implementations
     WHERE organization_id = $1 AND control_id = $2
     LIMIT 1`,
    [orgId, control.framework_control_id]
  );

  if (existing.rows.length === 0) {
    if (!shouldFlagNeedsReview) return { implementationId: null, statusChanged: false };
    const inserted = await client.query(
      `INSERT INTO control_implementations (control_id, organization_id, status, notes, created_at)
       VALUES ($1, $2, 'needs_review', $3, NOW())
       ON CONFLICT (control_id, organization_id) DO NOTHING
       RETURNING id, status`,
      [control.framework_control_id, orgId, noteLine]
    );
    return {
      implementationId: inserted.rows[0]?.id || null,
      statusChanged: inserted.rows.length > 0
    };
  }

  const current = existing.rows[0];
  let statusChanged = false;

  if (shouldFlagNeedsReview && !['needs_review', 'in_progress'].includes(current.status)) {
    await client.query(
      `UPDATE control_implementations
       SET status = 'needs_review',
           notes = CASE
             WHEN COALESCE(notes, '') ILIKE $3 THEN notes
             WHEN COALESCE(notes, '') = '' THEN $2
             ELSE notes || E'\n' || $2
           END
       WHERE id = $1`,
      [current.id, noteLine, `%${finding.finding_key}%`]
    );
    statusChanged = true;
  }

  if (statusChanged) {
    await client.query(
      `INSERT INTO audit_logs (
         organization_id, user_id, event_type, resource_type, resource_id, details, success
       )
       VALUES ($1, $2, 'control_impact_flagged', 'control', $3, $4::jsonb, true)`,
      [
        orgId,
        userId,
        control.framework_control_id,
        JSON.stringify({
          vulnerability_id: finding.id,
          vulnerability_key: finding.finding_key,
          control_id: control.control_id,
          framework_code: control.framework_code
        })
      ]
    );
  }

  return { implementationId: current.id, statusChanged };
}

async function ensureControlImpactWorkflowForFinding(orgId, userId, finding, vulnerabilityConfig) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const controlImpacts = await resolveControlImpacts(
      client,
      orgId,
      vulnerabilityConfig.controlImpactByFramework || CONTROL_IMPACT_BY_FRAMEWORK,
      vulnerabilityConfig.fallbackControlKeywords || FALLBACK_CONTROL_KEYWORDS
    );
    const createdOrUpdated = [];
    const actionType = inferActionType(finding);
    const actionStatus = inferActionStatus(finding);
    const controlEffect = inferControlEffect(finding);
    const dueDate = defaultDueDate(finding);

    for (const control of controlImpacts) {
      const workflowResult = await client.query(
        `INSERT INTO vulnerability_control_work_items (
           organization_id, vulnerability_id, framework_control_id, action_type, action_status,
           control_effect, response_summary, due_date, created_by, updated_by, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10::jsonb)
         ON CONFLICT (organization_id, vulnerability_id, framework_control_id)
         DO UPDATE SET
           action_type = EXCLUDED.action_type,
           action_status = CASE
             WHEN vulnerability_control_work_items.action_status IN ('resolved', 'accepted', 'closed')
               THEN vulnerability_control_work_items.action_status
             ELSE EXCLUDED.action_status
           END,
           control_effect = CASE
             WHEN vulnerability_control_work_items.action_status IN ('resolved', 'accepted', 'closed')
               THEN vulnerability_control_work_items.control_effect
             ELSE EXCLUDED.control_effect
           END,
           response_summary = COALESCE(vulnerability_control_work_items.response_summary, EXCLUDED.response_summary),
           due_date = COALESCE(vulnerability_control_work_items.due_date, EXCLUDED.due_date),
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING id, implementation_id`,
        [
          orgId,
          finding.id,
          control.framework_control_id,
          actionType,
          actionStatus,
          controlEffect,
          buildWorkflowSummary(finding, control),
          dueDate,
          userId,
          JSON.stringify({
            source: finding.source,
            standard: finding.standard,
            finding_key: finding.finding_key,
            vulnerability_id: finding.vulnerability_id
          })
        ]
      );

      const workflowItem = workflowResult.rows[0];
      const implementationImpact = await upsertControlImplementationImpact(client, orgId, userId, finding, control);
      if (implementationImpact.implementationId && !workflowItem.implementation_id) {
        await client.query(
          `UPDATE vulnerability_control_work_items
           SET implementation_id = $1, updated_at = NOW(), updated_by = $2
           WHERE id = $3`,
          [implementationImpact.implementationId, userId, workflowItem.id]
        );
      }
      createdOrUpdated.push(workflowItem.id);
    }

    await client.query('COMMIT');
    return createdOrUpdated.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getWorkflowItems(orgId, vulnerabilityId) {
  const workflowResult = await pool.query(
    `SELECT
       vw.id,
       vw.vulnerability_id,
       vw.framework_control_id,
       vw.implementation_id,
       vw.action_type,
       vw.action_status,
       vw.control_effect,
       vw.response_summary,
       vw.response_details,
       vw.due_date,
       vw.closed_at,
       vw.created_at,
       vw.updated_at,
       fc.control_id AS control_code,
       fc.title AS control_title,
       f.code AS framework_code,
       f.name AS framework_name,
       COALESCE(ci.status, 'not_started') AS implementation_status,
       owner.email AS owner_email,
       owner.first_name || ' ' || owner.last_name AS owner_name
     FROM vulnerability_control_work_items vw
     JOIN framework_controls fc ON fc.id = vw.framework_control_id
     JOIN frameworks f ON f.id = fc.framework_id
     LEFT JOIN control_implementations ci ON ci.id = vw.implementation_id
     LEFT JOIN users owner ON owner.id = vw.owner_id
     WHERE vw.organization_id = $1
       AND vw.vulnerability_id = $2
     ORDER BY
       CASE vw.action_status
         WHEN 'open' THEN 1
         WHEN 'in_progress' THEN 2
         WHEN 'accepted' THEN 3
         WHEN 'resolved' THEN 4
         WHEN 'closed' THEN 5
         ELSE 6
       END,
       f.code,
       fc.control_id`,
    [orgId, vulnerabilityId]
  );

  const rows = workflowResult.rows;
  const summary = {
    total: rows.length,
    open: rows.filter((row) => row.action_status === 'open').length,
    in_progress: rows.filter((row) => row.action_status === 'in_progress').length,
    resolved: rows.filter((row) => row.action_status === 'resolved').length,
    accepted: rows.filter((row) => row.action_status === 'accepted').length,
    closed: rows.filter((row) => row.action_status === 'closed').length
  };

  return { items: rows, summary };
}

// ---------- Scan Import ----------
// Upload common compliance artifacts (STIG CKL, ACAS/Nessus, SARIF, Fortify FPR).
// For supported formats, ingest findings into vulnerability_findings (idempotent upsert by finding_key).
const scanUploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(scanUploadsDir)) {
  fs.mkdirSync(scanUploadsDir, { recursive: true });
}

const SCAN_ALLOWED_EXTENSIONS = new Set(['.nessus', '.ckl', '.cklb', '.xml', '.sarif', '.json', '.fpr', '.zip']);

const scanStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, scanUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

const scanUpload = multer({
  storage: scanStorage,
  limits: {
    fileSize: Math.max(1, Number(process.env.SCAN_MAX_UPLOAD_MB || process.env.EVIDENCE_MAX_UPLOAD_MB || 200)) * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!SCAN_ALLOWED_EXTENSIONS.has(ext)) {
      const err = new Error(`Unsupported scan file type: ${ext || 'unknown'}`);
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  }
});

const xmlParser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true, trim: true });

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function truncate(value, maxLen) {
  const str = String(value ?? '');
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function normalizeText(value) {
  const str = String(value ?? '').trim();
  return str.length ? str : '';
}

function tryParseScore(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapNessusSeverity(raw) {
  const level = Number(raw);
  if (level >= 4) return 'critical';
  if (level === 3) return 'high';
  if (level === 2) return 'medium';
  if (level === 1) return 'low';
  return 'info';
}

function mapStigSeverity(raw) {
  const value = normalizeText(raw).toLowerCase();
  if (!value) return 'medium';
  if (value.includes('critical')) return 'critical';
  if (value.includes('high') || value.includes('cat i') || value === 'i') return 'high';
  if (value.includes('medium') || value.includes('cat ii') || value === 'ii') return 'medium';
  if (value.includes('low') || value.includes('cat iii') || value === 'iii') return 'low';
  return 'medium';
}

function mapStigStatus(raw) {
  const value = normalizeText(raw).toLowerCase();
  if (!value) return 'open';
  if (value.includes('notafinding')) return 'remediated';
  if (value.includes('not_applicable') || value.includes('not applicable')) return 'false_positive';
  if (value.includes('not_reviewed') || value.includes('not reviewed')) return 'open';
  if (value.includes('open')) return 'open';
  return 'open';
}

function parseCveList(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '');
  const parts = raw
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const cves = parts.filter((item) => /^cve-\d{4}-\d+/i.test(item)).map((item) => item.toUpperCase());
  return Array.from(new Set(cves));
}

function detectXmlScanType(xmlDoc) {
  if (xmlDoc?.CHECKLIST) return 'stig_ckl';
  if (xmlDoc?.NessusClientData_v2) return 'nessus';
  if (xmlDoc?.FVDL) return 'fortify_fvdl';
  return 'unknown_xml';
}

async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function getDefaultRetentionDate() {
  const retentionDays = Number(process.env.EVIDENCE_DEFAULT_RETENTION_DAYS || 365);
  const dt = new Date();
  dt.setDate(dt.getDate() + Math.max(1, retentionDays));
  return dt.toISOString().split('T')[0];
}

function normalizeRetentionDate(input) {
  if (!input) return getDefaultRetentionDate();
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return getDefaultRetentionDate();
  return parsed.toISOString().split('T')[0];
}

function parseTagsInput(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((t) => String(t).trim()).filter(Boolean);
  }
  return String(input)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

async function loadAssetMatchers(orgId) {
  const result = await pool.query(
    `SELECT id, name, hostname, fqdn, ip_address
     FROM assets
     WHERE organization_id = $1`,
    [orgId]
  );

  const byHostname = new Map();
  const byFqdn = new Map();
  const byIp = new Map();

  for (const row of result.rows) {
    const hostname = normalizeText(row.hostname).toLowerCase();
    const fqdn = normalizeText(row.fqdn).toLowerCase();
    const ip = normalizeText(row.ip_address);
    if (hostname) byHostname.set(hostname, row.id);
    if (fqdn) byFqdn.set(fqdn, row.id);
    if (ip) byIp.set(ip, row.id);
  }

  return { byHostname, byFqdn, byIp };
}

function resolveAssetId(matchers, hints) {
  const hostname = normalizeText(hints?.hostname).toLowerCase();
  const fqdn = normalizeText(hints?.fqdn).toLowerCase();
  const ip = normalizeText(hints?.ip);

  if (hostname && matchers.byHostname.has(hostname)) return matchers.byHostname.get(hostname);
  if (fqdn && matchers.byFqdn.has(fqdn)) return matchers.byFqdn.get(fqdn);
  if (ip && matchers.byIp.has(ip)) return matchers.byIp.get(ip);
  return null;
}

function parseNessusFindings(xmlDoc) {
  const findings = [];
  const report = xmlDoc?.NessusClientData_v2?.Report;
  const reports = toArray(report);

  for (const rep of reports) {
    const hosts = toArray(rep?.ReportHost);
    for (const host of hosts) {
      const hostName = normalizeText(host?.name || host?.$?.name);
      const hostTags = toArray(host?.HostProperties?.tag);
      let hostIp = '';
      for (const tag of hostTags) {
        const tagName = normalizeText(tag?.name || tag?.$?.name).toLowerCase();
        const tagValue = normalizeText(tag?._ || tag?.['#text'] || tag);
        if (tagName === 'host-ip' || tagName === 'host-ipv4') {
          hostIp = tagValue;
        }
      }

      const items = toArray(host?.ReportItem);
      for (const item of items) {
        const pluginId = normalizeText(item?.pluginID || item?.pluginId || item?.pluginid);
        const pluginName = normalizeText(item?.pluginName || item?.plugin_name);
        const port = normalizeText(item?.port);
        const protocol = normalizeText(item?.protocol);
        const severity = mapNessusSeverity(item?.severity);
        const cvssScore = tryParseScore(item?.cvss3_base_score || item?.cvss_base_score || item?.cvss_score);
        const cves = parseCveList(item?.cve);
        const vulnId = cves[0] || (pluginId ? `NESSUS-${pluginId}` : 'NESSUS');
        const standard = cves.length ? 'CVE/NVD' : 'Nessus';

        const descParts = [];
        if (item?.synopsis) descParts.push(`Synopsis: ${normalizeText(item.synopsis)}`);
        if (item?.description) descParts.push(`Description: ${normalizeText(item.description)}`);
        if (item?.solution) descParts.push(`Solution: ${normalizeText(item.solution)}`);
        if (item?.plugin_output) descParts.push(`Output: ${normalizeText(item.plugin_output)}`);
        const description = descParts.filter(Boolean).join('\n\n') || null;

        const location = port && protocol
          ? `${hostName || hostIp || 'unknown'}:${port}/${protocol}`
          : (hostName || hostIp || null);

        const findingKey = truncate(['ACAS', hostName || hostIp || 'unknown', pluginId || 'unknown', protocol || '-', port || '-'].join(':'), 255);

        findings.push({
          source: 'ACAS',
          standard,
          finding_key: findingKey,
          vulnerability_id: truncate(vulnId, 128),
          title: truncate(pluginName || vulnId, 1000),
          description,
          severity,
          cvss_score: cvssScore,
          status: 'open',
          stig_id: null,
          hostname: hostName || null,
          ip: hostIp || null,
          location,
          metadata: {
            plugin_id: pluginId || null,
            plugin_name: pluginName || null,
            port: port || null,
            protocol: protocol || null,
            svc_name: normalizeText(item?.svc_name) || null,
            plugin_family: normalizeText(item?.pluginFamily || item?.plugin_family) || null,
            risk_factor: normalizeText(item?.risk_factor) || null,
            cves
          }
        });
      }
    }
  }

  return findings;
}

function parseStigChecklistFindings(xmlDoc) {
  const checklist = xmlDoc?.CHECKLIST;
  const asset = checklist?.ASSET || {};
  const hostName = normalizeText(asset?.HOST_NAME || asset?.HOSTNAME);
  const hostIp = normalizeText(asset?.HOST_IP || asset?.HOSTIP || asset?.IP_ADDRESS);

  const findings = [];
  const stigContainers = toArray(checklist?.STIGS?.iSTIG);

  for (const stig of stigContainers) {
    const vulns = toArray(stig?.VULN);
    for (const vuln of vulns) {
      const statusRaw = normalizeText(vuln?.STATUS);
      const status = mapStigStatus(statusRaw);

      const attrs = {};
      for (const row of toArray(vuln?.STIG_DATA)) {
        const key = normalizeText(row?.VULN_ATTRIBUTE).toUpperCase();
        const val = normalizeText(row?.ATTRIBUTE_DATA);
        if (key) attrs[key] = val;
      }

      const vulnNum = normalizeText(attrs.VULN_NUM || attrs.RULE_ID || attrs.RULE_VER || attrs.VULN_ID || attrs.GROUP_TITLE);
      const ruleTitle = normalizeText(attrs.RULE_TITLE || attrs.VULN_TITLE || attrs.GROUP_TITLE || vulnNum || 'STIG Finding');
      const severityRaw = normalizeText(attrs.SEVERITY);
      const severity = mapStigSeverity(severityRaw);

      const details = normalizeText(vuln?.FINDING_DETAILS);
      const comments = normalizeText(vuln?.COMMENTS);

      const descParts = [];
      if (attrs.VULN_DISCUSS) descParts.push(attrs.VULN_DISCUSS);
      if (attrs.FIX_TEXT) descParts.push(`Fix: ${attrs.FIX_TEXT}`);
      if (details) descParts.push(`Details: ${details}`);
      if (comments) descParts.push(`Comments: ${comments}`);
      const description = descParts.filter(Boolean).join('\n\n') || null;

      const findingKey = truncate(['STIG', hostName || hostIp || 'unknown', vulnNum || ruleTitle].join(':'), 255);
      const vulnId = truncate(vulnNum || ruleTitle || 'STIG', 128);
      const location = hostName || hostIp || null;

      findings.push({
        source: 'STIG',
        standard: 'DISA STIG',
        finding_key: findingKey,
        vulnerability_id: vulnId,
        title: truncate(ruleTitle, 1000),
        description,
        severity,
        cvss_score: null,
        status,
        stig_id: vulnNum || null,
        hostname: hostName || null,
        ip: hostIp || null,
        location,
        metadata: {
          status_raw: statusRaw,
          severity_raw: severityRaw || null,
          attributes: attrs
        }
      });
    }
  }

  return findings;
}

// Parse STIG Viewer 3 CKLB (JSON) format
function parseStigCklbFindings(cklbDoc) {
  const targetData = cklbDoc?.target_data || {};
  const hostName = normalizeText(targetData?.host_name || targetData?.fqdn);
  const hostIp = normalizeText(targetData?.ip_address);

  const findings = [];
  const stigs = Array.isArray(cklbDoc?.stigs) ? cklbDoc.stigs : [];

  for (const stig of stigs) {
    const rules = Array.isArray(stig?.rules) ? stig.rules : [];
    for (const rule of rules) {
      const statusRaw = normalizeText(rule?.status);
      const normalizedStatusToken = (statusRaw || '').replace(/[_\s]/g, '').toLowerCase();
      const status = normalizedStatusToken === 'notafinding'
        ? mapStigStatus('NotAFinding')
        : mapStigStatus(statusRaw);
      const severityRaw = normalizeText(rule?.severity);
      const severity = mapStigSeverity(severityRaw);

      const vulnNum = normalizeText(rule?.group_id || rule?.rule_version);
      const ruleTitle = normalizeText(rule?.rule_title || vulnNum || 'STIG Finding');

      const descParts = [];
      if (rule?.discussion) descParts.push(rule.discussion);
      if (rule?.fix_text) descParts.push(`Fix: ${rule.fix_text}`);
      if (rule?.finding_details) descParts.push(`Details: ${rule.finding_details}`);
      if (rule?.comments) descParts.push(`Comments: ${rule.comments}`);
      const description = descParts.filter(Boolean).join('\n\n') || null;

      const findingKey = truncate(['STIG', hostName || hostIp || 'unknown', vulnNum || ruleTitle].join(':'), 255);
      const vulnId = truncate(vulnNum || ruleTitle || 'STIG', 128);
      const location = hostName || hostIp || null;

      findings.push({
        source: 'STIG',
        standard: 'DISA STIG',
        finding_key: findingKey,
        vulnerability_id: vulnId,
        title: truncate(ruleTitle, 1000),
        description,
        severity,
        cvss_score: null,
        status,
        stig_id: vulnNum || null,
        hostname: hostName || null,
        ip: hostIp || null,
        location,
        metadata: {
          status_raw: statusRaw,
          severity_raw: severityRaw || null,
          stig_name: stig?.stig_name || null,
          ccis: rule?.ccis || [],
          srg_id: rule?.srg_id || null,
          check_content: rule?.check_content || null
        }
      });
    }
  }

  return findings;
}

function detectSarif(json) {
  return Boolean(json && typeof json === 'object' && Array.isArray(json.runs));
}

function parseSarifFindings(json) {
  const findings = [];
  const runs = Array.isArray(json?.runs) ? json.runs : [];

  for (const run of runs) {
    const toolName = normalizeText(run?.tool?.driver?.name) || 'SAST';
    const rules = toArray(run?.tool?.driver?.rules);
    const ruleTitleById = new Map();
    for (const rule of rules) {
      const id = normalizeText(rule?.id);
      const name = normalizeText(rule?.name);
      const shortText = normalizeText(rule?.shortDescription?.text);
      if (id) ruleTitleById.set(id, name || shortText || id);
    }

    const results = toArray(run?.results);
    for (const result of results) {
      const ruleId = normalizeText(result?.ruleId || result?.rule?.id);
      const level = normalizeText(result?.level).toLowerCase();
      const severity = level === 'error' ? 'high' : level === 'warning' ? 'medium' : 'low';
      const message = normalizeText(result?.message?.text || result?.message);

      const physical = result?.locations?.[0]?.physicalLocation;
      const uri = normalizeText(physical?.artifactLocation?.uri);
      const startLine = physical?.region?.startLine ? Number(physical.region.startLine) : null;
      const location = uri ? (startLine ? `${uri}:${startLine}` : uri) : null;

      const title = ruleTitleById.get(ruleId) || ruleId || 'SARIF Finding';
      const findingKey = truncate(['SARIF', toolName, ruleId || 'rule', uri || '-', startLine || '-'].join(':'), 255);

      findings.push({
        source: 'SAST',
        standard: 'SARIF',
        finding_key: findingKey,
        vulnerability_id: truncate(ruleId || 'SARIF', 128),
        title: truncate(title, 1000),
        description: message || null,
        severity,
        cvss_score: null,
        status: 'open',
        stig_id: null,
        hostname: null,
        ip: null,
        location,
        metadata: {
          tool: toolName,
          rule_id: ruleId || null,
          uri: uri || null,
          start_line: startLine
        }
      });
    }
  }

  return findings;
}

function chunkArray(items, chunkSize) {
  const out = [];
  for (let i = 0; i < items.length; i += chunkSize) out.push(items.slice(i, i + chunkSize));
  return out;
}

// Detect an IAVM JSON export.
// Accepts either a single IAVM notice object (with an `iavmNumber` or `iavm_number` field)
// or an array of such objects, or a wrapper `{ notices: [...] }` envelope.
function detectIavm(json) {
  if (!json || typeof json !== 'object') return false;
  // Wrapper with notices array — validate at least one notice has an IAVM identifier
  if (Array.isArray(json.notices)) {
    return json.notices.slice(0, 3).some(
      (item) => item && (item.iavmNumber || item.iavm_number || item.IAVMID)
    );
  }
  if (Array.isArray(json)) {
    // Check up to the first 3 elements so a single malformed head doesn't block detection
    return json.slice(0, 3).some(
      (item) => item && (item.iavmNumber || item.iavm_number || item.IAVMID)
    );
  }
  return !!(json.iavmNumber || json.iavm_number || json.IAVMID);
}

function mapIavmSeverity(raw) {
  const v = String(raw || '').toLowerCase();
  if (v.includes('cat i') || v === '1' || v.includes('critical')) return 'critical';
  if (v.includes('cat ii') || v === '2' || v.includes('high')) return 'high';
  if (v.includes('cat iii') || v === '3' || v.includes('medium')) return 'medium';
  return 'low';
}

function parseIavmFindings(json) {
  // Normalize to array of notice objects
  let notices = [];
  if (Array.isArray(json)) notices = json;
  else if (Array.isArray(json.notices)) notices = json.notices;
  else notices = [json];

  const findings = [];
  for (const notice of notices) {
    if (!notice || typeof notice !== 'object') continue;
    const iavmId = normalizeText(
      notice.iavmNumber || notice.iavm_number || notice.IAVMID || notice.id || ''
    );
    if (!iavmId) continue;

    const title = normalizeText(notice.title || notice.Title || notice.name || iavmId);
    const description = normalizeText(notice.description || notice.Description || notice.synopsis || '');
    const severityRaw = normalizeText(notice.severity || notice.Severity || notice.category || notice.Category || '');
    const severity = mapIavmSeverity(severityRaw);
    const cvssRaw = notice.cvssScore || notice.cvss_score || notice.cvssBaseScore || null;
    const cvssScore = cvssRaw !== null ? tryParseScore(cvssRaw) : null;

    // IAVM notices may reference one or more CVEs
    const cveRaw = notice.cves || notice.CVEs || notice.cveList || notice.relatedCVEs || [];
    const cves = parseCveList(Array.isArray(cveRaw) ? cveRaw.join(',') : String(cveRaw || ''));
    const vulnId = truncate(cves[0] || `IAVM-${iavmId}`, 128);
    const findingKey = truncate(`IAVM:${iavmId}`, 255);

    // Affected platforms — stored in metadata for AI matching
    const affectedProducts = notice.affectedProducts || notice.affected_products ||
      notice.platforms || notice.Platforms || notice.affectedSystems || null;

    // Capture CVSS version when available for accurate risk assessment
    const cvssVersion = normalizeText(notice.cvssVersion || notice.cvss_version || '') || null;

    findings.push({
      source: 'IAVM',
      standard: 'IAVM',
      finding_key: findingKey,
      vulnerability_id: vulnId,
      title: truncate(title, 1000),
      description: description || null,
      severity,
      cvss_score: cvssScore,
      status: 'open',
      stig_id: null,
      hostname: null,
      ip: null,
      location: null,
      metadata: {
        iavm_id: iavmId,
        severity_raw: severityRaw || null,
        cves,
        affected_products: affectedProducts || null,
        fix_action: normalizeText(notice.fixAction || notice.fix_action || notice.remediation || '') || null,
        release_date: normalizeText(notice.releaseDate || notice.release_date || '') || null,
        cvss_version: cvssVersion
      }
    });
  }
  return findings;
}

async function upsertVulnerabilityFindings(orgId, evidenceUrl, importedAt, matchers, findings) {
  if (!findings.length) return { inserted: 0, updated: 0, total: 0 };

  const rows = findings.map((f) => {
    const assetId = resolveAssetId(matchers, { hostname: f.hostname, ip: f.ip });
    return {
      organization_id: orgId,
      asset_id: assetId,
      source: truncate(f.source || 'UNKNOWN', 64) || 'UNKNOWN',
      standard: truncate(f.standard || '', 128) || null,
      finding_key: truncate(f.finding_key || '', 255),
      vulnerability_id: truncate(f.vulnerability_id || '', 128),
      title: f.title || '',
      description: f.description || null,
      severity: truncate(f.severity || 'medium', 20) || 'medium',
      cvss_score: f.cvss_score ?? null,
      status: truncate(f.status || 'open', 32) || 'open',
      first_seen_at: importedAt,
      last_seen_at: importedAt,
      detected_at: importedAt,
      location: truncate(f.location || '', 255) || null,
      stig_id: truncate(f.stig_id || '', 128) || null,
      evidence_url: evidenceUrl,
      cwe_id: truncate(f.cwe_id || '', 64) || null,
      owasp_top10_2025_category: mapCweToOwasp2025(f.cwe_id),
      metadata: f.metadata || {}
    };
  }).filter((row) => row.finding_key && row.vulnerability_id && row.title);

  const chunks = chunkArray(rows, 200);
  let inserted = 0;
  let updated = 0;

  for (const chunk of chunks) {
    const values = [];
    const placeholders = chunk.map((row, i) => {
      const base = i * 20;
      values.push(
        row.organization_id,
        row.asset_id,
        row.source,
        row.standard,
        row.finding_key,
        row.vulnerability_id,
        row.title,
        row.description,
        row.severity,
        row.cvss_score,
        row.status,
        row.first_seen_at,
        row.last_seen_at,
        row.detected_at,
        row.location,
        row.stig_id,
        row.evidence_url,
        row.cwe_id,
        row.owasp_top10_2025_category,
        JSON.stringify(row.metadata || {})
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}::jsonb)`;
    });

    const result = await pool.query(
      `INSERT INTO vulnerability_findings (
         organization_id, asset_id, source, standard, finding_key, vulnerability_id, title, description,
         severity, cvss_score, status, first_seen_at, last_seen_at, detected_at, location, stig_id,
         evidence_url, cwe_id, owasp_top10_2025_category, metadata
       )
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (organization_id, finding_key) DO UPDATE SET
         asset_id = COALESCE(EXCLUDED.asset_id, vulnerability_findings.asset_id),
         source = EXCLUDED.source,
         standard = COALESCE(EXCLUDED.standard, vulnerability_findings.standard),
         vulnerability_id = EXCLUDED.vulnerability_id,
         title = EXCLUDED.title,
         description = COALESCE(EXCLUDED.description, vulnerability_findings.description),
         severity = EXCLUDED.severity,
         cvss_score = COALESCE(EXCLUDED.cvss_score, vulnerability_findings.cvss_score),
         status = EXCLUDED.status,
         first_seen_at = COALESCE(vulnerability_findings.first_seen_at, EXCLUDED.first_seen_at),
         last_seen_at = EXCLUDED.last_seen_at,
         detected_at = EXCLUDED.detected_at,
         location = COALESCE(EXCLUDED.location, vulnerability_findings.location),
         stig_id = COALESCE(EXCLUDED.stig_id, vulnerability_findings.stig_id),
         evidence_url = COALESCE(EXCLUDED.evidence_url, vulnerability_findings.evidence_url),
         cwe_id = COALESCE(EXCLUDED.cwe_id, vulnerability_findings.cwe_id),
         owasp_top10_2025_category = COALESCE(EXCLUDED.owasp_top10_2025_category, vulnerability_findings.owasp_top10_2025_category),
         metadata = COALESCE(vulnerability_findings.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
         updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      values
    );

    for (const row of result.rows) {
      if (row.inserted) inserted += 1;
      else updated += 1;
    }
  }

  return { inserted, updated, total: inserted + updated };
}

// POST /vulnerabilities/import
router.post('/import', requirePermission('evidence.write'), scanUpload.single('file'), async (req, res) => {
  const orgId = req.user.organization_id;
  const userId = req.user.id;
  const importedAt = new Date();

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const safeOriginalName = path.basename(String(req.file.originalname || 'scan'));
    const ext = path.extname(safeOriginalName || '').toLowerCase();

    const tagsArray = parseTagsInput(req.body?.tags);
    const retentionUntil = normalizeRetentionDate(req.body?.retention_until || req.body?.retentionUntil);
    const integrityHash = await computeFileSha256(req.file.path);

    // Always store the raw artifact as evidence first (even if parsing is unsupported).
    const evidenceResult = await pool.query(`
      INSERT INTO evidence (
        organization_id, uploaded_by, file_name, file_path, file_size, mime_type, description, tags,
        integrity_hash_sha256, evidence_version, retention_until, integrity_verified_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, NOW())
      RETURNING id, file_name
    `, [
      orgId, userId,
      safeOriginalName, req.file.path, req.file.size, req.file.mimetype,
      req.body?.description || null,
      Array.from(new Set(['scan', ...tagsArray])),
      integrityHash,
      retentionUntil
    ]);

    const evidenceId = evidenceResult.rows[0]?.id;
    const evidenceUrl = evidenceId ? `/api/v1/evidence/${evidenceId}/download` : null;

    let detectedType = 'unknown';
    let findings = [];
    const warnings = [];

    if (ext === '.fpr' || ext === '.zip') {
      detectedType = ext === '.fpr' ? 'fortify_fpr' : 'zip_artifact';
      warnings.push('Parsing is not supported for this file type yet. Artifact stored as Evidence only.');
    } else if (ext === '.sarif') {
      detectedType = 'sarif';
      const text = await fs.promises.readFile(req.file.path, 'utf8');
      const json = JSON.parse(text);
      findings = parseSarifFindings(json);
    } else if (ext === '.json') {
      const text = await fs.promises.readFile(req.file.path, 'utf8');
      const json = JSON.parse(text);
      if (detectSarif(json)) {
        detectedType = 'sarif';
        findings = parseSarifFindings(json);
      } else if (detectIavm(json)) {
        detectedType = 'iavm';
        findings = parseIavmFindings(json);
      } else {
        detectedType = 'json_artifact';
        warnings.push('JSON uploaded. This endpoint currently ingests SARIF or IAVM JSON; artifact stored as Evidence.');
      }
    } else if (ext === '.cklb') {
      detectedType = 'stig_cklb';
      const text = await fs.promises.readFile(req.file.path, 'utf8');
      try {
        const cklbDoc = JSON.parse(text);
        findings = parseStigCklbFindings(cklbDoc);
      } catch (err) {
        if (err instanceof SyntaxError) {
          return res.status(400).json({
            error: 'Invalid CKLB file: JSON parse error',
            details: err.message
          });
        }
        throw err;
      }
    } else if (ext === '.nessus' || ext === '.ckl' || ext === '.xml') {
      const xmlText = await fs.promises.readFile(req.file.path, 'utf8');
      const xmlDoc = await xmlParser.parseStringPromise(xmlText);
      const xmlType = ext === '.xml' ? detectXmlScanType(xmlDoc) : (ext === '.nessus' ? 'nessus' : 'stig_ckl');
      detectedType = xmlType;

      if (xmlType === 'nessus') {
        findings = parseNessusFindings(xmlDoc);
      } else if (xmlType === 'stig_ckl') {
        findings = parseStigChecklistFindings(xmlDoc);
      } else {
        warnings.push(`XML uploaded (${xmlType}). Ingestion is not supported for this XML format yet; artifact stored as Evidence.`);
      }
    }

    const matchers = await loadAssetMatchers(orgId);
    const ingestResult = await upsertVulnerabilityFindings(orgId, evidenceUrl, importedAt, matchers, findings);

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, ip_address, user_agent, success)
       VALUES ($1, $2, 'vulnerability_scan_imported', 'evidence', $3, $4, $5, $6, true)`,
      [
        orgId,
        userId,
        evidenceId,
        JSON.stringify({
          evidence_id: evidenceId,
          file_name: safeOriginalName,
          ext,
          detected_type: detectedType,
          ingested: ingestResult,
          warnings
        }),
        req.ip,
        req.get('user-agent') || null
      ]
    );

    // Emit real-time event for critical/high severity vulnerabilities
    if (ingestResult.inserted > 0) {
      vulnerabilityCreated(orgId, {
        count: ingestResult.inserted,
        source: detectedType,
        file_name: safeOriginalName
      });
    }

    res.status(201).json({
      success: true,
      data: {
        evidence: {
          id: evidenceId,
          file_name: safeOriginalName,
          download_url: evidenceUrl
        },
        detected_type: detectedType,
        ingested: ingestResult,
        warnings
      }
    });
  } catch (error) {
    console.error('Vulnerability scan import error:', error);

    try {
      await pool.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, ip_address, user_agent, success, failure_reason)
         VALUES ($1, $2, 'vulnerability_scan_imported', 'evidence', NULL, $3, $4, $5, false, $6)`,
        [
          orgId,
          userId,
          JSON.stringify({ error: error.message || 'Import failed' }),
          req.ip,
          req.get('user-agent') || null,
          error.message || 'Import failed'
        ]
      );
    } catch (auditError) {
      console.error('Failed to write scan import audit log:', auditError);
    }

    res.status(500).json({ success: false, error: 'Failed to import scan artifact' });
  }
});

router.get('/', requirePermission('assets.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const vulnerabilityConfig = await getVulnerabilityDynamicConfig(orgId);
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const { whereClause, params } = buildWhereClause(orgId, req.query);
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const findingsQuery = `
      SELECT
        vf.*,
        a.name AS asset_name,
        a.hostname AS asset_hostname,
        ac.code AS asset_category_code,
        e.name AS environment_name,
        (
          SELECT COUNT(*)
          FROM vulnerability_control_work_items vw
          WHERE vw.organization_id = vf.organization_id
            AND vw.vulnerability_id = vf.id
        )::int AS control_work_items_total,
        (
          SELECT COUNT(*)
          FROM vulnerability_control_work_items vw
          WHERE vw.organization_id = vf.organization_id
            AND vw.vulnerability_id = vf.id
            AND vw.action_status IN ('open', 'in_progress')
        )::int AS control_work_items_open,
        (
          SELECT COUNT(*)
          FROM audit_logs al
          WHERE al.organization_id = vf.organization_id
            AND (
              (al.resource_type = 'vulnerability' AND al.resource_id::text = vf.id::text)
              OR (al.details->>'finding_key') = vf.finding_key
              OR (al.details->>'vulnerability_id') = vf.vulnerability_id
            )
        )::int AS linked_audit_events
      FROM vulnerability_findings vf
      LEFT JOIN assets a ON a.id = vf.asset_id
      LEFT JOIN asset_categories ac ON ac.id = a.category_id
      LEFT JOIN environments e ON e.id = a.environment_id
      WHERE ${whereClause}
      ORDER BY
        CASE vf.severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          WHEN 'info' THEN 5
          ELSE 6
        END,
        COALESCE(vf.cvss_score, 0) DESC,
        COALESCE(vf.last_seen_at, vf.detected_at, vf.created_at) DESC
      LIMIT $${limitIdx}
      OFFSET $${offsetIdx}
    `;

    const findingsResult = await pool.query(findingsQuery, [...params, limit, offset]);

    for (const finding of findingsResult.rows) {
      if (!['open', 'in_progress', 'risk_accepted'].includes(String(finding.status || '').toLowerCase())) continue;
      try {
        await ensureControlImpactWorkflowForFinding(orgId, req.user.id, finding, vulnerabilityConfig);
      } catch (workflowError) {
        console.error('Ensure control impact workflow error:', workflowError.message);
      }
    }

    const refreshedFindingsResult = await pool.query(findingsQuery, [...params, limit, offset]);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM vulnerability_findings vf
       LEFT JOIN assets a ON a.id = vf.asset_id
       WHERE ${whereClause}`,
      params
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_findings,
         COUNT(*) FILTER (WHERE vf.status IN ('open', 'in_progress'))::int AS active_findings,
         COUNT(*) FILTER (WHERE vf.severity = 'critical' AND vf.status IN ('open', 'in_progress'))::int AS critical_open,
         COUNT(DISTINCT vf.asset_id)::int AS affected_assets,
         COUNT(*) FILTER (WHERE vf.kev_listed = true)::int AS kev_listed_count,
         ROUND(AVG(vf.cvss_score)::numeric, 1) AS avg_cvss
       FROM vulnerability_findings vf
       LEFT JOIN assets a ON a.id = vf.asset_id
       WHERE ${whereClause}`,
      params
    );

    const bySourceResult = await pool.query(
      `SELECT vf.source, COUNT(*)::int AS count
       FROM vulnerability_findings vf
       LEFT JOIN assets a ON a.id = vf.asset_id
       WHERE ${whereClause}
       GROUP BY vf.source
       ORDER BY count DESC, vf.source ASC`,
      params
    );

    const bySeverityResult = await pool.query(
      `SELECT vf.severity, COUNT(*)::int AS count
       FROM vulnerability_findings vf
       LEFT JOIN assets a ON a.id = vf.asset_id
       WHERE ${whereClause}
       GROUP BY vf.severity
       ORDER BY count DESC`,
      params
    );

    const byStatusResult = await pool.query(
      `SELECT vf.status, COUNT(*)::int AS count
       FROM vulnerability_findings vf
       LEFT JOIN assets a ON a.id = vf.asset_id
       WHERE ${whereClause}
       GROUP BY vf.status
       ORDER BY count DESC`,
      params
    );

    const trendResult = await pool.query(
      `SELECT
         DATE_TRUNC('day', COALESCE(vf.detected_at, vf.created_at))::date AS day,
         COUNT(*)::int AS count
       FROM vulnerability_findings vf
       LEFT JOIN assets a ON a.id = vf.asset_id
       WHERE ${whereClause}
         AND COALESCE(vf.detected_at, vf.created_at) >= NOW() - INTERVAL '30 days'
       GROUP BY day
       ORDER BY day`,
      params
    );

    res.json({
      success: true,
      data: {
        findings: refreshedFindingsResult.rows,
        summary: summaryResult.rows[0] || {
          total_findings: 0,
          active_findings: 0,
          critical_open: 0,
          affected_assets: 0,
          kev_listed_count: 0,
          avg_cvss: null
        },
        charts: {
          bySource: bySourceResult.rows,
          bySeverity: bySeverityResult.rows,
          byStatus: byStatusResult.rows,
          trend30d: trendResult.rows
        },
        enums: {
          severityOrder: SEVERITY_ORDER,
          statusOrder: STATUS_ORDER,
          frameworkRequiredArtifacts: vulnerabilityConfig.frameworkRequiredArtifacts
        },
        pagination: {
          total: countResult.rows[0]?.total || 0,
          limit,
          offset
        }
      }
    });
  } catch (error) {
    console.error('Get vulnerabilities error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch vulnerabilities' });
  }
});

router.get('/sources', requirePermission('assets.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const vulnerabilityConfig = await getVulnerabilityDynamicConfig(orgId);

    const sourceResult = await pool.query(
      `SELECT source, COUNT(*)::int AS count
       FROM vulnerability_findings
       WHERE organization_id = $1
       GROUP BY source
       ORDER BY count DESC, source ASC`,
      [orgId]
    );

    const standardResult = await pool.query(
      `SELECT standard, COUNT(*)::int AS count
       FROM vulnerability_findings
       WHERE organization_id = $1 AND standard IS NOT NULL AND standard <> ''
       GROUP BY standard
       ORDER BY count DESC, standard ASC`,
      [orgId]
    );

    res.json({
      success: true,
      data: {
        sources: sourceResult.rows,
        standards: standardResult.rows,
        frameworkAlignedStandards: vulnerabilityConfig.frameworkAlignedStandards,
        frameworkRequiredArtifacts: vulnerabilityConfig.frameworkRequiredArtifacts
      }
    });
  } catch (error) {
    console.error('Get vulnerability sources error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch vulnerability source metadata' });
  }
});

router.get('/:id/workflow', requirePermission('assets.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const vulnerabilityConfig = await getVulnerabilityDynamicConfig(orgId);
    const { id } = req.params;

    const findingResult = await pool.query(
      `SELECT id, finding_key, vulnerability_id, source, standard, severity, status, due_date
       FROM vulnerability_findings
       WHERE organization_id = $1 AND id = $2`,
      [orgId, id]
    );

    if (findingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability finding not found' });
    }

    const finding = findingResult.rows[0];
    if (['open', 'in_progress', 'risk_accepted'].includes(String(finding.status || '').toLowerCase())) {
      await ensureControlImpactWorkflowForFinding(orgId, req.user.id, finding, vulnerabilityConfig);
    }

    const workflow = await getWorkflowItems(orgId, id);
    res.json({ success: true, data: workflow });
  } catch (error) {
    console.error('Get vulnerability workflow error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch vulnerability workflow' });
  }
});

router.patch('/:id/workflow/:workItemId', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id, workItemId } = req.params;
    const {
      actionType,
      actionStatus,
      controlEffect,
      responseSummary,
      responseDetails,
      dueDate,
      ownerId
    } = req.body || {};

    if (actionType !== undefined && !ACTION_TYPE_ORDER.includes(actionType)) {
      return res.status(400).json({ success: false, error: `actionType must be one of: ${ACTION_TYPE_ORDER.join(', ')}` });
    }
    if (actionStatus !== undefined && !ACTION_STATUS_ORDER.includes(actionStatus)) {
      return res.status(400).json({ success: false, error: `actionStatus must be one of: ${ACTION_STATUS_ORDER.join(', ')}` });
    }
    if (controlEffect !== undefined && !CONTROL_EFFECT_ORDER.includes(controlEffect)) {
      return res.status(400).json({ success: false, error: `controlEffect must be one of: ${CONTROL_EFFECT_ORDER.join(', ')}` });
    }

    const existingResult = await pool.query(
      `SELECT
         vw.*,
         vf.finding_key,
         vf.vulnerability_id,
         vf.source,
         vf.standard
       FROM vulnerability_control_work_items vw
       JOIN vulnerability_findings vf ON vf.id = vw.vulnerability_id
       WHERE vw.organization_id = $1
         AND vw.vulnerability_id = $2
         AND vw.id = $3`,
      [orgId, id, workItemId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workflow item not found' });
    }

    const existing = existingResult.rows[0];
    const nextActionStatus = actionStatus || existing.action_status;
    const nextControlEffect = controlEffect || existing.control_effect;
    const nextDueDate = dueDate === undefined ? undefined : parseDateOnly(dueDate);

    if (dueDate !== undefined && !nextDueDate) {
      return res.status(400).json({ success: false, error: 'dueDate must be a valid date' });
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (actionType !== undefined) {
      updates.push(`action_type = $${idx}`);
      params.push(actionType);
      idx++;
    }
    if (actionStatus !== undefined) {
      updates.push(`action_status = $${idx}`);
      params.push(actionStatus);
      idx++;
    }
    if (controlEffect !== undefined) {
      updates.push(`control_effect = $${idx}`);
      params.push(controlEffect);
      idx++;
    }
    if (responseSummary !== undefined) {
      updates.push(`response_summary = $${idx}`);
      params.push(responseSummary || null);
      idx++;
    }
    if (responseDetails !== undefined) {
      updates.push(`response_details = $${idx}`);
      params.push(responseDetails || null);
      idx++;
    }
    if (dueDate !== undefined) {
      updates.push(`due_date = $${idx}`);
      params.push(nextDueDate);
      idx++;
    }
    if (ownerId !== undefined) {
      updates.push(`owner_id = $${idx}`);
      params.push(ownerId || null);
      idx++;
    }

    updates.push(`closed_at = CASE WHEN $${idx} IN ('resolved', 'accepted', 'closed') THEN COALESCE(closed_at, NOW()) ELSE NULL END`);
    params.push(nextActionStatus);
    idx++;

    updates.push(`updated_by = $${idx}`);
    params.push(req.user.id);
    idx++;

    updates.push('updated_at = NOW()');
    params.push(orgId, id, workItemId);

    const updateQuery = `
      UPDATE vulnerability_control_work_items
      SET ${updates.join(', ')}
      WHERE organization_id = $${idx}
        AND vulnerability_id = $${idx + 1}
        AND id = $${idx + 2}
      RETURNING *`;

    const updatedResult = await pool.query(updateQuery, params);
    const updated = updatedResult.rows[0];

    // If closing a risk_acceptance work item as 'accepted', update the vulnerability finding status to 'risk_accepted'
    if (updated.action_type === 'risk_acceptance' && nextActionStatus === 'accepted') {
      await pool.query(
        `UPDATE vulnerability_findings
         SET status = 'risk_accepted', updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [id, orgId]
      );
    }

    const currentImplementation = await pool.query(
      `SELECT id, status
       FROM control_implementations
       WHERE organization_id = $1 AND control_id = $2
       LIMIT 1`,
      [orgId, updated.framework_control_id]
    );

    let targetControlStatus = null;
    if (['open', 'in_progress'].includes(nextActionStatus) && ['non_compliant', 'partial'].includes(nextControlEffect)) {
      targetControlStatus = 'needs_review';
    } else if (nextActionStatus === 'accepted') {
      targetControlStatus = 'needs_review';
    } else if (['resolved', 'closed'].includes(nextActionStatus) && nextControlEffect === 'compliant') {
      targetControlStatus = 'implemented';
    }

    if (targetControlStatus) {
      if (currentImplementation.rows.length === 0) {
        const insertedImplementation = await pool.query(
          `INSERT INTO control_implementations (
             control_id, organization_id, status, notes, implementation_date, created_at
           )
           VALUES (
             $1, $2, $3, $4,
             CASE WHEN $3 = 'implemented' THEN CURRENT_DATE ELSE NULL END,
             NOW()
           )
           ON CONFLICT (control_id, organization_id) DO NOTHING
           RETURNING id`,
          [
            updated.framework_control_id,
            orgId,
            targetControlStatus,
            `Control impact workflow update for finding ${existing.finding_key}.`
          ]
        );
        if (insertedImplementation.rows[0]?.id) {
          await pool.query(
            `UPDATE vulnerability_control_work_items
             SET implementation_id = $1, updated_at = NOW(), updated_by = $2
             WHERE id = $3`,
            [insertedImplementation.rows[0].id, req.user.id, updated.id]
          );
        }
      } else if (currentImplementation.rows[0].status !== targetControlStatus) {
        await pool.query(
          `UPDATE control_implementations
           SET status = $1,
               implementation_date = CASE WHEN $1 = 'implemented' THEN CURRENT_DATE ELSE implementation_date END,
               notes = CASE
                 WHEN COALESCE(notes, '') = '' THEN $2
                 ELSE notes || E'\n' || $2
               END
           WHERE id = $3`,
          [
            targetControlStatus,
            `Control impact workflow update for finding ${existing.finding_key}.`,
            currentImplementation.rows[0].id
          ]
        );
      }
    }

    await pool.query(
      `INSERT INTO audit_logs (
         organization_id, user_id, event_type, resource_type, resource_id, details, success
       )
       VALUES ($1, $2, 'vulnerability_workflow_updated', 'vulnerability_workflow', $3, $4::jsonb, true)`,
      [
        orgId,
        req.user.id,
        updated.id,
        JSON.stringify({
          vulnerability_id: id,
          finding_key: existing.finding_key,
          old: {
            action_type: existing.action_type,
            action_status: existing.action_status,
            control_effect: existing.control_effect
          },
          new: {
            action_type: updated.action_type,
            action_status: updated.action_status,
            control_effect: updated.control_effect
          }
        })
      ]
    );

    const workflow = await getWorkflowItems(orgId, id);
    res.json({ success: true, data: { updatedItem: updated, workflow } });
  } catch (error) {
    console.error('Update vulnerability workflow item error:', error);
    res.status(500).json({ success: false, error: 'Failed to update vulnerability workflow item' });
  }
});

router.get('/:id', requirePermission('assets.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const vulnerabilityConfig = await getVulnerabilityDynamicConfig(orgId);
    const { id } = req.params;

    const findingResult = await pool.query(
      `SELECT
         vf.*,
         a.name AS asset_name,
         a.hostname AS asset_hostname,
         ac.code AS asset_category_code,
         e.name AS environment_name
       FROM vulnerability_findings vf
       LEFT JOIN assets a ON a.id = vf.asset_id
       LEFT JOIN asset_categories ac ON ac.id = a.category_id
       LEFT JOIN environments e ON e.id = a.environment_id
       WHERE vf.organization_id = $1 AND vf.id = $2`,
      [orgId, id]
    );

    if (findingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability finding not found' });
    }

    const finding = findingResult.rows[0];

    if (['open', 'in_progress', 'risk_accepted'].includes(String(finding.status || '').toLowerCase())) {
      try {
        await ensureControlImpactWorkflowForFinding(orgId, req.user.id, finding, vulnerabilityConfig);
      } catch (workflowError) {
        console.error('Ensure control impact workflow for detail error:', workflowError.message);
      }
    }

    const auditResult = await pool.query(
      `SELECT
         al.id,
         al.event_type,
         al.resource_type,
         al.resource_id,
         al.details,
         al.ip_address,
         al.success,
         al.failure_reason,
         al.created_at,
         u.first_name || ' ' || u.last_name AS user_name,
         u.email AS user_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.organization_id = $1
         AND (
           (al.resource_type = 'vulnerability' AND al.resource_id::text = $2)
           OR (al.details->>'finding_key') = $3
           OR (al.details->>'vulnerability_id') = $4
           OR (al.details->>'source') = $5
         )
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [orgId, String(id), finding.finding_key, finding.vulnerability_id, finding.source]
    );

    const controlImpactWorkflow = await getWorkflowItems(orgId, id);

    res.json({
      success: true,
      data: {
        finding,
        relatedAuditEvents: auditResult.rows,
        controlImpactWorkflow
      }
    });
  } catch (error) {
    console.error('Get vulnerability detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch vulnerability detail' });
  }
});

// ---------- POST /:id/analyze ----------
// Run AI remediation analysis for a vulnerability, caching result in ai_analysis column.
// Safe to call repeatedly — returns cached result if fresh (< 24h).
router.post('/:id/analyze', requirePermission('ai.use'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    const provider = req.body.provider || 'claude';
    const model = req.body.model || null;

    // Return cached result if still fresh (24h)
    const cached = await pool.query(
      `SELECT ai_analysis, ai_analyzed_at FROM vulnerability_findings
       WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [id, orgId]
    );
    if (cached.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability not found' });
    }
    const { ai_analysis, ai_analyzed_at } = cached.rows[0];
    if (ai_analysis && ai_analyzed_at) {
      const ageMs = Date.now() - new Date(ai_analyzed_at).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        // ai_analysis is stored as {result: "..."}, pg returns it as an object
        const cachedResult = typeof ai_analysis === 'object' ? ai_analysis.result : ai_analysis;
        return res.json({ success: true, data: { result: cachedResult, cached: true } });
      }
    }

    // Run fresh analysis
    const llm = require('../services/llmService');
    const result = await llm.generateVulnerabilityRemediation({
      vulnerabilityId: id,
      organizationId: orgId,
      provider,
      model
    });

    // Cache result
    await pool.query(
      `UPDATE vulnerability_findings
       SET ai_analysis = $1, ai_analyzed_at = NOW()
       WHERE id = $2 AND organization_id = $3`,
      [JSON.stringify({ result }), id, orgId]
    );

    res.json({ success: true, data: { result, cached: false } });
  } catch (err) {
    console.error('Vulnerability AI analyze error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.statusCode === 400 ? 'No AI API key configured. Add one in Settings > LLM Configuration.' : 'AI analysis failed'
    });
  }
});

module.exports = router;
