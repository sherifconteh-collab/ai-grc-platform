// @tier: enterprise
/**
 * CWE → MITRE ATT&CK mapping utility.
 *
 * Maps common CWE IDs to the most-relevant ATT&CK techniques so that
 * vulnerability findings can surface tactical threat context.
 */

const CWE_TO_ATTACK = Object.freeze({
  'CWE-78':  [{ technique: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'TA0002 Execution' }],
  'CWE-79':  [{ technique: 'T1059.007', name: 'JavaScript', tactic: 'TA0002 Execution' }],
  'CWE-89':  [{ technique: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'TA0001 Initial Access' }],
  'CWE-94':  [{ technique: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'TA0002 Execution' }],
  'CWE-119': [{ technique: 'T1203', name: 'Exploitation for Client Execution', tactic: 'TA0002 Execution' }],
  'CWE-125': [{ technique: 'T1005', name: 'Data from Local System', tactic: 'TA0009 Collection' }],
  'CWE-190': [{ technique: 'T1203', name: 'Exploitation for Client Execution', tactic: 'TA0002 Execution' }],
  'CWE-200': [{ technique: 'T1005', name: 'Data from Local System', tactic: 'TA0009 Collection' }],
  'CWE-269': [{ technique: 'T1068', name: 'Exploitation for Privilege Escalation', tactic: 'TA0004 Privilege Escalation' }],
  'CWE-276': [{ technique: 'T1222', name: 'File and Directory Permissions Modification', tactic: 'TA0005 Defense Evasion' }],
  'CWE-287': [{ technique: 'T1078', name: 'Valid Accounts', tactic: 'TA0001 Initial Access' }],
  'CWE-306': [{ technique: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'TA0001 Initial Access' }],
  'CWE-352': [{ technique: 'T1185', name: 'Browser Session Hijacking', tactic: 'TA0009 Collection' }],
  'CWE-400': [{ technique: 'T1499', name: 'Endpoint Denial of Service', tactic: 'TA0040 Impact' }],
  'CWE-416': [{ technique: 'T1203', name: 'Exploitation for Client Execution', tactic: 'TA0002 Execution' }],
  'CWE-434': [{ technique: 'T1105', name: 'Ingress Tool Transfer', tactic: 'TA0011 Command and Control' }],
  'CWE-502': [{ technique: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'TA0002 Execution' }],
  'CWE-522': [{ technique: 'T1110', name: 'Brute Force', tactic: 'TA0006 Credential Access' }],
  'CWE-601': [{ technique: 'T1566.002', name: 'Spearphishing Link', tactic: 'TA0001 Initial Access' }],
  'CWE-611': [{ technique: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'TA0001 Initial Access' }],
  'CWE-787': [{ technique: 'T1203', name: 'Exploitation for Client Execution', tactic: 'TA0002 Execution' }],
  'CWE-798': [{ technique: 'T1552.001', name: 'Credentials In Files', tactic: 'TA0006 Credential Access' }],
  'CWE-862': [{ technique: 'T1548', name: 'Abuse Elevation Control Mechanism', tactic: 'TA0004 Privilege Escalation' }],
  'CWE-918': [{ technique: 'T1090', name: 'Proxy', tactic: 'TA0011 Command and Control' }]
});

/**
 * Map a CWE ID to MITRE ATT&CK techniques.
 * @param {string} cweId - e.g. "CWE-89" or "89"
 * @returns {{ technique: string, name: string, tactic: string }[]}
 */
function mapCweToMitreAttack(cweId) {
  const normalized = String(cweId || '').toUpperCase().trim();
  const key = normalized.startsWith('CWE-') ? normalized : `CWE-${normalized}`;
  return CWE_TO_ATTACK[key] || [];
}

module.exports = { mapCweToMitreAttack, CWE_TO_ATTACK };
