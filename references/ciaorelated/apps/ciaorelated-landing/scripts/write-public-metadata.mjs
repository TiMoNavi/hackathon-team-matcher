import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function normalizeUrl(raw) {
  const trimmed = String(raw || "https://ciaorelated.com").replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

loadLocalEnv();

const siteUrl = normalizeUrl(process.env.VITE_PUBLIC_WEBSITE_URL);
const outputDir = resolve(process.cwd(), ".output/public");
const routes = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/support.html", changefreq: "monthly", priority: "0.6" },
  { path: "/privacy.html", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy-de.html", changefreq: "monthly", priority: "0.5" },
  { path: "/datenschutz.html", changefreq: "monthly", priority: "0.5" },
  { path: "/terms.html", changefreq: "monthly", priority: "0.5" },
  { path: "/terms-de.html", changefreq: "monthly", priority: "0.5" },
  { path: "/guidelines.html", changefreq: "monthly", priority: "0.5" },
  { path: "/guidelines-de.html", changefreq: "monthly", priority: "0.5" },
  { path: "/kampagne.html", changefreq: "monthly", priority: "0.4" },
];

writeFileSync(
  resolve(outputDir, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
);

writeFileSync(
  resolve(outputDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes
    .map(
      (route) =>
        `  <url>\n    <loc>${siteUrl}${route.path === "/" ? "/" : route.path}</loc>\n    <changefreq>${route.changefreq}</changefreq>\n    <priority>${route.priority}</priority>\n  </url>`,
    )
    .join("\n")}\n</urlset>\n`,
);
