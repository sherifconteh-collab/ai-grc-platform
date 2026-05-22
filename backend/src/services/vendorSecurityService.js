// @tier: enterprise
const pool = require('../config/database');
const axios = require('axios');

const SECURITYSCORECARD_BASE_URL = 'https://api.securityscorecard.io';
const BITSIGHT_BASE_URL = 'https://api.bitsighttech.com';

/**
 * Get all vendor security scores for an organization
 */
async function getVendorScores(organizationId, filters = {}) {
  const { vendor_name, score_provider, score_trend, limit = 100, offset = 0 } = filters;
  
  const conditions = ['organization_id = $1'];
  const values = [organizationId];
  let paramCount = 1;
  
  if (vendor_name) {
    conditions.push(`vendor_name ILIKE $${++paramCount}`);
    values.push(`%${vendor_name}%`);
  }
  
  if (score_provider) {
    conditions.push(`score_provider = $${++paramCount}`);
    values.push(score_provider);
  }
  
  if (score_trend) {
    conditions.push(`score_trend = $${++paramCount}`);
    values.push(score_trend);
  }
  
  values.push(limit, offset);
  
  const result = await pool.query(
    `SELECT * FROM vendor_security_scores
     WHERE ${conditions.join(' AND ')}
     ORDER BY score_date DESC, score_value ASC
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    values
  );
  
  return result.rows;
}

/**
 * Get a specific vendor score
 */
async function getVendorScore(organizationId, scoreId) {
  const result = await pool.query(
    `SELECT * FROM vendor_security_scores
     WHERE organization_id = $1 AND id = $2
     LIMIT 1`,
    [organizationId, scoreId]
  );
  
  return result.rows[0] || null;
}

/**
 * Add or update vendor security score
 */
async function upsertVendorScore(organizationId, scoreData) {
  const {
    vendor_name,
    vendor_domain,
    score_provider,
    score_value,
    score_grade,
    score_date,
    risk_factors = {},
    findings_summary = {},
    assessment_url = null
  } = scoreData;
  
  // Get previous score for trend calculation
  const previousResult = await pool.query(
    `SELECT score_value FROM vendor_security_scores
     WHERE organization_id = $1 AND vendor_domain = $2 AND score_provider = $3
     ORDER BY score_date DESC
     LIMIT 1`,
    [organizationId, vendor_domain, score_provider]
  );
  
  const previousScore = previousResult.rows[0]?.score_value || null;
  
  // Calculate trend
  let scoreTrend = 'new';
  if (previousScore !== null && score_value !== null) {
    if (score_provider === 'securityscorecard') {
      // For SSC, higher is better (A=100, F=0)
      if (score_value > previousScore) scoreTrend = 'improving';
      else if (score_value < previousScore) scoreTrend = 'declining';
      else scoreTrend = 'stable';
    } else if (score_provider === 'bitsight') {
      // For BitSight, higher is better (250-900 scale)
      if (score_value > previousScore) scoreTrend = 'improving';
      else if (score_value < previousScore) scoreTrend = 'declining';
      else scoreTrend = 'stable';
    }
  }
  
  const result = await pool.query(
    `INSERT INTO vendor_security_scores (
       organization_id, vendor_name, vendor_domain, score_provider,
       score_value, score_grade, score_date, risk_factors, findings_summary,
       previous_score, score_trend, assessment_url
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
     RETURNING *`,
    [
      organizationId, vendor_name, vendor_domain, score_provider,
      score_value, score_grade, score_date,
      JSON.stringify(risk_factors), JSON.stringify(findings_summary),
      previousScore, scoreTrend, assessment_url
    ]
  );
  
  return result.rows[0];
}

/**
 * Delete a vendor score
 */
async function deleteVendorScore(organizationId, scoreId) {
  const result = await pool.query(
    `DELETE FROM vendor_security_scores
     WHERE organization_id = $1 AND id = $2
     RETURNING id`,
    [organizationId, scoreId]
  );
  
  return result.rowCount > 0;
}

/**
 * Fetch score from SecurityScorecard
 */
async function fetchSecurityScorecard(apiKey, domain) {
  if (!apiKey) {
    throw new Error('SecurityScorecard requires an API key');
  }
  
  try {
    const response = await axios.get(`${SECURITYSCORECARD_BASE_URL}/companies/${domain}`, {
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    const data = response.data;
    
    // Convert grade to numeric score (A=100, B=80, C=60, D=40, F=20)
    const gradeToScore = {
      'A': 100,
      'B': 80,
      'C': 60,
      'D': 40,
      'F': 20
    };
    
    const scoreValue = gradeToScore[data.score] || 50;
    
    // Extract risk factors
    const riskFactors = {};
    if (data.factors) {
      for (const factor of data.factors) {
        riskFactors[factor.name] = {
          score: factor.score,
          grade: factor.grade,
          percentile: factor.percentile
        };
      }
    }
    
    return {
      vendor_name: data.name,
      vendor_domain: domain,
      score_provider: 'securityscorecard',
      score_value: scoreValue,
      score_grade: data.score,
      score_date: new Date().toISOString().split('T')[0],
      risk_factors: riskFactors,
      findings_summary: {
        industry: data.industry,
        size: data.size,
        last_updated: data.last_updated
      },
      assessment_url: `https://securityscorecard.com/company/${domain}`
    };
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Invalid SecurityScorecard API key');
    }
    if (error.response?.status === 404) {
      throw new Error('Vendor not found in SecurityScorecard');
    }
    throw new Error(`SecurityScorecard API error: ${error.message}`);
  }
}

