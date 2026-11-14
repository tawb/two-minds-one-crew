import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The site can be served from a sub-path (GitHub Pages: /two-minds-one-crew/). Set VITE_BASE at build time; default is the root.
export default defineConfig(({ mode }) => {
  const base = loadEnv(mode, '.', '').VITE_BASE || '/';
  return {
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*', 'data/*', 'mediapipe/**/*'],
      workbox: {
        // Cache the whole app shell, fonts, data files and the on-device pose model.
        globPatterns: ['**/*.{js,css,html,woff,woff2,svg,png,json,csv,wasm,task}'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'AstroVitals',
        short_name: 'AstroVitals',
        description: 'Crew health self-monitoring for long missions.',
        lang: 'en',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#070D17',
        theme_color: '#070D17',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
};
});
