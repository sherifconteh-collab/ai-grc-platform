#!/usr/bin/env bash
# End-to-end verification of the link routes added in migrations 146-149,
# plus the CMDB asset<->control mapping that migration 005 never had an API for.
set -uo pipefail

API=${API_BASE_URL:-http://localhost:3001/api/v1}
TOKEN=${ACCESS_TOKEN:-$(cat "${TOKEN_FILE:-/tmp/token.txt}")}
AUTH="Authorization: Bearer $TOKEN"
JSON="Content-Type: application/json"

# The cross-tenant section needs a second organization's credentials. Supplied
# by the caller rather than written here: even the documented demo password is
# a literal a secret scanner will flag, and rightly -- a script that carries one
# is a script someone will copy with a real one substituted.
#   DEMO_PASSWORD=... npm run qa:e2e:links
# Unset, the isolation checks skip rather than silently passing.
DEMO_PASSWORD="${DEMO_PASSWORD:-}"
SECOND_ORG_EMAIL="${SECOND_ORG_EMAIL:-admin@financial.com}"

# Evidence expiry: retention_until in this repo (migration 012), expires_at in
# ControlWeaver-Pro. Asserting the specific column is the point of the check --
# a blind port between the repos substitutes one for the other and 500s at
# runtime while every static gate still passes.
EXPIRY_FIELD="${EVIDENCE_EXPIRY_FIELD:-retention_until}"

pass=0; fail=0
check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1));
  else echo "  FAIL  $1 — got $2, expected $3"; fail=$((fail+1)); fi
}
jqf() { node -pe "try{const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const v=$1;v===undefined?'':(typeof v==='object'?JSON.stringify(v):String(v))}catch(e){''}"; }

echo "== setup: create a risk =="
RISK=$(curl -s -X POST "$API/risks" -H "$AUTH" -H "$JSON" -d '{
  "title":"E2E vendor concentration risk","category":"operational",
  "inherentLikelihood":4,"inherentImpact":5,
  "residualLikelihood":3,"residualImpact":4}')
RISK_ID=$(echo "$RISK" | jqf "j.data.id")
check "risk created" "$([ -n "$RISK_ID" ] && echo yes || echo no)" "yes"
echo "  risk_id=$RISK_ID"

echo "== generated columns (migration 140) =="
INH=$(echo "$RISK" | jqf "j.data.inherent_score")
RES=$(echo "$RISK" | jqf "j.data.residual_score")
check "inherent_score = 4x5" "$INH" "20"
check "residual_score = 3x4" "$RES" "12"

echo "== setup: create a vendor =="
VENDOR=$(curl -s -X POST "$API/tprm/vendors" -H "$AUTH" -H "$JSON" -d '{
  "vendor_name":"E2E Managed Hosting Ltd","vendor_type":"cloud",
  "risk_tier":"low","data_access_level":"full"}')
VENDOR_ID=$(echo "$VENDOR" | jqf "j.data.id")
check "vendor created" "$([ -n "$VENDOR_ID" ] && echo yes || echo no)" "yes"

echo "== migration 148: risk <-> vendor =="
CODE=$(curl -s -o /tmp/o -w '%{http_code}' -X POST "$API/risks/$RISK_ID/vendors" -H "$AUTH" -H "$JSON" \
  -d "{\"vendorId\":\"$VENDOR_ID\",\"notes\":\"single-region hosting\"}")
check "POST /risks/:id/vendors" "$CODE" "201"

# Idempotency: the ON CONFLICT DO UPDATE arm should return 200, not 500.
CODE=$(curl -s -o /tmp/o -w '%{http_code}' -X POST "$API/risks/$RISK_ID/vendors" -H "$AUTH" -H "$JSON" \
  -d "{\"vendorId\":\"$VENDOR_ID\",\"notes\":\"updated note\"}")
check "re-link is idempotent (DO UPDATE returns a row)" "$CODE" "201"

