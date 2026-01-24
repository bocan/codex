import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read app metadata from root package.json
const rootPackageJson = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8')
);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
    __APP_NAME__: JSON.stringify(rootPackageJson.name.charAt(0).toUpperCase() + rootPackageJson.name.slice(1)), // Capitalize
    __APP_DESCRIPTION__: JSON.stringify(rootPackageJson.description),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
