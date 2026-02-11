# Cross-Framework Mappings (Crosswalks)

## Overview

The ControlWeave includes comprehensive **cross-framework control mappings** (also called "crosswalks") that show relationships between controls across all 6 major frameworks. This is one of the platform's most powerful features.

## What Are Crosswalks?

Crosswalks are mappings that identify when controls in different frameworks address the same or similar requirements. For example:
- NIST CSF 2.0 "PR.AA-06" (Multi-factor Authentication)
- NIST 800-171 "3.5.3" (Multi-factor Authentication)
- ISO 27001 "A.5.17" (Authentication Information)

These three controls from different frameworks all require multi-factor authentication. By implementing MFA once, you satisfy all three requirements.

## Supported Framework Combinations

The platform includes mappings between:

1. **NIST CSF 2.0 ↔ NIST SP 800-171**
2. **NIST SP 800-171 ↔ NIST SP 800-53**
3. **NIST CSF 2.0 ↔ ISO 27001:2022**
4. **SOC 2 ↔ NIST CSF 2.0**
5. **ISO 27001:2022 ↔ SOC 2**
6. **NIST AI RMF ↔ NIST CSF 2.0**
7. **NIST AI RMF ↔ ISO 27001:2022**

## Mapping Types

Each mapping has a **type** that indicates the relationship strength:

### Equivalent (90-100% similarity)
Controls that address essentially the same requirement.
**Example**: NIST CSF "PR.AA-06" ↔ NIST 800-171 "3.5.3" (both require MFA)
**Business Impact**: Implement once, satisfy both frameworks

### Subset (80-90% similarity)
One control is a simplified version of another.
**Example**: NIST 800-171 "3.1.1" ↔ NIST 800-53 "AC-2" (800-171 derived from 800-53)
**Business Impact**: Implementing the more detailed control satisfies both

### Related (60-80% similarity)
Controls address similar concerns but with different focus.
**Example**: NIST AI RMF "MAP.4.1" ↔ NIST CSF "ID.RA-01" (both about risk identification)
**Business Impact**: Partial overlap, may need separate implementations

### Complementary (<60% similarity)
Controls work together but address different aspects.
**Example**: Encryption + Access Control work together for data protection
**Business Impact**: Both needed, but implementing one helps with the other

## Business Value

### 1. Reduce Compliance Burden
Instead of implementing 500+ controls across 6 frameworks, you might only need to implement 200-250 unique controls due to overlaps.

**Example Savings**:
- NIST CSF: 106 controls
- ISO 27001: 93 controls
- SOC 2: 32 controls
- **Total without mappings**: 231 implementations
- **Total with mappings**: ~140-160 implementations (40% reduction)

### 2. Accelerate Compliance
If you're already ISO 27001 certified and need to add NIST CSF:
- Review existing ISO controls
- Identify which NIST CSF controls are already satisfied
- Only implement net-new controls
- **Time savings**: 40-60% faster compliance

### 3. Evidence Reuse
A single security control implementation can generate evidence for multiple frameworks:
- MFA logs satisfy NIST CSF, NIST 800-171, ISO 27001, and SOC 2
- One audit report covers multiple standards
- Single policy document maps to multiple requirements

### 4. Cost Savings
**Traditional Approach** (without crosswalks):
- ISO 27001 audit: $30k
- SOC 2 audit: $25k  
- NIST assessment: $20k
- **Total: $75k/year**

**With Crosswalks**:
- Integrated audit covering all 3: $40-50k
- Reuse evidence across frameworks
- **Savings: $25-35k/year (33-47%)**

## How Mappings Work in the Platform

### Database Structure
```sql
control_mappings (
    source_control_id UUID,      -- Control in framework A
    target_control_id UUID,      -- Control in framework B
    mapping_type VARCHAR,        -- equivalent, subset, related, complementary
    similarity_score INTEGER,    -- 0-100 (higher = stronger mapping)
    notes TEXT                   -- Explanation of relationship
)
```

