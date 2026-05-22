// @tier: pro
const pool = require('../config/database');
const Parser = require('rss-parser');
const axios = require('axios');

const parser = new Parser({
  timeout: 30000,
  headers: {
    'User-Agent': 'ControlWeave-GRC-Platform'
  }
});

// Regulatory news sources configuration
const NEWS_SOURCES = {
  fedramp: {
    url: 'https://www.fedramp.gov/feed/',
    frameworks: ['FedRAMP', 'NIST 800-53', 'NIST 800-171'],
    keywords: ['authorization', 'security', 'compliance', 'cloud']
  },
  nist: {
    url: 'https://csrc.nist.gov/publications/rss',
    frameworks: ['NIST 800-53', 'NIST CSF', 'NIST AI RMF', 'NIST 800-171'],
    keywords: ['cybersecurity', 'privacy', 'security', 'control']
  },
  cisa_advisories: {
    url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
    frameworks: ['NIST CSF', 'NIST 800-53'],
    keywords: ['vulnerability', 'threat', 'advisory', 'alert']
  },
  pci: {
    // PCI DSS doesn't have a direct RSS feed, would need web scraping
    url: null,
    frameworks: ['PCI DSS'],
    keywords: ['payment', 'cardholder', 'standard']
  }
};

/**
 * Get regulatory news items
 */
async function getNewsItems(organizationId, filters = {}) {
  const {
    source,
    is_read,
    is_archived,
    relevant_frameworks,
    impact_level,
    limit = 50,
    offset = 0
  } = filters;
  
  const conditions = ['organization_id = $1'];
  const values = [organizationId];
  let paramCount = 1;
  
  if (source) {
    conditions.push(`source = $${++paramCount}`);
    values.push(source);
  }
  
  if (is_read !== undefined) {
    conditions.push(`is_read = $${++paramCount}`);
    values.push(is_read);
  }
  
  if (is_archived !== undefined) {
    conditions.push(`is_archived = $${++paramCount}`);
    values.push(is_archived);
  }
  
  if (relevant_frameworks) {
    conditions.push(`relevant_frameworks && $${++paramCount}::text[]`);
    values.push(relevant_frameworks);
  }
  
  if (impact_level) {
    conditions.push(`impact_level = $${++paramCount}`);
    values.push(impact_level);
  }
  
  values.push(limit, offset);
  
  const result = await pool.query(
    `SELECT * FROM regulatory_news_items
     WHERE ${conditions.join(' AND ')}
     ORDER BY published_at DESC
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    values
  );
  
  return result.rows;
}

/**
 * Get unread news count
 */
async function getUnreadCount(organizationId) {
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM regulatory_news_items
     WHERE organization_id = $1 AND is_read = false AND is_archived = false`,
    [organizationId]
  );
  
  return parseInt(result.rows[0].count);
}

/**
 * Mark news item as read/archived
 */
async function updateNewsItem(organizationId, newsId, updates) {
  const { is_read, is_archived } = updates;
  
  const fields = [];
  const values = [organizationId, newsId];
  let paramCount = 2;
  
  if (is_read !== undefined) {
    fields.push(`is_read = $${++paramCount}`);
    values.push(is_read);
    
    if (is_read) {
      fields.push('read_at = NOW()');
    }
  }
  
  if (is_archived !== undefined) {
    fields.push(`is_archived = $${++paramCount}`);
    values.push(is_archived);
    
    if (is_archived) {
      fields.push('archived_at = NOW()');
    }
  }
  
  if (fields.length === 0) {
    return null;
  }
  
  fields.push('updated_at = NOW()');
  
  const result = await pool.query(
    `UPDATE regulatory_news_items
     SET ${fields.join(', ')}
     WHERE organization_id = $1 AND id = $2
     RETURNING *`,
    values
  );
  
  return result.rows[0] || null;
}

/**
 * Fetch and parse RSS feed
 */
async function fetchRssFeed(sourceConfig) {
  if (!sourceConfig.url) {
    return [];
  }
  
  try {
    const feed = await parser.parseURL(sourceConfig.url);
    
    const items = [];
    
    for (const item of feed.items || []) {
      // Extract keywords from title and content
      const text = `${item.title} ${item.contentSnippet || item.content || ''}`.toLowerCase();
      const keywords = sourceConfig.keywords.filter(kw => text.includes(kw.toLowerCase()));
      
      // Determine impact level based on keywords and content
      let impactLevel = 'low';
      if (text.includes('critical') || text.includes('urgent') || text.includes('mandatory')) {
        impactLevel = 'critical';
      } else if (text.includes('important') || text.includes('required') || text.includes('must')) {
        impactLevel = 'high';
      } else if (text.includes('recommended') || text.includes('updated')) {
        impactLevel = 'medium';
      }
      
      items.push({
        title: item.title,
        summary: item.contentSnippet || item.summary || '',
        content: item.content || item.contentSnippet || '',
        url: item.link,
        published_at: item.pubDate ? new Date(item.pubDate) : new Date(),
        relevant_frameworks: sourceConfig.frameworks,
        impact_level: impactLevel,
        keywords: keywords
      });
    }
    
    return items;
  } catch (error) {
    console.error(`Error fetching RSS feed from ${sourceConfig.url}:`, error.message);
    return [];
  }
}

/**
 * Refresh regulatory news from all sources
 */
async function refreshNews(organizationId) {
  const allItems = [];
  
  for (const [sourceName, sourceConfig] of Object.entries(NEWS_SOURCES)) {
    if (!sourceConfig.url) {
      continue;
    }
    
    try {
      const items = await fetchRssFeed(sourceConfig);
      
      for (const item of items) {
        try {
          await pool.query(
            `INSERT INTO regulatory_news_items (
               organization_id, source, title, summary, content, url,
               published_at, relevant_frameworks, impact_level, keywords
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10::text[])
             ON CONFLICT (organization_id, source, url) DO UPDATE
             SET title = EXCLUDED.title,
                 summary = EXCLUDED.summary,
                 content = EXCLUDED.content,
                 published_at = EXCLUDED.published_at,
                 relevant_frameworks = EXCLUDED.relevant_frameworks,
                 impact_level = EXCLUDED.impact_level,
                 keywords = EXCLUDED.keywords,
                 updated_at = NOW()`,
            [
              organizationId, sourceName, item.title, item.summary, item.content,
              item.url, item.published_at, item.relevant_frameworks,
              item.impact_level, item.keywords
            ]
          );
          
          allItems.push(item);
        } catch (error) {
          console.error(`Error inserting news item:`, error.message);
        }
      }
    } catch (error) {
      console.error(`Error processing source ${sourceName}:`, error.message);
    }
  }
  
  return allItems;
}

/**
 * Add custom news source
 */
async function addCustomSource(organizationId, sourceConfig) {
  // Store custom sources in dynamic config for now
  // In future, could have a separate table for custom sources
  const { name, url, frameworks, keywords } = sourceConfig;
  
  // Validate RSS feed
  try {
    await parser.parseURL(url);
  } catch (error) {
    throw new Error(`Invalid RSS feed URL: ${error.message}`);
  }
  
  return {
    name,
    url,
    frameworks: frameworks || [],
    keywords: keywords || []
  };
}

module.exports = {
  getNewsItems,
  getUnreadCount,
  updateNewsItem,
  refreshNews,
  addCustomSource,
  NEWS_SOURCES
};
