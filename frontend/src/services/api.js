import axios from 'axios';

/**
 * Central Axios instance.
 * - Uses VITE_API_BASE_URL when set, otherwise the dev proxy (same origin /api).
 * - Attaches the JWT (Bearer) to every protected request.
 * - On a 401 response the session is cleared and the user is sent to login.
 */

const baseURL =
  (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') || '';
const api = axios.create({ baseURL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
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