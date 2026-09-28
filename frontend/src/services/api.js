import axios from 'axios';

/**
 * Central Axios instance.
 * - Uses VITE_API_BASE_URL when set, otherwise the dev proxy (same origin /api).
 * - Auth rides on the HttpOnly session cookie: withCredentials covers both the
 *   same-origin dev proxy and a direct cross-origin base URL.
 * - On a 401 response the cached user is cleared and the user is sent to login.
 */

const baseURL =
  (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') || '';
const api = axios.create({ baseURL, withCredentials: true });

// ngrok's free tier serves an interstitial "You are about to visit" page to
// browser requests, which would hijack the API calls when the dashboard is
// opened through a tunnel. This header tells the ngrok edge to let requests
// straight through (every other server simply ignores it).
api.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Legacy JWT leftovers are wiped too (cleanup for tabs from before the
      // session-cookie migration).
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('admin');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/** Reads the human readable message out of an axios error. */
export function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    'An unexpected error occurred'
  );
}

export default api;