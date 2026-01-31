# VS Code Setup Guide - See Your GRC Platform Running!

## Prerequisites Check

Before we start, make sure you have:
- [ ] PostgreSQL installed
- [ ] Node.js 18+ installed
- [ ] VS Code installed
- [ ] Git installed

---

## Step 1: Open in VS Code

1. Open VS Code
2. File → Open Folder
3. Navigate to this folder: `ai-grc-platform`
4. Click "Select Folder"

---

## Step 2: Set Up Database (5 minutes)

### Open VS Code Terminal
- View → Terminal (or Ctrl+`)

### Create Database
```bash
# Create the database
createdb ai_grc_platform

# Verify it was created
psql -l | grep ai_grc_platform
```

### Load Schema
```bash
# Load the schema (creates all 25+ tables)
psql ai_grc_platform < db/schema.sql
```

### Load Framework Data
```bash
# Load all 6 frameworks
psql ai_grc_platform < db/seeds/01_nist_csf_2.0.sql
psql ai_grc_platform < db/seeds/02_nist_ai_rmf.sql
psql ai_grc_platform < db/seeds/03_iso_soc2_others.sql
psql ai_grc_platform < db/seeds/04_nist_800_171.sql
psql ai_grc_platform < db/seeds/05_nist_800_53_moderate.sql

# Load crosswalk mappings (the secret sauce!)
psql ai_grc_platform < db/seeds/06_crosswalk_mappings.sql
```

### Verify Data Loaded
```bash
# This should show 528+ controls
psql ai_grc_platform -c "SELECT COUNT(*) FROM framework_controls;"

# This should show 80+ mappings
psql ai_grc_platform -c "SELECT COUNT(*) FROM control_mappings;"

# This should show all 6 frameworks
psql ai_grc_platform -c "SELECT code, name FROM frameworks ORDER BY code;"
```

**Expected Output:**
```
 count 
-------
   528

 count 
-------
    80

     code      |        name        
---------------+--------------------
 iso_27001     | ISO 27001
 nist_800_171  | NIST SP 800-171
 nist_800_53   | NIST SP 800-53
 nist_ai_rmf   | NIST AI RMF
 nist_csf_2.0  | NIST CSF 2.0
 soc2          | SOC 2
```

✅ **If you see this, your database is working!**

---

## Step 3: Quick Backend Setup (10 minutes)

### Initialize Node Project
```bash
# Create backend folder
mkdir -p backend/src
cd backend

# Initialize npm
npm init -y

# Install dependencies
npm install express cors pg dotenv
npm install --save-dev nodemon
```

### Create Environment File
```bash
# Create .env file
cat > .env << 'EOF'
DATABASE_URL=postgresql://localhost/ai_grc_platform
PORT=3001
EOF
```

### Backend is now ready! See backend/src/index.js for the API server code.

---

## Step 4: See It Working! (Browser-Based Demo)

### Start the Backend
```bash
# In terminal from ai-grc-platform/backend folder
npm run dev
```

**You should see:**
```
🚀 AI GRC Platform API running on http://localhost:3001
✅ Database connected successfully
```

### Test the API
Open a new terminal and run:
```bash
# Test health check
curl http://localhost:3001/health

# Get all frameworks
curl http://localhost:3001/api/frameworks

# Get NIST CSF controls
curl http://localhost:3001/api/frameworks/nist_csf_2.0/controls | jq
```

### Open the Demo Interface

1. Keep the backend running
2. Open a browser
3. Go to: `http://localhost:3001`

**You'll see a simple dashboard showing:**
- All 6 frameworks
- 528 controls
- 80+ crosswalk mappings
- Interactive framework viewer
- Control detail pages with crosswalk connections

---

## Step 5: Explore Your Data in VS Code

### Install PostgreSQL Extension
1. Click Extensions icon (or Ctrl+Shift+X)
2. Search "PostgreSQL"
3. Install "PostgreSQL" by Chris Kolkman
4. Click "Reload"

### Connect to Database
1. Click PostgreSQL icon in left sidebar
2. Click "+"
3. Enter connection details:
   - Host: localhost
   - Port: 5432
   - Database: ai_grc_platform
   - Username: (your postgres username)
   - Password: (if you have one)

### Run SQL Queries
1. Create new file: `test_queries.sql`
2. Copy these queries:

```sql
-- See all frameworks
SELECT code, name, version FROM frameworks;

-- See control counts
SELECT 
    f.name,
    COUNT(fc.id) as controls
FROM frameworks f
JOIN framework_controls fc ON fc.framework_id = f.id
GROUP BY f.name;

-- See crosswalk example: MFA
SELECT 
    f1.code as framework_a,
    fc1.control_id,
    fc1.title,
    '→' as maps_to,
    f2.code as framework_b,
    fc2.control_id,
    cm.similarity_score
FROM control_mappings cm
JOIN framework_controls fc1 ON fc1.id = cm.source_control_id
JOIN frameworks f1 ON f1.id = fc1.framework_id
JOIN framework_controls fc2 ON fc2.id = cm.target_control_id
JOIN frameworks f2 ON f2.id = fc2.framework_id
WHERE fc1.title ILIKE '%multi%factor%'
ORDER BY cm.similarity_score DESC;
```

3. Right-click → Execute Query
4. See results in Output panel

---

## Troubleshooting

### PostgreSQL Not Found
```bash
# Mac (with Homebrew)
brew install postgresql@14
brew services start postgresql@14

# Ubuntu/Debian
sudo apt-get install postgresql-14
sudo systemctl start postgresql

# Windows
# Download from: https://www.postgresql.org/download/windows/
```

### Permission Denied
```bash
# Create postgres user if needed
sudo -u postgres createuser -s $USER
```

### Port 3001 Already in Use
```bash
# Change PORT in backend/.env to 3002 or any available port
```

### Database Connection Error
```bash
# Check if PostgreSQL is running
pg_isready

# Try connecting manually
psql ai_grc_platform
```

---

## What You Can Do Now

### 1. Explore the Dashboard
- See all 6 frameworks
- View control counts
- See compliance percentages (when you add implementations)

### 2. Query the Database
- Use VS Code PostgreSQL extension
- Run custom SQL queries
- Export data to CSV

### 3. Test the API
- GET /api/frameworks
- GET /api/frameworks/:code/controls
- GET /api/controls/:id/mappings
- See backend/src/index.js for all endpoints

### 4. Add Sample Data
```bash
# Connect to database
psql ai_grc_platform

# Create a test organization
INSERT INTO organizations (id, name, industry)
VALUES ('test-org', 'Test Company', 'Technology');

# Mark some controls as implemented
INSERT INTO control_implementations (organization_id, control_id, status, compliance_status)
SELECT 
    'test-org',
    id,
    'implemented',
    'compliant'
FROM framework_controls
WHERE control_id IN ('PR.AA-06', 'ID.AM-01', 'DE.CM-01')
AND framework_id = (SELECT id FROM frameworks WHERE code = 'nist_csf_2.0');

# Now query to see crosswalk magic!
```

### 5. Build Features
Now that everything works, you can:
- Improve the frontend UI
- Add user authentication
- Add more API endpoints
- Build assessment workflows
- Generate PDF reports
- Add charts/graphs

---

## Next Steps

### Immediate (Today)
- [x] Database running ✓
- [x] Backend API running ✓
- [x] Can see data in browser ✓
- [ ] Add a few sample controls
- [ ] Test crosswalk queries

### This Week
- [ ] Improve UI design
- [ ] Add user login
- [ ] Build control implementation form
- [ ] Add dashboard charts

### This Month
- [ ] Build assessment module
- [ ] Add PDF report generation
- [ ] Deploy to Railway/Render
- [ ] Get first beta user

---

## Quick Reference Commands

```bash
# Database
psql ai_grc_platform                    # Connect to DB
\dt                                      # List tables
\d framework_controls                    # Describe table
SELECT COUNT(*) FROM control_mappings;   # Quick query

# Backend
cd backend
npm run dev                              # Start server
npm run dev:watch                        # Auto-restart on changes

# Frontend
cd frontend  
npm start                                # Start React app
npm run build                            # Build for production
```

---

## You're Running! 🚀

Your AI GRC Platform is now:
✅ Database loaded with 528 controls
✅ API server running
✅ Accessible in browser
✅ Ready for development

**Open http://localhost:3001 to see it live!**
