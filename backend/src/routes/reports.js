// @tier: pro
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.use(requireTier('pro'));

// Helper: get compliance data for an org
async function getComplianceData(orgId) {
  const overallResult = await pool.query(`
    SELECT
      COUNT(DISTINCT fc.id) as total_controls,
      COUNT(DISTINCT CASE WHEN ci.status = 'implemented' THEN ci.id END) as implemented,
      COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) as crosswalked,
      COUNT(DISTINCT CASE WHEN ci.status = 'in_progress' THEN ci.id END) as in_progress,
      COUNT(DISTINCT CASE WHEN ci.status = 'needs_review' THEN ci.id END) as needs_review
    FROM organization_frameworks of2
    JOIN framework_controls fc ON fc.framework_id = of2.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
  `, [orgId]);

  const frameworkResult = await pool.query(`
    SELECT
      f.name, f.code,
      COUNT(DISTINCT fc.id) as total_controls,
      COUNT(DISTINCT CASE WHEN ci.status = 'implemented' THEN ci.id END) as implemented,
      COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) as crosswalked,
      COUNT(DISTINCT CASE WHEN ci.status = 'in_progress' THEN ci.id END) as in_progress
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
    GROUP BY f.id, f.name, f.code
    ORDER BY f.name
  `, [orgId]);

  const controlsResult = await pool.query(`
    SELECT fc.control_id, fc.title, fc.priority,
           f.name as framework_name, f.code as framework_code,
           COALESCE(ci.status, 'not_started') as status,
           ci.notes, ci.implementation_date,
           u.first_name || ' ' || u.last_name as assigned_to
    FROM organization_frameworks of2
    JOIN framework_controls fc ON fc.framework_id = of2.framework_id
    JOIN frameworks f ON f.id = fc.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    LEFT JOIN users u ON u.id = ci.assigned_to
    WHERE of2.organization_id = $1
    ORDER BY f.name, fc.control_id
  `, [orgId]);

  return {
    overall: overallResult.rows[0],
    frameworks: frameworkResult.rows,
    controls: controlsResult.rows
  };
}

async function queryOptional(sql, params, fallbackRows = [{}]) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (error && error.code === '42P01') {
      return { rows: fallbackRows };
    }
    throw error;
  }
}

