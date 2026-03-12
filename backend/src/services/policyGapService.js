// @tier: community
const pool = require('../config/database');
const { getLLMService } = require('./llmService');
const { extractFamilyCode, NIST_CONTROL_FAMILIES } = require('./policyService');

/**
 * Policy Gap Analysis Service
 * Analyzes uploaded policies against framework controls to identify gaps
 */

const GAP_TYPES = ['missing', 'partial', 'unclear', 'outdated'];
const GAP_SEVERITIES = ['low', 'medium', 'high', 'critical'];

/**
 * Extract text content from uploaded policy file
 * This is a simplified version - in production, use libraries like pdf-parse, mammoth, etc.
 */
async function extractPolicyText(filePath, mimeType) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    // For text files, read directly
    if (mimeType === 'text/plain' || path.extname(filePath) === '.txt') {
      return fs.readFileSync(filePath, 'utf-8');
    }
    
    // For PDF files
    if (mimeType === 'application/pdf' || path.extname(filePath) === '.pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
      } catch (error) {
        console.error('PDF parsing error:', error);
        return null;
      }
    }
    
    // For Word documents
    if (mimeType?.includes('word') || ['.doc', '.docx'].includes(path.extname(filePath))) {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
      } catch (error) {
        console.error('Word document parsing error:', error);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Text extraction error:', error);
    return null;
  }
}

/**
 * Analyze policy content against controls using AI
 */
async function analyzePolicyWithAI(orgId, policyText, controls) {
  try {
    const llmService = await getLLMService(orgId);
    
    if (!llmService) {
      // Fallback to keyword-based analysis
      return analyzePolicyKeywordBased(policyText, controls);
    }
    
    const controlsList = controls.map(c => 
      `${c.control_id}: ${c.title}`
    ).join('\n');
    
    const prompt = `You are a compliance analyst reviewing an organization's policy document.

Policy Document (excerpt):
${policyText.substring(0, 8000)}

Framework Controls to Check:
${controlsList.substring(0, 2000)}

Analyze this policy and identify gaps for each control. For each control, determine:
1. Is it COVERED (explicitly addressed), PARTIAL (mentioned but incomplete), or MISSING (not addressed)?
2. Gap severity (low, medium, high, critical)
3. Brief description of the gap
4. Recommended action

Respond in JSON format:
{
  "gaps": [
    {
      "control_id": "AC-1",
      "status": "covered|partial|missing",
      "gap_severity": "low|medium|high|critical",
      "gap_description": "Brief description",
      "recommended_action": "What should be added",
      "confidence": 0.85
    }
  ]
}

Focus on the first 20 controls. Be concise.`;
    
    const response = await llmService.generateText(prompt, {
      temperature: 0.3,
      max_tokens: 2000
    });
    
    // Try to parse JSON response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return result.gaps || [];
      }
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
    }
    
    // Fallback
    return analyzePolicyKeywordBased(policyText, controls);
  } catch (error) {
    console.error('AI analysis error:', error);
    return analyzePolicyKeywordBased(policyText, controls);
  }
}

/**
 * Keyword-based policy analysis (fallback when AI is unavailable)
 */
function analyzePolicyKeywordBased(policyText, controls) {
  const lowerText = policyText.toLowerCase();
  const gaps = [];
  
  for (const control of controls) {
    const controlKeywords = extractKeywords(control);
    let matchCount = 0;
    let totalKeywords = controlKeywords.length;
    
    for (const keyword of controlKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }
    
    const coverageRatio = totalKeywords > 0 ? matchCount / totalKeywords : 0;
    
    let status, gapSeverity, gapDescription;
    
    if (coverageRatio === 0) {
      status = 'missing';
      gapSeverity = control.priority === '1' ? 'high' : 'medium';
      gapDescription = `Policy does not address ${control.title}`;
    } else if (coverageRatio < 0.5) {
      status = 'partial';
      gapSeverity = 'medium';
      gapDescription = `Policy partially addresses ${control.title} (${Math.round(coverageRatio * 100)}% coverage)`;
    } else if (coverageRatio < 0.8) {
      status = 'partial';
      gapSeverity = 'low';
      gapDescription = `Policy mostly addresses ${control.title} but may need enhancement`;
    } else {
      status = 'covered';
      gapSeverity = 'low';
      gapDescription = `Policy adequately addresses ${control.title}`;
    }
    
    if (status !== 'covered') {
      gaps.push({
        control_id: control.control_id,
        control_db_id: control.id,
        framework_id: control.framework_id,
        status,
        gap_severity: gapSeverity,
        gap_description: gapDescription,
        recommended_action: `Add specific requirements for ${control.title}`,
        confidence: 0.6
      });
    }
  }
  
  return gaps;
}

