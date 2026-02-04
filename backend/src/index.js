// AI GRC Platform - Backend API Server
// Simple Express server to query the database and serve a basic UI

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import auditRoutes from './routes/audit.js';
import organizationsRoutes from './routes/organizations.js';
import controlsRoutes from './routes/controls.js';
import dashboardRoutes from './routes/dashboard.js';
import aiRoutes from './routes/ai.js';
import evidenceRoutes from './routes/evidence.js';
import { authenticateToken } from './middleware/auth.js';
import pool from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_AUTH) || 5,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later'
  }
});

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_API) || 100,
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully');
  }
});

// ==========================================
// API ROUTES
// ==========================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// ==========================================
// AUTH ROUTES (with rate limiting)
// ==========================================
app.use('/api/v1/auth', authLimiter, authRoutes);

// ==========================================
// AUDIT ROUTES (protected, admin only)
// ==========================================
app.use('/api/v1/audit', apiLimiter, auditRoutes);

// ==========================================
// ORGANIZATION ROUTES (protected)
// ==========================================
app.use('/api/v1/organizations', apiLimiter, organizationsRoutes);

// ==========================================
// CONTROL ROUTES (protected)
// ==========================================
app.use('/api/v1/controls', apiLimiter, controlsRoutes);

// ==========================================
// DASHBOARD ROUTES (protected)
// ==========================================
app.use('/api/v1/dashboard', apiLimiter, dashboardRoutes);

// ==========================================
// AI ROUTES (protected)
// ==========================================
app.use('/api/v1/ai', apiLimiter, authenticateToken, aiRoutes);

// ==========================================
// EVIDENCE ROUTES (protected)
// ==========================================
app.use('/api/v1/evidence', apiLimiter, authenticateToken, evidenceRoutes);

// ==========================================
// PROTECTED API ROUTES
// ==========================================

// Apply API rate limiting and authentication to all API routes
app.use('/api', apiLimiter);

// Get all frameworks (PROTECTED)
app.get('/api/v1/frameworks', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        f.id,
        f.code,
        f.name,
        f.full_name,
        f.version,
        f.issuing_body,
        f.description,
        f.category,
        COUNT(fc.id) as control_count
      FROM frameworks f
      LEFT JOIN framework_controls fc ON fc.framework_id = f.id
      GROUP BY f.id, f.code, f.name, f.full_name, f.version, f.issuing_body, f.description, f.category
      ORDER BY f.code
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching frameworks:', err);
    res.status(500).json({ error: 'Failed to fetch frameworks' });
  }
});

