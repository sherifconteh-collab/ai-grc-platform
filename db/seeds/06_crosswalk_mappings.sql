-- Cross-Framework Control Mappings
-- Maps controls between all 6 frameworks to show overlaps and relationships
-- This enables organizations to satisfy multiple frameworks with single control implementations

-- This script creates mappings between:
-- 1. NIST CSF 2.0
-- 2. NIST AI RMF  
-- 3. NIST SP 800-171
-- 4. NIST SP 800-53 Rev 5
-- 5. ISO 27001:2022
-- 6. SOC 2

DO $$
DECLARE
    -- Framework IDs
    fw_csf UUID;
    fw_ai_rmf UUID;
    fw_800_171 UUID;
    fw_800_53 UUID;
    fw_iso UUID;
    fw_soc2 UUID;
    
    -- Control IDs (examples - will be looked up dynamically)
    control_id_source UUID;
    control_id_target UUID;
BEGIN
    -- Get framework IDs
    SELECT id INTO fw_csf FROM frameworks WHERE code = 'nist_csf_2.0';
    SELECT id INTO fw_ai_rmf FROM frameworks WHERE code = 'nist_ai_rmf';
    SELECT id INTO fw_800_171 FROM frameworks WHERE code = 'nist_800_171';
    SELECT id INTO fw_800_53 FROM frameworks WHERE code = 'nist_800_53';
    SELECT id INTO fw_iso FROM frameworks WHERE code = 'iso_27001';
    SELECT id INTO fw_soc2 FROM frameworks WHERE code = 'soc2';

    -- ========================================
    -- NIST CSF 2.0 <-> NIST SP 800-171
    -- ========================================
    
    -- GV.OC-02 (Legal/Regulatory) <-> 3.1.9 (Privacy Notices)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'GV.OC-02'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.1.9'),
        'related', 70, 'Both address legal/regulatory compliance and user notifications'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'GV.OC-02')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.1.9');

    -- ID.AM-01 (Physical Assets) <-> 3.4.1 (Baseline Config/Inventory)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'ID.AM-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.4.1'),
        'equivalent', 90, 'Asset inventory requirements'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'ID.AM-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.4.1');

    -- PR.AA-01 (Identity Management) <-> 3.5.1 & 3.5.2 (User ID & Auth)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.AA-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.5.1'),
        'equivalent', 95, 'Identity management and authentication'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.AA-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.5.1');

    -- PR.AA-06 (MFA) <-> 3.5.3 (Multi-factor Auth)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.AA-06'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.5.3'),
        'equivalent', 100, 'Multi-factor authentication requirement'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.AA-06')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.5.3');

    -- PR.DS-01 (Data at Rest) <-> 3.13.16 (CUI at Rest Protection)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.DS-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.13.16'),
        'equivalent', 95, 'Protecting data at rest with encryption'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.DS-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.13.16');

    -- DE.CM-01 (Network Monitoring) <-> 3.14.6 (Network Monitoring)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'DE.CM-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.14.6'),
        'equivalent', 100, 'Network monitoring for security events'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'DE.CM-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.14.6');

    -- RS.MA-01 (Incident Response) <-> 3.6.1 (Incident Handling)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'RS.MA-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.6.1'),
        'equivalent', 95, 'Incident response capability'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'RS.MA-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.6.1');

    -- ========================================
    -- NIST SP 800-171 <-> NIST SP 800-53
    -- ========================================
    
    -- 3.1.1 (Authorized Access) <-> AC-2 (Account Management)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.1.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'AC-2'),
        'subset', 90, '800-171 derived from 800-53 - access control'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.1.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'AC-2');

    -- 3.1.5 (Least Privilege) <-> AC-6 (Least Privilege)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.1.5'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'AC-6'),
        'equivalent', 100, 'Direct mapping - least privilege principle'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.1.5')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'AC-6');

    -- 3.2.1 (Security Awareness) <-> AT-2 (Literacy Training)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.2.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'AT-2'),
        'equivalent', 95, 'Security awareness and training'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.2.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'AT-2');

    -- 3.3.1 (System Audit Logging) <-> AU-2 (Event Logging)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.3.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'AU-2'),
        'subset', 90, 'Audit logging requirements'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.3.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'AU-2');

    -- 3.4.1 (Baseline Config) <-> CM-2 (Baseline Configuration)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.4.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'CM-2'),
        'equivalent', 100, 'Baseline configuration management'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.4.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'CM-2');

    -- 3.5.3 (MFA) <-> AC-17 (Remote Access) partial
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.5.3'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'AC-17'),
        'related', 75, 'MFA requirement for remote access'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_171 AND control_id = '3.5.3')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_800_53 AND control_id = 'AC-17');

    -- ========================================
    -- NIST CSF 2.0 <-> ISO 27001:2022
    -- ========================================
    
    -- GV.PO-01 (Policy) <-> A.5.1 (Policies for Info Security)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'GV.PO-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.1'),
        'equivalent', 95, 'Information security policy establishment'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'GV.PO-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.1');

    -- ID.AM-01 (Asset Inventory) <-> A.5.9 (Inventory of Assets)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'ID.AM-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.9'),
        'equivalent', 100, 'Asset inventory management'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'ID.AM-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.9');

    -- PR.AA-01 (Identity Management) <-> A.5.16 (Identity Management)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.AA-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.16'),
        'equivalent', 100, 'Identity management lifecycle'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.AA-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.16');

    -- PR.AT-01 (Security Training) <-> A.6.3 (Awareness & Training)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.AT-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.6.3'),
        'equivalent', 95, 'Security awareness and training'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.AT-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.6.3');

    -- PR.DS-01 (Data at Rest) <-> A.8.24 (Use of Cryptography)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.DS-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.8.24'),
        'related', 85, 'Data protection through cryptography'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.DS-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.8.24');

    -- DE.CM-01 (Network Monitoring) <-> A.8.16 (Monitoring Activities)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'DE.CM-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.8.16'),
        'equivalent', 90, 'System and network monitoring'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'DE.CM-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.8.16');

    -- RS.MA-01 (Incident Response) <-> A.5.24 (Incident Management Planning)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'RS.MA-01'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.24'),
        'equivalent', 95, 'Incident response planning'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'RS.MA-01')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.24');

    -- ========================================
    -- SOC 2 <-> NIST CSF 2.0
    -- ========================================
    
    -- CC1.1 (Control Environment) <-> GV.RR-01 (Cybersecurity Leadership)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC1.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'GV.RR-01'),
        'equivalent', 85, 'Leadership commitment and accountability'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC1.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'GV.RR-01');

    -- CC2.1 (Risk Assessment) <-> ID.RA-01 (Vulnerability Identification)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC2.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'ID.RA-01'),
        'related', 80, 'Risk identification and assessment'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC2.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'ID.RA-01');

    -- CC6.1 (Logical Access) <-> PR.AA-01 (Identity Management)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC6.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.AA-01'),
        'equivalent', 90, 'Logical access controls and identity management'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC6.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.AA-01');

    -- CC7.2 (Threat Monitoring) <-> DE.CM-01 (Network Monitoring)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC7.2'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'DE.CM-01'),
        'equivalent', 95, 'System monitoring for anomalies'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC7.2')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'DE.CM-01');

    -- CC7.3 (Incident Evaluation) <-> DE.AE-02 (Event Correlation)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC7.3'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'DE.AE-02'),
        'equivalent', 90, 'Security event analysis'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC7.3')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'DE.AE-02');

    -- CC7.4 (Incident Response) <-> RS.MA-01 (Incident Response Plan)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC7.4'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'RS.MA-01'),
        'equivalent', 95, 'Incident response capability'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC7.4')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'RS.MA-01');

    -- ========================================
    -- ISO 27001:2022 <-> SOC 2
    -- ========================================
    
    -- A.5.1 (Policies) <-> CC1.1 (Control Environment)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC1.1'),
        'related', 75, 'Policy and control environment'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC1.1');

    -- A.5.16 (Identity Management) <-> CC6.1 (Logical Access)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.16'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC6.1'),
        'equivalent', 90, 'Identity and access management'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.16')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC6.1');

    -- A.6.3 (Awareness & Training) <-> CC1.4 (Competence)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.6.3'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC1.4'),
        'related', 80, 'Training and competence'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.6.3')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC1.4');

    -- A.8.16 (Monitoring) <-> CC7.2 (Threat Monitoring)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.8.16'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC7.2'),
        'equivalent', 95, 'System monitoring for anomalies'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.8.16')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_soc2 AND control_id = 'CC7.2');

    -- ========================================
    -- NIST AI RMF <-> NIST CSF 2.0
    -- ========================================
    
    -- GV.1.1 (Leadership Engagement) <-> GV.RR-01 (Cybersecurity Leadership)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'GV.1.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'GV.RR-01'),
        'equivalent', 85, 'Leadership accountability for risk management'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'GV.1.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'GV.RR-01');

    -- GV.3.1 (AI Policy) <-> GV.PO-01 (Policy)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'GV.3.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'GV.PO-01'),
        'related', 80, 'Policy establishment (AI-specific vs general)'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'GV.3.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'GV.PO-01');

    -- MAP.1.1 (AI System Purpose) <-> ID.AM-02 (Software Assets)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MAP.1.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'ID.AM-02'),
        'related', 70, 'AI system inventory similar to software asset inventory'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MAP.1.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'ID.AM-02');

    -- MAP.4.1 (Harm Identification) <-> ID.RA-01 (Vulnerability Identification)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MAP.4.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'ID.RA-01'),
        'related', 75, 'Risk identification (AI-specific harms vs general vulnerabilities)'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MAP.4.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'ID.RA-01');

    -- MEASURE.2.3 (Security Testing) <-> PR.PS-04 (Log Generation) partial overlap
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MEASURE.2.3'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.PS-04'),
        'related', 65, 'Security testing and monitoring (different focus)'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MEASURE.2.3')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'PR.PS-04');

    -- MEASURE.3.1 (Production Monitoring) <-> DE.CM-01 (Network Monitoring)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MEASURE.3.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'DE.CM-01'),
        'related', 80, 'Monitoring in production (AI performance vs security)'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MEASURE.3.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'DE.CM-01');

    -- MANAGE.3.1 (Incident Response Plan) <-> RS.MA-01 (Incident Response Plan)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MANAGE.3.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'RS.MA-01'),
        'equivalent', 85, 'Incident response planning (AI-specific vs general)'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MANAGE.3.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_csf AND control_id = 'RS.MA-01');

    -- ========================================
    -- NIST AI RMF <-> ISO 27001:2022
    -- ========================================
    
    -- GV.1.1 (Leadership) <-> A.5.1 (Policies)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'GV.1.1'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.1'),
        'related', 70, 'Leadership and policy establishment'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'GV.1.1')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.1');

    -- MAP.3.4 (Data Privacy) <-> A.5.34 (Privacy and PII Protection)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MAP.3.4'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.34'),
        'equivalent', 90, 'Data privacy protection requirements'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MAP.3.4')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.34');

    -- MEASURE.2.8 (Privacy Assessment) <-> A.5.34 (Privacy Protection)
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT 
        (SELECT id FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MEASURE.2.8'),
        (SELECT id FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.34'),
        'related', 85, 'Privacy assessment and protection'
    WHERE EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_ai_rmf AND control_id = 'MEASURE.2.8')
    AND EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_iso AND control_id = 'A.5.34');

    RAISE NOTICE 'Cross-framework mappings created successfully!';
    RAISE NOTICE 'Total mappings: %', (SELECT COUNT(*) FROM control_mappings);

END $$;
