import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Note: the Gemini API key is deliberately NOT injected here via `define`.
// Baking a key into `process.env.*` at build time means it ships inside the
// compiled JS bundle and is readable by anyone who loads the deployed site.
// Instead each user supplies their own key at runtime via the in-app
// Settings modal, stored only in their own browser's localStorage.
// See services/geminiChatService.ts and hooks/useLocalStorage.ts.
export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
          manifest: {
            id: '/',
            name: 'MindMapNote',
            short_name: 'MindMapNote',
            description: '用 Markdown 寫筆記，自動整理成心智圖。',
            lang: 'zh-Hant',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: '#0071e3',
            icons: [
              { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
              { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            // Notes/images/tree live in localStorage, not the service worker
            // cache — this just precaches the app shell (JS/CSS/HTML) so the
            // app itself still loads with no network connection.
            globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
          },
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
