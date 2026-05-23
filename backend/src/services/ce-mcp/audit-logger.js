/**
 * CE-MCP Audit Logger
 * Comprehensive audit logging for code execution events
 * Supports compliance with AU-2, AU-3, AU-12 requirements
 */

class CEMCPAuditLogger {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      logToConsole: config.logToConsole !== false,
      logToFile: config.logToFile === true,
      logPath: config.logPath || '/var/log/controlweave/ce-mcp-audit.log',
      includeCodeHashes: config.includeCodeHashes !== false,
      redactSensitiveData: config.redactSensitiveData !== false,
      ...config
    };
  }

  /**
   * Log code execution request
   */
  logExecutionRequest({ code, language, statedIntent, userId, organizationId, codeHash }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'code_execution_requested',
      userId,
      organizationId,
      language,
      statedIntent: this.sanitizeIntent(statedIntent),
      codeSize: code.length,
      codeHash: this.config.includeCodeHashes ? codeHash : undefined,
      codeSnippet: this.getCodeSnippet(code, 100)
    };

    this.writeLog(logEntry);
  }

  /**
   * Log static validation result
   */
  logStaticValidation({ passed, risk, findings, userId, organizationId, codeHash }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: passed ? 'static_validation_passed' : 'static_validation_failed',
      severity: passed ? 'INFO' : 'WARNING',
      userId,
      organizationId,
      codeHash,
      risk,
      findingsCount: findings.length,
      criticalFindings: findings.filter(f => f.severity === 'CRITICAL').length,
      highFindings: findings.filter(f => f.severity === 'HIGH').length,
      findings: findings.map(f => ({
        severity: f.severity,
        category: f.category,
        message: f.message,
        line: f.line,
        attackClass: f.attackClass
      }))
    };

    this.writeLog(logEntry);
  }

  /**
   * Log semantic gate result
   */
  logSemanticGate({ passed, gates, warnings, blockedReasons, userId, organizationId, codeHash }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: passed ? 'semantic_gate_passed' : 'semantic_gate_failed',
      severity: passed ? 'INFO' : 'WARNING',
      userId,
      organizationId,
      codeHash,
      gates: gates.map(g => ({
        gate: g.gate,
        passed: g.passed,
        reason: g.reason
      })),
      warnings: warnings,
      blockedReasons: blockedReasons
    };

    this.writeLog(logEntry);
  }

  /**
   * Log sandbox creation
   */
  logSandboxCreated({ sandboxId, language, userId, organizationId }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'sandbox_created',
      sandboxId,
      language,
      userId,
      organizationId
    };

    this.writeLog(logEntry);
  }

  /**
   * Log execution start
   */
  logExecutionStarted({ sandboxId, userId, organizationId, codeHash }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'execution_started',
      sandboxId,
      userId,
      organizationId,
      codeHash
    };

    this.writeLog(logEntry);
  }

  /**
   * Log execution completion
   */
  logExecutionCompleted({ sandboxId, success, executionTime, exitCode, outputSize, userId, organizationId, codeHash }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: success ? 'execution_completed' : 'execution_failed',
      severity: success ? 'INFO' : 'WARNING',
      sandboxId,
      userId,
      organizationId,
      codeHash,
      executionTime,
      exitCode,
      outputSize
    };

    this.writeLog(logEntry);
  }

  /**
   * Log resource limit exceeded
   */
  logResourceLimitExceeded({ sandboxId, limitType, value, limit, userId, organizationId }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'resource_limit_exceeded',
      severity: 'WARNING',
      sandboxId,
      userId,
      organizationId,
      limitType,
      value,
      limit,
      attackClass: 'Resource Exhaustion (#8, #9, #10)'
    };

    this.writeLog(logEntry);
  }

  /**
   * Log suspicious behavior
   */
  logSuspiciousBehavior({ sandboxId, behaviorType, description, severity, userId, organizationId, attackClass }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'suspicious_behavior_detected',
      severity: severity || 'HIGH',
      sandboxId,
      userId,
      organizationId,
      behaviorType,
      description,
      attackClass
    };

    this.writeLog(logEntry);
  }

  /**
   * Log output sanitization
   */
  logOutputSanitized({ sandboxId, filteredFields, redactedCount, userId, organizationId }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'output_sanitized',
      sandboxId,
      userId,
      organizationId,
      filteredFields,
      redactedCount
    };

    this.writeLog(logEntry);
  }

  /**
   * Log security exception
   */
  logSecurityException({ exception, sandboxId, userId, organizationId, attackClass }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'security_exception',
      severity: 'CRITICAL',
      sandboxId,
      userId,
      organizationId,
      exceptionType: exception.type,
      message: exception.message,
      attackClass
    };

    this.writeLog(logEntry);
  }

  /**
   * Log authorization state corruption attempt
   */
  logAuthorizationCorruption({ sandboxId, details, userId, organizationId }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'authorization_state_corruption_attempt',
      severity: 'CRITICAL',
      sandboxId,
      userId,
      organizationId,
      details,
      attackClass: 'Authorization State Corruption (#5)'
    };

    this.writeLog(logEntry);
  }

  /**
   * Log sandbox escape attempt
   */
  logSandboxEscapeAttempt({ sandboxId, escapeType, details, userId, organizationId }) {
    if (!this.config.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'sandbox_escape_attempt',
      severity: 'CRITICAL',
      sandboxId,
      userId,
      organizationId,
      escapeType,
      details,
      attackClass: 'Sandbox Escape (#14, #15, #16)'
    };

    this.writeLog(logEntry);
  }

  /**
   * Write log entry
   */
  writeLog(logEntry) {
    const logString = JSON.stringify(logEntry);

    if (this.config.logToConsole) {
      console.error(`[CEMCP AUDIT] ${logString}`);
    }

    if (this.config.logToFile) {
      // In production, this would write to a file
      // For now, we'll use console as well
      console.error(`[CEMCP AUDIT FILE] ${logString}`);
    }
  }

  /**
   * Sanitize intent text for logging
   */
  sanitizeIntent(intent) {
    if (!intent) return '';
    
    // Remove potentially sensitive information
    let sanitized = intent;
    
    if (this.config.redactSensitiveData) {
      sanitized = sanitized.replace(/password[:\s=]+[^\s]+/gi, 'password=***');
      sanitized = sanitized.replace(/api[_-]?key[:\s=]+[^\s]+/gi, 'api_key=***');
      sanitized = sanitized.replace(/token[:\s=]+[^\s]+/gi, 'token=***');
    }
    
    // Truncate if too long
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200) + '...';
    }
    
    return sanitized;
  }

  /**
   * Get code snippet for logging
   */
  getCodeSnippet(code, maxLength = 100) {
    if (!code) return '';
    
    // Remove sensitive patterns before logging
    let snippet = code;
    
    if (this.config.redactSensitiveData) {
      snippet = snippet.replace(/password[:\s=]+[^\s]+/gi, 'password=***');
      snippet = snippet.replace(/api[_-]?key[:\s=]+[^\s]+/gi, 'api_key=***');
      snippet = snippet.replace(/token[:\s=]+[^\s]+/gi, 'token=***');
    }
    
    // Truncate
    if (snippet.length > maxLength) {
      snippet = snippet.substring(0, maxLength) + '...';
    }
    
    // Remove newlines for cleaner logging
    snippet = snippet.replace(/\n/g, ' ');
    
    return snippet;
  }

  /**
   * Get audit log statistics
   */
  getStatistics(timeRange = '24h') {
    // This would query the audit logs
    // For now, return placeholder
    return {
      timeRange,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      staticValidationFailures: 0,
      semanticGateFailures: 0,
      resourceLimitViolations: 0,
      suspiciousBehaviors: 0,
      securityExceptions: 0,
      sandboxEscapeAttempts: 0
    };
  }
}

module.exports = CEMCPAuditLogger;
