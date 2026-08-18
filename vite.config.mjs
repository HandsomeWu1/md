import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const rendererRoot = fileURLToPath(new URL('./src/renderer', import.meta.url));
const outDir = fileURLToPath(new URL('./dist/renderer', import.meta.url));
const srcAlias = fileURLToPath(new URL('./src/renderer/src', import.meta.url));

export default defineConfig({
  root: rendererRoot,
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir,
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': srcAlias,
    },
  },
});
