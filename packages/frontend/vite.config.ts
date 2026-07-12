import path from 'path';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@docs': path.join(repoRoot, 'docs'),
    },
  },
  server: {
    fs: { allow: [repoRoot] },
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
});
