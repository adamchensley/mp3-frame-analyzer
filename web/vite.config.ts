import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/analyze': 'http://localhost:3000',
      '/file-upload': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist' },
});
