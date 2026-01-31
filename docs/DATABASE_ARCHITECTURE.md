# Database Architecture - How It All Connects

## Visual Schema Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                         FRAMEWORKS TABLE                               │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ id | code          | name              | version | ...       │     │
│  ├────┼───────────────┼───────────────────┼─────────┼───────────┤     │
│  │ 1  │ nist_csf_2.0  │ NIST CSF 2.0     │ 2.0     │ ...       │     │
│  │ 2  │ nist_ai_rmf   │ NIST AI RMF      │ 1.0     │ ...       │     │
│  │ 3  │ nist_800_171  │ NIST SP 800-171  │ Rev 2   │ ...       │     │
│  │ 4  │ nist_800_53   │ NIST SP 800-53   │ Rev 5   │ ...       │     │
│  │ 5  │ iso_27001     │ ISO 27001        │ 2022    │ ...       │     │
│  │ 6  │ soc2          │ SOC 2            │ 2017    │ ...       │     │
│  └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ has many
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    FRAMEWORK_CONTROLS TABLE                            │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ id | framework_id | control_id | title           | ...       │     │
│  ├────┼──────────────┼────────────┼─────────────────┼───────────┤     │
│  │ A1 │ 1 (CSF)      │ PR.AA-06   │ Multi-factor... │ critical  │     │
│  │ A2 │ 1 (CSF)      │ ID.AM-01   │ Physical Assets │ high      │     │
│  │ A3 │ 1 (CSF)      │ DE.CM-01   │ Network Monitor │ high      │     │
│  │ B1 │ 3 (800-171)  │ 3.5.3      │ Multi-Factor... │ critical  │     │
│  │ B2 │ 3 (800-171)  │ 3.4.1      │ Baseline Config │ critical  │     │
│  │ C1 │ 5 (ISO)      │ A.5.16     │ Identity Mgmt   │ critical  │     │
│  │ C2 │ 5 (ISO)      │ A.5.9      │ Inventory       │ critical  │     │
│  └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
           │                                                    │
           │                                                    │
           │                                                    │
           │         ┌──────────────────────────┐              │
           │         │  CONTROL_MAPPINGS TABLE  │              │
           │         │   (THE MAGIC HAPPENS)    │              │
           │         └──────────────────────────┘              │
           │                      │                             │
           └──────────────────────┼─────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    CONTROL_MAPPINGS (CROSSWALKS)                       │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ source_id | target_id | mapping_type | similarity | notes   │     │
│  ├───────────┼───────────┼──────────────┼────────────┼─────────┤     │
│  │ A1        │ B1        │ equivalent   │ 100        │ MFA     │     │
│  │ A2        │ C2        │ equivalent   │ 100        │ Inv.    │     │
│  │ A3        │ ...       │ equivalent   │ 100        │ Mon.    │     │
│  │ B1        │ (800-53)  │ subset       │ 90         │ ...     │     │
│  │ C1        │ A1        │ related      │ 85         │ ...     │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  This table creates the "crosswalk" connections between controls!     │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ enables
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  CONTROL_IMPLEMENTATIONS TABLE                         │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ org_id | control_id | status      | compliance | ...         │     │
│  ├────────┼────────────┼─────────────┼────────────┼─────────────┤     │
│  │ Org1   │ A1 (CSF)   │ implemented │ compliant  │ 2024-01-15  │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  When you mark A1 as implemented, the crosswalks show you that:       │
│  - B1 (NIST 800-171) is also satisfied                               │
│  - C1 (ISO 27001) is partially satisfied                             │
│  - (800-53) control is partially satisfied                           │
└────────────────────────────────────────────────────────────────────────┘
```

## How a Query Works: Multi-Factor Authentication Example

### Step 1: User implements MFA for NIST CSF

```sql
-- Organization "Acme Corp" implements PR.AA-06
INSERT INTO control_implementations 
VALUES ('acme-corp-id', 'control-A1-id', 'implemented', 'compliant');
```

### Step 2: System checks crosswalks

```sql
-- What else does this satisfy?
SELECT * FROM control_mappings 
WHERE source_control_id = 'control-A1-id' 
   OR target_control_id = 'control-A1-id';
