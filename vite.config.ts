import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // ... your other settings
      plugins: [
        react(),
        VitePWA({ 
          registerType: 'autoUpdate',
          includeAssets: ['first trans.png', 'second trans.png', 'favicon.ico'],
          manifest: {
            name: 'Refy AI Referee Assistant',
            short_name: 'Refy',
            description: 'An AI-powered referee assistant for soccer matches.',
            theme_color: '#ffffff',
            icons: [
              // --- Your original icon for older browsers ---
              {
                src: 'app_icon.png', // Your icon with the white background
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any' // The default purpose
              },
              // --- THE NEW MASKABLE ICON ---
              {
                src: 'maskable_icon.png', // The new icon you just created
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable' // The magic property!
              }
            ]
          }
        })
      ],
      // ... your other settings
    };
});