/**
 * Exception Sanitizer for CE-MCP
 * Prevents exception-mediated code injection (MAESTRO Attack Class #1)
 * Sanitizes exception messages to prevent information leakage and injection attacks
 */

class ExceptionSanitizer {
  constructor(config = {}) {
    this.config = {
      removeStackTraces: config.removeStackTraces !== false,
      redactPaths: config.redactPaths !== false,
      redactCredentials: config.redactCredentials !== false,
      maxMessageLength: parseInt(config.maxMessageLength || '500'),
      verboseMode: config.verboseMode === true,
      ...config
    };

    // Patterns to detect and remove from exceptions
    this.sensitivePatterns = [
      // Credentials and secrets
      { pattern: /password[:\s=]+[^\s]+/gi, replacement: 'password=***REDACTED***' },
      { pattern: /api[_-]?key[:\s=]+[^\s]+/gi, replacement: 'api_key=***REDACTED***' },
      { pattern: /secret[:\s=]+[^\s]+/gi, replacement: 'secret=***REDACTED***' },
      { pattern: /token[:\s=]+[^\s]+/gi, replacement: 'token=***REDACTED***' },
      
      // Database connection strings
      { pattern: /postgres:\/\/[^\s]+/gi, replacement: 'postgres://***REDACTED***' },
      { pattern: /mysql:\/\/[^\s]+/gi, replacement: 'mysql://***REDACTED***' },
      { pattern: /mongodb:\/\/[^\s]+/gi, replacement: 'mongodb://***REDACTED***' },
      
      // File paths (security concern - file system escape)
      { pattern: /\/home\/[^\s]+/g, replacement: '/***REDACTED***' },
      { pattern: /\/etc\/[^\s]+/g, replacement: '/***REDACTED***' },
      { pattern: /\/var\/[^\s]+/g, replacement: '/***REDACTED***' },
      { pattern: /C:\\[^\s]+/g, replacement: 'C:\\***REDACTED***' },
      
      // SQL injection patterns
      { pattern: /DROP\s+TABLE/gi, replacement: '***REDACTED SQL***' },
      { pattern: /DELETE\s+FROM/gi, replacement: '***REDACTED SQL***' },
      { pattern: /TRUNCATE/gi, replacement: '***REDACTED SQL***' },
      
      // Code injection patterns
      { pattern: /eval\([^\)]+\)/gi, replacement: '***REDACTED CODE***' },
      { pattern: /exec\([^\)]+\)/gi, replacement: '***REDACTED CODE***' },
      { pattern: /__import__\([^\)]+\)/gi, replacement: '***REDACTED CODE***' },
      
      // IP addresses (information disclosure)
      { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '***REDACTED IP***' },
      
      // UUIDs and IDs (information disclosure)
      { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: '***REDACTED UUID***' }
    ];

    // Dangerous exception types that indicate attacks
    this.dangerousExceptionTypes = [
      'SecurityError',
      'PermissionDenied',
      'AccessDenied',
      'Unauthorized',
      'AuthenticationError',
      'SQLInjectionError',
      'CodeInjectionError'
    ];
  }

  /**
   * Sanitize exception message and stack trace
   * @param {Error} exception - The exception object
   * @param {Object} context - Execution context
   * @returns {Object} Sanitized exception information
   */
  sanitize(exception, context = {}) {
    // Extract exception info
    const exceptionInfo = {
      type: exception.name || 'Error',
      message: exception.message || 'Unknown error',
      stack: exception.stack || '',
      code: exception.code || null,
      originalMessage: exception.message // Keep for logging
    };

    // Check if this is a dangerous exception type
    const isDangerous = this.isDangerousException(exceptionInfo.type);

    // Sanitize message
    let sanitizedMessage = this.sanitizeMessage(exceptionInfo.message);

    // Truncate if too long
    if (sanitizedMessage.length > this.config.maxMessageLength) {
      sanitizedMessage = sanitizedMessage.substring(0, this.config.maxMessageLength) + '... (truncated)';
    }

    // Sanitize stack trace
    let sanitizedStack = '';
    if (this.config.verboseMode && !this.config.removeStackTraces) {
      sanitizedStack = this.sanitizeStackTrace(exceptionInfo.stack);
    }

    // Determine if exception should be logged as security event
    const isSecurityEvent = isDangerous || this.containsSuspiciousPatterns(exceptionInfo.message);

    return {
      type: exceptionInfo.type,
      message: sanitizedMessage,
      stack: sanitizedStack,
      code: exceptionInfo.code,
      isSecurityEvent,
      isDangerous,
      timestamp: new Date().toISOString(),
      context: {
        userId: context.userId || 'unknown',
        organizationId: context.organizationId || 'unknown',
        sandboxId: context.sandboxId || 'unknown'
      }
    };
  }

  /**
   * Sanitize exception message
   */
  sanitizeMessage(message) {
    if (!message) return 'An error occurred';

    let sanitized = message;

    // Apply all sensitive pattern replacements
    for (const { pattern, replacement } of this.sensitivePatterns) {
      sanitized = sanitized.replace(pattern, replacement);
    }

    // Remove control characters (potential injection vector)
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

    // Remove potentially dangerous characters
    sanitized = sanitized.replace(/[<>]/g, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  /**
   * Sanitize stack trace
   */
  sanitizeStackTrace(stack) {
    if (!stack) return '';

    let sanitized = stack;

    // Redact file paths if configured
    if (this.config.redactPaths) {
      sanitized = sanitized.replace(/\/[^\s:]+/g, '/***REDACTED***');
      sanitized = sanitized.replace(/C:\\[^\s:]+/g, 'C:\\***REDACTED***');
    }

    // Remove absolute paths, keep relative info
    sanitized = sanitized.replace(/at\s+[^\s]+\s+\(([^)]+)\)/g, (match, location) => {
      const fileName = location.split('/').pop();
      return `at ***REDACTED*** (${fileName})`;
    });

    // Limit stack trace length
    const lines = sanitized.split('\n');
    if (lines.length > 10) {
      sanitized = lines.slice(0, 10).join('\n') + '\n... (stack trace truncated)';
    }

    return sanitized;
  }

  /**
   * Check if exception type is dangerous
   */
  isDangerousException(exceptionType) {
    return this.dangerousExceptionTypes.some(dangerous => 
      exceptionType.toLowerCase().includes(dangerous.toLowerCase())
    );
  }

  /**
   * Check if message contains suspicious patterns
   */
  containsSuspiciousPatterns(message) {
    if (!message) return false;

    const suspiciousPatterns = [
      /DROP\s+TABLE/i,
      /DELETE\s+FROM/i,
      /TRUNCATE/i,
      /\beval\s*\(/i,
      /\bexec\s*\(/i,
      /__import__/i,
      /\.\.\//,  // Path traversal
      /\/etc\/passwd/i,
      /\/etc\/shadow/i,
      /password\s*=/i,
      /api_key\s*=/i,
      /token\s*=/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Create safe error response for API
   */
  createSafeErrorResponse(exception, context = {}) {
    const sanitized = this.sanitize(exception, context);

    // In production, return minimal information
    if (!this.config.verboseMode) {
      return {
        error: 'An error occurred during code execution',
        type: 'ExecutionError',
        timestamp: sanitized.timestamp
      };
    }

    // In development, return sanitized details
    return {
      error: sanitized.message,
      type: sanitized.type,
      code: sanitized.code,
      timestamp: sanitized.timestamp,
      ...(sanitized.stack && { stack: sanitized.stack })
    };
  }

  /**
   * Log exception for security monitoring
   */
  logSecurityEvent(exception, context = {}) {
    const sanitized = this.sanitize(exception, context);

    if (sanitized.isSecurityEvent) {
      // This would integrate with your audit logging system
      const logEntry = {
        event: 'security_exception',
        severity: sanitized.isDangerous ? 'CRITICAL' : 'HIGH',
        exception_type: sanitized.type,
        message: sanitized.message,
        original_message: exception.message, // Keep for forensics
        context: sanitized.context,
        timestamp: sanitized.timestamp
      };

      console.error('[CEMCP SECURITY]', JSON.stringify(logEntry));
      return logEntry;
    }

    return null;
  }

  /**
   * Detect authorization state corruption attempts (MAESTRO Attack Class #5)
   */
  detectAuthorizationCorruption(exception, userContext) {
    if (!exception || !exception.message) return false;

    const corruptionPatterns = [
      /role\s*=\s*['"]admin['"]/i,
      /is_admin\s*=\s*true/i,
      /permission.*escalat/i,
      /privilege.*elevat/i,
      /token.*modif/i,
      /authentication.*bypass/i
    ];

    const messageContainsPattern = corruptionPatterns.some(pattern => 
      pattern.test(exception.message)
    );

    if (messageContainsPattern) {
      this.logSecurityEvent(new Error('Authorization state corruption attempt detected'), {
        ...userContext,
        attackClass: 'Authorization State Corruption (#5)',
        severity: 'CRITICAL'
      });
      return true;
    }

    return false;
  }
}

module.exports = ExceptionSanitizer;
