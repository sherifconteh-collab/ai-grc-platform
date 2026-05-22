/**
 * CE-MCP Coordinator
 * Main orchestrator for Code Execution MCP security
 * Implements layered defense against MAESTRO framework's 16 attack classes
 */

const crypto = require('crypto');
const StaticCodeValidator = require('./static-validator');
const SemanticGatingEngine = require('./semantic-gate');
const SandboxManager = require('./sandbox-manager');
const ExceptionSanitizer = require('./exception-sanitizer');
const CEMCPAuditLogger = require('./audit-logger');
const aiSecurity = require('../../utils/aiSecurity');

class CEMCPCoordinator {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      staticValidationEnabled: config.staticValidationEnabled !== false,
      semanticGatingEnabled: config.semanticGatingEnabled !== false,
      sandboxType: config.sandboxType || 'docker',
      auditLogEnabled: config.auditLogEnabled !== false,
      rateLimitPerHour: parseInt(config.rateLimitPerHour || '10'),
      rateLimitPerDay: parseInt(config.rateLimitPerDay || '50'),
      ...config
    };

    // Initialize components
    this.staticValidator = new StaticCodeValidator(config);
    this.semanticGate = new SemanticGatingEngine(config);
    this.sandboxManager = new SandboxManager(config);
    this.exceptionSanitizer = new ExceptionSanitizer(config);
    this.auditLogger = new CEMCPAuditLogger(config);

    // Rate limiting state
    this.rateLimitState = new Map(); // userId -> {hourly: [], daily: []}
  }

  /**
   * Execute code with comprehensive security checks
   * @param {Object} params - Execution parameters
   * @returns {Object} Execution result
   */
  async executeCode({ code, language, statedIntent, userContext }) {
    // Check if CE-MCP is enabled
    if (!this.config.enabled) {
      throw new Error('CE-MCP is not enabled');
    }

    // Validate user context
    if (!userContext || !userContext.userId || !userContext.organizationId) {
      throw new Error('Invalid user context');
    }

    // Generate code hash for tracking
    const codeHash = this.generateCodeHash(code);

    try {
      // Log execution request
      this.auditLogger.logExecutionRequest({
        code,
        language,
        statedIntent,
        userId: userContext.userId,
        organizationId: userContext.organizationId,
        codeHash
      });

      // Check rate limits
      const rateLimitCheck = this.checkRateLimit(userContext.userId);
      if (!rateLimitCheck.allowed) {
        throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}`);
      }

      // ── AIDEFEND: Adversarial Input Defense ────────────────────────────
      // Scan statedIntent for prompt injection before semantic gating.
      // Blocks requests where the intent field itself is used to hijack
      // the MCP's semantic gate (AIDEFEND: Adversarial Robustness,
      // OWASP LLM01 - Prompt Injection).
      if (statedIntent) {
        const { text: sanitizedIntent, truncated } = aiSecurity.sanitizeInput(statedIntent);
        // Always normalize statedIntent to the sanitized string so downstream
        // layers (semantic gate etc.) always receive a safe, string value.
        statedIntent = sanitizedIntent;
        if (truncated) {
          console.warn(`[aiSecurity] CE-MCP statedIntent truncated (org=${userContext.organizationId})`);
        }
        const intentScan = aiSecurity.detectPromptInjection(sanitizedIntent);
        if (intentScan.detected) {
          const labels = [...new Set(intentScan.threats.map(t => t.label))].join(', ');
          this.auditLogger.logSuspiciousBehavior({
            sandboxId: 'intent-validation',
            behaviorType: 'prompt_injection',
            description: `Prompt injection detected in statedIntent: ${labels}`,
            severity: 'HIGH',
            userId: userContext.userId,
            organizationId: userContext.organizationId,
            attackClass: 'Prompt Injection (OWASP LLM01 / AIDEFEND)'
          });
          return {
            success: false,
            blocked: true,
            layer: 'aidefend_input_scan',
            reason: 'Adversarial content detected in stated intent',
            threatTypes: labels
          };
        }
      }
      // ───────────────────────────────────────────────────────────────────

      // Layer 1: Static Validation
      const staticResult = await this.performStaticValidation(code, language, userContext, codeHash);
      if (!staticResult.passed) {
        return {
          success: false,
          blocked: true,
          layer: 'static_validation',
          reason: 'Code failed static security validation',
          findings: staticResult.findings,
          risk: staticResult.risk
        };
      }

      // Layer 2: Semantic Gating
      if (this.config.semanticGatingEnabled) {
        const semanticResult = await this.performSemanticGating(code, statedIntent, userContext, language, codeHash);
        if (!semanticResult.passed) {
          return {
            success: false,
            blocked: true,
            layer: 'semantic_gate',
            reason: 'Code failed semantic gating',
            blockedReasons: semanticResult.blockedReasons,
            warnings: semanticResult.warnings
          };
        }
      }

      // Layer 3 & 4: Sandbox Execution with Monitoring
      const executionResult = await this.executeInSandbox(code, language, userContext, codeHash);

      // Record successful execution in rate limit
      this.recordExecution(userContext.userId);

      return executionResult;

    } catch (error) {
      // Sanitize exception
      const sanitizedException = this.exceptionSanitizer.sanitize(error, userContext);

      // Check for authorization corruption
      const isAuthCorruption = this.exceptionSanitizer.detectAuthorizationCorruption(error, userContext);
      if (isAuthCorruption) {
        this.auditLogger.logAuthorizationCorruption({
          sandboxId: 'pre-execution',
          details: sanitizedException.message,
          userId: userContext.userId,
          organizationId: userContext.organizationId
        });
      }

      // Log security exception if applicable
      if (sanitizedException.isSecurityEvent) {
        this.auditLogger.logSecurityException({
          exception: sanitizedException,
          sandboxId: 'unknown',
          userId: userContext.userId,
          organizationId: userContext.organizationId,
          attackClass: 'Various'
        });
      }

      return {
        success: false,
        error: this.exceptionSanitizer.createSafeErrorResponse(error, userContext),
        isSecurityEvent: sanitizedException.isSecurityEvent
      };
    }
  }

  /**
   * Layer 1: Perform static validation
   */
  async performStaticValidation(code, language, userContext, codeHash) {
    const result = this.staticValidator.validate(code, language);

    // Log validation result
    this.auditLogger.logStaticValidation({
      passed: result.passed,
      risk: result.risk,
      findings: result.findings,
      userId: userContext.userId,
      organizationId: userContext.organizationId,
      codeHash
    });

    return result;
  }

  /**
   * Layer 2: Perform semantic gating
   */
  async performSemanticGating(code, statedIntent, userContext, language, codeHash) {
    const result = await this.semanticGate.analyze({
      code,
      statedIntent,
      userContext,
      language
    });

    // Log gate result
    this.auditLogger.logSemanticGate({
      passed: result.passed,
      gates: result.gates,
      warnings: result.warnings,
      blockedReasons: result.blockedReasons,
      userId: userContext.userId,
      organizationId: userContext.organizationId,
      codeHash
    });

    return result;
  }

  /**
   * Layer 3 & 4: Execute in sandbox with monitoring
   */
  async executeInSandbox(code, language, userContext, codeHash) {
    // Create sandbox
    const sandboxId = `sandbox_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    this.auditLogger.logSandboxCreated({
      sandboxId,
      language,
      userId: userContext.userId,
      organizationId: userContext.organizationId
    });

    // Log execution started
    this.auditLogger.logExecutionStarted({
      sandboxId,
      userId: userContext.userId,
      organizationId: userContext.organizationId,
      codeHash
    });

    try {
      // Execute in sandbox
      const result = await this.sandboxManager.execute({
        code,
        language,
        userId: userContext.userId,
        organizationId: userContext.organizationId
      });

      // Sanitize output
      const sanitizedOutput = this.sanitizeOutput(result.output);
      const sanitizedErrors = this.sanitizeOutput(result.errors);

      // Log completion
      this.auditLogger.logExecutionCompleted({
        sandboxId: result.sandboxId || sandboxId,
        success: result.success,
        executionTime: result.executionTime,
        exitCode: result.exitCode,
        outputSize: sanitizedOutput.length + sanitizedErrors.length,
        userId: userContext.userId,
        organizationId: userContext.organizationId,
        codeHash
      });

      return {
        success: result.success,
        output: sanitizedOutput,
        errors: sanitizedErrors,
        executionTime: result.executionTime,
        exitCode: result.exitCode,
        sandboxId: result.sandboxId || sandboxId
      };

    } catch (error) {
      // Log execution failure
      this.auditLogger.logExecutionCompleted({
        sandboxId,
        success: false,
        executionTime: 0,
        exitCode: -1,
        outputSize: 0,
        userId: userContext.userId,
        organizationId: userContext.organizationId,
        codeHash
      });

      throw error;
    }
  }

  /**
   * Sanitize output for sensitive data
   */
  sanitizeOutput(output) {
    if (!output) return '';

    let sanitized = output;
    const filteredFields = [];

    // Remove sensitive patterns
    const sensitivePatterns = [
      { pattern: /password[:\s=]+[^\s]+/gi, field: 'password' },
      { pattern: /api[_-]?key[:\s=]+[^\s]+/gi, field: 'api_key' },
      { pattern: /secret[:\s=]+[^\s]+/gi, field: 'secret' },
      { pattern: /token[:\s=]+[^\s]+/gi, field: 'token' },
      { pattern: /[0-9]{3}-[0-9]{2}-[0-9]{4}/g, field: 'ssn' },
      { pattern: /[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}/g, field: 'credit_card' }
    ];

    for (const { pattern, field } of sensitivePatterns) {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, `***${field.toUpperCase()}***`);
        filteredFields.push(field);
      }
    }

    // Log if any fields were filtered
    if (filteredFields.length > 0) {
      // Would log to audit logger in production
      console.log(`[CEMCP] Sanitized output: filtered ${filteredFields.join(', ')}`);
    }

    return sanitized;
  }

  /**
   * Check rate limits
   */
  checkRateLimit(userId) {
    const now = Date.now();
    const hourAgo = now - 3600000; // 1 hour
    const dayAgo = now - 86400000; // 24 hours

    if (!this.rateLimitState.has(userId)) {
      this.rateLimitState.set(userId, { hourly: [], daily: [] });
    }

    const userLimits = this.rateLimitState.get(userId);

    // Clean old entries
    userLimits.hourly = userLimits.hourly.filter(ts => ts > hourAgo);
    userLimits.daily = userLimits.daily.filter(ts => ts > dayAgo);

    // Check limits
    if (userLimits.hourly.length >= this.config.rateLimitPerHour) {
      return {
        allowed: false,
        reason: `Hourly limit of ${this.config.rateLimitPerHour} executions exceeded`
      };
    }

    if (userLimits.daily.length >= this.config.rateLimitPerDay) {
      return {
        allowed: false,
        reason: `Daily limit of ${this.config.rateLimitPerDay} executions exceeded`
      };
    }

    return { allowed: true };
  }

  /**
   * Record execution for rate limiting
   */
  recordExecution(userId) {
    const now = Date.now();
    const userLimits = this.rateLimitState.get(userId);
    
    if (userLimits) {
      userLimits.hourly.push(now);
      userLimits.daily.push(now);
    }
  }

  /**
   * Generate code hash for tracking
   */
  generateCodeHash(code) {
    return crypto.createHash('sha256').update(code).digest('hex').substring(0, 16);
  }

  /**
   * Check if Docker is available
   */
  async checkSystemRequirements() {
    const dockerAvailable = await this.sandboxManager.checkDockerAvailable();
    const imageAvailable = await this.sandboxManager.validateSandboxImage();

    return {
      dockerAvailable,
      imageAvailable,
      ready: dockerAvailable && imageAvailable
    };
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      staticValidationEnabled: this.config.staticValidationEnabled,
      semanticGatingEnabled: this.config.semanticGatingEnabled,
      sandboxType: this.config.sandboxType,
      activeSandboxes: this.sandboxManager.getActiveSandboxCount(),
      rateLimits: {
        perHour: this.config.rateLimitPerHour,
        perDay: this.config.rateLimitPerDay
      }
    };
  }

  /**
   * Emergency shutdown - kill all sandboxes
   */
  async emergencyShutdown() {
    await this.sandboxManager.killAllSandboxes();
    this.rateLimitState.clear();
  }
}

module.exports = CEMCPCoordinator;