/**
 * Extract keywords from control for matching
 */
function extractKeywords(control) {
  const keywords = [];
  const title = String(control.title || '');
  const description = String(control.description || '').substring(0, 500);
  
  // Extract significant words (more than 3 characters, not common words)
  const commonWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'been', 'will', 'shall', 'must', 'may', 'should', 'can', 'could', 'would']);
  
  const words = (title + ' ' + description)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !commonWords.has(w));
  
  // Remove duplicates
  return [...new Set(words)].slice(0, 15);
}

/**
 * Perform gap analysis on uploaded policy
 */
async function performGapAnalysis(orgId, policyUploadId, frameworkIds) {
  try {
    // Get policy upload
    const uploadResult = await pool.query(
      `SELECT * FROM policy_uploads WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [policyUploadId, orgId]
    );
    
    if (uploadResult.rows.length === 0) {
      throw new Error('Policy upload not found');
    }
    
    const upload = uploadResult.rows[0];
    
    // Extract text if not already done
    let policyText = upload.parsed_content;
    if (!policyText) {
      policyText = await extractPolicyText(upload.file_path, upload.mime_type);
      if (policyText) {
        await pool.query(
          `UPDATE policy_uploads SET parsed_content = $1, updated_at = NOW() WHERE id = $2`,
          [policyText, policyUploadId]
        );
      }
    }
    
    if (!policyText) {
      throw new Error('Could not extract text from policy document');
    }
    
    const results = [];
    
    // Analyze for each framework
    for (const frameworkId of frameworkIds) {
      // Get controls for framework
      const controlsResult = await pool.query(
        `SELECT 
           fc.id, fc.control_id, fc.title, fc.description, fc.priority, fc.framework_id
         FROM framework_controls fc
         WHERE fc.framework_id = $1
         ORDER BY fc.control_id`,
        [frameworkId]
      );
      
      const controls = controlsResult.rows;
      
      if (controls.length === 0) {
        continue;
      }
      
      // Perform analysis
      const gaps = await analyzePolicyWithAI(orgId, policyText, controls);
      
      // Calculate statistics
      const totalControls = controls.length;
      const controlsWithGaps = gaps.filter(g => g.status !== 'covered').length;
      const controlsCovered = totalControls - controlsWithGaps;
      const coveragePercentage = totalControls > 0 ? (controlsCovered / totalControls) * 100 : 0;
      
      // Create gap analysis record
      const analysisResult = await pool.query(
        `INSERT INTO policy_gap_analysis (
           organization_id, policy_upload_id, framework_id,
           total_controls_analyzed, controls_covered, controls_with_gaps,
           coverage_percentage, gap_summary
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          orgId,
          policyUploadId,
          frameworkId,
          totalControls,
          controlsCovered,
          controlsWithGaps,
          coveragePercentage.toFixed(2),
          JSON.stringify({
            by_severity: gaps.reduce((acc, g) => {
              acc[g.gap_severity] = (acc[g.gap_severity] || 0) + 1;
              return acc;
            }, {}),
            by_type: gaps.reduce((acc, g) => {
              acc[g.status] = (acc[g.status] || 0) + 1;
              return acc;
            }, {})
          })
        ]
      );
      
      const analysisId = analysisResult.rows[0].id;
      
      // Insert individual control gaps
      for (const gap of gaps) {
        if (gap.status !== 'covered') {
          await pool.query(
            `INSERT INTO policy_control_gaps (
               organization_id, gap_analysis_id, control_id, framework_id,
               gap_type, gap_severity, gap_description, recommended_action, ai_confidence_score
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              orgId,
              analysisId,
              gap.control_db_id,
              frameworkId,
              gap.status,
              gap.gap_severity,
              gap.gap_description,
              gap.recommended_action,
              gap.confidence || 0.5
            ]
          );
        }
      }
      
      results.push({
        framework_id: frameworkId,
        analysis_id: analysisId,
        total_controls: totalControls,
        controls_covered: controlsCovered,
        controls_with_gaps: controlsWithGaps,
        coverage_percentage: coveragePercentage.toFixed(2)
      });
    }
    
    // Update upload status
    await pool.query(
      `UPDATE policy_uploads 
       SET processing_status = 'completed', updated_at = NOW() 
       WHERE id = $1`,
      [policyUploadId]
    );
    
    return results;
  } catch (error) {
    console.error('Gap analysis error:', error);
    
    // Update upload status to failed
    await pool.query(
      `UPDATE policy_uploads 
       SET processing_status = 'failed', processing_error = $2, updated_at = NOW() 
       WHERE id = $1`,
      [policyUploadId, error.message]
    );
    
    throw error;
  }
}

/**
 * Set an uploaded policy as the baseline for generation
 */
async function setAsBaseline(orgId, policyUploadId) {
  // Remove baseline flag from all other uploads
  await pool.query(
    `UPDATE policy_uploads 
     SET is_baseline = false, updated_at = NOW() 
     WHERE organization_id = $1 AND is_baseline = true`,
    [orgId]
  );
  
  // Set this upload as baseline
  const result = await pool.query(
    `UPDATE policy_uploads 
     SET is_baseline = true, updated_at = NOW() 
     WHERE id = $1 AND organization_id = $2 
     RETURNING *`,
    [policyUploadId, orgId]
  );
  
  return result.rows[0];
}

/**
 * Generate policy from baseline upload with gap filling
 */
async function generatePolicyFromBaseline(orgId, userId, policyName, policyType, baselineUploadId, frameworkIds) {
  try {
    // Get baseline upload
    const uploadResult = await pool.query(
      `SELECT * FROM policy_uploads WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [baselineUploadId, orgId]
    );
    
    if (uploadResult.rows.length === 0) {
      throw new Error('Baseline policy upload not found');
    }
    
    const baseline = uploadResult.rows[0];
    
    // Get gap analysis for this baseline
    const gapAnalysisResult = await pool.query(
      `SELECT * FROM policy_gap_analysis 
       WHERE policy_upload_id = $1 AND framework_id = ANY($2)
       ORDER BY analysis_date DESC`,
      [baselineUploadId, frameworkIds]
    );
    
    // Create policy record
    const policyResult = await pool.query(
      `INSERT INTO organization_policies (
         organization_id, policy_name, policy_type, status, version,
         review_frequency_days, created_by
       )
       VALUES ($1, $2, $3, 'draft', '1.0', 365, $4)
       RETURNING *`,
      [orgId, policyName, policyType, userId]
    );
    
    const policy = policyResult.rows[0];
    
    // Link baseline to policy
    await pool.query(
      `UPDATE policy_uploads SET policy_id = $1 WHERE id = $2`,
      [policy.id, baselineUploadId]
    );
    
    // Create policy sections from baseline + gaps
    // For each family, create a section combining baseline content and gap recommendations
    let displayOrder = 0;
    for (const family of NIST_CONTROL_FAMILIES) {
      const sectionContent = `## ${family.name}

### Baseline Policy Content
${baseline.parsed_content ? baseline.parsed_content.substring(0, 1000) : 'See uploaded policy document.'}

### Gap Analysis Recommendations
${gapAnalysisResult.rows.length > 0 ? 'Based on analysis, consider adding requirements for:' : 'No significant gaps identified.'}

*Note: This section was generated from your uploaded baseline policy. Review and enhance as needed.*`;
      
      await pool.query(
        `INSERT INTO policy_sections (
           organization_id, policy_id, section_number, section_title,
           section_content, framework_family_code, framework_family_name, display_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          orgId,
          policy.id,
          family.code,
          `${family.code} - ${family.name}`,
          sectionContent,
          family.code,
          family.name,
          displayOrder++
        ]
      );
    }
    
    return {
      policy,
      baseline_used: baseline.file_name,
      gap_analyses: gapAnalysisResult.rows.length
    };
  } catch (error) {
    console.error('Generate policy from baseline error:', error);
    throw error;
  }
}

module.exports = {
  extractPolicyText,
  performGapAnalysis,
  setAsBaseline,
  generatePolicyFromBaseline,
  GAP_TYPES,
  GAP_SEVERITIES
};
