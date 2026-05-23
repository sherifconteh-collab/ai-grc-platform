/**
 * CE-MCP Security Module Entry Point
 * Exports all CE-MCP security components
 */

const CEMCPCoordinator = require('./coordinator');
const StaticCodeValidator = require('./static-validator');
const SemanticGatingEngine = require('./semantic-gate');
const SandboxManager = require('./sandbox-manager');
const ExceptionSanitizer = require('./exception-sanitizer');
const CEMCPAuditLogger = require('./audit-logger');

module.exports = {
  CEMCPCoordinator,
  StaticCodeValidator,
  SemanticGatingEngine,
  SandboxManager,
  ExceptionSanitizer,
  CEMCPAuditLogger
};
