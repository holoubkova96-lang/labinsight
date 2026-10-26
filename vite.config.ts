import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages servíruje aplikaci z podadresáře /labinsight/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/labinsight/' : '/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  build: { chunkSizeWarningLimit: 1500 },
}));
