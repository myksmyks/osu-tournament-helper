const COLUMN_LETTER_PATTERN = /^[A-Z]+$/;

function normalizeColumnLetter(column) {
  if (typeof column !== "string") {
    throw new Error(`Sheet column must be a letter, received ${typeof column}.`);
  }

  const normalized = column.trim().toUpperCase();
  if (!COLUMN_LETTER_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid sheet column "${column}". Use letters such as A, Z, AA, or AB.`,
    );
  }
  return normalized;
}

function columnLetterToIndex(column) {
  const normalized = normalizeColumnLetter(column);
  let index = 0;

  for (const character of normalized) {
    index = index * 26 + character.charCodeAt(0) - 64;
  }

  return index - 1;
}

function columnIndexToLetter(index) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Sheet column index must be a non-negative integer.");
  }

  let remaining = index + 1;
  let column = "";
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return column;
}

function validateColumnMapping(columns, mappingName, requiredFields = []) {
  if (!columns || typeof columns !== "object" || Array.isArray(columns)) {
    throw new Error(`${mappingName} column config must be an object.`);
  }

  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(columns, field)) {
      throw new Error(`${mappingName} column config is missing "${field}".`);
    }
  }

  for (const [field, column] of Object.entries(columns)) {
    try {
      normalizeColumnLetter(column);
    } catch (error) {
      throw new Error(`${mappingName}.${field}: ${error.message}`);
    }
  }
}

function getCell(row, column) {
  if (!Array.isArray(row)) return null;
  return row[columnLetterToIndex(column)] ?? null;
}

function parseSheetRow(row, columns, mappingName = "Sheet") {
  validateColumnMapping(columns, mappingName);
  return Object.fromEntries(
    Object.entries(columns).map(([field, column]) => [
      field,
      getCell(row, column),
    ]),
  );
}

function getLastConfiguredColumn(columns, mappingName = "Sheet") {
  validateColumnMapping(columns, mappingName);
  const indexes = Object.values(columns).map(columnLetterToIndex);
  if (indexes.length === 0) {
    throw new Error(`${mappingName} column config must not be empty.`);
  }
  return columnIndexToLetter(Math.max(...indexes));
}

module.exports = {
  columnIndexToLetter,
  columnLetterToIndex,
  getCell,
  getLastConfiguredColumn,
  parseSheetRow,
  validateColumnMapping,
};
