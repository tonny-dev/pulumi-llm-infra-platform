module.exports = {
  ...require('./jest.config.js'),
  testMatch: [
    '**/__tests__/**/*.integration.(ts|tsx|js)',
    '**/*.(integration).+(ts|tsx|js)'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/test-setup.integration.ts'
  ],
  testTimeout: 60000,
  maxWorkers: 1, // Run integration tests sequentially
  collectCoverage: false, // Skip coverage for integration tests
  globalSetup: '<rootDir>/src/test-global-setup.ts',
  globalTeardown: '<rootDir>/src/test-global-teardown.ts'
};
