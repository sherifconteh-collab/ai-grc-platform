#!/bin/bash
# Master Database Initialization Script for ControlWeave
# This script creates the complete multi-framework GRC database

set -e  # Exit on error

DB_NAME="${DB_NAME:-ai_grc_platform}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo "=========================================="
echo "ControlWeave Database Initialization"
echo "=========================================="
echo ""
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql command not found. Please install PostgreSQL client."
    exit 1
fi

# Function to execute SQL file
execute_sql() {
    local file=$1
    local description=$2
    echo "→ $description..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$file" -v ON_ERROR_STOP=1 > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "  ✓ Success"
    else
        echo "  ✗ Failed"
        exit 1
    fi
}

# Create database if it doesn't exist
echo "Checking database existence..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME
if [ $? -ne 0 ]; then
    echo "Creating database $DB_NAME..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;"
    echo "  ✓ Database created"
else
    echo "  ✓ Database exists"
fi

echo ""
echo "=========================================="
echo "Phase 1: Creating Schema"
echo "=========================================="
execute_sql "schema.sql" "Creating tables, indexes, and triggers"

echo ""
echo "=========================================="
echo "Phase 2: Loading Framework Data"
echo "=========================================="
execute_sql "seed_nist_csf_2.sql" "Loading NIST CSF 2.0 (106 controls)"
execute_sql "seed_nist_ai_rmf.sql" "Loading NIST AI RMF 1.0 (70 controls)"
execute_sql "seed_iso_27001.sql" "Loading ISO 27001:2022 (93 controls)"
execute_sql "seed_soc2.sql" "Loading SOC 2 TSC (60+ controls)"
execute_sql "seed_hipaa_pci_gdpr.sql" "Loading HIPAA, PCI DSS, GDPR (100+ controls)"

echo ""
echo "=========================================="
echo "Phase 3: Verification"
echo "=========================================="

# Count frameworks
FRAMEWORK_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM frameworks;")
echo "→ Frameworks loaded: $FRAMEWORK_COUNT"

# Count controls
CONTROL_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM controls;")
echo "→ Controls loaded: $CONTROL_COUNT"

# Show framework summary
echo ""
echo "Framework Summary:"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
SELECT 
    f.name,
    f.version,
    COUNT(c.id) as control_count
FROM frameworks f
LEFT JOIN controls c ON f.id = c.framework_id
GROUP BY f.id, f.name, f.version
ORDER BY f.name;
"

echo ""
echo "=========================================="
echo "✓ Database initialization complete!"
echo "=========================================="
echo ""
echo "Total Frameworks: $FRAMEWORK_COUNT"
echo "Total Controls: $CONTROL_COUNT"
echo ""
echo "Next steps:"
echo "1. Review /docs/FRAMEWORK_COVERAGE.md for detailed control listings"
echo "2. Start the application backend"
echo "3. Begin implementing controls for your organization"
echo ""