VCOUNT=$(curl -s -H "$AUTH" "$API/risks/$RISK_ID" | jqf "j.data.vendors.length")
check "vendor appears on GET /risks/:id" "$VCOUNT" "1"

# The reverse view: vendor detail must carry risks + the derived counters.
VDET=$(curl -s -H "$AUTH" "$API/tprm/vendors/$VENDOR_ID")
check "vendor detail carries risks" "$(echo "$VDET" | jqf "j.data.risks.length")" "1"
check "open_risk_count" "$(echo "$VDET" | jqf "j.data.open_risk_count")" "1"
check "max_residual_score" "$(echo "$VDET" | jqf "j.data.max_residual_score")" "12"

echo "== migration 149: risk <-> evidence =="
# Upload a real file so the evidence row is genuine, not hand-inserted.
echo "e2e evidence body" > /tmp/e2e-evidence.txt
EV=$(curl -s -X POST "$API/evidence/upload" -H "$AUTH" \
  -F "file=@/tmp/e2e-evidence.txt" -F "description=E2E pen test report")
EV_ID=$(echo "$EV" | jqf "j.data.id")
check "evidence uploaded" "$([ -n "$EV_ID" ] && echo yes || echo no)" "yes"

CODE=$(curl -s -o /tmp/o -w '%{http_code}' -X POST "$API/risks/$RISK_ID/evidence" -H "$AUTH" -H "$JSON" \
  -d "{\"evidenceId\":\"$EV_ID\",\"relevance\":\"assessment\",\"notes\":\"scoped test\"}")
check "POST /risks/:id/evidence" "$CODE" "201"

# A bad relevance must be a 400 naming the options, not a 500 from the CHECK.
BAD=$(curl -s -o /tmp/bad -w '%{http_code}' -X POST "$API/risks/$RISK_ID/evidence" -H "$AUTH" -H "$JSON" \
  -d "{\"evidenceId\":\"$EV_ID\",\"relevance\":\"not-a-real-value\"}")
check "invalid relevance rejected as 400" "$BAD" "400"
grep -q "assessment" /tmp/bad && echo "  PASS  400 names the valid options" && pass=$((pass+1)) \
  || { echo "  FAIL  400 does not name the valid options"; fail=$((fail+1)); }

RDET=$(curl -s -H "$AUTH" "$API/risks/$RISK_ID")
check "evidence on GET /risks/:id" "$(echo "$RDET" | jqf "j.data.evidence.length")" "1"
check "relevance persisted" "$(echo "$RDET" | jqf "j.data.evidence[0].relevance")" "assessment"
# The column substitution that would have 500'd if ported blind.
RU=$(echo "$RDET" | jqf "j.data.evidence[0]")
echo "$RU" | grep -q "$EXPIRY_FIELD" && echo "  PASS  $EXPIRY_FIELD present on the evidence row" && pass=$((pass+1)) \
  || { echo "  FAIL  $EXPIRY_FIELD missing from the evidence row"; fail=$((fail+1)); }

echo "== reverse read: GET /evidence/:id/risks =="
ERISKS=$(curl -s -H "$AUTH" "$API/evidence/$EV_ID/risks")
check "evidence -> risks" "$(echo "$ERISKS" | jqf "j.data.length")" "1"
check "carries relevance" "$(echo "$ERISKS" | jqf "j.data[0].relevance")" "assessment"

echo "== migration 005 finally reachable: asset <-> control =="
ASSET=$(curl -s -X POST "$API/cmdb/hardware" -H "$AUTH" -H "$JSON" \
  -d '{"name":"e2e-db-01","criticality":"high","status":"active"}')
ASSET_ID=$(echo "$ASSET" | jqf "j.data.id")
check "asset created" "$([ -n "$ASSET_ID" ] && echo yes || echo no)" "yes"