### Query Examples

**Find all controls that satisfy multiple frameworks**:
```sql
SELECT 
    fc1.framework_id as framework_a,
    fc1.control_id as control_a,
    fc2.framework_id as framework_b,
    fc2.control_id as control_b,
    cm.mapping_type,
    cm.similarity_score
FROM control_mappings cm
JOIN framework_controls fc1 ON fc1.id = cm.source_control_id
JOIN framework_controls fc2 ON fc2.id = cm.target_control_id
WHERE cm.similarity_score >= 90;  -- Only "equivalent" mappings
```

**Find coverage gaps**:
```sql
-- Controls in ISO 27001 NOT mapped to NIST CSF
SELECT fc.control_id, fc.title
FROM framework_controls fc
WHERE fc.framework_id = (SELECT id FROM frameworks WHERE code = 'iso_27001')
AND fc.id NOT IN (
    SELECT source_control_id FROM control_mappings
    UNION
    SELECT target_control_id FROM control_mappings
);
```

## Key Insights from Mappings

### NIST Family Relationships
- **NIST 800-171** is a **subset** of **NIST 800-53** (110 controls from 1000+)
- **NIST CSF 2.0** maps well to both 800-171 and 800-53 (strategic → technical)
- **NIST AI RMF** complements CSF with AI-specific requirements

### International Standards
- **ISO 27001** has strong mappings to NIST frameworks (~70-80% overlap)
- **SOC 2** common criteria align well with NIST CSF and ISO 27001
- Implementing ISO 27001 gives you 60-70% of NIST CSF coverage

### AI Governance
- **NIST AI RMF** has unique AI-specific controls (bias, explainability, fairness)
- ~40% of AI RMF maps to traditional security frameworks
- ~60% of AI RMF is net-new (AI-specific governance, not covered elsewhere)

## Real-World Use Cases

### Use Case 1: Startup Seeking Multiple Certifications
**Scenario**: SaaS company needs SOC 2 and ISO 27001

**Without Crosswalks**:
1. Implement 32 SOC 2 controls
2. Implement 93 ISO 27001 controls
3. Total: 125 implementations
4. Timeline: 12-18 months
5. Cost: $150k-200k

**With Crosswalks**:
1. Identify 25 overlapping controls (78% of SOC 2)
2. Implement 93 ISO controls (covers most of SOC 2)
3. Add 7 SOC 2-specific controls
4. Total: 100 implementations  
5. Timeline: 8-12 months
6. Cost: $100k-130k
7. **Savings**: 20% implementation reduction, 4-6 months faster, $50-70k saved

### Use Case 2: University Adding Federal Research
**Scenario**: University with existing security program needs NIST 800-171 for DoD contract

**Without Crosswalks**:
- Start from scratch with 110 new controls
- Timeline: 12 months
- Cost: $200k

**With Crosswalks**:
- Review existing controls against 800-171
- Find 60-70 already implemented (ISO 27001 overlap)
- Implement 40-50 net-new controls
- Timeline: 6 months
- Cost: $100k
- **Savings**: 50% faster, $100k saved

### Use Case 3: Federal Contractor Path to FedRAMP
**Scenario**: Company has NIST 800-171, wants FedRAMP (requires 800-53)

**Without Crosswalks**:
- FedRAMP requires 325+ controls (MODERATE baseline)
- Start implementing 800-53 controls independently
- Timeline: 18-24 months
- Cost: $500k-1M

**With Crosswalks**:
- 110 controls from 800-171 map to 800-53
- Already compliant with ~30-40% of requirements
- Focus on 200+ net-new controls
- Timeline: 12-18 months
- Cost: $350k-700k
- **Savings**: 6 months faster, $150-300k saved

## Mapping Metadata

