import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api/v1/ws': {
        target: 'ws://localhost:8080',
        ws: true
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: false
      },
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: false
      },
      '/health': {
        target: 'http://localhost:8080',
        changeOrigin: false
      }
    }
  }
});
