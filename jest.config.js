module.exports = {
  testEnvironment: "node",
  verbose: true,
  cacheDirectory: "<rootDir>/.jest-cache",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "json-summary"],
  collectCoverageFrom: [
    "src/services/**/*.js",
    "src/utils/**/*.js",
    "src/database/**/*.js",
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 80,
      lines: 80,
      statements: 75,
    },
  },
};