function toNumber(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

async function getSspData(orgId) {
  const [orgResult, profileResult, complianceData, assetSummaryResult, assetCategoryResult, vulnerabilitySummaryResult, evidenceSummaryResult, poamSummaryResult] = await Promise.all([
    pool.query(
      `SELECT id, name, tier, created_at
       FROM organizations
       WHERE id = $1
       LIMIT 1`,
      [orgId]
    ),
    queryOptional(
      `SELECT *
       FROM organization_profiles
       WHERE organization_id = $1
       LIMIT 1`,
      [orgId]
    ),
    getComplianceData(orgId),
    queryOptional(
      `SELECT
         COUNT(*)::int AS total_assets,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active_assets,
         COUNT(*) FILTER (WHERE criticality = 'critical')::int AS critical_assets
       FROM assets
       WHERE organization_id = $1`,
      [orgId]
    ),
    queryOptional(
      `SELECT
         ac.name,
         ac.code,
         COUNT(a.id)::int AS count
       FROM asset_categories ac
       LEFT JOIN assets a ON a.category_id = ac.id AND a.organization_id = $1
       GROUP BY ac.id, ac.name, ac.code
       ORDER BY count DESC, ac.name`,
      [orgId],
      []
    ),
    queryOptional(
      `SELECT
         COUNT(*)::int AS total_findings,
         COUNT(*) FILTER (WHERE status = 'open')::int AS open_findings,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_findings,
         COUNT(*) FILTER (WHERE status = 'remediated')::int AS remediated_findings,
         COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical_findings
       FROM vulnerability_findings
       WHERE organization_id = $1`,
      [orgId]
    ),
    queryOptional(
      `SELECT COUNT(*)::int AS total_evidence
       FROM evidence
       WHERE organization_id = $1`,
      [orgId]
    ),
    queryOptional(
      `SELECT
         COUNT(*)::int AS total_poam,
         COUNT(*) FILTER (WHERE status = 'open')::int AS open_poam,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_poam,
         COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_poam
       FROM poam_items
       WHERE organization_id = $1`,
      [orgId]
    )
  ]);

  const organization = orgResult.rows[0] || { id: orgId, name: 'Organization', tier: 'community', created_at: null };
  const profile = profileResult.rows[0] || {};
  const overall = complianceData.overall || {};
  const controlsTotal = toNumber(overall.total_controls);
  const controlsImplemented = toNumber(overall.implemented);
  const controlsCrosswalked = toNumber(overall.crosswalked);
  const controlsInProgress = toNumber(overall.in_progress);
  const controlsNeedsReview = toNumber(overall.needs_review);
  const compliancePercent = controlsTotal > 0
    ? Math.round(((controlsImplemented + controlsCrosswalked) / controlsTotal) * 100)
    : 0;

  const assetSummary = assetSummaryResult.rows[0] || {};
  const vulnerabilitySummary = vulnerabilitySummaryResult.rows[0] || {};
  const evidenceSummary = evidenceSummaryResult.rows[0] || {};
  const poamSummary = poamSummaryResult.rows[0] || {};

  return {
    generated_at: new Date().toISOString(),
    organization: {
      id: organization.id,
      name: organization.name,
      tier: organization.tier,
      created_at: organization.created_at
    },
    profile: {
      company_legal_name: profile.company_legal_name || null,
      company_description: profile.company_description || null,
      industry: profile.industry || null,
      website: profile.website || null,
      headquarters_location: profile.headquarters_location || null,
      employee_count_range: profile.employee_count_range || null,
      system_name: profile.system_name || null,
      system_description: profile.system_description || null,
      authorization_boundary: profile.authorization_boundary || null,
      operating_environment_summary: profile.operating_environment_summary || null,
      confidentiality_impact: profile.confidentiality_impact || null,
      integrity_impact: profile.integrity_impact || null,
      availability_impact: profile.availability_impact || null,
      impact_rationale: profile.impact_rationale || null,
      environment_types: toArray(profile.environment_types),
      deployment_model: profile.deployment_model || null,
      cloud_providers: toArray(profile.cloud_providers),
      data_sensitivity_types: toArray(profile.data_sensitivity_types),
      rmf_stage: profile.rmf_stage || null,
      rmf_notes: profile.rmf_notes || null,
      compliance_profile: profile.compliance_profile || 'private',
      nist_adoption_mode: profile.nist_adoption_mode || 'best_practice',
      nist_notes: profile.nist_notes || null
    },
    compliance: {
      overall: {
        total_controls: controlsTotal,
        implemented: controlsImplemented,
        satisfied_via_crosswalk: controlsCrosswalked,
        in_progress: controlsInProgress,
        needs_review: controlsNeedsReview,
        compliance_percent: compliancePercent
      },
      frameworks: complianceData.frameworks || []
    },
    assets: {
      summary: {
        total_assets: toNumber(assetSummary.total_assets),
        active_assets: toNumber(assetSummary.active_assets),
        critical_assets: toNumber(assetSummary.critical_assets)
      },
      by_category: assetCategoryResult.rows || []
    },
    vulnerabilities: {
      total_findings: toNumber(vulnerabilitySummary.total_findings),
      open_findings: toNumber(vulnerabilitySummary.open_findings),
      in_progress_findings: toNumber(vulnerabilitySummary.in_progress_findings),
      remediated_findings: toNumber(vulnerabilitySummary.remediated_findings),
      critical_findings: toNumber(vulnerabilitySummary.critical_findings)
    },
    evidence: {
      total_evidence: toNumber(evidenceSummary.total_evidence)
    },
    poam: {
      total_items: toNumber(poamSummary.total_poam),
      open_items: toNumber(poamSummary.open_poam),
      in_progress_items: toNumber(poamSummary.in_progress_poam),
      closed_items: toNumber(poamSummary.closed_poam)
    }
  };
}

// GET /reports/compliance/pdf
router.get('/compliance/pdf', requirePermission('reports.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const orgName = req.user.organization_name;
    const data = await getComplianceData(orgId);
    const overall = data.overall;
    const total = parseInt(overall.total_controls) || 1;
    const implemented = parseInt(overall.implemented) || 0;
    const crosswalked = parseInt(overall.crosswalked) || 0;
    const compliancePct = Math.round(((implemented + crosswalked) / total) * 100);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="compliance-report-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    // Title page
    doc.fontSize(28).fillColor('#7c3aed').text('Compliance Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).fillColor('#374151').text(orgName, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).fillColor('#6b7280').text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
    doc.moveDown(2);

    // Executive Summary
    doc.fontSize(18).fillColor('#111827').text('Executive Summary');
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.5);

    doc.fontSize(11).fillColor('#374151');
    doc.text(`Overall Compliance: ${compliancePct}%`);
    doc.text(`Total Controls: ${total}`);
    doc.text(`Implemented: ${implemented}`);
    doc.text(`Satisfied via Crosswalk: ${crosswalked}`);
    doc.text(`In Progress: ${overall.in_progress || 0}`);
    doc.text(`Needs Review: ${overall.needs_review || 0}`);
    doc.text(`Not Started: ${total - implemented - crosswalked - (parseInt(overall.in_progress) || 0) - (parseInt(overall.needs_review) || 0)}`);
    doc.moveDown(1.5);

    // Framework breakdown
    doc.fontSize(18).fillColor('#111827').text('Framework Breakdown');
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.5);

    for (const fw of data.frameworks) {
      const fwTotal = parseInt(fw.total_controls);
      const fwImpl = parseInt(fw.implemented) + parseInt(fw.crosswalked);
      const fwPct = fwTotal > 0 ? Math.round((fwImpl / fwTotal) * 100) : 0;

      doc.fontSize(13).fillColor('#1f2937').text(`${fw.name} (${fw.code})`);
      doc.fontSize(10).fillColor('#6b7280')
        .text(`${fwPct}% compliant | ${fwImpl} of ${fwTotal} controls | ${fw.in_progress || 0} in progress`);
      doc.moveDown(0.5);
    }

    // Control details (new page)
    doc.addPage();
    doc.fontSize(18).fillColor('#111827').text('Control Details');
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.5);

    const statusColor = (s) => {
      if (s === 'implemented') return '#059669';
      if (s === 'satisfied_via_crosswalk') return '#2563eb';
      if (s === 'in_progress') return '#d97706';
      if (s === 'needs_review') return '#dc2626';
      return '#6b7280';
    };

    let currentFramework = '';
    for (const ctrl of data.controls) {
      if (doc.y > 700) doc.addPage();

      if (ctrl.framework_name !== currentFramework) {
        currentFramework = ctrl.framework_name;
        doc.moveDown(0.5);
        doc.fontSize(13).fillColor('#7c3aed').text(currentFramework);
        doc.moveDown(0.3);
      }

      doc.fontSize(9).fillColor(statusColor(ctrl.status))
        .text(`[${ctrl.status.replace(/_/g, ' ').toUpperCase()}]`, { continued: true });
      doc.fillColor('#111827').text(`  ${ctrl.control_id} - ${ctrl.title}`);

      if (ctrl.assigned_to) {
        doc.fontSize(8).fillColor('#9ca3af').text(`    Assigned: ${ctrl.assigned_to}`);
      }
    }

    // Footer
    doc.addPage();
    doc.fontSize(10).fillColor('#9ca3af').text('This report was generated by ControlWeave.', { align: 'center' });
    doc.text('For audit purposes only. Verify all data before submission.', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('PDF report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate PDF report' });
  }
});

