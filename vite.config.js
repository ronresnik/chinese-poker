import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Repo is deployed to https://<user>.github.io/chinese-poker/
// so all built asset URLs must be prefixed with the repo name.
// HashRouter is used app-side so this works with GitHub Pages'
// static hosting (no server-side rewrites needed for deep links).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'autoUpdate' silently fetches a new service worker in the
      // background and activates it on the next load — a player is never
      // stuck on a stale cached build with no way back to the current
      // one (the failure mode the alternative, 'prompt', is prone to if
      // nobody clicks through the "update available" prompt).
      registerType: 'autoUpdate',
      // The service worker registration script vite-plugin-pwa injects
      // needs no code changes in main.jsx to work — it's added straight
      // into the built index.html.
      injectRegister: 'auto',
      includeAssets: ['favicon.svg'],
      manifest: {
        // GitHub Pages serves this app from a subpath (base above), and
        // the manifest is fetched relative to index.html's own URL — so
        // these must be relative paths, not site-root-absolute ones, or
        // start_url/scope would resolve to the Pages *user* site root
        // instead of /chinese-poker/.
        id: '.',
        start_url: '.',
        scope: '.',
        name: '5-Column Poker',
        short_name: '5-Col Poker',
        description: 'Five hands. One board. Winner takes the columns. Play online or vs. computer.',
        theme_color: '#052013',
        background_color: '#052013',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precaches the whole built app (JS/CSS/HTML/icons/fonts CSS) at
        // install time — this is what makes "played it once, works with
        // no connection next time" actually true, rather than only
        // caching whatever happened to be requested during one session.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Firebase reads/writes must never be served from a cache — a
        // stale room snapshot or a write silently answered from the SW
        // cache instead of actually reaching RTDB/Firestore would be far
        // worse than a clear "you're offline" failure. Excluding these
        // paths (rather than trying to cache-then-network them) keeps
        // the online multiplayer and leaderboard's real consistency
        // guarantees exactly as they already are; only the app shell
        // gets the offline win.
        navigateFallbackDenylist: [/^\/__/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /firebaseio\.com$|firestore\.googleapis\.com$|googleapis\.com$/.test(url.hostname),
            handler: 'NetworkOnly',
          },
          // Google Fonts' stylesheet + font files: fetched once, then
          // safe to reuse indefinitely (a font file's URL changes if its
          // content does) — this is what keeps the card-face/heading
          // fonts from silently falling back to a system font offline.
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        // The service worker is a production concern — enabling it in
        // `npm run dev` would mean editing a file and not seeing the
        // change until a hard-refresh past the cache, which is exactly
        // the confusing failure mode a dev server exists to avoid.
        enabled: false,
      },
    }),
  ],
  base: '/chinese-poker/',
  server: {
    port: 5173,
  },
})
