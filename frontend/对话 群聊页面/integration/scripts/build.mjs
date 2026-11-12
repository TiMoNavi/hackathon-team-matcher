import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const integrationRoot = fileURLToPath(new URL("../", import.meta.url));
const chatRoot = path.resolve(integrationRoot, "..");
const projectRoot = path.resolve(chatRoot, "../..");
const sharedRoot = path.join(projectRoot, "frontend/integration");
const outputRoot = path.join(projectRoot, "backend/protected/modules/matcher-chat-ui/resources/app");
const contract = JSON.parse(await fs.readFile(new URL("../toolchain.json", import.meta.url), "utf8"));
if (Number(process.versions.node.split(".")[0]) !== contract.nodeMajor) throw new Error("This build requires Node 24.");

for (const [root, packages] of [[sharedRoot, contract.sharedBuildPackages], [chatRoot, contract.chatPackages]]) {
  for (const [name, expected] of Object.entries(packages)) {
    const installed = JSON.parse(await fs.readFile(path.join(root, "node_modules", name, "package.json"), "utf8"));
    if (installed.version !== expected) throw new Error("Toolchain version mismatch: " + name + "; expected " + expected + ".");
  }
}
for (let target = outputRoot; target !== projectRoot; target = path.dirname(target)) {
  try { if ((await fs.lstat(target)).isSymbolicLink()) throw new Error("Refusing a symlink in the output path."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

const sharedRequire = createRequire(path.join(sharedRoot, "package.json"));
const chatRequire = createRequire(path.join(chatRoot, "package.json"));
const { build } = await import(pathToFileURL(sharedRequire.resolve("vite")).href);
const { default: react } = await import(pathToFileURL(sharedRequire.resolve("@vitejs/plugin-react")).href);
const { default: tailwindcss } = await import(pathToFileURL(chatRequire.resolve("@tailwindcss/postcss")).href);
const moduleDirectory = (name) => path.join(chatRoot, "node_modules", name);
const expectedReactRoot = await fs.realpath(moduleDirectory("react"));
let moduleCount = 0;
const audit = {
  name: "matcher-chat-shell-boundary",
  generateBundle() {
    const roots = new Set();
    const ids = Array.from(this.getModuleIds());
    moduleCount = ids.length;
    for (const id of ids) {
      const normalized = id.replaceAll("\\", "/");
      const match = normalized.match(/^(.*\/node_modules\/react)\//);
      if (match) roots.add(match[1]);
      if (/\/(?:lib\/(?:conversations|friend-requests)|components\/chat\/(?:conversation-app|friend-requests))\./.test(normalized) || /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?next\//.test(normalized)) {
        this.error("Shell build must not import fixtures, a business chat screen, or Next runtime.");
      }
    }
    if (roots.size !== 1 || !roots.has(expectedReactRoot)) this.error("Shell must bundle exactly the chat package React runtime.");
  },
};

await build({
  root: integrationRoot,
  configFile: false,
  envDir: false,
  cacheDir: path.join(integrationRoot, ".cache/vite"),
  publicDir: false,
  base: "./",
  plugins: [react(), audit],
  css: { postcss: { plugins: [tailwindcss({ base: integrationRoot })] } },
  resolve: {
    alias: [
      { find: "@", replacement: chatRoot },
      { find: "tailwindcss", replacement: path.join(moduleDirectory("tailwindcss"), "index.css") },
      { find: "tw-animate-css", replacement: path.join(moduleDirectory("tw-animate-css"), "dist/tw-animate.css") },
      { find: "shadcn/tailwind.css", replacement: path.join(moduleDirectory("shadcn"), "dist/tailwind.css") },
      { find: "react", replacement: moduleDirectory("react") },
      { find: "react-dom", replacement: moduleDirectory("react-dom") },
    ],
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    manifest: "manifest.json",
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
console.log(JSON.stringify({ build: "passed", stage: "shell", businessApiCalls: 0, modules: moduleCount, react: "19.2.4", output: "backend/protected/modules/matcher-chat-ui/resources/app", envFiles: "disabled", sharedCacheWrites: "disabled by explicit config" }));
