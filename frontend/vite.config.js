import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev server configuration.
 *
 * The proxy forwards the API to the Express backend. Its port MUST match PORT
 * in backend/.env (5000 by default) - point it elsewhere with
 * VITE_PROXY_TARGET=http://localhost:5002 in frontend/.env when needed.
 *
 * Tunnelling (ngrok): expose the dev server with `ngrok http 5173`. Tunnel
 * hostnames must be listed in server.allowedHosts below, otherwise Vite
 * answers "Blocked request. This host is not allowed".
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:5000';

  // Host header allow-list (Vite's DNS-rebinding protection): any request
  // whose Host is not in this list is refused. Free-plan ngrok URLs rotate
  // on every restart, so the wildcard keeps every future tunnel working too
  // (remove it to restrict access to the exact host above only).
  const tunnelHosts = [
    '8a57-2409-40f0-8421-5f50-d7e8-842c-6bdd-750f.ngrok-free.app',
    'https://a554-2409-40f0-8454-137a-c194-9dce-991e-ebd8.ngrok-free.app',
    '.ngrok-free.app',
    '.ngrok.io',
  ];

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Listen on all interfaces so the ngrok agent (or other devices on the
      // network) can reach the dev server, not just localhost.
      host: true,
      allowedHosts: tunnelHosts,
      // HMR websocket port as seen by the BROWSER. Behind an https tunnel the
      // page is served on port 443 - set VITE_HMR_TUNNEL=1 in frontend/.env
      // while tunnelling and remove it again for local development.
      ...(env.VITE_HMR_TUNNEL === '1' ? { hmr: { clientPort: 443 } } : {}),
      proxy: {
        // REST API
        '/api': { target, changeOrigin: true },
        // Gmail OAuth consent flow (mounted at the root: /auth/google, /auth/google/callback)
        '/auth': { target, changeOrigin: true },
        // Swagger UI and the OpenAPI JSON spec
        '/api-docs': { target, changeOrigin: true },
      },
    },
    // `vite preview` (production build) enforces the same host check.
    preview: {
      allowedHosts: tunnelHosts,
    },
  };
});
