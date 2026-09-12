import Badge from './Badge';

/** Renders one notification row with its delivery status. */
export default function NotificationStatus({ notifications = [], loading, onResend }) {
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
            <th>Mobile Number</th>
            <th>Booth Number</th>
            <th>Booth Name</th>
            <th>Mandal</th>
            <th>Message</th>
            <th>Status</th>
            <th>Created Date</th>
            <th>Sent Date</th>
            <th>Actions</th>
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
              <td className="mono">{n.mobileNumber}</td>
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
                <Badge>{n.status}</Badge>
              </td>
              <td>{n.createdAt ? new Date(n.createdAt).toLocaleString() : '—'}</td>
              <td>{n.sentAt ? new Date(n.sentAt).toLocaleString() : '—'}</td>
              <td className="col-actions">
                {onResend ? (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => onResend(n)}>
                    {n.status === 'SENT' ? 'Resend' : 'Send'}
                  </button>
                ) : (<span className="muted">—</span>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}