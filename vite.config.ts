import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({ 
          registerType: 'autoUpdate',
          // v-- THIS IS THE NEW PART --v
          includeAssets: ['first trans.png', 'second trans.png', 'favicon.ico'],
          // ^-- THIS TELLS THE PWA TO SAVE THESE IMAGES FOR OFFLINE USE --^
          manifest: {
            name: 'Refy AI Referee Assistant',
            short_name: 'Refy',
            description: 'An AI-powered referee assistant for soccer matches.',
            theme_color: '#ffffff',
            icons: [
              {
                src: 'app_icon.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: 'app_icon.png',
                sizes: '512x512',
                type: 'image/png'
              }
            ]
          }
        })
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});