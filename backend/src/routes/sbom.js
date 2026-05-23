// @tier: enterprise
const express = require('express');
const multer = require('multer');
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { requireProEdition } = require('../middleware/edition');
const {
  parseSbomBuffer,
  buildStableFindingKey,
  extractLicenseIds,
  normalizeSeverity
} = require('../services/sbomService');

const router = express.Router();
const ALLOWED_SBOM_EXTENSIONS = new Set(['.json', '.xml', '.yaml', '.yml', '.spdx', '.rdf', '.swid', '.swidtag']);
const ALLOWED_SBOM_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'text/xml',
  'text/plain',
  'text/yaml',
  'application/x-yaml',
  'application/spdx+json',
  'application/spdx+yaml'
]);

function isAllowedSbomFile(file) {
  const ext = String((file.originalname || '').toLowerCase()).split('.').length > 1
    ? `.${String(file.originalname || '').toLowerCase().split('.').pop()}`
    : '';
  if (!ALLOWED_SBOM_EXTENSIONS.has(ext)) return false;
  const mime = String(file.mimetype || '').toLowerCase();
  return !mime || ALLOWED_SBOM_MIME_TYPES.has(mime);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    if (!isAllowedSbomFile(file)) {
      return cb(new Error('Unsupported SBOM file type'));
    }
    return cb(null, true);
  }
});

const PROHIBITED_LICENSES = new Set(['GPL-3.0', 'AGPL-3.0']);
const REVIEW_LICENSES = new Set(['LGPL-2.1', 'MPL-2.0']);
const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

router.use(authenticate);
router.use(requireProEdition('sbom')); // Edition check BEFORE tier check
router.use(requireTier('enterprise'));

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function dueDateFromSeverity(severity) {
  const level = String(severity || '').toLowerCase();
  const date = new Date();
  if (level === 'critical') date.setDate(date.getDate() + 14);
  else if (level === 'high') date.setDate(date.getDate() + 30);
  else if (level === 'medium') date.setDate(date.getDate() + 60);
  else date.setDate(date.getDate() + 90);
  return date.toISOString().slice(0, 10);
}

function highestSeverity(items) {
  let max = 'info';
  for (const item of items) {
    const sev = String(item || '').toLowerCase();
    if ((SEVERITY_RANK[sev] || 0) > (SEVERITY_RANK[max] || 0)) {
      max = sev;
    }
  }
  return max;
}

function componentLookupKeys(component) {
  const keys = new Set();
  if (component.bomRef) keys.add(String(component.bomRef));
  if (component.purl) keys.add(String(component.purl));
  const version = component.version ? `@${component.version}` : '';
  keys.add(`${component.name}${version}`);
  keys.add(component.name);
  return Array.from(keys).filter(Boolean);
}

async function getSoftwareCategoryId(client) {
  const categoryResult = await client.query(
    `SELECT id
     FROM asset_categories
     WHERE code = 'software'
     LIMIT 1`
  );
  if (categoryResult.rows.length === 0) {
    throw new Error('Software asset category is not seeded');
  }
  return categoryResult.rows[0].id;
}

async function getAssetById(client, orgId, assetId) {
  const result = await client.query(
    `SELECT
       a.id,
       a.name,
       a.environment_id,
       a.criticality,
       a.security_classification AS data_classification,
       ac.code AS category_code
     FROM assets a
     JOIN asset_categories ac ON ac.id = a.category_id
     WHERE a.organization_id = $1 AND a.id = $2
     LIMIT 1`,
    [orgId, assetId]
  );
  return result.rows[0] || null;
}

