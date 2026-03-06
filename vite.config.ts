import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Explicitly use 127.0.0.1 to avoid ECONNREFUSED issues on Windows/IPv6
  const PYTHON_API = env.VITE_API_URL || 'http://127.0.0.1:5000';

  return {
    plugins: [react(), tailwindcss(), basicSsl()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: true, // Exposes the server to your local network
      proxy: {
        // Correctly route and rewrite /api calls to the Python backend
        '/api': {
          target: PYTHON_API,
          changeOrigin: true,
          secure: false, // Local dev doesn't need SSL verification
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
