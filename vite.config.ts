import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
