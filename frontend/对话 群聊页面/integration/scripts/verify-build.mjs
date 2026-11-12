import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const integrationRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 1 && args[0] === "--read");
const reading = args[0] === "--read";
const chatRoot = path.resolve(integrationRoot, "..");
const projectRoot = path.resolve(chatRoot, "../..");
const root = path.join(projectRoot, "backend/protected/modules/matcher-chat-ui/resources", reading ? "read-app" : "app");
assert.equal((await fs.lstat(root)).isSymbolicLink(), false, "symlink output root");
const manifestFile = path.join(root, "manifest.json");
assert.ok((await fs.stat(manifestFile)).size <= 1024 * 1024, "oversized manifest");
const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
assert.ok(manifest && typeof manifest === "object" && !Array.isArray(manifest));
assert.ok(Object.keys(manifest).length <= 2048);
assert.equal(manifest["index.html"]?.isEntry, true);
assert.match(manifest["index.html"].file, /\.(?:js|mjs)$/);
const assets = new Set();
const visiting = new Set();
const visited = new Set();
async function asset(relative) {
  assert.equal(typeof relative, "string");
  assert.ok(relative.length > 0 && relative.length <= 240 && !relative.startsWith("/") && !/[\\:?#]/.test(relative));
  const segments = relative.split("/");
  assert.ok(segments.every((segment) => segment && !segment.startsWith(".")), "unsafe path segment");
  assert.match(relative, /\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg|ico)$/i);
  let target = root;
  for (const segment of segments) {
    target = path.join(target, segment);
    assert.equal((await fs.lstat(target)).isSymbolicLink(), false, "symlink asset");
  }
  assert.ok((await fs.stat(target)).isFile());
  const resolved = await fs.realpath(target);
  assert.ok(resolved.startsWith(root + path.sep));
  assets.add(relative);
}
async function visit(key, depth = 0) {
  assert.ok(depth <= 64, "manifest graph too deep");
  assert.ok(!visiting.has(key), "manifest cycle");
  if (visited.has(key)) return;
  const item = manifest[key];
  assert.ok(item && typeof item === "object" && !Array.isArray(item), "missing manifest node");
  visiting.add(key);
  await asset(item.file);
  for (const field of ["css", "assets", "imports", "dynamicImports"]) {
    if (item[field] !== undefined) assert.ok(Array.isArray(item[field]), "invalid manifest field");
  }
  for (const file of [...item.css || [], ...item.assets || []]) await asset(file);
  for (const next of [...item.imports || [], ...item.dynamicImports || []]) await visit(next, depth + 1);
  visiting.delete(key);
  visited.add(key);
}
await visit("index.html");
for (const key of Object.keys(manifest)) await visit(key);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fonts = [...assets].filter((file) => file.endsWith(".woff2"));
assert.equal(fonts.length, 2, "expected the two existing local font files");
for (const name of ["inter-latin", "bricolage-grotesque-latin"]) {
  const emitted = fonts.find((file) => path.basename(file).startsWith(name + "-"));
  assert.ok(emitted);
  assert.equal(digest(await fs.readFile(path.join(root, emitted))), digest(await fs.readFile(path.join(chatRoot, "app/fonts", name + ".woff2"))));
}
let js = "";
let css = "";
for (const file of assets) {
  if (/\.(?:js|mjs|css)$/.test(file)) {
    const value = await fs.readFile(path.join(root, file), "utf8");
    assert.ok(!value.includes("/Users/") && !/127\.0\.0\.1:420[0-9]/.test(value), "development path in output");
    assert.ok(!value.includes("sourceMappingURL="), "source map reference in output");
    if (file.endsWith(".css")) css += value; else js += value;
  }
}
assert.ok(js && css);
assert.ok(js.includes("matcher-chat-bootstrap"));
if (!reading) assert.ok(js.includes("尚未读取会话"));
for (const fixture of ["周末 AI 创造营", "林小满", "陈序", "已添加到本地演示会话", "initialConversations", "initialFriendRequests"]) assert.ok(!js.includes(fixture), "fixture content in shell");
if (!reading) assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(js), "network API invocation in shell bundle");
else {
  assert.ok(js.includes("/api/v1") && js.includes("/conversations"), "read client missing");
  assert.ok(!/\b(?:XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(js), "unreviewed realtime transport");
  assert.ok(!js.includes("/me/current-event"), "read client must not bind private chat to current event");
}
assert.ok(!/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i.test(css), "external CSS import");
for (const match of css.matchAll(/url\(([^)]+)\)/gi)) {
  const value = match[1].replace(/^["']|["']$/g, "");
  assert.ok(!/^(?:https?:|\/\/|data:)/i.test(value), "nonlocal CSS asset");
}
assert.ok(!(await fs.readFile(path.join(integrationRoot, reading ? "read/index.html" : "index.html"), "utf8")).includes("matcher-chat-bootstrap"), "build HTML must not contain synthetic bootstrap");
console.log(JSON.stringify({ verification: "passed", manifestNodes: visited.size, assets: assets.size, fonts: fonts.length, shellOnly: !reading, businessApiCalls: reading ? "build validation does not measure runtime calls" : 0, realSessionVerified: false, browserVerified: false }));
