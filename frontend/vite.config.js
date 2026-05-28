import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use the existing public/manifest.json — don't generate a new one.
      manifest: false,
      workbox: {
        // Precache all built JS/CSS/HTML/fonts/icons so the app loads offline.
        globPatterns: ['**/*.{js,css,html,ico,svg,woff,woff2}'],
        // SPA fallback: any unmatched navigation serves index.html from cache.
        navigateFallback: '/index.html',
        // Never intercept API requests — let them reach the network.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    // Proxy /api requests to the FastAPI backend during development.
    // This makes the browser send requests to the same origin as the Vite
    // dev server, eliminating CORS entirely. Works in local dev AND in
    // GitHub Codespaces (both servers run on localhost inside the container).
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'forks',
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
})
