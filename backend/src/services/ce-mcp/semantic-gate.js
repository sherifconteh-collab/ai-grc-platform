/**
 * Semantic Gating Engine for CE-MCP
 * Validates that generated code matches stated intent and follows security policies
 * Based on MAESTRO framework semantic analysis
 */

class SemanticGatingEngine {
  constructor(config = {}) {
    this.config = {
      intentSimilarityThreshold: parseFloat(config.intentSimilarityThreshold || '0.7'),
      maxDataAccessScope: config.maxDataAccessScope || 'organization',
      requireExplicitPermissions: config.requireExplicitPermissions !== false,
      ...config
    };
  }

  /**
   * Perform semantic gating analysis
   * @param {Object} params - Analysis parameters
   * @param {string} params.code - Generated code
   * @param {string} params.statedIntent - User's stated intent/purpose
   * @param {Object} params.userContext - User permissions and context
   * @param {string} params.language - Programming language
   * @returns {Object} Gate result with pass/fail and reasons
   */
  async analyze({ code, statedIntent, userContext, language = 'javascript' }) {
    const results = {
      passed: true,
      gates: [],
      warnings: [],
      blockedReasons: []
    };

    // Gate 1: Intent Alignment
    const intentResult = await this.checkIntentAlignment(code, statedIntent, language);
    results.gates.push(intentResult);
    if (!intentResult.passed) {
      results.passed = false;
      results.blockedReasons.push(`Intent alignment failed: ${intentResult.reason}`);
    }

    // Gate 2: Permission Boundary
    const permissionResult = this.checkPermissionBoundary(code, userContext, language);
    results.gates.push(permissionResult);
    if (!permissionResult.passed) {
      results.passed = false;
      results.blockedReasons.push(`Permission boundary violated: ${permissionResult.reason}`);
    }

    // Gate 3: Data Access Pattern
    const dataAccessResult = this.checkDataAccessPattern(code, userContext, language);
    results.gates.push(dataAccessResult);
    if (!dataAccessResult.passed) {
      results.passed = false;
      results.blockedReasons.push(`Data access pattern invalid: ${dataAccessResult.reason}`);
    }

    // Gate 4: Resource Estimation
    const resourceResult = this.estimateResources(code, language);
    results.gates.push(resourceResult);
    if (!resourceResult.passed) {
      results.passed = false;
      results.blockedReasons.push(`Resource requirements exceeded: ${resourceResult.reason}`);
    }

    // Add warnings even if passed
    if (intentResult.confidence < 0.85) {
      results.warnings.push('Intent alignment confidence is moderate');
    }
    
    if (resourceResult.estimatedCpu > 20) {
      results.warnings.push('High CPU usage estimated');
    }

    return results;
  }

  /**
   * Gate 1: Check if code aligns with stated intent
   * Uses keyword matching and heuristics (simplified version)
   * In production, this would use LLM-based semantic similarity
   */
  async checkIntentAlignment(code, statedIntent, language) {
    const result = {
      gate: 'intent_alignment',
      passed: true,
      confidence: 1.0,
      reason: ''
    };

    if (!statedIntent || statedIntent.trim().length === 0) {
      result.passed = false;
      result.confidence = 0;
      result.reason = 'No stated intent provided';
      return result;
    }

    // Extract key intent words
    const intentKeywords = this.extractKeywords(statedIntent.toLowerCase());
    const codeKeywords = this.extractKeywords(code.toLowerCase());

    // Check for keyword overlap (simplified semantic similarity)
    const overlap = intentKeywords.filter(kw => codeKeywords.includes(kw));
    const similarity = overlap.length / Math.max(intentKeywords.length, 1);

    result.confidence = similarity;

    if (similarity < this.config.intentSimilarityThreshold) {
      result.passed = false;
      result.reason = `Code does not match stated intent (similarity: ${(similarity * 100).toFixed(1)}%)`;
    } else {
      result.reason = `Code matches intent (similarity: ${(similarity * 100).toFixed(1)}%)`;
    }

    // Check for suspicious mismatches
    if (statedIntent.toLowerCase().includes('read') && 
        (code.includes('write') || code.includes('delete') || code.includes('update'))) {
      result.passed = false;
      result.reason = 'Intent says "read" but code performs write operations';
    }

    if (statedIntent.toLowerCase().includes('local') && 
        (code.includes('http') || code.includes('fetch') || code.includes('socket'))) {
      result.passed = false;
      result.reason = 'Intent says "local" but code performs network operations';
    }

    return result;
  }