/**
 * Fetch score from BitSight
 */
async function fetchBitSight(apiKey, domain) {
  if (!apiKey) {
    throw new Error('BitSight requires an API key');
  }
  
  try {
    const response = await axios.get(`${BITSIGHT_BASE_URL}/ratings/v1/companies/${domain}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    const data = response.data;
    
    // Extract risk factors from risk vectors
    const riskFactors = {};
    if (data.rating_details) {
      for (const [key, value] of Object.entries(data.rating_details)) {
        riskFactors[key] = {
          rating: value.rating,
          percentile: value.percentile,
          grade: value.grade
        };
      }
    }
    
    // Calculate grade (A=800+, B=700-799, C=600-699, D=500-599, F=<500)
    let grade = 'F';
    if (data.rating >= 800) grade = 'A';
    else if (data.rating >= 700) grade = 'B';
    else if (data.rating >= 600) grade = 'C';
    else if (data.rating >= 500) grade = 'D';
    
    return {
      vendor_name: data.name,
      vendor_domain: domain,
      score_provider: 'bitsight',
      score_value: data.rating,
      score_grade: grade,
      score_date: new Date().toISOString().split('T')[0],
      risk_factors: riskFactors,
      findings_summary: {
        industry: data.industry,
        rating_date: data.rating_date,
        companies_count: data.companies_count
      },
      assessment_url: `https://service.bitsighttech.com/app/company/${data.guid}`
    };
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Invalid BitSight API key');
    }
    if (error.response?.status === 404) {
      throw new Error('Vendor not found in BitSight');
    }
    throw new Error(`BitSight API error: ${error.message}`);
  }
}

/**
 * Refresh vendor score from external provider
 */
async function refreshVendorScore(organizationId, apiKey, provider, domain) {
  let scoreData;
  
  if (provider === 'securityscorecard') {
    scoreData = await fetchSecurityScorecard(apiKey, domain);
  } else if (provider === 'bitsight') {
    scoreData = await fetchBitSight(apiKey, domain);
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  
  return await upsertVendorScore(organizationId, scoreData);
}

/**
 * Get vendor score trends
 */
async function getVendorTrends(organizationId, vendorDomain) {
  const result = await pool.query(
    `SELECT score_date, score_value, score_grade, score_provider
     FROM vendor_security_scores
     WHERE organization_id = $1 AND vendor_domain = $2
     ORDER BY score_date ASC`,
    [organizationId, vendorDomain]
  );
  
  return result.rows;
}

module.exports = {
  getVendorScores,
  getVendorScore,
  upsertVendorScore,
  deleteVendorScore,
  refreshVendorScore,
  getVendorTrends,
  fetchSecurityScorecard,
  fetchBitSight
};