async function findOrCreateComponentAsset(client, orgId, userId, parentAsset, softwareCategoryId, sbomId, component) {
  const componentKey = buildStableFindingKey([
    orgId,
    parentAsset.id,
    component.purl || '',
    component.bomRef || '',
    component.name || '',
    component.version || ''
  ]);

  const existing = await client.query(
    `SELECT id
     FROM assets
     WHERE organization_id = $1
       AND category_id = $2
       AND metadata->>'sbom_component_key' = $3
     LIMIT 1`,
    [orgId, softwareCategoryId, componentKey]
  );

  if (existing.rows.length > 0) {
    return { id: existing.rows[0].id, created: false, componentKey };
  }

  const displayName = component.version ? `${component.name} (${component.version})` : component.name;
  const metadata = {
    sbom_component_key: componentKey,
    sbom_parent_asset_id: parentAsset.id,
    sbom_id: sbomId,
    sbom_component_ref: component.bomRef || null,
    purl: component.purl || null,
    cpe: component.cpe || null,
    component_type: component.componentType || null,
    imported_from: 'sbom_upload'
  };

  const inserted = await client.query(
     `INSERT INTO assets (
       organization_id, category_id, environment_id, name, model, manufacturer, version,
       status, criticality, security_classification, notes, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10, $11::jsonb)
     RETURNING id`,
    [
      orgId,
      softwareCategoryId,
      parentAsset.environment_id || null,
      displayName,
      component.componentType || null,
      component.vendor || component.supplier || null,
      component.version || null,
      parentAsset.criticality || null,
      parentAsset.data_classification || null,
      `Imported from SBOM ${sbomId} for parent asset ${parentAsset.name}.`,
      JSON.stringify(metadata)
    ]
  );

  await client.query(
    `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
     VALUES ($1, $2, 'sbom_component_asset_created', 'asset', $3, $4::jsonb, true)`,
    [
      orgId,
      userId,
      inserted.rows[0].id,
      JSON.stringify({
        sbom_id: sbomId,
        parent_asset_id: parentAsset.id,
        component_name: component.name,
        component_version: component.version || null
      })
    ]
  );

  return { id: inserted.rows[0].id, created: true, componentKey };
}

async function upsertVulnerabilityFinding(client, orgId, finding) {
  const result = await client.query(
    `INSERT INTO vulnerability_findings (
       organization_id, asset_id, source, standard, finding_key, vulnerability_id, title, description,
       severity, cvss_score, status, first_seen_at, last_seen_at, detected_at, due_date,
       package_name, component_name, version_detected, cwe_id, metadata
     )
     VALUES (
       $1, $2, 'SBOM', $3, $4, $5, $6, $7,
       $8, $9, 'open', NOW(), NOW(), NOW(), $10,
       $11, $12, $13, $14, $15::jsonb
     )
     ON CONFLICT (organization_id, finding_key)
     DO UPDATE SET
       last_seen_at = NOW(),
       severity = EXCLUDED.severity,
       cvss_score = COALESCE(EXCLUDED.cvss_score, vulnerability_findings.cvss_score),
       status = CASE
         WHEN vulnerability_findings.status IN ('remediated', 'false_positive') THEN vulnerability_findings.status
         ELSE vulnerability_findings.status
       END,
       metadata = COALESCE(vulnerability_findings.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
       updated_at = NOW()
     RETURNING id`,
    [
      orgId,
      finding.assetId || null,
      finding.standard || null,
      finding.findingKey,
      finding.vulnerabilityId,
      finding.title,
      finding.description || null,
      finding.severity,
      finding.cvssScore || null,
      dueDateFromSeverity(finding.severity),
      finding.packageName || null,
      finding.componentName || null,
      finding.version || null,
      finding.cweId || null,
      JSON.stringify(finding.metadata || {})
    ]
  );
  return result.rows[0].id;
}

// GET /api/v1/sbom/assets
// Lightweight asset picker for SBOM uploads
router.get('/assets', requirePermission('assets.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const search = String(req.query.search || '').trim();
    const limit = Math.max(1, Math.min(200, toInt(req.query.limit, 100)));

    const params = [orgId];
    let query = `
      SELECT
        a.id,
        a.name,
        a.version,
        a.hostname,
        a.environment_id,
        ac.code AS category_code,
        ac.name AS category_name
      FROM assets a
      JOIN asset_categories ac ON ac.id = a.category_id
      WHERE a.organization_id = $1
    `;

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (
        a.name ILIKE $2
        OR COALESCE(a.hostname, '') ILIKE $2
        OR COALESCE(a.ip_address, '') ILIKE $2
      )`;
    }

    query += ` ORDER BY a.name ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json({ success: true, data: { assets: result.rows } });
  } catch (error) {
    console.error('SBOM assets list error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assets for SBOM upload' });
  }
});

