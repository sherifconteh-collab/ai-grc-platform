// PCI DSS v4.0 requirements.
//
// Ported from the sibling ControlWeaver-Pro repository. This repository had no
// pci_dss_v4 framework at all, while seed-frameworks.js still declared 21
// crosswalk pairs referencing it -- those pairs resolved to nothing and
// silently no-opped, because the seeder skips a pair whose framework is
// missing rather than reporting it. Porting the framework makes them resolve.
//
// PCI DSS has a genuine nested layer (requirement -> sub-requirement ->
// testing procedure). These are the sub-requirements; the testing-procedure
// layer is not modeled, so is_enhancement stays false throughout.

module.exports = {
  "code": "pci_dss_v4",
  "name": "PCI DSS v4.0",
  "version": "4.0",
  "category": "Payment Security",
  "tier_required": "pro",
  "description": "Payment Card Industry Data Security Standard v4.0. Protects cardholder data across all entities that store, process, or transmit account data.",
  "controls": [
    {
      "control_id": "PCI-1.1",
      "title": "Network Security Controls \u2014 Defined and Documented",
      "description": "Processes and mechanisms for installing and maintaining network security controls are defined and understood.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-1.2",
      "title": "Network Security Controls \u2014 Implemented",
      "description": "Network security controls (NSCs) are configured and maintained to restrict inbound and outbound traffic to only that which is necessary.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-1.3",
      "title": "Network Access Restricted Between CDE and Other Networks",
      "description": "Network access to and from the cardholder data environment (CDE) is restricted.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-1.4",
      "title": "Network Connections Between Trusted and Untrusted Networks",
      "description": "Network connections between trusted and untrusted networks are controlled.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-1.5",
      "title": "Risks to the CDE from Computing Devices",
      "description": "Risks to the CDE from computing devices that can connect to both untrusted networks and the CDE are mitigated.",
      "priority": "2",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-2.1",
      "title": "Secure Configurations \u2014 Processes Defined",
      "description": "Processes and mechanisms for applying secure configurations to all system components are defined and understood.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-2.2",
      "title": "System Components Configured Securely",
      "description": "System components are configured and managed securely with industry-accepted hardening standards.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-2.3",
      "title": "Wireless Environments Configured Securely",
      "description": "Wireless environments are configured and managed securely.",
      "priority": "2",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-3.1",
      "title": "Account Data Storage \u2014 Processes Defined",
      "description": "Processes and mechanisms for protecting stored account data are defined and understood.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-3.2",
      "title": "Storage of Account Data is Kept to a Minimum",
      "description": "Storage of account data is kept to a minimum through data retention and disposal policies and processes.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-3.3",
      "title": "Sensitive Authentication Data Not Retained After Authorization",
      "description": "Sensitive authentication data (SAD) is not retained after authorization.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-3.4",
      "title": "Access to PAN is Restricted",
      "description": "Access to the full contents of any PAN is restricted. Display of the primary account number (PAN) is restricted to those with a business need.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-3.5",
      "title": "Primary Account Number is Secured",
      "description": "The primary account number (PAN) is secured with strong cryptography when transmitted or stored.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-4.1",
      "title": "Cryptography for Transmission \u2014 Processes Defined",
      "description": "Processes and mechanisms for protecting cardholder data with strong cryptography during transmission over open networks are defined and understood.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-4.2",
      "title": "PAN Protected with Strong Cryptography During Transmission",
      "description": "PAN is protected with strong cryptography during transmission over open, public networks.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-5.1",
      "title": "Malware Protection \u2014 Processes Defined",
      "description": "Processes and mechanisms for protecting all systems against malware are defined and understood.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-5.2",
      "title": "Malware Protection in Place",
      "description": "Malware (malicious software) is prevented, or detected and addressed.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-5.3",
      "title": "Anti-Malware Mechanisms Actively Running",
      "description": "Anti-malware mechanisms and processes are active, maintained, and monitored.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-5.4",
      "title": "Anti-Phishing Mechanisms in Place",
      "description": "Anti-phishing mechanisms protect users against phishing attacks.",
      "priority": "2",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-6.1",
      "title": "Secure Systems Development \u2014 Processes Defined",
      "description": "Processes and mechanisms for developing and maintaining secure systems and software are defined and understood.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-6.2",
      "title": "Bespoke and Custom Software Developed Securely",
      "description": "Bespoke and custom software are developed securely.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-6.3",
      "title": "Security Vulnerabilities Identified and Addressed",
      "description": "Security vulnerabilities are identified and protected from exploitation.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-6.4",
      "title": "Public-Facing Web Applications Protected",
      "description": "Public-facing web applications are protected against attacks.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-6.5",
      "title": "Changes to System Components are Managed Securely",
      "description": "Changes to system components in the production environment are authorized, documented, and managed in accordance with the change control process.",
      "priority": "1",
      "control_type": "organizational"
    },
    {
      "control_id": "PCI-7.1",
      "title": "Access Control \u2014 Processes Defined",
      "description": "Processes and mechanisms for restricting access to system components and cardholder data by business need to know are defined and understood.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-7.2",
      "title": "Access to System Components and Data is Appropriately Defined",
      "description": "Access to system components and data is appropriately defined and assigned to individuals and roles based on job classification and function.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-7.3",
      "title": "Access to System Components and Data is Managed via Access Control System",
      "description": "Access to system components and data is managed via an access control system(s).",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-8.1",
      "title": "User Identity and Authentication \u2014 Processes Defined",
      "description": "Processes and mechanisms for identifying and authenticating access to system components are defined and understood.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-8.2",
      "title": "User IDs and Authentication Credentials are Managed for Non-Consumer Users",
      "description": "User identification and related accounts are strictly managed throughout the lifecycle.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-8.3",
      "title": "User Authentication for Non-Consumer Users and Administrators is Established",
      "description": "User authentication for non-consumer users and administrators is established and managed.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-8.4",
      "title": "Multi-Factor Authentication Implemented",
      "description": "Multi-factor authentication (MFA) is implemented to secure access into the CDE.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-8.5",
      "title": "Multi-Factor Authentication Systems Managed",
      "description": "Multi-factor authentication (MFA) systems are configured to prevent misuse.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-8.6",
      "title": "Use of Application and System Accounts Managed",
      "description": "Use of application and system accounts and associated authentication factors is strictly managed.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-9.1",
      "title": "Physical Security \u2014 Processes Defined",
      "description": "Processes and mechanisms for restricting physical access to cardholder data are defined and understood.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-9.2",
      "title": "Physical Access Controls Implemented",
      "description": "Physical access controls manage entry into facilities and systems containing cardholder data.",
      "priority": "2",
      "control_type": "physical"
    },
    {
      "control_id": "PCI-9.3",
      "title": "Physical Access for Personnel and Visitors Authorized and Managed",
      "description": "Physical access for personnel and visitors is authorized and managed.",
      "priority": "2",
      "control_type": "physical"
    },
    {
      "control_id": "PCI-9.4",
      "title": "Media with Cardholder Data is Secured",
      "description": "Media with cardholder data is secured.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-9.5",
      "title": "Point of Interaction Devices Protected",
      "description": "Point of interaction (POI) devices are protected from tampering and unauthorized substitution.",
      "priority": "1",
      "control_type": "physical"
    },
    {
      "control_id": "PCI-10.1",
      "title": "Logging and Monitoring \u2014 Processes Defined",
      "description": "Processes and mechanisms for logging and monitoring all access to system components and cardholder data are defined and documented.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-10.2",
      "title": "Audit Logs Are Implemented",
      "description": "Audit logs capture all individual user access, all actions taken with root/administrative privileges, access to audit trails, invalid logical access, use of identification and authentication mechanisms, initialization/stopping/pausing of audit logs, creation/deletion of system objects.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-10.3",
      "title": "Audit Logs Are Protected",
      "description": "Audit logs are protected to prevent modifications.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-10.4",
      "title": "Audit Logs Are Reviewed",
      "description": "Audit logs are reviewed to identify anomalies or suspicious activity.",
      "priority": "1",
      "control_type": "organizational"
    },
    {
      "control_id": "PCI-10.5",
      "title": "Audit Log History Is Retained",
      "description": "Retain audit log history for at least 12 months, with at least the most recent three months available for immediate analysis.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-10.6",
      "title": "Time-Synchronization Mechanisms Support Consistent Time Settings",
      "description": "Time-synchronization technology supports consistent time settings across all systems.",
      "priority": "2",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-10.7",
      "title": "Failures of Critical Security Controls Are Detected",
      "description": "Failures of critical security controls are detected, reported, and responded to promptly.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-11.1",
      "title": "Security Testing \u2014 Processes Defined",
      "description": "Processes and mechanisms for regularly testing security of systems and networks are defined and understood.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-11.2",
      "title": "Wireless Access Points Are Identified and Monitored",
      "description": "Wireless access points are identified and monitored, and unauthorized wireless access points are addressed.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-11.3",
      "title": "External and Internal Vulnerabilities Are Regularly Identified",
      "description": "External and internal vulnerabilities are regularly identified, prioritized, and addressed.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-11.4",
      "title": "External and Internal Penetration Testing",
      "description": "External and internal penetration testing is regularly performed, and exploitable vulnerabilities and security weaknesses are corrected.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-11.5",
      "title": "Network Intrusion and Unexpected File Changes Are Detected and Responded To",
      "description": "Network intrusions and unexpected file changes are detected and responded to.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-11.6",
      "title": "Unauthorized Changes on Payment Pages Are Detected",
      "description": "Unauthorized changes on payment pages are detected and responded to.",
      "priority": "1",
      "control_type": "technical"
    },
    {
      "control_id": "PCI-12.1",
      "title": "Comprehensive Information Security Policy Established",
      "description": "A comprehensive information security policy that governs and provides direction for protection of the entity's information assets is known and current.",
      "priority": "1",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-12.2",
      "title": "Acceptable Use Policies for End-User Technologies",
      "description": "Acceptable use policies for end-user technologies are defined and implemented.",
      "priority": "2",
      "control_type": "policy"
    },
    {
      "control_id": "PCI-12.3",
      "title": "Risks to the CDE Are Formally Identified, Evaluated, and Managed",
      "description": "Risks to the cardholder data environment are formally identified, evaluated, and managed.",
      "priority": "1",
      "control_type": "strategic"
    },
    {
      "control_id": "PCI-12.4",
      "title": "PCI DSS Compliance Is Managed",
      "description": "PCI DSS compliance is managed.",
      "priority": "1",
      "control_type": "organizational"
    },
    {
      "control_id": "PCI-12.5",
      "title": "PCI DSS Scope Is Documented and Validated",
      "description": "PCI DSS scope is documented and validated.",
      "priority": "1",
      "control_type": "organizational"
    },
    {
      "control_id": "PCI-12.6",
      "title": "Security Awareness Education Is Ongoing",
      "description": "Security awareness education is an ongoing activity.",
      "priority": "2",
      "control_type": "organizational"
    },
    {
      "control_id": "PCI-12.7",
      "title": "Personnel Are Screened",
      "description": "Personnel are screened to reduce risks from insider threats.",
      "priority": "2",
      "control_type": "organizational"
    },
    {
      "control_id": "PCI-12.8",
      "title": "Risk Posed by Third Parties Is Managed",
      "description": "Risk posed by third parties with access to cardholder data or the CDE is managed.",
      "priority": "1",
      "control_type": "strategic"
    },
    {
      "control_id": "PCI-12.9",
      "title": "Third-Party Responsibility for PCI DSS Compliance Is Supported",
      "description": "Third parties support their customers' PCI DSS compliance.",
      "priority": "2",
      "control_type": "strategic"
    },
    {
      "control_id": "PCI-12.10",
      "title": "Suspected and Confirmed Security Incidents Are Responded To Immediately",
      "description": "Suspected and confirmed security incidents that could impact the CDE are responded to immediately.",
      "priority": "1",
      "control_type": "organizational"
    }
  ]
};
