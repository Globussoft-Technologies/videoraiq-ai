import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // 1. Disable sourcemaps completely to save massive amounts of RAM
    sourcemap: false,
    
    // 2. Disable CSS code splitting if your project can handle it, 
    // or leave it default. Minimizing minifier overhead:
    cssMinify: 'esbuild', // esbuild is extremely light on CPU compared to lightningcss/clean-css

    rollupOptions: {
      // 3. Restrict concurrent file writes so CPU cores aren't overwhelmed
      maxParallelFileOps: 2, 
      
      output: {
        // 4. Split heavy node_modules into smaller chunks so Rollup doesn't 
        // hold one massive 'vendor' chunk in memory all at once.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Group dependencies by package name
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }
        },
      },
    },
    
    // 5. Use esbuild for minification (fastest, lowest CPU/RAM usage)
    minify: 'esbuild',
  },
});