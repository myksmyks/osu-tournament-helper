const fs = require("fs");
const path = require("path");

process.env.CONFIG_PATH ||= path.join(__dirname, "..", "config.example.json");

const placeholderEnv = {
  TOKEN: "smoke-token",
  CLIENT_ID: "smoke-client-id",
  OSU_IRC_USERNAME: "smoke-user",
  OSU_IRC_PASSWORD: "smoke-password",
};

for (const [name, value] of Object.entries(placeholderEnv)) {
  process.env[name] ||= value;
}

const projectRoot = path.join(__dirname, "..");
const commandRoot = path.join(projectRoot, "src", "commands");
const serviceRoot = path.join(projectRoot, "src", "services");
const {
  config,
  validateConfigShape,
  validateStartupConfiguration,
} = require(path.join(projectRoot, "src", "config"));

validateConfigShape(config);
validateStartupConfiguration(config);

function listJavaScriptFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
    return entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

for (const filePath of listJavaScriptFiles(serviceRoot)) {
  require(filePath);
}

for (const filePath of listJavaScriptFiles(commandRoot)) {
  const command = require(filePath);
  if (!command.data || typeof command.data.toJSON !== "function") {
    throw new Error(`${path.relative(projectRoot, filePath)} has no command data.`);
  }
  if (typeof command.execute !== "function") {
    throw new Error(`${path.relative(projectRoot, filePath)} has no execute function.`);
  }
  command.data.toJSON();
}

require(path.join(projectRoot, "src", "database", "db"));
require(path.join(projectRoot, "src", "utils", "textUtils"));

console.log(
  "Smoke check passed: configuration, services, and command definitions load safely.",
);
