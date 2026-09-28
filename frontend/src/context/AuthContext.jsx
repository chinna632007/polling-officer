import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../services/api';
import { homeForRole, roleLabel } from '../utils/roles';

const AuthContext = createContext(null);

const USER_KEY = 'user';
const LEGACY_KEYS = ['token', 'admin']; // wiped: pre-session-auth leftovers

/**
 * Auth state + login/logout for the single Main Admin.
 *
 * Auth rides on an HttpOnly session cookie - nothing secret is stored in
 * localStorage anymore. The non-sensitive user snapshot is cached there only
 * so the UI paints instantly; on boot it is revalidated against the real
 * server session (/api/auth/me) and dropped if the session is gone.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  });
  const [bootstrapChecked, setBootstrapChecked] = useState(() => {
    // No cached snapshot => nothing to validate, login page can render now.
    try {
      return !JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return true;
    }
  });

  const persist = useCallback((userPayload) => {
    localStorage.setItem(USER_KEY, JSON.stringify(userPayload));
    setUser(userPayload);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  // One-time cleanup of pre-session-auth leftovers (old JWT + admin snapshot).
  useEffect(() => {
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
  }, []);

  // Revalidate the cached snapshot against the live session on boot: if the
  // cookie is missing/expired the server answers 401 and the local user is
  // cleared, so a stale UI can never pretend to be logged in.
  useEffect(() => {
    if (!user) return; // nothing cached -> already "checked"
    let cancelled = false;
    api
      .get('/api/auth/me')
      .then(({ data }) => {
        if (!cancelled) persist(data.user);
      })
      .catch(() => {
        if (!cancelled) clear();
      })
      .finally(() => {
        if (!cancelled) setBootstrapChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (username, password) => {
      const { data } = await api.post('/api/auth/login', { username, password });
      // The server sets the HttpOnly session cookie on this response; we only
      // cache the public user snapshot for an instant UI.
      persist(data.user);
      setBootstrapChecked(true);
      return data.user;
    },
    [persist]
  );

  const loginWithGoogle = useCallback(async () => {
    // Lazy-import so the Firebase SDK stays out of the main bundle.
    const firebase = await import('../services/firebase');
    try {
      const result = await firebase.signInWithGoogle();
      const idToken = await result.user.getIdToken();
      const { data } = await api.post('/api/auth/google', { idToken });
      // The server has verified the token + email allowlist and set the
      // HttpOnly session cookie; we only cache the public user snapshot.
      persist(data.user);
      setBootstrapChecked(true);
      return data.user;
    } catch (err) {
      // A declined/failed attempt must not leave the popup account cached,
      // otherwise the next attempt silently reuses the rejected identity.
      try {
        const { signOut } = await import('firebase/auth');
        await signOut(firebase.auth);
      } catch {
        /* signOut failure is irrelevant here */
      }
      throw err;
    }
  }, [persist]);

  const logout = useCallback(() => {
    // Destroy the server-side session BEFORE wiping local state. Fire-and-
    // forget: an offline logout still clears local state.
    api.post('/api/auth/logout').catch(() => {});
    clear();
  }, [clear]);

  const isAuthenticated = Boolean(user);

  const value = {
    user,
    admin: user,
    isAuthenticated,
    isBootstrapMode: false,
    bootstrapChecked: true,
    login,
    loginWithGoogle,
    logout,
    role: user?.role,
    roleLabel: user ? roleLabel(user.role) : '',
    homePath: homeForRole(user?.role),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}