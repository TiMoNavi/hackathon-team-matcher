import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../../../backend/protected/modules/matcher-webapp/resources/app/", import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
const entry = manifest["index.html"]; assert.ok(entry?.isEntry, "index.html manifest entry missing");
const files = new Set(); const seen = new Set();
async function asset(value) {
  assert.equal(typeof value, "string");
  assert.ok(value && !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..") && !/[:?#]/.test(value), "unsafe asset path");
  const full = path.resolve(root, value); assert.ok(full.startsWith(root));
  assert.ok((await fs.stat(full)).isFile(), "missing asset"); files.add(value);
}
async function visit(key) {
  if (seen.has(key)) return; seen.add(key);
  const item = manifest[key]; assert.ok(item, "missing imported manifest entry");
  await asset(item.file);
  for (const file of [...item.css || [], ...item.assets || []]) await asset(file);
  for (const child of [...item.imports || [], ...item.dynamicImports || []]) await visit(child);
}
await visit("index.html");
for (const key of Object.keys(manifest)) await visit(key);
assert.ok([...files].some((file) => file.endsWith(".js")));
assert.ok([...files].some((file) => file.endsWith(".css")));
const fonts = [...files].filter((file) => file.endsWith(".woff2")); assert.equal(fonts.length, 2);
const digest = (value) => createHash("sha256").update(value).digest("hex");
for (const source of ["inter-latin.woff2", "bricolage-grotesque-latin.woff2"]) {
  const original = await fs.readFile(new URL(`../../首页/app/fonts/${source}`, import.meta.url));
  const emitted = fonts.find((file) => path.basename(file).startsWith(source.replace(".woff2", "-"))); assert.ok(emitted, "missing original font");
  assert.equal(digest(original), digest(await fs.readFile(path.join(root, emitted))), "font changed");
}
for (const file of files) if (/\.(js|css)$/.test(file)) {
  const content = await fs.readFile(path.join(root, file), "utf8");
  assert.ok(!content.includes("/Users/") && !content.includes("127.0.0.1:4200"), "machine-specific path in build");
}
console.log(JSON.stringify({ passed: true, entry: "index.html", manifest: "manifest.json", assets: files.size, fonts: fonts.length, singleReact: "enforced by Vite runtime audit" }));
