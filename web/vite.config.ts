import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 18174, proxy: { '/api': 'http://127.0.0.1:18080', '/sim': 'http://127.0.0.1:18080' } },
});
