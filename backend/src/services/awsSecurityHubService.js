// AWS Security Hub connector — polls findings and normalizes them for ControlWeave.
// Uses the AWS SDK v3; the caller must pass valid credentials from the connector config.
'use strict';

const SEVERITY_MAP = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFORMATIONAL: 'informational'
};

function normalizeSeverity(awsSeverity) {
  if (!awsSeverity) return 'informational';
  const label = String(awsSeverity.Label || awsSeverity.label || '').toUpperCase();
  return SEVERITY_MAP[label] || 'informational';
}

function normalizeStatus(awsWorkflow, awsRecord) {
  const wf = String((awsWorkflow && awsWorkflow.Status) || '').toUpperCase();
  const rc = String((awsRecord && awsRecord.RecordState) || '').toUpperCase();
  if (rc === 'ARCHIVED' || wf === 'RESOLVED' || wf === 'SUPPRESSED') return 'resolved';
  return 'open';
}

async function syncFindings(connectorConfig) {
  let SecurityHubClient, GetFindingsCommand;
  try {
    ({ SecurityHubClient, GetFindingsCommand } = require('@aws-sdk/client-securityhub'));
  } catch {
    return { error: 'aws-sdk-client-securityhub not installed', findings: [] };
  }

  const client = new SecurityHubClient({
    region: connectorConfig.region || 'us-east-1',
    credentials: {
      accessKeyId: connectorConfig.accessKeyId,
      secretAccessKey: connectorConfig.secretAccessKey,
      sessionToken: connectorConfig.sessionToken || undefined
    }
  });

  const findings = [];
  let nextToken;
  do {
    const command = new GetFindingsCommand({
      MaxResults: 100,
      NextToken: nextToken,
      Filters: {
        RecordState: [{ Value: 'ACTIVE', Comparison: 'EQUALS' }],
        WorkflowStatus: [{ Value: 'NEW', Comparison: 'EQUALS' }, { Value: 'NOTIFIED', Comparison: 'EQUALS' }]
      }
    });
    const response = await client.send(command);
    for (const finding of response.Findings || []) {
      findings.push({
        external_id: finding.Id,
        title: finding.Title || 'Untitled Finding',
        severity: normalizeSeverity(finding.Severity),
        status: normalizeStatus(finding.Workflow, finding.RecordState ? { RecordState: finding.RecordState } : null),
        raw_data: finding
      });
    }
    nextToken = response.NextToken;
  } while (nextToken);

  return { findings };
}

module.exports = { syncFindings };
