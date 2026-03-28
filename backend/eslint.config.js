const globals = require('globals');
const security = require('eslint-plugin-security');

const securityRecommendedRules = Object.fromEntries(
  Object.entries(security.configs.recommended.rules || {}).map(([ruleName, ruleValue]) => {
    if (Array.isArray(ruleValue)) {
      return [ruleName, ['warn', ...ruleValue.slice(1)]];
    }

    return [ruleName, 'warn'];
  })
);

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'migrations/**',
      'coverage/**'
    ]
  },
  {
    files: ['src/**/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      // globals provides the canonical Node.js global set for flat config.
      globals: {
        ...globals.node
      }
    },
    plugins: {
      security
    },
    rules: {
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-undef': 'warn',
      'no-unreachable': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      ...securityRecommendedRules,
      'security/detect-object-injection': 'off'
    }
  },
  {
    files: ['scripts/run-migrations.js', 'src/utils/auditLogger.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  }
];
