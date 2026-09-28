/**
 * Login.jsx
 * =========
 * Single Main Admin login.
 *   - Username + password, OR
 *   - Google sign-in (Firebase popup). The backend verifies the Google
 *     identity and only admits the email(s) in ADMIN_GOOGLE_EMAILS - every
 *     other account is declined.
 * No registration, no demo accounts, no role selection.
 */
import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../utils/roles';
import PasswordInput from '../components/PasswordInput';
import Toast from '../components/Toast';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/api';

export default function Login() {
  const { login, loginWithGoogle, user, bootstrapChecked } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(null);
  if (user) {
    return <Navigate to={homeForRole(user?.role)} replace />;
  }
  if (!bootstrapChecked) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center', padding: '40px' }}>
          <Spinner label="Initializing session…" />
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const loggedUser = await login(username, password);
      navigate(homeForRole(loggedUser?.role), { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const loggedUser = await loginWithGoogle();
      navigate(homeForRole(loggedUser?.role), { replace: true });
    } catch (err) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User closed the popup themselves - not worth a red toast.
        setError(null);
      } else {
        // Backend messages ("This Google account is not authorized for admin
        // access") surface verbatim; Firebase/network errors fall through to
        // getErrorMessage's generic handling.
        setError(getErrorMessage(err));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Smart Polling Booth Officer Allocation</h1>
        <p className="login-subtitle">
          Main Admin Login
        </p>

        {error ? (
          <Toast message={error} type="error" onClose={() => setError(null)} />
        ) : null}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter admin username"
              autoComplete="username"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <Spinner small label="Signing in…" /> : 'Login'}
          </button>
        </form>

        <div className="login-divider"><span>or</span></div>

        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={handleGoogle}
          disabled={loading || googleLoading}
        >
          {googleLoading ? (
            <Spinner small label="Connecting…" />
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ marginRight: 8 }}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="login-demo">
          <p className="login-demo-title">Development credentials</p>
          <div className="login-demo-grid">
            <span><strong>admin</strong> / admin123</span>
          </div>
        </div>

        <p className="login-foot">
          <Link to="/register">Employee? Register your details here</Link>
        </p>
        <p className="login-foot">
          Main Admin only · Authorized personnel only
        </p>
      </div>
    </div>
  );
}