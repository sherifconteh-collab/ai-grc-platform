// @tier: enterprise
const axios = require('axios');

const OTX_BASE_URL = 'https://otx.alienvault.com/api/v1';

/**
 * Fetch threat pulses from AlienVault OTX
 */
async function fetchFeed(apiKey, configuration = {}) {
  if (!apiKey) {
    throw new Error('AlienVault OTX requires an API key');
  }
  
  const {
    modified_since = null, // ISO date string
    limit = 50,
    pulse_types = ['all'] // Can filter by type
  } = configuration;
  
  try {
    const params = {
      limit: Math.min(limit, 100)
    };
    
    if (modified_since) {
      params.modified_since = modified_since;
    }
    
    const headers = {
      'X-OTX-API-KEY': apiKey,
      'User-Agent': 'ControlWeave-GRC-Platform'
    };
    
    // Fetch subscribed pulses
    const response = await axios.get(`${OTX_BASE_URL}/pulses/subscribed`, {
      headers,
      params,
      timeout: 30000
    });
    
    const pulses = response.data.results || [];
    const items = [];
    
    for (const pulse of pulses) {
      // Determine severity based on adversary and TLP
      let severity = 'medium';
      
      if (pulse.tlp === 'red') {
        severity = 'critical';
      } else if (pulse.tlp === 'amber' || pulse.adversary) {
        severity = 'high';
      } else if (pulse.tlp === 'green') {
        severity = 'low';
      }
      
      // Extract indicators
      const indicators = [];
      if (pulse.indicators) {
        for (const indicator of pulse.indicators) {
          indicators.push({
            type: indicator.type,
            value: indicator.indicator,
            description: indicator.description || ''
          });
        }
      }
      
      // Extract tags
      const tags = pulse.tags || [];
      
      // Extract targeted industries
      const industries = pulse.industries || [];
      
      // Extract CVE references
      const cveIds = [];
      if (pulse.references) {
        for (const ref of pulse.references) {
          const cveMatches = ref.match(/CVE-\d{4}-\d+/g);
          if (cveMatches) {
            cveIds.push(...cveMatches);
          }
        }
      }
      
      items.push({
        item_type: 'pulse',
        external_id: pulse.id,
        title: pulse.name,
        description: pulse.description || '',
        severity: severity,
        cvss_score: null,
        cvss_vector: null,
        cwe_ids: [],
        affected_products: industries,
        exploit_available: false,
        exploit_maturity: null,
        published_at: pulse.created ? new Date(pulse.created) : null,
        modified_at: pulse.modified ? new Date(pulse.modified) : null,
        due_date: null,
        metadata: {
          author: pulse.author_name,
          tlp: pulse.tlp,
          tags: tags,
          indicators: indicators.slice(0, 100), // Limit to 100 indicators
          indicator_count: pulse.indicator_count || 0,
          adversary: pulse.adversary || null,
          malware_families: pulse.malware_families || [],
          attack_ids: pulse.attack_ids || [],
          industries: industries,
          targeted_countries: pulse.targeted_countries || [],
          references: pulse.references || [],
          cve_ids: cveIds,
          source: 'alienvault_otx',
          pulse_url: `https://otx.alienvault.com/pulse/${pulse.id}`
        }
      });
    }
    
    items.rateLimitInfo = {
      remaining: null, // OTX doesn't expose rate limit in headers consistently
      reset_at: null
    };
    
    return items;
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error('Invalid AlienVault OTX API key');
      }
      throw new Error(`AlienVault OTX API error: ${error.response.status} - ${error.response.statusText}`);
    }
    throw new Error(`AlienVault OTX fetch error: ${error.message}`);
  }
}

/**
 * Test AlienVault OTX connection
 */
async function testConnection(apiKey) {
  if (!apiKey) {
    return {
      success: false,
      message: 'API key is required for AlienVault OTX'
    };
  }
  
  try {
    const headers = {
      'X-OTX-API-KEY': apiKey,
      'User-Agent': 'ControlWeave-GRC-Platform'
    };
    
    const response = await axios.get(`${OTX_BASE_URL}/user/me`, {
      headers,
      timeout: 10000
    });
    
    return {
      success: true,
      message: 'Connection successful',
      username: response.data.username,
      member_since: response.data.member_since
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return {
        success: false,
        message: 'Invalid API key'
      };
    }
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
