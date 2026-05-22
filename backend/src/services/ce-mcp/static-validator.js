/**
 * Static Code Validator for CE-MCP
 * Performs pre-execution static analysis to detect dangerous patterns
 * Based on MAESTRO framework security guidelines
 */

const esprima = require('esprima');

/**
 * Dangerous patterns to detect in code
 */
const DANGEROUS_PATTERNS = {
  // Subprocess execution (Attack Class #14)
  subprocess: [
    /require\(['"]child_process['"]\)/,
    /import.*child_process/,
    /subprocess\./,
    /os\.system/,
    /\bexec\(/,
    /\bspawn\(/,
    /\bfork\(/,
    /\bexecFile\(/,
    /\bexecSync\(/
  ],
  
  // Dynamic code execution (Attack Classes #1, #2)
  eval: [
    /\beval\(/,
    /Function\(['"].*['"]\)/,
    /new Function\(/,
    /\bexec\(/,
    /__import__\(/,
    /importlib\.import_module/
  ],
  
  // Dangerous imports (Attack Class #2)
  dangerousImports: [
    /require\(['"]vm['"]\)/,
    /import.*pickle/,
    /import.*marshal/,
    /require\(['"]net['"]\)/,
    /require\(['"]dgram['"]\)/
  ],
  
  // Network access (Attack Class #16)
  network: [
    /require\(['"]http['"]\)/,
    /require\(['"]https['"]\)/,
    /require\(['"]net['"]\)/,
    /import.*socket/,
    /import.*urllib/,
    /import.*requests/,
    /fetch\(/,
    /axios\./,
    /\$\.ajax/
  ],
  
  // File system access outside allowed paths (Attack Class #15)
  fileSystem: [
    /fs\.readFileSync\(/,
    /fs\.writeFileSync\(/,
    /open\(['"](?!\/tmp).*['"],.*['"]w/,
    /unlink\(/,
    /rmdir\(/,
    /\/etc\/passwd/,
    /\/etc\/shadow/,
    /\.\.\/\.\.\//  // Path traversal
  ],
  
  // Serialization attacks (Attack Class #4)
  serialization: [
    /pickle\.loads/,
    /pickle\.load/,
    /marshal\.loads/,
    /yaml\.load\(/,
    /eval\(.*json/i
  ],
  
  // Template injection (Attack Class #3)
  template: [
    /\beval\(.*template/i,
    /new Function\(.*\$\{/,
    /\$\{.*__import__/
  ]
};

/**
 * Complexity limits
 */
const COMPLEXITY_LIMITS = {
  maxNestingDepth: 4,
  maxLoopIterations: 1000,
  maxFunctionCalls: 50,
  maxCodeSize: 10240, // 10KB
  maxLines: 500,
  maxFunctions: 20
};

/**
 * Static code validator class
 */
class StaticCodeValidator {
  constructor(config = {}) {
    this.config = {
      ...COMPLEXITY_LIMITS,
      ...config
    };
    this.findings = [];
  }

  /**
   * Validate code and return security report
   * @param {string} code - Code to validate
   * @param {string} language - Programming language (javascript, python)
   * @returns {Object} Validation result with findings
   */
  validate(code, language = 'javascript') {
    this.findings = [];
    
    // Basic size check
    if (code.length > this.config.maxCodeSize) {
      this.findings.push({
        severity: 'HIGH',
        category: 'complexity',
        message: `Code size exceeds limit: ${code.length} > ${this.config.maxCodeSize}`,
        line: null
      });
      return this.getResult();
    }

    // Line count check
    const lines = code.split('\n').length;
    if (lines > this.config.maxLines) {
      this.findings.push({
        severity: 'MEDIUM',
        category: 'complexity',
        message: `Line count exceeds limit: ${lines} > ${this.config.maxLines}`,
        line: null
      });
    }

    // Pattern-based detection
    this.detectDangerousPatterns(code);

    // Language-specific analysis
    if (language === 'javascript') {
      this.analyzeJavaScript(code);
    } else if (language === 'python') {
      this.analyzePython(code);
    }

    return this.getResult();
  }

  /**
   * Detect dangerous patterns using regex
   */
  detectDangerousPatterns(code) {
    for (const [category, patterns] of Object.entries(DANGEROUS_PATTERNS)) {
      for (const pattern of patterns) {
        const match = pattern.exec(code);
        if (match) {
          const severity = this.getSeverityForCategory(category);
          const lineNumber = this.getLineNumber(code, match.index);
          
          this.findings.push({
            severity,
            category,
            message: `Dangerous pattern detected: ${category}`,
            pattern: match[0],
            line: lineNumber,
            attackClass: this.getAttackClassForCategory(category)
          });
        }
      }
    }
  }

  /**
   * Analyze JavaScript code using AST
   */
  analyzeJavaScript(code) {
    try {
      const ast = esprima.parseScript(code, { loc: true, tolerant: true });
      
      // Analyze AST
      this.analyzeASTComplexity(ast);
      this.detectDangerousASTPatterns(ast);
      
    } catch (error) {
      this.findings.push({
        severity: 'HIGH',
        category: 'syntax',
        message: `Failed to parse JavaScript: ${error.message}`,
        line: error.lineNumber || null
      });
    }
  }

  /**
   * Analyze Python code (basic pattern matching)
   * Note: Full AST analysis would require Python parser
   */
  analyzePython(code) {
    // Check for dangerous Python-specific patterns
    const pythonPatterns = {
      'eval/exec': /\b(eval|exec)\(/g,
      'subprocess': /import\s+subprocess|from\s+subprocess/g,
      'os.system': /os\.system\(/g,
      'pickle': /import\s+pickle|from\s+pickle/g,
      '__import__': /__import__\(/g,
      'socket': /import\s+socket|from\s+socket/g
    };

    for (const [name, pattern] of Object.entries(pythonPatterns)) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        this.findings.push({
          severity: 'CRITICAL',
          category: 'dangerous_function',
          message: `Dangerous Python pattern: ${name}`,
          pattern: match[0],
          line: this.getLineNumber(code, match.index)
        });
      }
    }

    // Check for indentation-based nesting (Python-specific)
    const nestingDepth = this.analyzePythonNesting(code);
    if (nestingDepth > this.config.maxNestingDepth) {
      this.findings.push({
        severity: 'MEDIUM',
        category: 'complexity',
        message: `Nesting depth exceeds limit: ${nestingDepth} > ${this.config.maxNestingDepth}`,
        line: null
      });
    }
  }

  /**
   * Analyze AST complexity
   */
  analyzeASTComplexity(ast) {
    let maxDepth = 0;
    let functionCount = 0;
    let loopCount = 0;

    const traverse = (node, depth = 0) => {
      if (!node) return;

      maxDepth = Math.max(maxDepth, depth);

      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
        functionCount++;
      }

      if (node.type === 'ForStatement' || node.type === 'WhileStatement' || 
          node.type === 'DoWhileStatement') {
        loopCount++;
      }

      // Traverse children
      for (const key in node) {
        if (node[key] && typeof node[key] === 'object') {
          if (Array.isArray(node[key])) {
            node[key].forEach(child => traverse(child, depth + 1));
          } else {
            traverse(node[key], depth + 1);
          }
        }
      }
    };

    traverse(ast);

    // Check limits
    if (maxDepth > this.config.maxNestingDepth) {
      this.findings.push({
        severity: 'MEDIUM',
        category: 'complexity',
        message: `Nesting depth exceeds limit: ${maxDepth} > ${this.config.maxNestingDepth}`,
        line: null
      });
    }

    if (functionCount > this.config.maxFunctions) {
      this.findings.push({
        severity: 'LOW',
        category: 'complexity',
        message: `Function count exceeds limit: ${functionCount} > ${this.config.maxFunctions}`,
        line: null
      });
    }
  }

  /**
   * Detect dangerous patterns in AST
   */
  detectDangerousASTPatterns(ast) {
    const dangerousFunctions = [
      'eval', 'Function', 'setTimeout', 'setInterval', 'execSync', 'exec', 'spawn'
    ];

    const traverse = (node) => {
      if (!node) return;

      // Check for dangerous function calls
      if (node.type === 'CallExpression') {
        const calleeName = this.getCalleeName(node.callee);
        
        if (dangerousFunctions.includes(calleeName)) {
          this.findings.push({
            severity: 'CRITICAL',
            category: 'dangerous_function',
            message: `Dangerous function call: ${calleeName}()`,
            line: node.loc ? node.loc.start.line : null,
            attackClass: 'Code Injection (#1, #2)'
          });
        }
      }

      // Check for require/import of dangerous modules
      if (node.type === 'CallExpression' && 
          this.getCalleeName(node.callee) === 'require' &&
          node.arguments[0] && node.arguments[0].type === 'Literal') {
        
        const moduleName = node.arguments[0].value;
        const dangerousModules = ['child_process', 'vm', 'net', 'dgram', 'cluster'];
        
        if (dangerousModules.includes(moduleName)) {
          this.findings.push({
            severity: 'CRITICAL',
            category: 'dangerous_import',
            message: `Dangerous module import: ${moduleName}`,
            line: node.loc ? node.loc.start.line : null,
            attackClass: 'Subprocess Escape (#14), Network Escape (#16)'
          });
        }
      }

      // Traverse children
      for (const key in node) {
        if (node[key] && typeof node[key] === 'object') {
          if (Array.isArray(node[key])) {
            node[key].forEach(child => traverse(child));
          } else {
            traverse(node[key]);
          }
        }
      }
    };

    traverse(ast);
  }

  /**
   * Get callee name from AST node
   */
  getCalleeName(callee) {
    if (!callee) return '';
    
    if (callee.type === 'Identifier') {
      return callee.name;
    } else if (callee.type === 'MemberExpression') {
      return this.getCalleeName(callee.property);
    }
    
    return '';
  }

  /**
   * Analyze Python nesting depth based on indentation
   */
  analyzePythonNesting(code) {
    const lines = code.split('\n');
    let maxDepth = 0;

    for (const line of lines) {
      const match = line.match(/^(\s*)/);
      if (match) {
        const spaces = match[1].length;
        const depth = Math.floor(spaces / 4); // Assuming 4-space indentation
        maxDepth = Math.max(maxDepth, depth);
      }
    }

    return maxDepth;
  }

  /**
   * Get line number from string index
   */
  getLineNumber(code, index) {
    const upToIndex = code.substring(0, index);
    return upToIndex.split('\n').length;
  }

  /**
   * Get severity for category
   */
  getSeverityForCategory(category) {
    const severityMap = {
      subprocess: 'CRITICAL',
      eval: 'CRITICAL',
      dangerousImports: 'CRITICAL',
      network: 'HIGH',
      fileSystem: 'HIGH',
      serialization: 'CRITICAL',
      template: 'HIGH',
      complexity: 'MEDIUM'
    };
    
    return severityMap[category] || 'MEDIUM';
  }

  /**
   * Map category to MAESTRO attack class
   */
  getAttackClassForCategory(category) {
    const attackClassMap = {
      subprocess: 'Subprocess Escape (#14)',
      eval: 'Exception-Mediated Code Injection (#1)',
      dangerousImports: 'Dynamic Import Injection (#2)',
      network: 'Network Escape (#16)',
      fileSystem: 'File System Escape (#15)',
      serialization: 'Serialization Injection (#4)',
      template: 'String Template Injection (#3)'
    };
    
    return attackClassMap[category] || 'Unknown';
  }

  /**
   * Get validation result
   */
  getResult() {
    const criticalCount = this.findings.filter(f => f.severity === 'CRITICAL').length;
    const highCount = this.findings.filter(f => f.severity === 'HIGH').length;
    
    const passed = criticalCount === 0 && highCount === 0;

    return {
      passed,
      risk: this.calculateRisk(),
      findings: this.findings,
      summary: {
        total: this.findings.length,
        critical: criticalCount,
        high: highCount,
        medium: this.findings.filter(f => f.severity === 'MEDIUM').length,
        low: this.findings.filter(f => f.severity === 'LOW').length
      }
    };
  }

  /**
   * Calculate overall risk score
   */
  calculateRisk() {
    if (this.findings.length === 0) return 'SAFE';
    
    const criticalCount = this.findings.filter(f => f.severity === 'CRITICAL').length;
    const highCount = this.findings.filter(f => f.severity === 'HIGH').length;
    
    if (criticalCount > 0) return 'CRITICAL';
    if (highCount > 2) return 'HIGH';
    if (highCount > 0) return 'MEDIUM';
    
    return 'LOW';
  }
}

module.exports = StaticCodeValidator;
