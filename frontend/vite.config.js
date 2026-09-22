import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev server configuration.
 *
 * The proxy forwards the API to the Express backend. Its port MUST match PORT
 * in backend/.env (5000 by default) - point it elsewhere with
 * VITE_PROXY_TARGET=http://localhost:5002 in frontend/.env when needed.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // REST API
        '/api': { target, changeOrigin: true },
        // Gmail OAuth consent flow (mounted at the root: /auth/google, /auth/google/callback)
        '/auth': { target, changeOrigin: true },
        // Swagger UI and the OpenAPI JSON spec
        '/api-docs': { target, changeOrigin: true },
      },
    },
  };
});