  /**
   * Gate 2: Check permission boundaries
   * Validates that code only accesses resources user has permission for
   */
  checkPermissionBoundary(code, userContext, language) {
    const result = {
      gate: 'permission_boundary',
      passed: true,
      violations: [],
      reason: ''
    };

    if (!userContext || !userContext.role) {
      result.passed = false;
      result.reason = 'No user context provided';
      return result;
    }

    // Check for admin-only operations
    const adminOperations = [
      'delete.*users',
      'drop.*table',
      'truncate',
      'grant',
      'revoke',
      'alter.*table'
    ];

    if (userContext.role !== 'admin' && userContext.role !== 'platform_admin') {
      for (const op of adminOperations) {
        const regex = new RegExp(op, 'i');
        if (regex.test(code)) {
          result.violations.push(`Non-admin user attempting admin operation: ${op}`);
          result.passed = false;
        }
      }
    }

    // Check for cross-organization access
    if (userContext && userContext.organization_id) {
      const userOrgId = String(userContext.organization_id);
      const orgIdLiterals = [];

      // Match patterns like: organization_id = 'org-123' or organization_id="org-123"
      const equalityPattern = /organization_id\s*=\s*(['"])(.*?)\1/gi;
      let match;
      while ((match = equalityPattern.exec(code)) !== null) {
        if (match[2]) {
          orgIdLiterals.push(match[2]);
        }
      }

      // Match patterns like: organization_id IN ('org-1','org-2')
      const inPattern = /organization_id\s+IN\s*\(([^)]+)\)/gi;
      while ((match = inPattern.exec(code)) !== null) {
        const listContent = match[1];
        if (listContent) {
          const values = listContent.split(',').map(v =>
            v.trim().replace(/^['"]|['"]$/g, '')
          );
          for (const val of values) {
            if (val) {
              orgIdLiterals.push(val);
            }
          }
        }
      }

      const hasLiterals = orgIdLiterals.length > 0;
      const hasForeignOrg = orgIdLiterals.some(id => id && id !== userOrgId);

      if (hasLiterals && hasForeignOrg) {
        result.violations.push('Potential cross-organization access detected');
        result.passed = false;
      }
    }

    // Check for permission escalation attempts
    if (code.match(/role\s*=\s*['"]admin['"]/) || 
        code.match(/is_admin\s*=\s*true/i) ||
        code.match(/permissions.*\+\+/)) {
      result.violations.push('Permission escalation attempt detected');
      result.passed = false;
    }

    if (result.violations.length > 0) {
      result.reason = result.violations.join('; ');
    } else {
      result.reason = 'Permission boundaries respected';
    }

    return result;
  }

  /**
   * Gate 3: Validate data access patterns
   * Ensures data access follows expected patterns and scope
   */
  checkDataAccessPattern(code, userContext, language) {
    const result = {
      gate: 'data_access_pattern',
      passed: true,
      issues: [],
      reason: ''
    };

    // Check for bulk data extraction
    const bulkPatterns = [
      /select\s+\*\s+from.*without.*where/i,
      /find\(\{\}\)/,
      /findAll\(\)/,
      /\.scan\(\)/,
      /SELECT.*FROM.*(?!WHERE)/i
    ];

    for (const pattern of bulkPatterns) {
      if (pattern.test(code)) {
        result.issues.push('Bulk data extraction without filtering detected');
        result.passed = false;
        break;
      }
    }

    // Check for PII access without proper handling
    const piiFields = ['ssn', 'social_security', 'credit_card', 'password', 'secret'];
    for (const field of piiFields) {
      const regex = new RegExp(`\\b${field}\\b`, 'i');
      if (regex.test(code) && !code.includes('encrypt') && !code.includes('hash') && !code.includes('redact')) {
        result.issues.push(`PII field '${field}' accessed without proper sanitization`);
        result.passed = false;
      }
    }

    // Check for data exfiltration patterns (Attack Class #11, #12, #13)
    const exfiltrationPatterns = [
      /console\.log.*password/i,
      /console\.log.*secret/i,
      /console\.log.*token/i,
      /logger.*password/i,
      /print.*password/i,
      /return.*password/i
    ];

    for (const pattern of exfiltrationPatterns) {
      if (pattern.test(code)) {
        result.issues.push('Potential data exfiltration through logging/output');
        result.passed = false;
        break;
      }
    }

    if (result.issues.length > 0) {
      result.reason = result.issues.join('; ');
    } else {
      result.reason = 'Data access patterns are valid';
    }

    return result;
  }

  /**
   * Gate 4: Estimate resource requirements
   * Predicts CPU, memory, and time requirements
   */
  estimateResources(code, language) {
    const result = {
      gate: 'resource_estimation',
      passed: true,
      estimatedCpu: 0,
      estimatedMemory: 0,
      estimatedTime: 0,
      reason: ''
    };

    const lines = code.split('\n').length;
    
    // Estimate CPU usage based on code patterns
    const loopCount = (code.match(/for\s*\(/g) || []).length + 
                      (code.match(/while\s*\(/g) || []).length;
    const recursionCount = (code.match(/function.*\{[\s\S]*?\1\(/g) || []).length;
    
    result.estimatedCpu = lines * 0.1 + loopCount * 5 + recursionCount * 10;

    // Estimate memory usage
    const arrayAllocations = (code.match(/new Array\(/g) || []).length;
    const objectCreations = (code.match(/\{\s*[a-zA-Z]/g) || []).length;
    
    result.estimatedMemory = lines * 1 + arrayAllocations * 10 + objectCreations * 2;

    // Estimate time (seconds)
    result.estimatedTime = Math.max(1, Math.ceil(result.estimatedCpu / 10));

    // Check limits
    const limits = {
      maxCpu: 50,      // Arbitrary units
      maxMemory: 200,  // Arbitrary units
      maxTime: 30      // Seconds
    };

    const violations = [];

    if (result.estimatedCpu > limits.maxCpu) {
      violations.push(`Estimated CPU (${result.estimatedCpu.toFixed(1)}) exceeds limit (${limits.maxCpu})`);
      result.passed = false;
    }

    if (result.estimatedMemory > limits.maxMemory) {
      violations.push(`Estimated memory (${result.estimatedMemory.toFixed(1)}) exceeds limit (${limits.maxMemory})`);
      result.passed = false;
    }

    if (result.estimatedTime > limits.maxTime) {
      violations.push(`Estimated time (${result.estimatedTime}s) exceeds limit (${limits.maxTime}s)`);
      result.passed = false;
    }

    // Check for infinite loops (heuristic)
    if (code.match(/while\s*\(\s*true\s*\)/) || code.match(/for\s*\(\s*;\s*;\s*\)/)) {
      violations.push('Potential infinite loop detected');
      result.passed = false;
    }

    if (violations.length > 0) {
      result.reason = violations.join('; ');
    } else {
      result.reason = `Resources within limits (CPU: ${result.estimatedCpu.toFixed(1)}, Memory: ${result.estimatedMemory.toFixed(1)}, Time: ${result.estimatedTime}s)`;
    }

    return result;
  }

  /**
   * Extract keywords from text (simplified NLP)
   */
  extractKeywords(text) {
    // Remove common stop words
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
      'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'will', 'with'
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }
}

module.exports = SemanticGatingEngine;
