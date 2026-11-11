import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  build: { outDir: '../module/resources/app', emptyOutDir: true, manifest: true },
})