// GET /reports/compliance/excel
router.get('/compliance/excel', requirePermission('reports.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const orgName = req.user.organization_name;
    const data = await getComplianceData(orgId);
    const overall = data.overall;
    const total = parseInt(overall.total_controls) || 1;
    const implemented = parseInt(overall.implemented) || 0;
    const crosswalked = parseInt(overall.crosswalked) || 0;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ControlWeave';
    workbook.created = new Date();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };

    summarySheet.addRow({ metric: 'Organization', value: orgName });
    summarySheet.addRow({ metric: 'Report Date', value: new Date().toLocaleDateString() });
    summarySheet.addRow({ metric: 'Overall Compliance', value: `${Math.round(((implemented + crosswalked) / total) * 100)}%` });
    summarySheet.addRow({ metric: 'Total Controls', value: total });
    summarySheet.addRow({ metric: 'Implemented', value: implemented });
    summarySheet.addRow({ metric: 'Crosswalked', value: crosswalked });
    summarySheet.addRow({ metric: 'In Progress', value: parseInt(overall.in_progress) || 0 });
    summarySheet.addRow({ metric: 'Needs Review', value: parseInt(overall.needs_review) || 0 });

    // Frameworks sheet
    const fwSheet = workbook.addWorksheet('Frameworks');
    fwSheet.columns = [
      { header: 'Framework', key: 'name', width: 35 },
      { header: 'Code', key: 'code', width: 15 },
      { header: 'Total Controls', key: 'total', width: 15 },
      { header: 'Implemented', key: 'implemented', width: 15 },
      { header: 'Crosswalked', key: 'crosswalked', width: 15 },
      { header: 'In Progress', key: 'in_progress', width: 15 },
      { header: 'Compliance %', key: 'pct', width: 15 },
    ];
    fwSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    fwSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };

    for (const fw of data.frameworks) {
      const fwTotal = parseInt(fw.total_controls);
      const fwDone = parseInt(fw.implemented) + parseInt(fw.crosswalked);
      fwSheet.addRow({
        name: fw.name,
        code: fw.code,
        total: fwTotal,
        implemented: parseInt(fw.implemented),
        crosswalked: parseInt(fw.crosswalked),
        in_progress: parseInt(fw.in_progress) || 0,
        pct: fwTotal > 0 ? `${Math.round((fwDone / fwTotal) * 100)}%` : '0%'
      });
    }

    // Controls sheet
    const ctrlSheet = workbook.addWorksheet('Controls');
    ctrlSheet.columns = [
      { header: 'Framework', key: 'framework', width: 25 },
      { header: 'Control ID', key: 'control_id', width: 15 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Priority', key: 'priority', width: 10 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Assigned To', key: 'assigned_to', width: 20 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];
    ctrlSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ctrlSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };

    for (const ctrl of data.controls) {
      const row = ctrlSheet.addRow({
        framework: ctrl.framework_name,
        control_id: ctrl.control_id,
        title: ctrl.title,
        priority: ctrl.priority || '-',
        status: ctrl.status.replace(/_/g, ' '),
        assigned_to: ctrl.assigned_to || '-',
        notes: ctrl.notes || ''
      });

      // Color-code status
      const statusCell = row.getCell('status');
      if (ctrl.status === 'implemented') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      } else if (ctrl.status === 'in_progress') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      } else if (ctrl.status === 'not_started') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="compliance-report-${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate Excel report' });
  }
});

