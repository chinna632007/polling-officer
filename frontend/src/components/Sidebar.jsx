import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../utils/roles';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/upload', label: 'Excel Upload' },
  { to: '/officers', label: 'Officers' },
  { to: '/booths', label: 'Booths' },
  { to: '/allocation', label: 'Allocation' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/reports', label: 'Reports' },
];

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();

  return (
    <>
      {open ? <div className="sidebar-overlay" onClick={onClose} aria-hidden="true" /> : null}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head">
          <div>
            <h2 className="sidebar-title">Election Admin</h2>
            <p className="sidebar-sub">Officer Allocation</p>
          </div>
          <button
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            X
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="badge badge-navy">{roleLabel(user?.role) || 'Main Admin'}</span>
          <span style={{ marginTop: 6, display: 'block' }}>Smart Polling Allocation System</span>
        </div>
      </aside>
    </>
  );
}
