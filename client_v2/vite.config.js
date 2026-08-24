import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverHost = env.VITE_SERVER_HOST;
  const serverPort = Number(env.VITE_SERVER_PORT);
  const allowedHosts = env.VITE_ALLOWED_HOSTS
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  return {
  plugins: [react()],

  server: {
    host: serverHost,
    port: serverPort,
    allowedHosts,
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
  };
});
