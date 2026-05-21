import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        proxyTimeout: 0,        // no timeout — allow long PHP imports
        timeout: 0,             // no socket timeout
        configure: (proxy) => {
          proxy.on('error', (err) => console.error('[Proxy Error]', err.message));
        },
      },
    },
  },
});
