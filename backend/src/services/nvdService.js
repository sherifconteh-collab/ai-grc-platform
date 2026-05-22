// @tier: pro
const axios = require('axios');

const NVD_BASE_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const RATE_LIMIT_DELAY = 6000; // 6 seconds between requests (no API key)
const RATE_LIMIT_DELAY_WITH_KEY = 600; // 0.6 seconds with API key

/**
 * Fetch CVE data from NIST NVD
 */
async function fetchFeed(apiKey, configuration = {}) {
  const {
    days_back = 7,
    cvss_severity = null,
    keywords = null,
    max_results = 100
  } = configuration;
  
  const headers = {};
  if (apiKey) {
    headers['apiKey'] = apiKey;
  }
  
  const params = {
    resultsPerPage: Math.min(max_results, 2000),
    startIndex: 0
  };
  
  // Filter by date range
  if (days_back) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days_back);
    params.lastModStartDate = startDate.toISOString();
    params.lastModEndDate = endDate.toISOString();
  }
  
  // Filter by CVSS severity
  if (cvss_severity) {
    params.cvssV3Severity = cvss_severity.toUpperCase();
  }
  
  // Filter by keywords
  if (keywords) {
    params.keywordSearch = keywords;
  }
  
  try {
    const response = await axios.get(NVD_BASE_URL, {
      headers,
      params,
      timeout: 30000
    });
    
    const items = [];
    const vulnerabilities = response.data.vulnerabilities || [];
    
    for (const vuln of vulnerabilities) {
      const cve = vuln.cve;
      
      // Extract CVSS score
      let cvssScore = null;
      let cvssVector = null;
      let severity = 'medium';
      
      if (cve.metrics?.cvssMetricV31 && cve.metrics.cvssMetricV31.length > 0) {
        const metric = cve.metrics.cvssMetricV31[0];
        cvssScore = metric.cvssData?.baseScore;
        cvssVector = metric.cvssData?.vectorString;
        severity = metric.cvssData?.baseSeverity?.toLowerCase() || 'medium';
      } else if (cve.metrics?.cvssMetricV30 && cve.metrics.cvssMetricV30.length > 0) {
        const metric = cve.metrics.cvssMetricV30[0];
        cvssScore = metric.cvssData?.baseScore;
        cvssVector = metric.cvssData?.vectorString;
        severity = metric.cvssData?.baseSeverity?.toLowerCase() || 'medium';
      } else if (cve.metrics?.cvssMetricV2 && cve.metrics.cvssMetricV2.length > 0) {
        const metric = cve.metrics.cvssMetricV2[0];
        cvssScore = metric.cvssData?.baseScore;
        cvssVector = metric.cvssData?.vectorString;
        // Map CVSS v2 to severity
        if (cvssScore >= 7.0) severity = 'high';
        else if (cvssScore >= 4.0) severity = 'medium';
        else severity = 'low';
      }
      
      // Extract CWE IDs
      const cweIds = [];
      if (cve.weaknesses) {
        for (const weakness of cve.weaknesses) {
          for (const desc of weakness.description) {
            if (desc.value && desc.value.startsWith('CWE-')) {
              cweIds.push(desc.value);
            }
          }
        }
      }
      
      // Extract affected products
      const affectedProducts = [];
      if (cve.configurations) {
        for (const config of cve.configurations) {
          if (config.nodes) {
            for (const node of config.nodes) {
              if (node.cpeMatch) {
                for (const match of node.cpeMatch) {
                  if (match.criteria) {
                    affectedProducts.push(match.criteria);
                  }
                }
              }
            }
          }
        }
      }
      
      // Get description
      let description = '';
      if (cve.descriptions && cve.descriptions.length > 0) {
        description = cve.descriptions.find(d => d.lang === 'en')?.value || cve.descriptions[0].value;
      }
      
      items.push({
        item_type: 'cve',
        external_id: cve.id,
        title: cve.id,
        description: description,
        severity: severity,
        cvss_score: cvssScore,
        cvss_vector: cvssVector,
        cwe_ids: cweIds,
        affected_products: affectedProducts.slice(0, 50), // Limit to 50
        exploit_available: false, // NVD doesn't track exploit availability directly
        exploit_maturity: null,
        published_at: cve.published ? new Date(cve.published) : null,
        modified_at: cve.lastModified ? new Date(cve.lastModified) : null,
        due_date: null,
        metadata: {
          references: cve.references?.slice(0, 10).map(ref => ({
            url: ref.url,
            source: ref.source
          })) || [],
          source: 'nvd'
        }
      });
    }
    
    // Extract rate limit info from headers
    const rateLimitInfo = {
      remaining: response.headers['x-ratelimit-remaining'] 
        ? parseInt(response.headers['x-ratelimit-remaining']) 
        : null,
      reset_at: response.headers['x-ratelimit-reset']
        ? new Date(parseInt(response.headers['x-ratelimit-reset']) * 1000)
        : null
    };
    
    items.rateLimitInfo = rateLimitInfo;
    
    return items;
  } catch (error) {
    if (error.response) {
      throw new Error(`NVD API error: ${error.response.status} - ${error.response.statusText}`);
    }
    throw new Error(`NVD fetch error: ${error.message}`);
  }
}

/**
 * Test NVD connection
 */
async function testConnection(apiKey) {
  const headers = {};
  if (apiKey) {
    headers['apiKey'] = apiKey;
  }
  
  try {
    const response = await axios.get(NVD_BASE_URL, {
      headers,
      params: {
        resultsPerPage: 1
      },
      timeout: 10000
    });
    
    return {
      success: true,
      message: 'Connection successful',
      hasApiKey: !!apiKey,
      rateLimit: response.headers['x-ratelimit-remaining'] || 'unknown'
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.statusText || error.message
    };
  }
}

module.exports = {
  fetchFeed,
  testConnection
};
