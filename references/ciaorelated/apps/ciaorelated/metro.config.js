// apps/ciaorelated/metro.config.js
if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function toReversed() {
    return [...this].reverse();
  };
}

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// ✅ Monorepo: Workspace beobachten (ok & empfohlen)
config.watchFolders = [workspaceRoot];

// Opt-in browser preview adapters; native builds keep the original modules.
if (process.env.CIAO_BROWSER_PREVIEW === '1') {
  require('../../.preview/metro-preview.cjs')(config, workspaceRoot);
}

// ✅ WICHTIG: Expo Defaults NICHT überschreiben
// disableHierarchicalLookup MUSS false bleiben
// nodeModulesPaths NICHT manuell setzen

module.exports = config;
