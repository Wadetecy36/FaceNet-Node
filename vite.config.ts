import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), basicSsl()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: true,
      proxy: {
        // All API calls go through the Express server at :3001
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
        },
        // YOLO proxy: /yolo/* → Express → :8000
        '/yolo': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
        },
        // Flask proxy: /flask/* → Express → :5000
        '/flask': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