### Similarity Scores
- **100**: Identical requirements (word-for-word match)
- **90-99**: Equivalent (same requirement, different wording)
- **80-89**: Subset/superset (one contains the other)
- **70-79**: Related (similar focus, different details)
- **60-69**: Complementary (work together, different aspects)
- **<60**: Weak relationship (not mapped)

### Mapping Coverage Statistics

**Current Platform Coverage**:
- Total controls across 6 frameworks: ~550
- Total mappings: ~80+ (as of this version)
- Average controls per framework: ~90
- Average mappings per control: 1.5-2

**Expected Final Coverage** (when complete):
- Total mappings: 300-400
- Average mappings per control: 3-4
- Full crosswalk coverage: 80-90%

## Using Mappings in Your Organization

### Step 1: Inventory Current Compliance
```sql
-- What frameworks are we currently working on?
SELECT code, name, status 
FROM organization_frameworks
WHERE organization_id = 'your-org-id';
```

### Step 2: Find Overlap Opportunities
```sql
-- Show me controls we've implemented that satisfy multiple frameworks
SELECT 
    ci.control_id,
    fc.title,
    COUNT(cm.id) as mapped_to_count,
    STRING_AGG(f2.name, ', ') as satisfies_frameworks
FROM control_implementations ci
JOIN framework_controls fc ON fc.id = ci.control_id
JOIN control_mappings cm ON cm.source_control_id = ci.control_id
JOIN framework_controls fc2 ON fc2.id = cm.target_control_id
JOIN frameworks f2 ON f2.id = fc2.framework_id
WHERE ci.organization_id = 'your-org-id'
AND ci.status = 'implemented'
GROUP BY ci.control_id, fc.title
HAVING COUNT(cm.id) > 0
ORDER BY mapped_to_count DESC;
```

### Step 3: Prioritize Gaps
```sql
-- Controls that would satisfy multiple frameworks
SELECT 
    fc.control_id,
    fc.title,
    f.name as framework,
    COUNT(cm.id) as would_satisfy_count
FROM framework_controls fc
JOIN frameworks f ON f.id = fc.framework_id
JOIN control_mappings cm ON (cm.source_control_id = fc.id OR cm.target_control_id = fc.id)
WHERE fc.id NOT IN (
    SELECT control_id FROM control_implementations 
    WHERE organization_id = 'your-org-id' 
    AND status = 'implemented'
)
GROUP BY fc.id, fc.control_id, fc.title, f.name
ORDER BY would_satisfy_count DESC
LIMIT 20;
```

## Roadmap

### Current State (v1.0)
- ✅ 80+ core mappings
- ✅ All 6 frameworks mapped to each other
- ✅ High-value overlaps identified

### Future Enhancements (v2.0)
- [ ] AI-powered mapping suggestions
- [ ] Industry-specific mapping sets (healthcare, finance, etc.)
- [ ] Confidence scores for automated mappings
- [ ] Mapping validation workflows
- [ ] Evidence inheritance rules

### Community Contributions
We welcome contributions to expand mappings:
1. Review proposed mappings
2. Submit new mappings via pull request
3. Validate existing mappings
4. Share your organization's crosswalk experiences

## References

**Official Crosswalk Sources**:
- NIST 800-53 to 800-171: [NIST SP 800-171r2 Appendix D](https://csrc.nist.gov/publications/detail/sp/800-171/rev-2/final)
- NIST CSF to 800-53: [NIST CSF 2.0 Reference Tool](https://csrc.nist.gov/Projects/cybersecurity-framework/Filters#/csf/filters)
- ISO 27001 to NIST: Community-maintained mappings
- SOC 2 to ISO/NIST: AICPA guidance + community mappings

## Questions?

For questions about crosswalks or to contribute new mappings:
- GitHub Issues: [Report mapping gaps or errors]
- Email: Contehconsulting@gmail.com
- Documentation: [Link to full mapping guide]

---

**Note**: Control mappings are guidance, not legal advice. Organizations should work with qualified auditors to determine which controls satisfy their specific compliance requirements.