// GET /reports/ssp/json
router.get('/ssp/json', requirePermission('reports.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const ssp = await getSspData(orgId);

    const fileDate = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ssp-${fileDate}.json"`);
    res.send(JSON.stringify(ssp, null, 2));
  } catch (error) {
    console.error('SSP JSON report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate SSP JSON report' });
  }
});

// GET /reports/ssp/pdf
router.get('/ssp/pdf', requirePermission('reports.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const ssp = await getSspData(orgId);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    const profile = ssp.profile || {};
    const compliance = ssp.compliance || {};
    const overall = compliance.overall || {};

    const fileDate = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ssp-${fileDate}.pdf"`);
    doc.pipe(res);

    doc.fontSize(26).fillColor('#1d4ed8').text('System Security Plan (SSP)', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(15).fillColor('#111827').text(ssp.organization?.name || 'Organization', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#6b7280').text(`Generated ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(1.2);

    doc.fontSize(16).fillColor('#111827').text('1. Organization and System Context');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#374151');
    doc.text(`Legal name: ${profile.company_legal_name || ssp.organization?.name || 'Not specified'}`);
    doc.text(`System name: ${profile.system_name || 'Not specified'}`);
    doc.text(`Industry: ${profile.industry || 'Not specified'}`);
    doc.text(`Website: ${profile.website || 'Not specified'}`);
    doc.moveDown(0.3);
    doc.text(`System description: ${profile.system_description || 'Not specified'}`);
    doc.moveDown(0.3);
    doc.text(`Authorization boundary: ${profile.authorization_boundary || 'Not specified'}`);
    doc.moveDown(0.3);
    doc.text(`Operating environment: ${profile.operating_environment_summary || 'Not specified'}`);
    doc.moveDown(0.6);

    doc.fontSize(16).fillColor('#111827').text('2. CIA Impact Baseline');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#374151');
    doc.text(`Confidentiality: ${profile.confidentiality_impact || 'Not specified'}`);
    doc.text(`Integrity: ${profile.integrity_impact || 'Not specified'}`);
    doc.text(`Availability: ${profile.availability_impact || 'Not specified'}`);
    doc.moveDown(0.3);
    doc.text(`Impact rationale: ${profile.impact_rationale || 'Not specified'}`);
    doc.moveDown(0.3);
    doc.text(`Environment types: ${(profile.environment_types || []).join(', ') || 'Not specified'}`);
    doc.text(`Deployment model: ${profile.deployment_model || 'Not specified'}`);
    doc.text(`Cloud providers: ${(profile.cloud_providers || []).join(', ') || 'Not specified'}`);
    doc.text(`Data sensitivity types: ${(profile.data_sensitivity_types || []).join(', ') || 'Not specified'}`);
    doc.moveDown(0.6);

    doc.fontSize(16).fillColor('#111827').text('3. Compliance Posture');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#374151');
    doc.text(`Total controls: ${overall.total_controls || 0}`);
    doc.text(`Implemented: ${overall.implemented || 0}`);
    doc.text(`Satisfied via crosswalk: ${overall.satisfied_via_crosswalk || 0}`);
    doc.text(`In progress: ${overall.in_progress || 0}`);
    doc.text(`Needs review: ${overall.needs_review || 0}`);
    doc.text(`Overall compliance: ${overall.compliance_percent || 0}%`);
    doc.moveDown(0.3);

    const frameworks = Array.isArray(compliance.frameworks) ? compliance.frameworks : [];
    if (frameworks.length > 0) {
      doc.fontSize(11).fillColor('#111827').text('Framework breakdown:');
      frameworks.slice(0, 20).forEach((framework) => {
        const totalControls = toNumber(framework.total_controls);
        const implemented = toNumber(framework.implemented) + toNumber(framework.crosswalked);
        const pct = totalControls > 0 ? Math.round((implemented / totalControls) * 100) : 0;
        doc.fontSize(10).fillColor('#374151').text(`- ${framework.name} (${framework.code}): ${implemented}/${totalControls} (${pct}%)`);
      });
    } else {
      doc.fontSize(10).fillColor('#6b7280').text('No frameworks configured.');
    }

    doc.addPage();
    doc.fontSize(16).fillColor('#111827').text('4. Asset and Vulnerability Posture');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#374151');
    doc.text(`Total assets: ${ssp.assets?.summary?.total_assets || 0}`);
    doc.text(`Active assets: ${ssp.assets?.summary?.active_assets || 0}`);
    doc.text(`Critical assets: ${ssp.assets?.summary?.critical_assets || 0}`);
    doc.moveDown(0.3);

    const categoryRows = Array.isArray(ssp.assets?.by_category) ? ssp.assets.by_category : [];
    if (categoryRows.length > 0) {
      doc.fontSize(11).fillColor('#111827').text('Asset categories:');
      categoryRows.forEach((row) => {
        doc.fontSize(10).fillColor('#374151').text(`- ${row.name} (${row.code}): ${toNumber(row.count)}`);
      });
    }
    doc.moveDown(0.5);

    doc.fontSize(11).fillColor('#111827').text('Vulnerabilities:');
    doc.fontSize(10).fillColor('#374151');
    doc.text(`Total findings: ${ssp.vulnerabilities?.total_findings || 0}`);
    doc.text(`Open: ${ssp.vulnerabilities?.open_findings || 0}`);
    doc.text(`In progress: ${ssp.vulnerabilities?.in_progress_findings || 0}`);
    doc.text(`Remediated: ${ssp.vulnerabilities?.remediated_findings || 0}`);
    doc.text(`Critical findings: ${ssp.vulnerabilities?.critical_findings || 0}`);
    doc.moveDown(0.6);

    doc.fontSize(16).fillColor('#111827').text('5. Evidence and POA&M');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#374151');
    doc.text(`Evidence artifacts: ${ssp.evidence?.total_evidence || 0}`);
    doc.text(`POA&M items (total/open/in-progress/closed): ${ssp.poam?.total_items || 0} / ${ssp.poam?.open_items || 0} / ${ssp.poam?.in_progress_items || 0} / ${ssp.poam?.closed_items || 0}`);
    doc.moveDown(0.6);

    doc.fontSize(16).fillColor('#111827').text('6. RMF and NIST Positioning');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#374151');
    doc.text(`Compliance profile: ${profile.compliance_profile || 'private'}`);
    doc.text(`NIST adoption mode: ${profile.nist_adoption_mode || 'best_practice'}`);
    doc.text(`RMF stage: ${profile.rmf_stage || 'Not specified'}`);
    doc.moveDown(0.3);
    doc.text(`RMF notes: ${profile.rmf_notes || 'Not specified'}`);
    doc.moveDown(0.3);
    doc.text(`NIST notes: ${profile.nist_notes || 'Not specified'}`);

    doc.end();
  } catch (error) {
    console.error('SSP PDF report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate SSP PDF report' });
  }
});

