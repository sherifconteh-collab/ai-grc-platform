#!/bin/bash

# ControlWeave - Quick Start Script
# This script sets up the database and starts the application

echo "🚀 ControlWeave - Quick Start"
echo "================================"
echo ""

# Check if PostgreSQL is running
if ! pg_isready > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running. Please start PostgreSQL first."
    echo ""
    echo "Mac (Homebrew): brew services start postgresql"
    echo "Linux: sudo systemctl start postgresql"
    echo "Windows: Check Services app"
    exit 1
fi

echo "✅ PostgreSQL is running"
echo ""

# Check if database exists
if psql -lqt | cut -d \| -f 1 | grep -qw ai_grc_platform; then
    echo "✅ Database 'ai_grc_platform' already exists"
else
    echo "📦 Creating database 'ai_grc_platform'..."
    createdb ai_grc_platform
    echo "✅ Database created"
fi

echo ""

# Check if tables exist
TABLE_COUNT=$(psql ai_grc_platform -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" -eq "0" ]; then
    echo "📋 Loading database schema..."
    psql ai_grc_platform < db/schema.sql > /dev/null
    echo "✅ Schema loaded"
    
    echo ""
    echo "📚 Loading framework data..."
    echo "   • NIST CSF 2.0..."
    psql ai_grc_platform < db/seeds/01_nist_csf_2.0.sql > /dev/null
    echo "   • NIST AI RMF..."
    psql ai_grc_platform < db/seeds/02_nist_ai_rmf.sql > /dev/null
    echo "   • ISO 27001 & SOC 2..."
    psql ai_grc_platform < db/seeds/03_iso_soc2_others.sql > /dev/null
    echo "   • NIST SP 800-171..."
    psql ai_grc_platform < db/seeds/04_nist_800_171.sql > /dev/null
    echo "   • NIST SP 800-53..."
    psql ai_grc_platform < db/seeds/05_nist_800_53_moderate.sql > /dev/null
    echo "   • Crosswalk mappings..."
    psql ai_grc_platform < db/seeds/06_crosswalk_mappings.sql > /dev/null
    echo "✅ All frameworks loaded"
else
    echo "✅ Database schema already exists"
fi

echo ""
echo "📊 Database Statistics:"
CONTROL_COUNT=$(psql ai_grc_platform -t -c "SELECT COUNT(*) FROM framework_controls;" 2>/dev/null | xargs)
MAPPING_COUNT=$(psql ai_grc_platform -t -c "SELECT COUNT(*) FROM control_mappings;" 2>/dev/null | xargs)
FRAMEWORK_COUNT=$(psql ai_grc_platform -t -c "SELECT COUNT(*) FROM frameworks;" 2>/dev/null | xargs)

echo "   • Frameworks: $FRAMEWORK_COUNT"
echo "   • Controls: $CONTROL_COUNT"
echo "   • Crosswalk Mappings: $MAPPING_COUNT"

echo ""
echo "🔧 Setting up backend..."
cd backend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env created"
fi

echo ""
echo "================================"
echo "✅ Setup Complete!"
echo "================================"
echo ""
echo "🚀 Starting server..."
echo ""
echo "Open your browser to: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm run dev