```

**Returns:**
```
source: A1 (CSF PR.AA-06)  → target: B1 (800-171 3.5.3)   [equivalent, 100]
source: A1 (CSF PR.AA-06)  → target: C1 (ISO A.5.17)      [related, 85]
source: A1 (CSF PR.AA-06)  → target: D1 (800-53 AC-17)    [related, 75]
```

### Step 3: Dashboard shows compliance across frameworks

```
┌─────────────────────────────────────────────┐
│  COMPLIANCE DASHBOARD - Acme Corp           │
├─────────────────────────────────────────────┤
│                                             │
│  NIST CSF 2.0:      [▓▓░░░░░░░░] 5/106     │
│  NIST 800-171:      [▓▓░░░░░░░░] 4/110 ✓   │  ← Satisfied via crosswalk!
│  ISO 27001:         [▓░░░░░░░░░] 3/93  ✓   │  ← Satisfied via crosswalk!
│  NIST 800-53:       [▓░░░░░░░░░] 1/90  ✓   │  ← Satisfied via crosswalk!
│  SOC 2:             [▓░░░░░░░░░] 2/32       │
│  AI RMF:            [▓░░░░░░░░░] 1/97       │
│                                             │
│  🎯 By implementing 5 CSF controls, you've  │
│     made progress in 6 frameworks!          │
└─────────────────────────────────────────────┘
```

## Real Data Flow Example

### Scenario: Security audit preparation

**Step 1**: Auditor asks: "Do you have MFA?"

**Traditional GRC Tool Response**:
- Check NIST CSF: ✓ Implemented
- Check ISO 27001: ❌ Not tracked
- Check NIST 800-171: ❌ Not tracked
- Auditor must manually verify each framework

**Your Platform Response** (with crosswalks):
```sql
WITH mfa_implementation AS (
  SELECT * FROM control_implementations ci
  JOIN framework_controls fc ON fc.id = ci.control_id
  WHERE fc.control_id = 'PR.AA-06'
  AND ci.organization_id = 'acme-corp'
)
SELECT 
  f.name as framework,
  fc.control_id,
  CASE 
    WHEN ci.id IS NOT NULL THEN 'Directly Implemented'
    WHEN cm.id IS NOT NULL THEN 'Satisfied via Crosswalk'
    ELSE 'Not Implemented'
  END as status,
  cm.similarity_score as confidence
FROM frameworks f
JOIN framework_controls fc ON fc.framework_id = f.id
LEFT JOIN control_implementations ci ON ci.control_id = fc.id
LEFT JOIN control_mappings cm ON (
  cm.source_control_id IN (SELECT id FROM mfa_implementation)
  AND cm.target_control_id = fc.id
)
WHERE fc.title ILIKE '%multi%factor%'
   OR fc.control_id IN ('3.5.3', 'A.5.17');
```

**Result**:
```
     framework      | control_id |         status          | confidence
--------------------+------------+-------------------------+------------
 NIST CSF 2.0       | PR.AA-06   | Directly Implemented    | 100
 NIST SP 800-171    | 3.5.3      | Satisfied via Crosswalk | 100
 ISO 27001          | A.5.17     | Satisfied via Crosswalk | 85
 NIST SP 800-53     | AC-17      | Satisfied via Crosswalk | 75
```

✅ **Auditor sees**: MFA is implemented and covers 4 frameworks!

## The Business Impact

### Without Crosswalks:
```
Auditor: "Do you have multi-factor authentication?"
You: "Yes, for NIST CSF."
Auditor: "What about ISO 27001?"
You: "Let me check... I don't know."
Auditor: "What about 800-171?"
You: "Let me check... I don't know."

Result: Finding flagged, needs remediation.
Cost: 2-4 hours per control × 100+ controls = 200-400 hours wasted
```

### With Crosswalks:
```
Auditor: "Do you have multi-factor authentication?"
You: "Yes, implemented per NIST CSF PR.AA-06."
System: "This also satisfies:
         - NIST 800-171 3.5.3 (100% equivalent)
         - ISO 27001 A.5.17 (85% coverage)
         - NIST 800-53 AC-17 (75% coverage)"
You: "As you can see, MFA satisfies requirements across 4 frameworks."

Result: Finding closed, auditor impressed.
Cost: 5 minutes per control × 100+ controls = 8-10 hours total
Time saved: 190-390 hours (95%+ reduction!)
```

## Technical Implementation in Your App

When building the UI, you can use this query pattern:

```javascript
// Example: React component showing crosswalk connections
async function getControlCoverage(organizationId, controlId) {
  const query = `
    WITH implemented_control AS (
      SELECT ci.*, fc.framework_id, fc.control_id
      FROM control_implementations ci
      JOIN framework_controls fc ON fc.id = ci.control_id
      WHERE ci.organization_id = $1
      AND fc.id = $2
    ),
    crosswalked_controls AS (
      SELECT 
        fc.framework_id,
        fc.control_id,
        fc.title,
        cm.mapping_type,
        cm.similarity_score
      FROM control_mappings cm
      JOIN framework_controls fc ON (
        fc.id = cm.target_control_id 
        OR fc.id = cm.source_control_id
      )
      WHERE (
        cm.source_control_id = $2 
        OR cm.target_control_id = $2
      )
      AND fc.id != $2
    )
    SELECT * FROM crosswalked_controls;
  `;
  
  return await db.query(query, [organizationId, controlId]);
}
```

This returns all the frameworks satisfied by implementing one control!

---

## Summary: The Magic Explained

1. **You load frameworks** → 6 frameworks, 528 controls in database
2. **You load crosswalks** → 80+ mappings connecting related controls
3. **User implements 1 control** → Database records it
4. **System queries crosswalks** → Finds 3-4 related controls in other frameworks
5. **Dashboard updates** → Shows compliance progress across ALL frameworks
6. **Auditors are impressed** → One implementation satisfies multiple requirements
7. **You save time & money** → 40-60% reduction in compliance effort

**That's how crosswalks work!** 🎯
