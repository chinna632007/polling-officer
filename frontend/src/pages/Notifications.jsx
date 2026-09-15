import { useEffect, useMemo, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../services/api';
import NotificationStatus from '../components/NotificationStatus';
import MandalSection from '../components/MandalSection';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import { compareOfficerIds } from '../utils/naturalSort';

const STATUS_FILTERS = ['', 'PENDING', 'SENT', 'FAILED', 'DEMO_SENT'];

/** Mandal name of a notification row: snapshot -> officer -> booth fallback. */
function mandalOf(n) {
  return (
    String(n?.mandal || n?.officer?.mandal || n?.booth?.mandal || '').trim() || 'Unknown'
  );
}

/** Officer ID of a notification row (for numeric sorting). */
function officerIdOf(n) {
  return String(n?.officer?.officerId || n?.officerId || '');
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [mandal, setMandal] = useState('');
  const [mandals, setMandals] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [notify, setNotify] = useState(null);

  /** Unique Mandal names from officers + booths (same source as Reports page). */
  const loadMandals = useCallback(async () => {
    try {
      const [officersRes, boothsRes] = await Promise.all([
        api.get('/api/officers/grouped'),
        api.get('/api/booths/grouped'),
      ]);
      const names = new Set();
      (officersRes.data?.data || []).forEach((g) => {
        if (g.mandal) names.add(g.mandal);
      });
      (boothsRes.data?.data || []).forEach((g) => {
        if (g.mandal) names.add(g.mandal);
      });
      // Also include Mandals that appear only on notification records.
      notifications.forEach((n) => {
        const m = mandalOf(n);
        if (m && m !== 'Unknown') names.add(m);
      });
      setMandals([...names].sort((a, b) => a.localeCompare(b)));
    } catch {
      // Dropdown stays usable with the notification rows as fallback.
    }
  }, [notifications]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page };
      if (status) params.status = status;
      if (mandal) params.mandal = mandal;
      const { data } = await api.get('/api/notifications', { params });
      setNotifications(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, status, mandal]);

  useEffect(() => {
    fetchNotifications().catch(() => {});
  }, [fetchNotifications]);

  useEffect(() => {
    loadMandals().catch(() => {});
  }, [loadMandals]);

  // Mandal-wise grouping: Mandals ascending, officers inside by numeric ID.
  const notificationGroups = useMemo(() => {
    const map = new Map();
    notifications.forEach((n) => {
      const name = mandalOf(n);
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(n);
    });
    return [...map.entries()]
      .map(([name, rows]) => ({
        name,
        rows: rows.sort((a, b) => compareOfficerIds(officerIdOf(a), officerIdOf(b))),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [notifications]);

  const doResend = async (n) => {
    try {
      const { data } = await api.post(`/api/notifications/resend/${n._id}`);
      setNotify({ message: data.message || `Notification ${data.data?.status || ''}`, type: 'success' });
      fetchNotifications().catch(() => {});
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    }
  };

  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            SMS delivery status for every polling-duty message sent to officers
          </p>
        </div>
      </div>

      <div className="toolbar card">
        <select
          className="input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s || 'all'} value={s}>
              {s || 'All Statuses'}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={mandal}
          onChange={(e) => {
            setMandal(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Mandals</option>
          {mandals.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setStatus('');
            setMandal('');
            setPage(1);
          }}
        >
          Clear
        </button>
      </div>

      {loading && notifications.length === 0 ? (
        <Spinner label="Loading notifications…" />
      ) : notificationGroups.length === 0 ? (
        <p className="empty-state">No notifications have been sent yet.</p>
      ) : (
        notificationGroups.map((group) => (
          <MandalSection
            key={group.name}
            title={group.name}
            badgeLabel="notifications"
            count={group.rows.length}
            defaultOpen
          >
            <NotificationStatus
              notifications={group.rows}
              loading={false}
              onResend={doResend}
            />
          </MandalSection>
        ))
      )}

      {pagination.pages > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span className="muted">
            Page {page} / {pagination.pages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}