// GET /api/v1/sbom
router.get('/', requirePermission('assets.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const limit = Math.max(1, Math.min(200, toInt(req.query.limit, 50)));
    const offset = Math.max(0, toInt(req.query.offset, 0));

    const result = await pool.query(
      `SELECT
         s.id,
         s.sbom_format,
         s.spec_version,
         s.serial_number,
         s.version,
         s.file_name,
         s.source,
         s.tool_name,
         s.tool_version,
         s.generated_at,
         s.total_components,
         s.vulnerabilities_found,
         s.critical_vulnerabilities,
         s.high_vulnerabilities,
         s.license_issues,
         s.processed,
         s.processed_at,
         s.uploaded_at,
         a.id AS asset_id,
         a.name AS asset_name,
         u.email AS uploaded_by_email
       FROM sboms s
       JOIN assets a ON a.id = s.asset_id
       LEFT JOIN users u ON u.id = s.uploaded_by
       WHERE s.organization_id = $1
       ORDER BY s.uploaded_at DESC
       LIMIT $2 OFFSET $3`,
      [orgId, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM sboms
       WHERE organization_id = $1`,
      [orgId]
    );

    res.json({
      success: true,
      data: {
        sboms: result.rows,
        pagination: {
          total: countResult.rows[0]?.total || 0,
          limit,
          offset
        }
      }
    });
  } catch (error) {
    console.error('SBOM list error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch SBOM records' });
  }
});

// GET /api/v1/sbom/:id
router.get('/:id', requirePermission('assets.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const sbomId = req.params.id;

    const sbomResult = await pool.query(
      `SELECT
         s.*,
         a.name AS asset_name,
         a.id AS asset_id
       FROM sboms s
       JOIN assets a ON a.id = s.asset_id
       WHERE s.organization_id = $1 AND s.id = $2
       LIMIT 1`,
      [orgId, sbomId]
    );

    if (sbomResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SBOM record not found' });
    }

    const componentsResult = await pool.query(
      `SELECT
         sc.*,
         a.name AS component_asset_name
       FROM software_components sc
       LEFT JOIN assets a ON a.id = sc.asset_id
       WHERE sc.organization_id = $1
         AND sc.sbom_id = $2
       ORDER BY sc.name ASC`,
      [orgId, sbomId]
    );

    const vulnerabilitiesResult = await pool.query(
      `SELECT
         cv.*,
         vf.finding_key,
         vf.vulnerability_id,
         vf.title AS finding_title,
         vf.status AS finding_status,
         sc.name AS component_name
       FROM component_vulnerabilities cv
       JOIN software_components sc ON sc.id = cv.component_id
       LEFT JOIN vulnerability_findings vf ON vf.id = cv.vulnerability_finding_id
       WHERE cv.organization_id = $1
         AND sc.sbom_id = $2
       ORDER BY cv.discovered_at DESC`,
      [orgId, sbomId]
    );

    res.json({
      success: true,
      data: {
        sbom: sbomResult.rows[0],
        components: componentsResult.rows,
        componentVulnerabilities: vulnerabilitiesResult.rows
      }
    });
  } catch (error) {
    console.error('SBOM detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch SBOM details' });
  }
});

// POST /api/v1/sbom/upload
router.post('/upload', requirePermission('assets.write'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'File is required' });
  }

  const orgId = req.user.organization_id;
  const userId = req.user.id;
  const assetId = req.body.asset_id || req.body.assetId;
  if (!assetId) {
    return res.status(400).json({ success: false, error: 'asset_id is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const parentAsset = await getAssetById(client, orgId, assetId);
    if (!parentAsset) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Parent asset not found for this organization' });
    }

    const parsed = await parseSbomBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
    const softwareCategoryId = await getSoftwareCategoryId(client);

    const sbomInsert = await client.query(
      `INSERT INTO sboms (
         organization_id, asset_id, sbom_format, spec_version, serial_number, version,
         tool_name, tool_version, generated_at, file_name, source, sbom_data,
         uploaded_by, processed
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'upload', $11::jsonb, $12, false)
       RETURNING id`,
      [
        orgId,
        parentAsset.id,
        parsed.format,
        parsed.specVersion || null,
        parsed.serialNumber || null,
        parsed.version || null,
        parsed.toolName || null,
        parsed.toolVersion || null,
        parseTimestamp(parsed.generatedAt),
        req.file.originalname,
        JSON.stringify(parsed.raw || {}),
        userId
      ]
    );
    const sbomId = sbomInsert.rows[0].id;

    const componentRefs = new Map();
    let componentsCreated = 0;
    let componentAssetsCreated = 0;
    let vulnerabilityFindingsCreated = 0;
    let criticalVulnerabilities = 0;
    let highVulnerabilities = 0;
    let licenseIssues = 0;
    let dependencyLinksCreated = 0;

    for (const component of parsed.components || []) {
      const componentAsset = await findOrCreateComponentAsset(
        client,
        orgId,
        userId,
        parentAsset,
        softwareCategoryId,
        sbomId,
        component
      );
      if (componentAsset.created) componentAssetsCreated += 1;

      const vulnerabilitySeverities = [];

      const componentInsert = await client.query(
        `INSERT INTO software_components (
           organization_id, sbom_id, asset_id, parent_asset_id,
           bom_ref, name, version, purl, cpe, component_type,
           vendor, supplier, author, licenses, metadata
         )
         VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14::jsonb, $15::jsonb
         )
         RETURNING id`,
        [
          orgId,
          sbomId,
          componentAsset.id,
          parentAsset.id,
          component.bomRef || null,
          component.name,
          component.version || null,
          component.purl || null,
          component.cpe || null,
          component.componentType || null,
          component.vendor || null,
          component.supplier || null,
          component.author || null,
          JSON.stringify(component.licenses || []),
          JSON.stringify(component.metadata || {})
        ]
      );

      const componentId = componentInsert.rows[0].id;
      componentsCreated += 1;

      for (const key of componentLookupKeys(component)) {
        componentRefs.set(key, { componentId, assetId: componentAsset.id, name: component.name, version: component.version || null });
      }

      for (const vulnerability of component.vulnerabilities || []) {
        const vulnerabilityId = vulnerability.id || `SBOM-${component.name}-${component.version || 'unknown'}`;
        const severity = normalizeSeverity(vulnerability.severity, vulnerability.cvss_score);
        vulnerabilitySeverities.push(severity);

        if (severity === 'critical') criticalVulnerabilities += 1;
        if (severity === 'high') highVulnerabilities += 1;

        const findingKey = buildStableFindingKey([
          orgId,
          parentAsset.id,
          component.name,
          component.version || '',
          vulnerabilityId,
          'SBOM'
        ]);

        const findingId = await upsertVulnerabilityFinding(client, orgId, {
          assetId: componentAsset.id,
          standard: vulnerabilityId.toUpperCase().startsWith('CVE-') ? 'CVE/NVD' : parsed.format,
          findingKey,
          vulnerabilityId,
          title: vulnerability.title || `SBOM vulnerability in ${component.name}`,
          description: vulnerability.description || null,
          severity,
          cvssScore: vulnerability.cvss_score || null,
          packageName: component.name,
          componentName: component.name,
          version: component.version || null,
          cweId: vulnerability.cwe_id || null,
          metadata: {
            sbom_id: sbomId,
            component_id: componentId,
            recommendation: vulnerability.recommendation || null,
            source_format: parsed.format
          }
        });

        await client.query(
          `INSERT INTO component_vulnerabilities (
             organization_id, component_id, vulnerability_finding_id, cve_id, cwe_id, severity,
             cvss_score, title, description, fix_available, fixed_in_version, patch_url, status, metadata
           )
           VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11, $12, 'open', $13::jsonb
           )`,
          [
            orgId,
            componentId,
            findingId,
            vulnerabilityId.toUpperCase().startsWith('CVE-') ? vulnerabilityId : null,
            vulnerability.cwe_id || null,
            severity,
            vulnerability.cvss_score || null,
            vulnerability.title || `SBOM vulnerability in ${component.name}`,
            vulnerability.description || null,
            Boolean(vulnerability.recommendation),
            null,
            null,
            JSON.stringify({
              source_format: parsed.format,
              recommendation: vulnerability.recommendation || null,
              raw: vulnerability.raw || null
            })
          ]
        );

        vulnerabilityFindingsCreated += 1;
      }

      const licenseIds = extractLicenseIds(component);
      for (const licenseId of licenseIds) {
        let severity = null;
        let issueTitle = null;
        if (PROHIBITED_LICENSES.has(licenseId)) {
          severity = 'high';
          issueTitle = `Prohibited license detected: ${licenseId}`;
        } else if (REVIEW_LICENSES.has(licenseId)) {
          severity = 'medium';
          issueTitle = `License requires legal review: ${licenseId}`;
        }
        if (!severity) continue;

        vulnerabilitySeverities.push(severity);
        licenseIssues += 1;

        const findingKey = buildStableFindingKey([
          orgId,
          parentAsset.id,
          component.name,
          component.version || '',
          `LICENSE-${licenseId}`
        ]);

        await upsertVulnerabilityFinding(client, orgId, {
          assetId: componentAsset.id,
          standard: 'License Compliance',
          findingKey,
          vulnerabilityId: `LICENSE-${licenseId}`,
          title: issueTitle,
          description: `Component ${component.name}${component.version ? ` (${component.version})` : ''} uses ${licenseId}.`,
          severity,
          cvssScore: null,
          packageName: component.name,
          componentName: component.name,
          version: component.version || null,
          cweId: null,
          metadata: {
            sbom_id: sbomId,
            component_id: componentId,
            license_id: licenseId,
            issue_type: 'license_policy'
          }
        });
      }

      await client.query(
        `UPDATE software_components
         SET known_vulnerabilities = $1,
             highest_severity = $2
         WHERE id = $3`,
        [
          vulnerabilitySeverities.length,
          vulnerabilitySeverities.length ? highestSeverity(vulnerabilitySeverities) : null,
          componentId
        ]
      );
    }

    for (const dependency of parsed.dependencies || []) {
      const sourceRef = dependency.ref;
      const source = componentRefs.get(sourceRef);
      if (!source) continue;

      for (const targetRef of dependency.dependsOn || []) {
        const target = componentRefs.get(targetRef);
        if (!target || target.assetId === source.assetId) continue;
        await client.query(
          `INSERT INTO asset_dependencies (
             asset_id, depends_on_asset_id, dependency_type, criticality, notes
           )
           VALUES ($1, $2, 'uses', 'medium', $3)
           ON CONFLICT (asset_id, depends_on_asset_id, dependency_type) DO NOTHING`,
          [source.assetId, target.assetId, `Imported from SBOM ${sbomId}`]
        );
        dependencyLinksCreated += 1;
      }
    }

    await client.query(
      `UPDATE sboms
       SET total_components = $1,
           vulnerabilities_found = $2,
           critical_vulnerabilities = $3,
           high_vulnerabilities = $4,
           license_issues = $5,
           processed = true,
           processed_at = NOW()
       WHERE id = $6`,
      [
        componentsCreated,
        vulnerabilityFindingsCreated,
        criticalVulnerabilities,
        highVulnerabilities,
        licenseIssues,
        sbomId
      ]
    );

    await client.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'sbom_uploaded', 'sbom', $3, $4::jsonb, true)`,
      [
        orgId,
        userId,
        sbomId,
        JSON.stringify({
          asset_id: parentAsset.id,
          asset_name: parentAsset.name,
          sbom_format: parsed.format,
          total_components: componentsCreated,
          vulnerability_findings: vulnerabilityFindingsCreated,
          license_issues: licenseIssues,
          dependencies_created: dependencyLinksCreated
        })
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        sbom_id: sbomId,
        sbom_format: parsed.format,
        asset_id: parentAsset.id,
        asset_name: parentAsset.name,
        components_imported: componentsCreated,
        component_assets_created: componentAssetsCreated,
        vulnerabilities_found: vulnerabilityFindingsCreated,
        critical_vulnerabilities: criticalVulnerabilities,
        high_vulnerabilities: highVulnerabilities,
        license_issues: licenseIssues,
        dependencies_created: dependencyLinksCreated
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('SBOM upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to process SBOM upload' });
  } finally {
    client.release();
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'SBOM file exceeds 25MB upload limit' });
    }
    return res.status(400).json({ success: false, error: 'Invalid SBOM upload request' });
  }

  if (err?.message === 'Unsupported SBOM file type') {
    return res.status(400).json({ success: false, error: 'Unsupported SBOM file type' });
  }

  return next(err);
});

module.exports = router;
