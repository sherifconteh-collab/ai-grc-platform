// CMMC 2.0 Level 2, all 110 practices.
//
// Ported from the sibling ControlWeaver-Pro repository, where these were
// generated from the FATHOM5CORP OSCAL CMMC catalog by
// scripts/import-oscal-cmmc-l2.js. This repository previously carried 50
// hand-written practices while its own framework description claimed 110 --
// the description was right about the standard and wrong about the data.
//
// Level 1 (17 practices) is still absent; see the framework-depth notes.
// Do not hand-edit: re-port from the sibling repo's generated module.

module.exports = {
  code: 'cmmc_2.0',
  name: 'CMMC 2.0 Level 2',
  version: '2.0',
  category: 'Defense Industrial Base',
  tier_required: 'community',
  description: 'Cybersecurity Maturity Model Certification Level 2 -- all 110 practices, aligned with NIST SP 800-171.',
  controls: [
  {
    "control_id": "AC.L2-3.1.1",
    "title": "Limit system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems).",
    "description": "Limit system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems).",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.2",
    "title": "Limit system access to the types of transactions and functions that authorized users are permitted to execute.",
    "description": "Limit system access to the types of transactions and functions that authorized users are permitted to execute.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.3",
    "title": "Control the flow of CUI in accordance with approved authorizations.",
    "description": "Control the flow of CUI in accordance with approved authorizations.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.4",
    "title": "Separate the duties of individuals to reduce the risk of malevolent activity without collusion.",
    "description": "Separate the duties of individuals to reduce the risk of malevolent activity without collusion.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.5",
    "title": "Employ the principle of least privilege, including for specific security functions and privileged accounts.",
    "description": "Employ the principle of least privilege, including for specific security functions and privileged accounts.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.6",
    "title": "Use non-privileged accounts or roles when accessing non-security functions.",
    "description": "Use non-privileged accounts or roles when accessing non-security functions.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.7",
    "title": "Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs.",
    "description": "Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.8",
    "title": "Limit unsuccessful logon attempts.",
    "description": "Limit unsuccessful logon attempts.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.9",
    "title": "Provide privacy and security notices consistent with applicable CUI rules.",
    "description": "Provide privacy and security notices consistent with applicable CUI rules.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.10",
    "title": "Use session lock with pattern-hiding displays to prevent access and viewing of data after a period of inactivity.",
    "description": "Use session lock with pattern-hiding displays to prevent access and viewing of data after a period of inactivity.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.11",
    "title": "Terminate (automatically) a user session after a defined condition.",
    "description": "Terminate (automatically) a user session after a defined condition.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.12",
    "title": "Monitor and control remote access sessions.",
    "description": "Monitor and control remote access sessions.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.13",
    "title": "Employ cryptographic mechanisms to protect the confidentiality of remote access sessions.",
    "description": "Employ cryptographic mechanisms to protect the confidentiality of remote access sessions.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.14",
    "title": "Route remote access via managed access control points.",
    "description": "Route remote access via managed access control points.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.15",
    "title": "Authorize remote execution of privileged commands and remote access to security- relevant information.",
    "description": "Authorize remote execution of privileged commands and remote access to security- relevant information.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.16",
    "title": "Authorize wireless access prior to allowing such connections.",
    "description": "Authorize wireless access prior to allowing such connections.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.17",
    "title": "Protect wireless access using authentication and encryption.",
    "description": "Protect wireless access using authentication and encryption.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.18",
    "title": "Control connection of mobile devices.",
    "description": "Control connection of mobile devices.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.19",
    "title": "Encrypt CUI on mobile devices and mobile computing platforms",
    "description": "Encrypt CUI on mobile devices and mobile computing platforms",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.20",
    "title": "Verify and control/limit connections to and use of external systems.",
    "description": "Verify and control/limit connections to and use of external systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.21",
    "title": "Limit use of portable storage devices on external systems.",
    "description": "Limit use of portable storage devices on external systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AC.L2-3.1.22",
    "title": "Control CUI posted or processed on publicly accessible systems.",
    "description": "Control CUI posted or processed on publicly accessible systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AT.L2-3.2.1",
    "title": "Ensure that managers, systems administrators, and users of organizational systems are made aware of the security risks associated with their activities and of the applicable policies, standards, and procedures related to the security of those systems.",
    "description": "Ensure that managers, systems administrators, and users of organizational systems are made aware of the security risks associated with their activities and of the applicable policies, standards, and procedures related to the security of those systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AT.L2-3.2.2",
    "title": "Ensure that personnel are trained to carry out their assigned information security- related duties and responsibilities.",
    "description": "Ensure that personnel are trained to carry out their assigned information security- related duties and responsibilities.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AT.L2-3.2.3",
    "title": "Provide security awareness training on recognizing and reporting potential indicators of insider threat.",
    "description": "Provide security awareness training on recognizing and reporting potential indicators of insider threat.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AU.L2-3.3.1",
    "title": "Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.",
    "description": "Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AU.L2-3.3.2",
    "title": "Ensure that the actions of individual system users can be uniquely traced to those users so they can be held accountable for their actions.",
    "description": "Ensure that the actions of individual system users can be uniquely traced to those users so they can be held accountable for their actions.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AU.L2-3.3.3",
    "title": "Review and update logged events.",
    "description": "Review and update logged events.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AU.L2-3.3.4",
    "title": "Alert in the event of an audit logging process failure.",
    "description": "Alert in the event of an audit logging process failure.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AU.L2-3.3.5",
    "title": "Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity.",
    "description": "Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AU.L2-3.3.6",
    "title": "Provide audit record reduction and report generation to support on-demand analysis and reporting.",
    "description": "Provide audit record reduction and report generation to support on-demand analysis and reporting.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AU.L2-3.3.7",
    "title": "Provide a system capability that compares and synchronizes internal system clocks with an authoritative source to generate time stamps for audit records.",
    "description": "Provide a system capability that compares and synchronizes internal system clocks with an authoritative source to generate time stamps for audit records.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AU.L2-3.3.8",
    "title": "Protect audit information and audit logging tools from unauthorized access, modification, and deletion.",
    "description": "Protect audit information and audit logging tools from unauthorized access, modification, and deletion.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "AU.L2-3.3.9",
    "title": "Limit management of audit logging functionality to a subset of privileged users.",
    "description": "Limit management of audit logging functionality to a subset of privileged users.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CA.L2-3.12.1",
    "title": "Periodically assess the security controls in organizational systems to determine if the controls are effective in their application.",
    "description": "Periodically assess the security controls in organizational systems to determine if the controls are effective in their application.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CA.L2-3.12.2",
    "title": "Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational systems.",
    "description": "Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CA.L2-3.12.3",
    "title": "Monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls.",
    "description": "Monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CA.L2-3.12.4",
    "title": "Develop, document, and periodically update system security plans that describe system boundaries, system environments of operation, how security requirements are implemented, and the relationships with or connections to other systems.",
    "description": "Develop, document, and periodically update system security plans that describe system boundaries, system environments of operation, how security requirements are implemented, and the relationships with or connections to other systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CM.L2-3.4.1",
    "title": "Establish and maintain baseline configurations and inventories of organizational systems (including hardware, software, firmware, and documentation) throughout the respective system development life cycles.",
    "description": "Establish and maintain baseline configurations and inventories of organizational systems (including hardware, software, firmware, and documentation) throughout the respective system development life cycles.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CM.L2-3.4.2",
    "title": "Establish and enforce security configuration settings for information technology products employed in organizational systems.",
    "description": "Establish and enforce security configuration settings for information technology products employed in organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CM.L2-3.4.3",
    "title": "Track, review, approve or disapprove, and log changes to organizational systems.",
    "description": "Track, review, approve or disapprove, and log changes to organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CM.L2-3.4.4",
    "title": "Analyze the security impact of changes prior to implementation.",
    "description": "Analyze the security impact of changes prior to implementation.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CM.L2-3.4.5",
    "title": "Define, document, approve, and enforce physical and logical access restrictions associated with changes to organizational systems.",
    "description": "Define, document, approve, and enforce physical and logical access restrictions associated with changes to organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CM.L2-3.4.6",
    "title": "Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities.",
    "description": "Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CM.L2-3.4.7",
    "title": "Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services.",
    "description": "Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CM.L2-3.4.8",
    "title": "Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the execution of authorized software.",
    "description": "Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the execution of authorized software.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "CM.L2-3.4.9",
    "title": "Control and monitor user-installed software.",
    "description": "Control and monitor user-installed software.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.1",
    "title": "Identify system users, processes acting on behalf of users, and devices.",
    "description": "Identify system users, processes acting on behalf of users, and devices.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.2",
    "title": "Authenticate (or verify) the identities of users, processes, or devices, as a prerequisite to allowing access to organizational systems.",
    "description": "Authenticate (or verify) the identities of users, processes, or devices, as a prerequisite to allowing access to organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.3",
    "title": "Use multifactor authentication (MFA) for local and network access to privileged accounts and for network access to non- privileged accounts.",
    "description": "Use multifactor authentication (MFA) for local and network access to privileged accounts and for network access to non- privileged accounts.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.4",
    "title": "Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts.",
    "description": "Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.5",
    "title": "Prevent reuse of identifiers for a defined period.",
    "description": "Prevent reuse of identifiers for a defined period.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.6",
    "title": "Disable identifiers after a defined period of inactivity.",
    "description": "Disable identifiers after a defined period of inactivity.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.7",
    "title": "Enforce a minimum password complexity and change of characters when new passwords are created.",
    "description": "Enforce a minimum password complexity and change of characters when new passwords are created.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.8",
    "title": "Prohibit password reuse for a specified number of generations.",
    "description": "Prohibit password reuse for a specified number of generations.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.9",
    "title": "Allow temporary password use for system logons with an immediate change to a permanent password.",
    "description": "Allow temporary password use for system logons with an immediate change to a permanent password.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.10",
    "title": "Store and transmit only cryptographically- protected passwords.",
    "description": "Store and transmit only cryptographically- protected passwords.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IA.L2-3.5.11",
    "title": "Obscure feedback of authentication information.",
    "description": "Obscure feedback of authentication information.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IR.L2-3.6.1",
    "title": "Establish an operational incident-handling capability for organizational systems that includes preparation, detection, analysis, containment, recovery, and user response activities.",
    "description": "Establish an operational incident-handling capability for organizational systems that includes preparation, detection, analysis, containment, recovery, and user response activities.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IR.L2-3.6.2",
    "title": "Track, document, and report incidents to designated officials and/or authorities both internal and external to the organization.",
    "description": "Track, document, and report incidents to designated officials and/or authorities both internal and external to the organization.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "IR.L2-3.6.3",
    "title": "Test the organizational incident response capability.",
    "description": "Test the organizational incident response capability.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MA.L2-3.7.1",
    "title": "Perform maintenance on organizational systems.",
    "description": "Perform maintenance on organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MA.L2-3.7.2",
    "title": "Provide controls on the tools, techniques, mechanisms, and personnel used to conduct system maintenance.",
    "description": "Provide controls on the tools, techniques, mechanisms, and personnel used to conduct system maintenance.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MA.L2-3.7.3",
    "title": "Ensure equipment removed for off-site maintenance is sanitized of any CUI.",
    "description": "Ensure equipment removed for off-site maintenance is sanitized of any CUI.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MA.L2-3.7.4",
    "title": "Check media containing diagnostic and test programs for malicious code before the media are used in organizational systems.",
    "description": "Check media containing diagnostic and test programs for malicious code before the media are used in organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MA.L2-3.7.5",
    "title": "Require multifactor authentication to establish nonlocal maintenance sessions via external network connections and terminate such connections when nonlocal maintenance is complete.",
    "description": "Require multifactor authentication to establish nonlocal maintenance sessions via external network connections and terminate such connections when nonlocal maintenance is complete.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MA.L2-3.7.6",
    "title": "Supervise the maintenance activities of maintenance personnel without required access authorization.",
    "description": "Supervise the maintenance activities of maintenance personnel without required access authorization.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MP.L2-3.8.1",
    "title": "Protect (i.e., physically control and securely store) system media containing CUI, both paper and digital.",
    "description": "Protect (i.e., physically control and securely store) system media containing CUI, both paper and digital.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MP.L2-3.8.2",
    "title": "Limit access to CUI on system media to authorized users.",
    "description": "Limit access to CUI on system media to authorized users.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MP.L2-3.8.3",
    "title": "Sanitize or destroy system media containing CUI before disposal or release for reuse.",
    "description": "Sanitize or destroy system media containing CUI before disposal or release for reuse.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MP.L2-3.8.4",
    "title": "Mark media with necessary CUI markings and distribution limitations.",
    "description": "Mark media with necessary CUI markings and distribution limitations.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MP.L2-3.8.5",
    "title": "Control access to media containing CUI and maintain accountability for media during transport outside of controlled areas.",
    "description": "Control access to media containing CUI and maintain accountability for media during transport outside of controlled areas.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MP.L2-3.8.6",
    "title": "Implement cryptographic mechanisms to protect the confidentiality of CUI stored on digital media during transport unless otherwise protected by alternative physical safeguards.",
    "description": "Implement cryptographic mechanisms to protect the confidentiality of CUI stored on digital media during transport unless otherwise protected by alternative physical safeguards.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MP.L2-3.8.7",
    "title": "Control the use of removable media on system components.",
    "description": "Control the use of removable media on system components.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MP.L2-3.8.8",
    "title": "Prohibit the use of portable storage devices when such devices have no identifiable owner.",
    "description": "Prohibit the use of portable storage devices when such devices have no identifiable owner.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "MP.L2-3.8.9",
    "title": "Protect the confidentiality of backup CUI at storage locations.",
    "description": "Protect the confidentiality of backup CUI at storage locations.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "PE.L2-3.10.1",
    "title": "Limit physical access to organizational systems, equipment, and the respective operating environments to authorized individuals.",
    "description": "Limit physical access to organizational systems, equipment, and the respective operating environments to authorized individuals.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "PE.L2-3.10.2",
    "title": "Protect and monitor the physical facility and support infrastructure for organizational systems.",
    "description": "Protect and monitor the physical facility and support infrastructure for organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "PE.L2-3.10.3",
    "title": "Escort visitors and monitor visitor activity.",
    "description": "Escort visitors and monitor visitor activity.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "PE.L2-3.10.4",
    "title": "Maintain audit logs of physical access.",
    "description": "Maintain audit logs of physical access.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "PE.L2-3.10.5",
    "title": "Control and manage physical access devices.",
    "description": "Control and manage physical access devices.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "PE.L2-3.10.6",
    "title": "Enforce safeguarding measures for CUI at alternate work sites.",
    "description": "Enforce safeguarding measures for CUI at alternate work sites.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "PS.L2-3.9.1",
    "title": "Screen individuals prior to authorizing access to organizational systems containing CUI.",
    "description": "Screen individuals prior to authorizing access to organizational systems containing CUI.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "PS.L2-3.9.2",
    "title": "Ensure that organizational systems containing CUI are protected during and after personnel actions such as terminations and transfers.",
    "description": "Ensure that organizational systems containing CUI are protected during and after personnel actions such as terminations and transfers.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "RA.L2-3.11.1",
    "title": "Periodically assess the risk to organizational operations (including mission, functions, image, or reputation), organizational assets, and individuals, resulting from the operation of organizational systems and the associated processing, storage, or transmission of CUI.",
    "description": "Periodically assess the risk to organizational operations (including mission, functions, image, or reputation), organizational assets, and individuals, resulting from the operation of organizational systems and the associated processing, storage, or transmission of CUI.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "RA.L2-3.11.2",
    "title": "Scan for vulnerabilities in organizational systems and applications periodically and when new vulnerabilities affecting those systems and applications are identified.",
    "description": "Scan for vulnerabilities in organizational systems and applications periodically and when new vulnerabilities affecting those systems and applications are identified.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "RA.L2-3.11.3",
    "title": "Remediate vulnerabilities in accordance with risk assessments.",
    "description": "Remediate vulnerabilities in accordance with risk assessments.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.1",
    "title": "Monitor, control, and protect communications (i.e., information transmitted or received by organizational systems) at the external boundaries and key internal boundaries of organizational systems.",
    "description": "Monitor, control, and protect communications (i.e., information transmitted or received by organizational systems) at the external boundaries and key internal boundaries of organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.2",
    "title": "Employ architectural designs, software development techniques, and systems engineering principles that promote effective information security within organizational systems.",
    "description": "Employ architectural designs, software development techniques, and systems engineering principles that promote effective information security within organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.3",
    "title": "Separate user functionality from system management functionality.",
    "description": "Separate user functionality from system management functionality.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.4",
    "title": "Prevent unauthorized and unintended information transfer via shared system resources.",
    "description": "Prevent unauthorized and unintended information transfer via shared system resources.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.5",
    "title": "Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.",
    "description": "Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.6",
    "title": "Deny network communications traffic by default and allow network communications traffic by exception (i.e., deny all, permit by exception).",
    "description": "Deny network communications traffic by default and allow network communications traffic by exception (i.e., deny all, permit by exception).",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.7",
    "title": "Prevent remote devices from simultaneously establishing non-remote connections with organizational systems and communicating via some other connection to resources in external networks (i.e., split tunneling).",
    "description": "Prevent remote devices from simultaneously establishing non-remote connections with organizational systems and communicating via some other connection to resources in external networks (i.e., split tunneling).",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.8",
    "title": "Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards.",
    "description": "Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.9",
    "title": "Terminate network connections associated with communications sessions at the end of the sessions or after a defined period of inactivity.",
    "description": "Terminate network connections associated with communications sessions at the end of the sessions or after a defined period of inactivity.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.10",
    "title": "Establish and manage cryptographic keys for cryptography employed in organizational systems.",
    "description": "Establish and manage cryptographic keys for cryptography employed in organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.11",
    "title": "Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.",
    "description": "Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.12",
    "title": "Prohibit remote activation of collaborative computing devices and provide indication of devices in use to users present at the device.",
    "description": "Prohibit remote activation of collaborative computing devices and provide indication of devices in use to users present at the device.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.13",
    "title": "Control and monitor the use of mobile code.",
    "description": "Control and monitor the use of mobile code.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.14",
    "title": "Control and monitor the use of Voice over Internet Protocol (VoIP) technologies.",
    "description": "Control and monitor the use of Voice over Internet Protocol (VoIP) technologies.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.15",
    "title": "Protect the authenticity of communications sessions.",
    "description": "Protect the authenticity of communications sessions.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SC.L2-3.13.16",
    "title": "Protect the confidentiality of CUI at rest.",
    "description": "Protect the confidentiality of CUI at rest.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SI.L2-3.14.1",
    "title": "Identify, report, and correct system flaws in a timely manner.",
    "description": "Identify, report, and correct system flaws in a timely manner.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SI.L2-3.14.2",
    "title": "Provide protection from malicious code at designated locations within organizational systems.",
    "description": "Provide protection from malicious code at designated locations within organizational systems.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SI.L2-3.14.3",
    "title": "Monitor system security alerts and advisories and take action in response.",
    "description": "Monitor system security alerts and advisories and take action in response.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SI.L2-3.14.4",
    "title": "Update malicious code protection mechanisms when new releases are available.",
    "description": "Update malicious code protection mechanisms when new releases are available.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SI.L2-3.14.5",
    "title": "Perform periodic scans of organizational systems and real-time scans of files from external sources as files are downloaded, opened, or executed.",
    "description": "Perform periodic scans of organizational systems and real-time scans of files from external sources as files are downloaded, opened, or executed.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SI.L2-3.14.6",
    "title": "Monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks.",
    "description": "Monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks.",
    "priority": "2",
    "control_type": "technical"
  },
  {
    "control_id": "SI.L2-3.14.7",
    "title": "Identify unauthorized use of organizational systems",
    "description": "Identify unauthorized use of organizational systems",
    "priority": "2",
    "control_type": "technical"
  }
]
};
