// @tier: community
// Report generation for scheduled report delivery (routes/scheduledReports.js
// + services/jobService.js#runScheduledReport). Builds a real PDF/CSV/JSON
// file from live data per report_type, instead of the previous stub that
// only touched last_run_at.
const PDFDocument = require('pdfkit');
const pool = require('../config/database');

async function fetchFrameworkGapRows(orgId) {
  const { rows } = await pool.query(
    `SELECT f.name AS framework_name, fc.control_id, fc.title,
            COALESCE(ci.status, 'not_started') AS status
       FROM organization_frameworks of2
       JOIN frameworks f ON f.id = of2.framework_id
       JOIN framework_controls fc ON fc.framework_id = f.id
       LEFT JOIN control_implementations ci
         ON ci.control_id = fc.id AND ci.organization_id = of2.organization_id
      WHERE of2.organization_id = $1
        AND COALESCE(ci.status, 'not_started') NOT IN ('implemented', 'satisfied_via_crosswalk', 'verified', 'not_applicable')
      ORDER BY f.name, fc.control_id`,
    [orgId]
  );
  return rows;
}

async function fetchEvidenceStatusRows(orgId) {
  const { rows } = await pool.query(
    `SELECT e.title, e.pii_classification, e.retention_until,
            CASE WHEN e.retention_until IS NOT NULL AND e.retention_until < CURRENT_DATE THEN 'expired'
                 WHEN e.retention_until IS NOT NULL AND e.retention_until < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
                 ELSE 'current' END AS expiration_status,
            e.created_at
       FROM evidence e
      WHERE e.organization_id = $1
      ORDER BY e.retention_until ASC NULLS LAST`,
    [orgId]
  );
  return rows;
}

async function fetchAuditTrailRows(orgId) {
  const { rows } = await pool.query(
    `SELECT event_type, resource_type, resource_id, success, created_at
       FROM audit_logs
      WHERE organization_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT 500`,
    [orgId]
  );
  return rows;
}

async function fetchExecutiveRows(orgId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (cs.framework_id)
            f.code AS framework_code, f.name AS framework_name,
            cs.snapshot_date, cs.total_controls, cs.implemented, cs.compliance_pct
       FROM compliance_snapshots cs
       JOIN frameworks f ON f.id = cs.framework_id
      WHERE cs.organization_id = $1
      ORDER BY cs.framework_id, cs.snapshot_date DESC`,
    [orgId]
  );
  return rows;
}

async function fetchReportData(organizationId, reportType) {
  switch (reportType) {
    case 'framework_gap':
      return { rows: await fetchFrameworkGapRows(organizationId), title: 'Framework Gap Report' };
    case 'evidence_status':
      return { rows: await fetchEvidenceStatusRows(organizationId), title: 'Evidence Status Report' };
    case 'audit_trail':
      return { rows: await fetchAuditTrailRows(organizationId), title: 'Audit Trail Report' };
    case 'executive':
      return { rows: await fetchExecutiveRows(organizationId), title: 'Executive Summary Report' };
    case 'compliance_summary':
    default: {
      // eslint-disable-next-line global-require -- avoid a require cycle at module load time
      const { getComplianceData } = require('../routes/reports');
      const data = await getComplianceData(organizationId);
      return { rows: data.controls, summary: data, title: 'Compliance Summary Report' };
    }
  }
}

function toCsv(rows) {
  if (!rows || rows.length === 0) return 'No data.\n';
  const columns = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCell(row[col])).join(','));
  }
  return lines.join('\n');
}

function buildPdfBuffer(title, orgName, rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).fillColor('#7c3aed').text(title, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(13).fillColor('#374151').text(orgName, { align: 'center' });
    doc.fontSize(10).fillColor('#6b7280').text(new Date().toLocaleString('en-US'), { align: 'center' });
    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(1);

    if (!rows || rows.length === 0) {
      doc.fontSize(11).fillColor('#374151').text('No data for this reporting period.');
    } else {
      const columns = Object.keys(rows[0]);
      for (const row of rows) {
        if (doc.y > 700) doc.addPage();
        const line = columns.map((col) => `${col}: ${row[col] ?? ''}`).join('  |  ');
        doc.fontSize(9).fillColor('#111827').text(line);
        doc.moveDown(0.2);
      }
    }

    doc.end();
  });
}

async function generateReportFile({ organizationId, orgName, reportType, format }) {
  const { rows, title } = await fetchReportData(organizationId, reportType);
  const dateStamp = new Date().toISOString().split('T')[0];
  const baseName = `${reportType}-${dateStamp}`;

  if (format === 'csv') {
    return { buffer: Buffer.from(toCsv(rows), 'utf8'), filename: `${baseName}.csv`, mimeType: 'text/csv' };
  }
  if (format === 'json') {
    return {
      buffer: Buffer.from(JSON.stringify({ report_type: reportType, generated_at: new Date().toISOString(), rows }, null, 2), 'utf8'),
      filename: `${baseName}.json`,
      mimeType: 'application/json'
    };
  }
  const pdfBuffer = await buildPdfBuffer(title, orgName, rows);
  return { buffer: pdfBuffer, filename: `${baseName}.pdf`, mimeType: 'application/pdf' };
}

module.exports = { generateReportFile };