# /auth/me nests the organization, so the id is data.organization.id.
ORG_ID=$(curl -s -H "$AUTH" "$API/auth/me" | jqf "j.data.organization.id")
CTRL_ID=$(curl -s -H "$AUTH" "$API/organizations/$ORG_ID/controls?limit=1" | jqf "j.data[0].id")
echo "  control_id=$CTRL_ID"

CODE=$(curl -s -o /tmp/o -w '%{http_code}' -X POST "$API/cmdb/assets/$ASSET_ID/controls" -H "$AUTH" -H "$JSON" \
  -d "{\"control_id\":\"$CTRL_ID\",\"compliance_status\":\"partial\"}")
check "POST /cmdb/assets/:id/controls" "$CODE" "201"

MAPPED=$(curl -s -H "$AUTH" "$API/cmdb/assets/$ASSET_ID/controls")
check "mapping listed" "$(echo "$MAPPED" | jqf "j.data.length")" "1"
check "status persisted" "$(echo "$MAPPED" | jqf "j.data[0].compliance_status")" "partial"

CODE=$(curl -s -o /tmp/o -w '%{http_code}' -X PUT "$API/cmdb/assets/$ASSET_ID/controls/$CTRL_ID" -H "$AUTH" -H "$JSON" \
  -d '{"compliance_status":"compliant"}')
check "PUT updates the mapping" "$CODE" "200"
BADS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$API/cmdb/assets/$ASSET_ID/controls/$CTRL_ID" -H "$AUTH" -H "$JSON" \
  -d '{"compliance_status":"nonsense"}')
check "invalid compliance_status rejected" "$BADS" "400"

check "reverse: control -> assets" \
  "$(curl -s -H "$AUTH" "$API/cmdb/controls/$CTRL_ID/assets" | jqf "j.data.length")" "1"

echo "== migration 140 reverse: asset <-> risk =="
curl -s -o /dev/null -X POST "$API/risks/$RISK_ID/assets" -H "$AUTH" -H "$JSON" -d "{\"assetId\":\"$ASSET_ID\"}"
check "asset -> risks" "$(curl -s -H "$AUTH" "$API/cmdb/assets/$ASSET_ID/risks" | jqf "j.data.length")" "1"

echo "== risk-exposure rollup =="
check "risk-exposure responds" \
  "$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" "$API/cmdb/risk-exposure")" "200"

echo "== multi-tenant isolation =="
# A second org's token must not see or reach the first org's rows.
T2=""
[ -n "$DEMO_PASSWORD" ] && T2=$(curl -s -X POST "$API/auth/login" -H "$JSON" \
  -d "{\"email\":\"$SECOND_ORG_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}" | jqf "j.data.tokens.accessToken")
if [ -n "$T2" ]; then
  check "cross-org risk read is 404" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T2" "$API/risks/$RISK_ID")" "404"
  check "cross-org evidence->risks is 404" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T2" "$API/evidence/$EV_ID/risks")" "404"
  check "cross-org asset controls is 404" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T2" "$API/cmdb/assets/$ASSET_ID/controls")" "404"
else
  echo "  SKIP  cross-tenant checks — set DEMO_PASSWORD to run them"
fi

echo "== unlink =="
check "DELETE risk->evidence" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/risks/$RISK_ID/evidence/$EV_ID" -H "$AUTH")" "200"
check "DELETE risk->vendor" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/risks/$RISK_ID/vendors/$VENDOR_ID" -H "$AUTH")" "200"
check "DELETE asset->control" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/cmdb/assets/$ASSET_ID/controls/$CTRL_ID" -H "$AUTH")" "200"
check "unlink is reflected" "$(curl -s -H "$AUTH" "$API/risks/$RISK_ID" | jqf "j.data.evidence.length")" "0"

echo
echo "==================================="
echo "  PASSED: $pass    FAILED: $fail"
echo "==================================="
[ "$fail" -eq 0 ]
