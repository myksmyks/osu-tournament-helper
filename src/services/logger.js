const { config } = require("../config");

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const CURRENT_LEVEL =
  LOG_LEVELS[config.runtime.logLevel?.toUpperCase()] ?? LOG_LEVELS.INFO;

function log(level, moduleName, message, ...args) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;
  const timestamp = new Date().toISOString();
  const levelStr = level.padEnd(5);
  const context = moduleName ? `[${moduleName}]` : "";
  console.log(`${timestamp} | ${levelStr} | ${context} ${message}`, ...args);
}

module.exports = {
  debug: (moduleName, message, ...args) =>
    log("DEBUG", moduleName, message, ...args),
  info: (moduleName, message, ...args) =>
    log("INFO", moduleName, message, ...args),
  warn: (moduleName, message, ...args) =>
    log("WARN", moduleName, message, ...args),
  error: (moduleName, message, ...args) =>
    log("ERROR", moduleName, message, ...args),
};