// GET /reports/types
router.get('/types', requirePermission('reports.read'), async (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'compliance-pdf', name: 'Compliance Report (PDF)', format: 'pdf', description: 'Full compliance status report with framework breakdown and control details' },
      { id: 'compliance-excel', name: 'Compliance Report (Excel)', format: 'xlsx', description: 'Spreadsheet with summary, frameworks, and all controls with status' },
      { id: 'ssp-pdf', name: 'System Security Plan (SSP) PDF', format: 'pdf', description: 'Narrative SSP including organization profile, control posture, assets, vulnerabilities, evidence, and POA&M' },
      { id: 'ssp-json', name: 'System Security Plan (SSP) JSON', format: 'json', description: 'Machine-readable SSP snapshot for integrations and versioning' },
      { id: 'executive', name: 'Executive Summary', format: 'json', description: 'Cross-framework compliance summary with trend data for executive reporting' },
      { id: 'scheduled', name: 'Scheduled Report', format: 'various', description: 'Recurring automated report delivery on a configured schedule' },
    ]
  });
});

// GET /reports/executive — cross-framework executive summary from compliance snapshots
router.get('/executive', requirePermission('reports.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 90));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const latestResult = await pool.query(
      `SELECT DISTINCT ON (cs.framework_id)
              f.code AS framework_code, f.name AS framework_name,
              cs.snapshot_date, cs.total_controls, cs.implemented,
              cs.partial, cs.not_implemented, cs.compliance_pct
         FROM compliance_snapshots cs
         JOIN frameworks f ON f.id = cs.framework_id
        WHERE cs.organization_id = $1
        ORDER BY cs.framework_id, cs.snapshot_date DESC`,
      [orgId]
    );

    const trendResult = await pool.query(
      `SELECT f.code AS framework_code, cs.snapshot_date, cs.compliance_pct
         FROM compliance_snapshots cs
         JOIN frameworks f ON f.id = cs.framework_id
        WHERE cs.organization_id = $1 AND cs.snapshot_date >= $2
        ORDER BY f.code, cs.snapshot_date ASC`,
      [orgId, since]
    );

    const trendByFramework = {};
    for (const row of trendResult.rows) {
      if (!trendByFramework[row.framework_code]) trendByFramework[row.framework_code] = [];
      trendByFramework[row.framework_code].push({
        date: row.snapshot_date,
        compliance_pct: parseFloat(row.compliance_pct)
      });
    }

    const frameworks = latestResult.rows.map((row) => ({
      ...row,
      compliance_pct: parseFloat(row.compliance_pct),
      trend: trendByFramework[row.framework_code] || []
    }));

    const overallPct = frameworks.length > 0
      ? Math.round(frameworks.reduce((sum, f) => sum + f.compliance_pct, 0) / frameworks.length * 100) / 100
      : 0;

    res.json({
      success: true,
      data: {
        generated_at: new Date().toISOString(),
        period_days: days,
        overall_compliance_pct: overallPct,
        framework_count: frameworks.length,
        frameworks
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /reports/trend/framework/:frameworkId — per-framework compliance trend from snapshots
router.get('/trend/framework/:frameworkId', requirePermission('reports.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 90));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const fwCheck = await pool.query(
      `SELECT f.id, f.code, f.name FROM frameworks f WHERE f.id = $1`,
      [req.params.frameworkId]
    );
    if (fwCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Framework not found' });
    }

    const trendResult = await pool.query(
      `SELECT snapshot_date, total_controls, implemented, partial, not_implemented, compliance_pct
         FROM compliance_snapshots
        WHERE organization_id = $1 AND framework_id = $2 AND snapshot_date >= $3
        ORDER BY snapshot_date ASC`,
      [orgId, req.params.frameworkId, since]
    );

    res.json({
      success: true,
      data: {
        framework: fwCheck.rows[0],
        period_days: days,
        snapshots: trendResult.rows.map((r) => ({
          ...r,
          compliance_pct: parseFloat(r.compliance_pct)
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /reports/scheduled — list scheduled reports for the org
router.get('/scheduled', requirePermission('reports.read'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM scheduled_reports WHERE organization_id = $1 ORDER BY created_at DESC',
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /reports/scheduled — create a scheduled report
router.post('/scheduled', requirePermission('reports.manage'), async (req, res) => {
  try {
    const { name, report_type, schedule, format = 'pdf', recipients = [], filters = {} } = req.body;
    if (!name || !report_type || !schedule) {
      return res.status(400).json({ error: 'name, report_type, and schedule are required' });
    }
    const VALID_SCHEDULES = ['daily', 'weekly', 'monthly', 'quarterly'];
    if (!VALID_SCHEDULES.includes(schedule)) {
      return res.status(400).json({ error: `schedule must be one of: ${VALID_SCHEDULES.join(', ')}` });
    }
    const result = await pool.query(
      `INSERT INTO scheduled_reports
         (organization_id, name, report_type, schedule, format, recipients, filters, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       RETURNING *`,
      [req.user.organization_id, name.trim(), report_type, schedule, format,
       JSON.stringify(recipients), JSON.stringify(filters), req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /reports/scheduled/:id — update a scheduled report
router.patch('/scheduled/:id', requirePermission('reports.manage'), async (req, res) => {
  try {
    const { name, schedule, format, recipients, filters, is_active } = req.body;
    const existing = await pool.query(
      'SELECT id FROM scheduled_reports WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled report not found' });
    }
    const result = await pool.query(
      `UPDATE scheduled_reports
         SET name = COALESCE($3, name),
             schedule = COALESCE($4, schedule),
             format = COALESCE($5, format),
             recipients = COALESCE($6::jsonb, recipients),
             filters = COALESCE($7::jsonb, filters),
             is_active = COALESCE($8, is_active),
             updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [req.params.id, req.user.organization_id,
       name || null, schedule || null, format || null,
       recipients ? JSON.stringify(recipients) : null,
       filters ? JSON.stringify(filters) : null,
       is_active === undefined ? null : is_active]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /reports/scheduled/:id — delete a scheduled report
router.delete('/scheduled/:id', requirePermission('reports.manage'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM scheduled_reports WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled report not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /reports/scheduled/:id/run — manually trigger a scheduled report
router.post('/scheduled/:id/run', requirePermission('reports.manage'), async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT id FROM scheduled_reports WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled report not found' });
    }
    const { enqueueJob } = require('../services/jobService');
    const job = await enqueueJob({
      organizationId: req.user.organization_id,
      jobType: 'scheduled_report_run',
      payload: { scheduledReportId: req.params.id },
      createdBy: req.user.id
    });
    res.json({ success: true, data: { job_id: job.id } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
