import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const runtimePackages = ["react", "react-dom", "cn", "class-variance-authority", "radix-ui", "motion", "lucide-react"];

// Original components live outside this package. Resolve their runtime dependencies
// here too, so a clean installation cannot accidentally bundle a second React.
function runtimeAudit(): Plugin {
  return {
    name: "matcher-single-react-audit",
    generateBundle() {
      const roots = new Set<string>();
      for (const id of this.getModuleIds()) {
        const match = id.replaceAll("\\", "/").match(/^(.*\/node_modules\/react)\//);
        if (match) roots.add(match[1]);
      }
      if (roots.size !== 1) this.error(`Expected exactly one React runtime; found ${roots.size}.`);
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss(), runtimeAudit()],
  resolve: {
    alias: [
      { find: "@", replacement: local("../首页") },
      { find: "tailwindcss", replacement: local("./node_modules/tailwindcss/index.css") },
      { find: "tw-animate-css", replacement: local("./node_modules/tw-animate-css/dist/tw-animate.css") },
      { find: "shadcn/tailwind.css", replacement: local("./node_modules/shadcn/dist/tailwind.css") },
      ...runtimePackages.map((name) => ({ find: name, replacement: local(`./node_modules/${name}`) })),
    ],
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: local("../../backend/protected/modules/matcher-webapp/resources/app"),
    emptyOutDir: true,
    manifest: "manifest.json",
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
