import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsDir: 'assets',
    sourcemap: false,
    // Keep the bundle reliable for deployment; adjust warning threshold.
    chunkSizeWarningLimit: 700
  }
});