// Get framework by code (PROTECTED)
app.get('/api/v1/frameworks/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const result = await pool.query(`
      SELECT 
        f.*,
        COUNT(fc.id) as control_count
      FROM frameworks f
      LEFT JOIN framework_controls fc ON fc.framework_id = f.id
      WHERE f.code = $1
      GROUP BY f.id
    `, [code]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Framework not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching framework:', err);
    res.status(500).json({ error: 'Failed to fetch framework' });
  }
});

// Get controls for a framework (PROTECTED)
app.get('/api/v1/frameworks/:code/controls', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const result = await pool.query(`
      SELECT 
        fc.id,
        fc.control_id,
        fc.title,
        fc.description,
        fc.control_type,
        fc.priority,
        ff.name as function_name,
        fcat.name as category_name
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN framework_functions ff ON ff.id = fc.function_id
      LEFT JOIN framework_categories fcat ON fcat.id = fc.category_id
      WHERE f.code = $1
      ORDER BY fc.display_order
    `, [code]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching controls:', err);
    res.status(500).json({ error: 'Failed to fetch controls' });
  }
});

// Get control by ID with crosswalk mappings (PROTECTED)
app.get('/api/v1/controls/:id/mappings', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the control
    const controlResult = await pool.query(`
      SELECT 
        fc.*,
        f.code as framework_code,
        f.name as framework_name
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE fc.id = $1
    `, [id]);
    
    if (controlResult.rows.length === 0) {
      return res.status(404).json({ error: 'Control not found' });
    }
    
    // Get crosswalk mappings
    const mappingsResult = await pool.query(`
      SELECT 
        fc2.id,
        fc2.control_id,
        fc2.title,
        f2.code as framework_code,
        f2.name as framework_name,
        cm.mapping_type,
        cm.similarity_score,
        cm.notes
      FROM control_mappings cm
      JOIN framework_controls fc2 ON (
        fc2.id = cm.target_control_id OR fc2.id = cm.source_control_id
      )
      JOIN frameworks f2 ON f2.id = fc2.framework_id
      WHERE (cm.source_control_id = $1 OR cm.target_control_id = $1)
      AND fc2.id != $1
      ORDER BY cm.similarity_score DESC
    `, [id]);
    
    res.json({
      control: controlResult.rows[0],
      mappings: mappingsResult.rows
    });
  } catch (err) {
    console.error('Error fetching control mappings:', err);
    res.status(500).json({ error: 'Failed to fetch control mappings' });
  }
});

// Get crosswalk statistics (PROTECTED)
app.get('/api/v1/stats/crosswalks', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mapping_type,
        COUNT(*) as count,
        ROUND(AVG(similarity_score)) as avg_similarity,
        MIN(similarity_score) as min_score,
        MAX(similarity_score) as max_score
      FROM control_mappings
      GROUP BY mapping_type
      ORDER BY count DESC
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching crosswalk stats:', err);
    res.status(500).json({ error: 'Failed to fetch crosswalk statistics' });
  }
});

// Search controls (PROTECTED)
app.get('/api/v1/search/controls', authenticateToken, async (req, res) => {
  try {
    const { q, framework } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    
    let query = `
      SELECT 
        fc.id,
        fc.control_id,
        fc.title,
        fc.description,
        fc.priority,
        f.code as framework_code,
        f.name as framework_name
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE (
        fc.title ILIKE $1 
        OR fc.description ILIKE $1 
        OR fc.control_id ILIKE $1
      )
    `;
    
    const params = [`%${q}%`];
    
    if (framework) {
      query += ` AND f.code = $2`;
      params.push(framework);
    }
    
    query += ` ORDER BY fc.priority DESC, fc.title LIMIT 50`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error searching controls:', err);
    res.status(500).json({ error: 'Failed to search controls' });
  }
});

// Get dashboard stats (PROTECTED)
app.get('/api/v1/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM frameworks) as total_frameworks,
        (SELECT COUNT(*) FROM framework_controls) as total_controls,
        (SELECT COUNT(*) FROM control_mappings) as total_mappings,
        (SELECT COUNT(*) FROM ai_systems) as total_ai_systems,
        (SELECT COUNT(*) FROM risks) as total_risks
    `);
    
    res.json(stats.rows[0]);
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// ==========================================
// SERVE SIMPLE HTML UI
// ==========================================

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI GRC Platform</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            border-radius: 10px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        h1 {
            color: #667eea;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            font-size: 16px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stat-number {
            font-size: 36px;
            font-weight: bold;
            color: #667eea;
        }
        .stat-label {
            color: #666;
            margin-top: 5px;
        }
        .frameworks {
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .framework {
            border-bottom: 1px solid #eee;
            padding: 20px 0;
        }
        .framework:last-child {
            border-bottom: none;
        }
        .framework-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .framework-name {
            font-size: 18px;
            font-weight: 600;
            color: #333;
        }
        .framework-code {
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .framework-info {
            color: #666;
            font-size: 14px;
            margin-bottom: 8px;
        }
        .control-count {
            display: inline-flex;
            align-items: center;
            background: #f0f0f0;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
        }
        .control-count span {
            color: #667eea;
            font-weight: 700;
            margin-right: 4px;
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        .api-info {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .api-info h3 {
            color: #667eea;
            margin-bottom: 15px;
        }
        .endpoint {
            background: #f5f5f5;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 10px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
        }
        .endpoint-method {
            color: #667eea;
            font-weight: bold;
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 AI GRC Platform</h1>
            <p class="subtitle">Multi-Framework Compliance Management with AI Governance</p>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-number" id="totalFrameworks">-</div>
                <div class="stat-label">Frameworks</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="totalControls">-</div>
                <div class="stat-label">Total Controls</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="totalMappings">-</div>
                <div class="stat-label">Crosswalk Mappings</div>
            </div>
        </div>

        <div class="frameworks">
            <h2 style="margin-bottom: 20px; color: #333;">Available Frameworks</h2>
            <div id="frameworksList" class="loading">Loading frameworks...</div>
        </div>

        <div class="api-info">
            <h3>🔌 API Endpoints</h3>
            <div class="endpoint">
                <span class="endpoint-method">GET</span>
                <span>/api/frameworks</span>
            </div>
            <div class="endpoint">
                <span class="endpoint-method">GET</span>
                <span>/api/frameworks/:code/controls</span>
            </div>
            <div class="endpoint">
                <span class="endpoint-method">GET</span>
                <span>/api/controls/:id/mappings</span>
            </div>
            <div class="endpoint">
                <span class="endpoint-method">GET</span>
                <span>/api/search/controls?q=mfa</span>
            </div>
            <div class="endpoint">
                <span class="endpoint-method">GET</span>
                <span>/api/stats/dashboard</span>
            </div>
        </div>
    </div>

    <script>
        // Load dashboard stats
        async function loadStats() {
            try {
                const response = await fetch('/api/stats/dashboard');
                const stats = await response.json();
                
                document.getElementById('totalFrameworks').textContent = stats.total_frameworks;
                document.getElementById('totalControls').textContent = stats.total_controls;
                document.getElementById('totalMappings').textContent = stats.total_mappings;
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        }

        // Load frameworks
        async function loadFrameworks() {
            try {
                const response = await fetch('/api/frameworks');
                const frameworks = await response.json();
                
                const frameworksList = document.getElementById('frameworksList');
                frameworksList.innerHTML = frameworks.map(fw => \`
                    <div class="framework">
                        <div class="framework-header">
                            <div class="framework-name">\${fw.name}</div>
                            <div class="framework-code">\${fw.code}</div>
                        </div>
                        <div class="framework-info">\${fw.full_name}</div>
                        <div class="framework-info">Version \${fw.version} | \${fw.issuing_body}</div>
                        <div class="control-count">
                            <span>\${fw.control_count}</span> controls
                        </div>
                    </div>
                \`).join('');
            } catch (error) {
                console.error('Error loading frameworks:', error);
                document.getElementById('frameworksList').innerHTML = 
                    '<p style="color: red;">Error loading frameworks. Make sure the database is set up.</p>';
            }
        }

        // Load data on page load
        loadStats();
        loadFrameworks();
    </script>
</body>
</html>
  `);
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(`\n🚀 AI GRC Platform API running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔌 API: http://localhost:${PORT}/api/frameworks`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
