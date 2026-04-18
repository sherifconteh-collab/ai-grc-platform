/**
 * Jest config for backend unit tests (v3.0.0 scaffold).
 *
 * The full upstream suite (62 tests) will be ported in batches per PR-3
 * sequencing in RELEASE_NOTES. For now the suite covers the v3.0.0 critical
 * paths: schema validator, quality gate, bcrypt rehash detection, and the
 * JWT HS256 pin.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/services/llmSchemas.js',
    'src/services/aiQualityGate.js',
    'src/services/aiExemplars/index.js',
  ],
  coverageDirectory: 'coverage',
  clearMocks: true,
  // Tests run without DB access; any DB-touching test must mock pool explicitly.
  testPathIgnorePatterns: ['/node_modules/'],
  // Some upstream test files use longer timeouts for streaming integration
  // tests; default 5s is fine for the current pure-function set.
  testTimeout: 10000,
};
