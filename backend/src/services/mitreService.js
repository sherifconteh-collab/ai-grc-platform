// @tier: enterprise
const axios = require('axios');

const MITRE_ATTACK_ENTERPRISE_URL = 'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json';
const MITRE_ATTACK_MOBILE_URL = 'https://raw.githubusercontent.com/mitre/cti/master/mobile-attack/mobile-attack.json';
const MITRE_ATTACK_ICS_URL = 'https://raw.githubusercontent.com/mitre/cti/master/ics-attack/ics-attack.json';

/**
 * Fetch MITRE ATT&CK techniques
 */
async function fetchFeed(apiKey, configuration = {}) {
  const {
    matrix = 'enterprise', // 'enterprise', 'mobile', or 'ics'
    include_deprecated = false,
    technique_types = ['attack-pattern'] // Can include 'malware', 'tool', 'intrusion-set'
  } = configuration;
  
  let url = MITRE_ATTACK_ENTERPRISE_URL;
  if (matrix === 'mobile') {
    url = MITRE_ATTACK_MOBILE_URL;
  } else if (matrix === 'ics') {
    url = MITRE_ATTACK_ICS_URL;
  }
  
  try {
    const response = await axios.get(url, {
      timeout: 60000, // MITRE data is large, allow more time
      headers: {
        'User-Agent': 'ControlWeave-GRC-Platform'
      }
    });
    
    const bundle = response.data;
    const objects = bundle.objects || [];
    
    const items = [];
    
    for (const obj of objects) {
      // Filter by type
      if (!technique_types.includes(obj.type)) {
        continue;
      }
      
      // Skip deprecated unless explicitly included
      if (!include_deprecated && obj.x_mitre_deprecated) {
        continue;
      }
      
      // Skip revoked objects
      if (obj.revoked) {
        continue;
      }
      
      if (obj.type === 'attack-pattern') {
        // Determine severity based on impact
        let severity = 'medium';
        if (obj.x_mitre_impact_type) {
          const impactTypes = Array.isArray(obj.x_mitre_impact_type) 
            ? obj.x_mitre_impact_type 
            : [obj.x_mitre_impact_type];
          
          if (impactTypes.includes('impact') || impactTypes.includes('availability')) {
            severity = 'high';
          }
        }
        
        // Get external references
        const externalRefs = obj.external_references || [];
        const mitreRef = externalRefs.find(ref => ref.source_name === 'mitre-attack');
        const externalId = mitreRef?.external_id || obj.id;
        
        // Get kill chain phases (tactics)
        const tactics = [];
        if (obj.kill_chain_phases) {
          for (const phase of obj.kill_chain_phases) {
            if (phase.phase_name) {
              tactics.push(phase.phase_name.replace(/-/g, ' '));
            }
          }
        }
        
        // Get platforms
        const platforms = obj.x_mitre_platforms || [];
        
        // Get data sources
        const dataSources = [];
        if (obj.x_mitre_data_sources) {
          dataSources.push(...obj.x_mitre_data_sources);
        }
        
        items.push({
          item_type: 'attack_technique',
          external_id: externalId,
          title: obj.name,
          description: obj.description || '',
          severity: severity,
          cvss_score: null,
          cvss_vector: null,
          cwe_ids: [],
          affected_products: platforms,
          exploit_available: false,
          exploit_maturity: null,
          published_at: obj.created ? new Date(obj.created) : null,
          modified_at: obj.modified ? new Date(obj.modified) : null,
          due_date: null,
          metadata: {
            mitre_id: externalId,
            tactics: tactics,
            platforms: platforms,
            data_sources: dataSources,
            is_subtechnique: externalId.includes('.'),
            detection: obj.x_mitre_detection || '',
            version: obj.x_mitre_version || '1.0',
            url: mitreRef?.url || '',
            source: 'mitre_attack',
            matrix: matrix
          }
        });
      }
    }
    
    items.rateLimitInfo = {
      remaining: null, // GitHub doesn't have strict rate limits for raw content
      reset_at: null
    };
    
    return items;
  } catch (error) {
    if (error.response) {
      throw new Error(`MITRE ATT&CK API error: ${error.response.status} - ${error.response.statusText}`);
    }
    throw new Error(`MITRE ATT&CK fetch error: ${error.message}`);
  }
}

/**
 * Test MITRE ATT&CK connection
 */
async function testConnection() {
  try {
    const response = await axios.get(MITRE_ATTACK_ENTERPRISE_URL, {
      timeout: 30000,
      headers: {
        'User-Agent': 'ControlWeave-GRC-Platform'
      }
    });
    
    const bundle = response.data;
    const techniques = bundle.objects?.filter(obj => obj.type === 'attack-pattern').length || 0;
    
    return {
      success: true,
      message: 'Connection successful',
      version: bundle.spec_version,
      techniques: techniques
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
