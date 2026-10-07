import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works on GitHub Pages under /<repo>/ and from any static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  // The bundle inlines ~540 kB of game icons as data URIs.
  build: { chunkSizeWarningLimit: 1200 },
})
