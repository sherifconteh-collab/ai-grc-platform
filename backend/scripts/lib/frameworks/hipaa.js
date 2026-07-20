module.exports = {
    code: 'hipaa', name: 'HIPAA Security Rule', version: '2024',
    category: 'Healthcare', tier_required: 'enterprise',
    description: 'Health Insurance Portability and Accountability Act security requirements.',
    controls: [
      { control_id: 'HIPAA-164.308(a)(1)', title: 'Security Management Process', description: 'Implement policies and procedures to prevent, detect, contain, and correct security violations.', priority: '1', control_type: 'strategic' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(2)', title: 'Assigned Security Responsibility', description: 'Identify the security official responsible for development and implementation of security policies.', priority: '1', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(3)', title: 'Workforce Security', description: 'Implement policies and procedures to ensure appropriate access to ePHI by workforce members.', priority: '1', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(4)', title: 'Information Access Management', description: 'Implement policies and procedures for authorizing access to ePHI.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(5)', title: 'Security Awareness and Training', description: 'Implement a security awareness and training program for all workforce members.', priority: '2', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(6)', title: 'Security Incident Procedures', description: 'Implement policies and procedures to address security incidents.', priority: '1', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(7)', title: 'Contingency Plan', description: 'Establish policies and procedures for responding to emergencies that damage systems with ePHI.', priority: '1', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(8)', title: 'Evaluation', description: 'Perform periodic technical and nontechnical evaluations of security policies and procedures.', priority: '2', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.310(a)(1)', title: 'Facility Access Controls', description: 'Implement policies to limit physical access to electronic information systems and facilities.', priority: '2', control_type: 'physical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.310(b)', title: 'Workstation Use', description: 'Implement policies and procedures specifying proper functions and physical attributes of workstations.', priority: '2', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.310(c)', title: 'Workstation Security', description: 'Implement physical safeguards for all workstations that access ePHI.', priority: '2', control_type: 'physical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.310(d)(1)', title: 'Device and Media Controls', description: 'Implement policies governing the receipt and removal of hardware and electronic media containing ePHI.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.312(a)(1)', title: 'Access Control', description: 'Implement technical policies and procedures to allow access only to authorized persons.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.312(b)', title: 'Audit Controls', description: 'Implement hardware, software, and procedural mechanisms to record and examine access to ePHI.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.312(c)(1)', title: 'Integrity', description: 'Implement policies and mechanisms to protect ePHI from improper alteration or destruction.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.312(d)', title: 'Person or Entity Authentication', description: 'Implement procedures to verify the identity of persons seeking access to ePHI.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.312(e)(1)', title: 'Transmission Security', description: 'Implement technical security measures to guard against unauthorized access to ePHI in transit.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
    ]
  };
