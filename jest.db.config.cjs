module.exports = {
  ...require('./jest.config.cjs'),
  setupFiles: ['<rootDir>/test/helpers/db-environment.ts'],
  testTimeout: 15000,
};
