// @tier: pro
const axios = require('axios');

const CISA_KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

/**
 * Fetch Known Exploited Vulnerabilities from CISA
 */
async function fetchFeed(apiKey, configuration = {}) {
  const {
    days_back = 30, // Only get KEVs added in last N days
    include_all = false // If true, get all KEVs regardless of date
  } = configuration;
  
  try {
    const response = await axios.get(CISA_KEV_URL, {
      timeout: 30000,
      headers: {
        'User-Agent': 'ControlWeave-GRC-Platform'
      }
    });
    
    const data = response.data;
    const vulnerabilities = data.vulnerabilities || [];
    
    const items = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days_back);
    
    for (const kev of vulnerabilities) {
      // Filter by date added unless include_all is true
      if (!include_all && kev.dateAdded) {
        const dateAdded = new Date(kev.dateAdded);
        if (dateAdded < cutoffDate) {
          continue;
        }
      }
      
      // Determine severity (KEV doesn't provide severity, so we assume high/critical)
      let severity = 'high'; // Default to high since these are known exploited
      
      // If there's a due date very soon, mark as critical
      if (kev.dueDate) {
        const dueDate = new Date(kev.dueDate);
        const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
        if (daysUntilDue <= 7) {
          severity = 'critical';
        }
      }
      
      items.push({
        item_type: 'kev',
        external_id: kev.cveID,
        title: `${kev.cveID} - ${kev.vulnerabilityName}`,
        description: `${kev.shortDescription}\n\nRequired Action: ${kev.requiredAction}`,
        severity: severity,
        cvss_score: null, // KEV doesn't provide CVSS scores
        cvss_vector: null,
        cwe_ids: [],
        affected_products: [kev.product].filter(Boolean),
        exploit_available: true, // All KEVs are known exploited
        exploit_maturity: 'active', // Known to be actively exploited
        published_at: kev.dateAdded ? new Date(kev.dateAdded) : null,
        modified_at: null,
        due_date: kev.dueDate ? new Date(kev.dueDate) : null,
        metadata: {
          vendor: kev.vendorProject,
          product: kev.product,
          vulnerability_name: kev.vulnerabilityName,
          required_action: kev.requiredAction,
          known_ransomware: kev.knownRansomwareCampaignUse === 'Known',
          notes: kev.notes || '',
          source: 'cisa_kev',
          catalog_version: data.catalogVersion,
          date_added: kev.dateAdded
        }
      });
    }
    
    items.rateLimitInfo = {
      remaining: null, // No rate limiting on public JSON feed
      reset_at: null
    };
    
    return items;
  } catch (error) {
    if (error.response) {
      throw new Error(`CISA KEV API error: ${error.response.status} - ${error.response.statusText}`);
    }
    throw new Error(`CISA KEV fetch error: ${error.message}`);
  }
}

/**
 * Test CISA KEV connection
 */
async function testConnection() {
  try {
    const response = await axios.get(CISA_KEV_URL, {
      timeout: 10000,
      headers: {
        'User-Agent': 'ControlWeave-GRC-Platform'
      }
    });
    
    const data = response.data;
    
    return {
      success: true,
      message: 'Connection successful',
      catalogVersion: data.catalogVersion,
      count: data.count,
      dateReleased: data.dateReleased
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
