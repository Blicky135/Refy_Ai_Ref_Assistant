import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa'; // <-- 1. Add this import

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        // v-- 2. Add the VitePWA plugin after react() --v
        VitePWA({ 
          registerType: 'autoUpdate',
          manifest: {
            name: 'Refy AI Referee Assistant',
            short_name: 'Refy',
            description: 'An AI-powered referee assistant for soccer matches.',
            theme_color: '#ffffff',
            icons: [
              {
                src: 'app_icon.png', // <-- Using your new PNG filename
                sizes: '192x192',
                type: 'image/png'   // <-- Using the correct type for PNG
              },
              {
                src: 'app_icon.png', // <-- Using your new PNG filename
                sizes: '512x512',
                type: 'image/png'   // <-- Using the correct type for PNG
              }
            ]
          }
        })
        // ^-- End of PWA plugin configuration --^
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});