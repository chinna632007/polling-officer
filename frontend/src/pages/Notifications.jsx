import { useEffect, useMemo, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../services/api';
import NotificationStatus from '../components/NotificationStatus';
import MandalSection from '../components/MandalSection';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';
import Badge from '../components/Badge';
import { compareOfficerIds } from '../utils/naturalSort';

const STATUS_FILTERS = ['', 'PENDING', 'ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED', 'DEMO_SENT'];
const CHANNEL_FILTERS = [
  { id: '', label: 'All Channels' },
  { id: 'sms', label: 'SMS' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
];

/** Plain-words status for elders/newbies: technical code -> friendly label. */
export function friendlyStatus(status) {
  switch (String(status || '').toUpperCase()) {
    case 'PENDING': return 'Waiting to send';
    case 'ACCEPTED': return 'Sent to WhatsApp';
    case 'SENT': return 'Sent';
    case 'DELIVERED': return 'Delivered';
    case 'READ': return 'Seen by officer';
    case 'FAILED': return 'Failed — can retry';
    case 'SKIPPED': return 'Skipped';
    case 'DEMO_SENT': return 'Demo sent (no real SMS)';
    default: return status || '—';
  }
}

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
  const [channel, setChannel] = useState('');
  const [mandal, setMandal] = useState('');
  const [mandals, setMandals] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [summary, setSummary] = useState(null);
  const [retryingIds, setRetryingIds] = useState(new Set());
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
      if (channel) params.channel = channel;
      if (mandal) params.mandal = mandal;
      const [{ data }, sumRes] = await Promise.all([
        api.get('/api/notifications', { params }),
        api.get('/api/notifications/summary', { params: mandal ? { mandal } : {} }).catch(() => null),
      ]);
      setNotifications(data.data);
      setPagination(data.pagination);
      if (sumRes?.data?.data) setSummary(sumRes.data.data);
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, status, channel, mandal]);

  useEffect(() => {
    fetchNotifications().catch(() => {});
  }, [fetchNotifications]);

  useEffect(() => {
    loadMandals().catch(() => {});
  }, [loadMandals]);

  const doRetry = async (n) => {
    setRetryingIds((prev) => new Set(prev).add(n._id));
    try {
      const { data } = await api.post(`/api/notifications/retry/${n._id}`);
      setNotify({ message: data.message || 'Retry sent.', type: 'success' });
      await fetchNotifications();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(n._id);
        return next;
      });
    }
  };

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

  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            SMS + WhatsApp + Email history for every polling-duty message.
            Green means delivered, red means failed (press Retry).
          </p>
        </div>
      </div>

      {summary ? (
        <div className="stat-grid">
          {['sms', 'whatsapp', 'email'].map((ch) => {
            const s = summary.byChannel?.[ch] || {};
            const ok = (s.SENT || 0) + (s.DELIVERED || 0) + (s.READ || 0) + (s.ACCEPTED || 0) + (s.DEMO_SENT || 0);
            const bad = s.FAILED || 0;
            return (
              <div className="card stat-card" key={ch}>
                <span className="muted" style={{ textTransform: 'capitalize' }}>{ch}</span>
                <strong style={{ fontSize: 20 }}>✔ {ok} sent · ✖ {bad} failed</strong>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="tab-row">
        {CHANNEL_FILTERS.map((c) => (
          <button
            key={c.id || 'all'}
            type="button"
            className={`tab-btn ${channel === c.id ? 'active' : ''}`}
            onClick={() => { setChannel(c.id); setPage(1); }}
          >
            {c.label}
          </button>
        ))}
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
              {s ? friendlyStatus(s) : 'All Statuses'}
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
            setChannel('');
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
            <NotificationStatus notifications={group.rows} loading={false} onRetry={doRetry} retryingIds={retryingIds} />
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