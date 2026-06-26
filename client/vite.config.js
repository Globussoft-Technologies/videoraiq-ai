import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // FORCE ESBUILD TO USE ONLY 1 CPU CORE
  // This stops those multiple heavy 'esbuild --service' lines eating your CPU/RAM
  esbuild: {
    supported: { 'dynamic-import': true },
  },
  worker: {
    plugins: () => [react(), tailwindcss()],
  },
  build: {
    sourcemap: false,
    cssMinify: 'esbuild',
    minify: 'esbuild',
    
    // Crucial constraints for low-resource servers:
    rollupOptions: {
      // 1. Force Rollup to process files strictly one-by-one
      maxParallelFileOps: 1, 
      
      output: {
        // 2. Turn off advanced multi-threading features in Rollup
        experimentalMinChunkSize: 10000,
        
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }
        },
      },
    },
  },
});