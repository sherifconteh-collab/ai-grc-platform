// @tier: enterprise
const pool = require('../config/database');
const { encrypt, decrypt } = require('../utils/encrypt');
const { enqueueJob } = require('./jobService');
const nvdService = require('./nvdService');
const cisaKevService = require('./cisaKevService');
const mitreService = require('./mitreService');
const alienVaultService = require('./alienVaultService');

const FEED_SERVICES = {
  nvd: nvdService,
  cisa_kev: cisaKevService,
  mitre: mitreService,
  otx: alienVaultService
};

/**
 * Get all threat feeds for an organization
 */
async function getThreatFeeds(organizationId) {
  const result = await pool.query(
    `SELECT id, organization_id, feed_type, feed_name, is_enabled,
            configuration, last_sync_at, last_sync_status, sync_error_message,
            rate_limit_remaining, rate_limit_reset_at, created_at, updated_at
     FROM external_threat_feeds
     WHERE organization_id = $1
     ORDER BY feed_type`,
    [organizationId]
  );
  return result.rows;
}

/**
 * Get a single threat feed by ID
 */
async function getThreatFeed(organizationId, feedId) {
  const result = await pool.query(
    `SELECT id, organization_id, feed_type, feed_name, is_enabled,
            configuration, last_sync_at, last_sync_status, sync_error_message,
            rate_limit_remaining, rate_limit_reset_at, created_at, updated_at
     FROM external_threat_feeds
     WHERE organization_id = $1 AND id = $2
     LIMIT 1`,
    [organizationId, feedId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new threat feed configuration
 */
async function createThreatFeed(organizationId, feedData) {
  const { feed_type, feed_name, is_enabled = true, api_key, configuration = {} } = feedData;
  
  const apiKeyEncrypted = api_key ? encrypt(api_key) : null;
  
  const result = await pool.query(
    `INSERT INTO external_threat_feeds (
       organization_id, feed_type, feed_name, is_enabled, api_key_encrypted, configuration, last_sync_status
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'never')
     RETURNING id, organization_id, feed_type, feed_name, is_enabled,
               configuration, last_sync_at, last_sync_status, created_at, updated_at`,
    [organizationId, feed_type, feed_name, is_enabled, apiKeyEncrypted, JSON.stringify(configuration)]
  );
  
  return result.rows[0];
}

/**
 * Update threat feed configuration
 */
async function updateThreatFeed(organizationId, feedId, updates) {
  const { feed_name, is_enabled, api_key, configuration } = updates;
  
  const fields = [];
  const values = [organizationId, feedId];
  let paramCount = 2;
  
  if (feed_name !== undefined) {
    fields.push(`feed_name = $${++paramCount}`);
    values.push(feed_name);
  }
  
  if (is_enabled !== undefined) {
    fields.push(`is_enabled = $${++paramCount}`);
    values.push(is_enabled);
  }
  
  if (api_key !== undefined) {
    fields.push(`api_key_encrypted = $${++paramCount}`);
    values.push(api_key ? encrypt(api_key) : null);
  }
  
  if (configuration !== undefined) {
    fields.push(`configuration = $${++paramCount}::jsonb`);
    values.push(JSON.stringify(configuration));
  }
  
  if (fields.length === 0) {
    return await getThreatFeed(organizationId, feedId);
  }
  
  fields.push('updated_at = NOW()');
  
  const result = await pool.query(
    `UPDATE external_threat_feeds
     SET ${fields.join(', ')}
     WHERE organization_id = $1 AND id = $2
     RETURNING id, organization_id, feed_type, feed_name, is_enabled,
               configuration, last_sync_at, last_sync_status, created_at, updated_at`,
    values
  );
  
  return result.rows[0] || null;
}

/**
 * Delete a threat feed
 */
async function deleteThreatFeed(organizationId, feedId) {
  const result = await pool.query(
    `DELETE FROM external_threat_feeds
     WHERE organization_id = $1 AND id = $2
     RETURNING id`,
    [organizationId, feedId]
  );
  return result.rowCount > 0;
}

/**
 * Get decrypted API key for a feed
 */
async function getFeedApiKey(organizationId, feedId) {
  const result = await pool.query(
    `SELECT api_key_encrypted FROM external_threat_feeds
     WHERE organization_id = $1 AND id = $2
     LIMIT 1`,
    [organizationId, feedId]
  );
  
  if (result.rows.length === 0 || !result.rows[0].api_key_encrypted) {
    return null;
  }
  
  try {
    return decrypt(result.rows[0].api_key_encrypted);
  } catch (error) {
    console.error('Error decrypting API key:', error);
    return null;
  }
}

/**
 * Update feed sync status
 */
async function updateFeedSyncStatus(feedId, status, errorMessage = null, rateLimitInfo = null) {
  const fields = ['last_sync_at = NOW()', 'last_sync_status = $2'];
  const values = [feedId, status];
  let paramCount = 2;
  
  if (errorMessage !== null) {
    fields.push(`sync_error_message = $${++paramCount}`);
    values.push(errorMessage);
  }
  
  if (rateLimitInfo) {
    if (rateLimitInfo.remaining !== undefined) {
      fields.push(`rate_limit_remaining = $${++paramCount}`);
      values.push(rateLimitInfo.remaining);
    }
    if (rateLimitInfo.reset_at !== undefined) {
      fields.push(`rate_limit_reset_at = $${++paramCount}`);
      values.push(rateLimitInfo.reset_at);
    }
  }
  
  await pool.query(
    `UPDATE external_threat_feeds
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $1`,
    values
  );
}

/**
 * Sync a specific feed
 */
async function syncFeed(organizationId, feedId) {
  const feed = await getThreatFeed(organizationId, feedId);
  
  if (!feed) {
    throw new Error('Feed not found');
  }
  
  if (!feed.is_enabled) {
    throw new Error('Feed is disabled');
  }
  
  const feedService = FEED_SERVICES[feed.feed_type];
  
  if (!feedService) {
    throw new Error(`No service available for feed type: ${feed.feed_type}`);
  }
  
  try {
    await updateFeedSyncStatus(feedId, 'pending');
    
    const apiKey = await getFeedApiKey(organizationId, feedId);
    const items = await feedService.fetchFeed(apiKey, feed.configuration);
    
    // Store items in database
    let insertedCount = 0;
    let updatedCount = 0;
    
    for (const item of items) {
      const result = await upsertThreatItem(organizationId, feedId, item);
      if (result.inserted) {
        insertedCount++;
      } else {
        updatedCount++;
      }
    }
    
    await updateFeedSyncStatus(feedId, 'success', null, items.rateLimitInfo);
    
    return { success: true, inserted: insertedCount, updated: updatedCount, total: items.length };
  } catch (error) {
    await updateFeedSyncStatus(feedId, 'error', error.message);
    throw error;
  }
}

/**
 * Upsert a threat intelligence item
 */
async function upsertThreatItem(organizationId, feedId, item) {
  const result = await pool.query(
    `INSERT INTO threat_intelligence_items (
       organization_id, feed_id, item_type, external_id, title, description,
       severity, cvss_score, cvss_vector, cwe_ids, affected_products,
       exploit_available, exploit_maturity, published_at, modified_at, due_date, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
     ON CONFLICT (organization_id, feed_id, external_id)
     DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       severity = EXCLUDED.severity,
       cvss_score = EXCLUDED.cvss_score,
       cvss_vector = EXCLUDED.cvss_vector,
       cwe_ids = EXCLUDED.cwe_ids,
       affected_products = EXCLUDED.affected_products,
       exploit_available = EXCLUDED.exploit_available,
       exploit_maturity = EXCLUDED.exploit_maturity,
       modified_at = EXCLUDED.modified_at,
       due_date = EXCLUDED.due_date,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING (xmax = 0) AS inserted`,
    [
      organizationId, feedId, item.item_type, item.external_id, item.title, item.description,
      item.severity, item.cvss_score, item.cvss_vector, item.cwe_ids, item.affected_products,
      item.exploit_available, item.exploit_maturity, item.published_at, item.modified_at,
      item.due_date, JSON.stringify(item.metadata || {})
    ]
  );
  
  return { inserted: result.rows[0].inserted };
}

/**
 * Get threat intelligence items
 */
async function getThreatItems(organizationId, filters = {}) {
  const { feed_id, item_type, severity, exploit_available, limit = 100, offset = 0 } = filters;
  
  const conditions = ['organization_id = $1'];
  const values = [organizationId];
  let paramCount = 1;
  
  if (feed_id) {
    conditions.push(`feed_id = $${++paramCount}`);
    values.push(feed_id);
  }
  
  if (item_type) {
    conditions.push(`item_type = $${++paramCount}`);
    values.push(item_type);
  }
  
  if (severity) {
    conditions.push(`severity = $${++paramCount}`);
    values.push(severity);
  }
  
  if (exploit_available !== undefined) {
    conditions.push(`exploit_available = $${++paramCount}`);
    values.push(exploit_available);
  }
  
  values.push(limit, offset);
  
  const result = await pool.query(
    `SELECT * FROM threat_intelligence_items
     WHERE ${conditions.join(' AND ')}
     ORDER BY published_at DESC, cvss_score DESC NULLS LAST
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    values
  );
  
  return result.rows;
}

/**
 * Get threat intelligence statistics
 */
async function getThreatStats(organizationId) {
  const result = await pool.query(
    `SELECT
       COUNT(*) as total_items,
       COUNT(*) FILTER (WHERE item_type = 'cve') as cve_count,
       COUNT(*) FILTER (WHERE item_type = 'kev') as kev_count,
       COUNT(*) FILTER (WHERE exploit_available = true) as exploitable_count,
       COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
       COUNT(*) FILTER (WHERE severity = 'high') as high_count,
       MAX(published_at) as latest_item_date
     FROM threat_intelligence_items
     WHERE organization_id = $1`,
    [organizationId]
  );
  
  return result.rows[0];
}

/**
 * Schedule automatic feed sync
 */
async function scheduleAutoSync(organizationId) {
  const feeds = await getThreatFeeds(organizationId);
  
  for (const feed of feeds) {
    if (feed.is_enabled) {
      await enqueueJob({
        organizationId,
        jobType: 'threat_intel_sync',
        payload: { feedId: feed.id },
        priority: 'medium'
      });
    }
  }
}

module.exports = {
  getThreatFeeds,
  getThreatFeed,
  createThreatFeed,
  updateThreatFeed,
  deleteThreatFeed,
  getFeedApiKey,
  syncFeed,
  getThreatItems,
  getThreatStats,
  scheduleAutoSync,
  upsertThreatItem
};
