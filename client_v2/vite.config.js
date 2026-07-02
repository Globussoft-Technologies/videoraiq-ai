import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 5002,
    allowedHosts: ['stagingv2.videoraiq.com'],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  esbuild: {
    supported: { 'dynamic-import': true },
  },

  worker: {
    plugins: () => [react()],
  },

  build: {
    sourcemap: false,
    cssMinify: 'esbuild',
    minify: 'esbuild',
    rollupOptions: {
      maxParallelFileOps: 1,
      output: {
        experimentalMinChunkSize: 10000,
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return id.split('node_modules/')[1].split('/')[0];
          }
        },
      },
    },
  },
});
