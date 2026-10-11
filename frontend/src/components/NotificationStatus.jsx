import Badge from './Badge';

/** Plain-words status (matches Notifications page, no circular import). */
function friendlyStatus(status) {
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

/** Tooltip for the Received badge: first download time + total downloads. */
function receivedTitle(card) {
  const first = card.receivedAt ? new Date(card.receivedAt).toLocaleString() : '';
  const count = card.downloadCount || 1;
  return `Downloaded ${first}${count > 1 ? ` · ${count} downloads` : ''}`;
}

function toneFor(status) {
  const s = String(status || '').toUpperCase();
  if (['DELIVERED', 'READ', 'SENT', 'DEMO_SENT'].includes(s)) return 'green';
  if (['FAILED'].includes(s)) return 'red';
  if (['PENDING', 'ACCEPTED'].includes(s)) return 'amber';
  return undefined;
}

/** Renders one notification row with channel, friendly status + retry. */
export default function NotificationStatus({ notifications = [], loading, onRetry, retryingIds = new Set() }) {
  if (loading) {
    return <p className="empty-state">Loading notifications…</p>;
  }
  if (!notifications.length) {
    return <p className="empty-state">No notifications have been sent yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Officer Name</th>
            <th>Channel</th>
            <th>Mobile Number</th>
            <th>Booth Number</th>
            <th>Booth Name</th>
            <th>Mandal</th>
            <th>Message</th>
            <th>Status</th>
            <th>ID Card Received</th>
            <th>Created Date</th>
            <th>Sent Date</th>
            <th>Retry</th>
          </tr>
        </thead>
        <tbody>
          {notifications.map((n, idx) => (
            <tr key={n._id}>
              <td className="mono">{idx + 1}</td>
              <td>
                <div>{n.officer?.officerName || n.officerName || '—'}</div>
                <div className="muted mono">{n.officer?.officerId || ''}</div>
              </td>
              <td style={{ textTransform: 'capitalize' }}>{n.channel || 'sms'}</td>
              <td className="mono">{n.channel === 'email' ? (n.email || '—') : (n.mobileNumber || '—')}</td>
              <td className="mono">{n.booth?.boothNumber || n.allocation?.booth?.boothNumber || '—'}</td>
              <td>{n.booth?.boothName || n.allocation?.booth?.boothName || '—'}</td>
              <td>{n.mandal || n.officer?.mandal || '—'}</td>
              <td>
                <details className="msg-details">
                  <summary>View message</summary>
                  <pre className="msg-content">{n.message}</pre>
                </details>
              </td>
              <td>
                <span title={n.status}>
                  <Badge tone={toneFor(n.status)}>{friendlyStatus(n.status)}</Badge>
                </span>
                {n.error ? <div className="muted" style={{ maxWidth: 220 }}>{n.error}</div> : null}
              </td>
              <td>
                {n.idCard?.issued ? (
                  n.idCard.receivedAt ? (
                    <span title={receivedTitle(n.idCard)}>
                      <Badge tone="green">Received</Badge>
                    </span>
                  ) : (
                    <Badge tone="amber">Not received</Badge>
                  )
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>{n.createdAt ? new Date(n.createdAt).toLocaleString() : '—'}</td>
              <td>{n.sentAt ? new Date(n.sentAt).toLocaleString() : '—'}</td>
              <td>
                {n.status === 'FAILED' && n.retryable !== false && (n.channel === 'sms' || n.channel === 'whatsapp') ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    disabled={retryingIds.has(n._id)}
                    onClick={() => onRetry && onRetry(n)}
                  >
                    {retryingIds.has(n._id) ? 'Retrying…' : 'Retry'}
                  </button>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}