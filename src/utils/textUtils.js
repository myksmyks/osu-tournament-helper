function cleanStageName(stageName) {
  if (!stageName) return "";
  return stageName.replace(/^\([^)]+\)\s*/, "").trim();
}

function cleanDateString(dateStr) {
  if (!dateStr) return "";
  return dateStr.replace(/^\([^)]+\)\s*/, "").trim();
}

function normalizeName(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, "");
}

module.exports = { cleanStageName, cleanDateString, normalizeName };
