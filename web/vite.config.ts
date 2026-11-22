import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// design.md §1.3 y D-06: la web en 5173 y /api por proxy a la API en 3000, así web y API
// comparten origen en local y la cookie del refresh (Path=/api/auth) viaja sin CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
