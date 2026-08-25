import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Repo is deployed to https://<user>.github.io/chinese-poker/
// so all built asset URLs must be prefixed with the repo name.
// HashRouter is used app-side so this works with GitHub Pages'
// static hosting (no server-side rewrites needed for deep links).
export default defineConfig({
  plugins: [react()],
  base: '/chinese-poker/',
  server: {
    port: 5173,
  },
})
