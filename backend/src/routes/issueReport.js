// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);

// Baseline limiter for all issue-report endpoints
router.use(createOrgRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 120,
  label: 'issue-report-route'
}));

// Rate limit: 10 issue reports per hour per org to prevent abuse
const issueReportLimiter = createOrgRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  label: 'issue-report'
});

const ALLOWED_CATEGORIES = ['bug', 'feature_request', 'usability', 'documentation', 'security', 'performance', 'other'];
const ALLOWED_SEVERITIES = ['low', 'medium', 'high', 'critical'];

/**
 * POST /api/v1/issues/report
 * Submit a new issue report from within the application.
 * Stores in the database and optionally forwards to GitHub Issues.
 */
router.post('/report', issueReportLimiter, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const userName = req.user.name || req.user.email || 'Unknown';
    const orgName = req.user.organization_name || 'Unknown Org';
    const tier = req.user.organization_tier || req.user.effectiveTier || 'community';

    const {
      title,
      description,
      category = 'bug',
      severity = 'medium',
      page_url,
      browser_info,
      steps_to_reproduce,
      expected_behavior,
      actual_behavior
    } = req.body || {};

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'title is required (min 3 chars)' });
    }
    if (title.trim().length > 200) {
      return res.status(400).json({ success: false, error: 'title must be 200 chars or less' });
    }
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'description is required (min 10 chars)' });
    }
    if (description.trim().length > 5000) {
      return res.status(400).json({ success: false, error: 'description must be 5000 chars or less' });
    }
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}` });
    }
    if (!ALLOWED_SEVERITIES.includes(severity)) {
      return res.status(400).json({ success: false, error: `severity must be one of: ${ALLOWED_SEVERITIES.join(', ')}` });
    }

    // Store the issue report in audit_logs for traceability
    const details = {
      title: title.trim(),
      description: description.trim(),
      category,
      severity,
      page_url: page_url || null,
      browser_info: browser_info || null,
      steps_to_reproduce: steps_to_reproduce || null,
      expected_behavior: expected_behavior || null,
      actual_behavior: actual_behavior || null,
      reporter_name: userName,
      organization_name: orgName,
      tier
    };

    const result = await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details, success, outcome, source_system)
       VALUES ($1, $2, 'issue_report_submitted', 'issue_report', $3::jsonb, true, 'success', 'controlweave')
       RETURNING id, created_at`,
      [orgId, userId, JSON.stringify(details)]
    );

    const issueId = result.rows[0].id;
    const createdAt = result.rows[0].created_at;

    // Sanitize user input for GitHub — neutralize @mentions and full HTML entity escaping
    const sanitizeForGh = (str) => {
      if (!str || typeof str !== 'string') return '';
      return str
        .replace(/&/g, '&amp;')        // escape ampersands first to avoid double-escaping
        .replace(/</g, '&lt;')         // escape HTML open tags
        .replace(/>/g, '&gt;')         // escape HTML close tags
        .replace(/"/g, '&quot;')       // escape double quotes
        .replace(/'/g, '&#39;')        // escape single quotes
        .replace(/@/g, '@ ');          // neutralize @mentions
    };

    const ghTitle = sanitizeForGh(title.trim());
    const ghDesc = sanitizeForGh(description.trim());
    const ghSteps = sanitizeForGh(steps_to_reproduce || '');
    const ghExpected = sanitizeForGh(expected_behavior || '');
    const ghActual = sanitizeForGh(actual_behavior || '');
    const ghBrowser = sanitizeForGh(browser_info || '');

    // Build GitHub issue body for forwarding
    const ghBody = [
      `## Issue Report`,
      `**Category:** ${category}`,
      `**Severity:** ${severity}`,
      `**Page:** ${page_url || 'Not specified'}`,
      `**Submitted:** ${new Date(createdAt).toISOString()}`,
      '',
      `### Description`,
      ghDesc,
      ghSteps ? `\n### Steps to Reproduce\n${ghSteps}` : '',
      ghExpected ? `\n### Expected Behavior\n${ghExpected}` : '',
      ghActual ? `\n### Actual Behavior\n${ghActual}` : '',
      ghBrowser ? `\n### Environment\n\`${ghBrowser}\`` : '',
      '',
      `---`,
      `*Submitted via ControlWeave in-app issue reporter (ID: ${issueId})*`
    ].filter(Boolean).join('\n');

    // Attempt to create a GitHub issue if GITHUB_TOKEN is configured
    let githubIssueUrl = null;
    const ghToken = process.env.GITHUB_ISSUES_TOKEN;
    const ghRepo = process.env.GITHUB_ISSUES_REPO;

    if (ghToken && ghRepo) {
      try {
        const [owner, repo] = ghRepo.split('/');
        const ghLabels = ['user-reported', category];
        if (severity === 'critical' || severity === 'high') {
          ghLabels.push(`priority:${severity}`);
        }

        const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'ControlWeave-IssueReporter'
          },
          body: JSON.stringify({
            title: `[User Report] ${ghTitle}`,
            body: ghBody,
            labels: ghLabels
          })
        });

        if (ghRes.ok) {
          const ghData = await ghRes.json();
          githubIssueUrl = ghData.html_url;
        } else {
          console.warn('GitHub issue creation failed with status:', ghRes.status);
        }
      } catch (ghErr) {
        console.warn('GitHub issue creation error:', ghErr.message);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        issue_id: issueId,
        created_at: createdAt,
        github_issue_url: githubIssueUrl,
        message: githubIssueUrl
          ? 'Issue reported and forwarded to the development team.'
          : 'Issue reported successfully. Our team will review it.'
      }
    });
  } catch (error) {
    console.error('Issue report error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit issue report' });
  }
});

/**
 * GET /api/v1/issues/my-reports
 * List the current user's submitted issue reports.
 */
router.get('/my-reports', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, details, created_at
       FROM audit_logs
       WHERE organization_id = $1 AND user_id = $2 AND event_type = 'issue_report_submitted'
       ORDER BY created_at DESC
       LIMIT 50`,
      [orgId, userId]
    );

    const reports = result.rows.map(row => ({
      id: row.id,
      title: row.details?.title || 'Untitled',
      category: row.details?.category || 'other',
      severity: row.details?.severity || 'medium',
      created_at: row.created_at
    }));

    res.json({ success: true, data: reports });
  } catch (error) {
    console.error('List issue reports error:', error);
    res.status(500).json({ success: false, error: 'Failed to list issue reports' });
  }
});

module.exports = router;
