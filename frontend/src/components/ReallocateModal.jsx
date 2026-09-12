import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../services/api';
import Spinner from './Spinner';

/**
 * Reallocate modal (spec section 16).
 * Shows the current booth + officer address, then lets the admin pick one of
 * the backend-computed suitable booths. The frontend never decides the rules.
 */
export default function ReallocateModal({ allocation, onClose, onDone }) {
  const [booths, setBooths] = useState([]);
  const [officer, setOfficer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // After the admin ACCEPTS a booth: the reallocation result + the
  // auto-created notification with the accepted booth message.
  const [accepted, setAccepted] = useState(null);

  const officerId = allocation?.officer?.officerId;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!officerId) return;
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get(
          `/api/allocation/suitable-booths/${encodeURIComponent(officerId)}`
        );
        if (cancelled) return;
        setOfficer(data.data?.officer || null);
        setBooths(data.data?.booths || []);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [officerId]);

  if (!allocation) return null;

  const current = allocation.booth;

  const submit = async () => {
    if (!selected) {
      setError('Please select a suitable booth first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(`/api/allocation/${allocation._id}/reallocate`, {
        preferredBoothId: selected,
      });
      const payload = res.data || {};
      let notification = payload.notification || null;
      // Fallback: if the backend could not auto-create the notification,
      // generate it now through the notification send endpoint.
      if (!notification && payload.newAllocation?._id) {
        try {
          const nres = await api.post(
            `/api/notifications/send/${payload.newAllocation._id}`
          );
          notification = nres.data || null;
        } catch (err) {
          notification = null;
        }
      }
      // Refresh the allocation page behind the modal, but keep the modal open
      // so the admin can see the notification for the accepted booth.
      if (onDone) await onDone();
      setAccepted({
        booth: payload.chosenBooth || null,
        newAllocation: payload.newAllocation || null,
        notification,
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setAccepted(null);
    setSelected('');
    setError(null);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={accepted ? reset : onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        {!accepted ? (
          <>
        <h3 className="modal-title">Reallocate {allocation.officer?.officerName}</h3>
        <div className="realloc-grid">
          <div className="realloc-box">
            <h4>Current booth</h4>
            <p><strong>Booth {current?.boothNumber}</strong> — {current?.boothName || '—'}</p>
            <p className="muted">{current?.buildingName || ''}{current?.locality ? ` · ${current.locality}` : ''}{current?.mandal ? ` · ${current.mandal}` : ''}</p>
          </div>
          <div className="realloc-box">
            <h4>Officer address</h4>
            <p>{officer?.officerName || allocation.officer?.officerName} ({officer?.officerId || allocation.officer?.officerId})</p>
            <p className="muted">
              {[officer?.houseNumber || allocation.officer?.houseNumber, officer?.street || allocation.officer?.street, officer?.locality || allocation.officer?.locality, officer?.ward || allocation.officer?.ward ? `Ward ${officer?.ward || allocation.officer?.ward}` : '', officer?.mandal || allocation.officer?.mandal].filter(Boolean).join(', ')}
            </p>
          </div>
        </div>

        <h4 className="modal-sub">Available booths for changing (same Mandal, different locality)</h4>
        {loading ? (
          <Spinner label="Loading suitable booths…" />
        ) : error && booths.length === 0 ? (
          <p className="empty-state">{error}</p>
        ) : booths.length === 0 ? (
          <p className="empty-state">No suitable alternative booth with free capacity.</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th></th>
                  <th>Booth No.</th>
                  <th>Booth Name</th>
                  <th>Building</th>
                  <th>Locality</th>
                  <th>Free slots</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {booths
                  .filter((b) => String(b._id) !== String(current?._id))
                  .map((b) => (
                    <tr key={b._id}>
                      <td>
                        <input
                          type="radio"
                          name="realloc-booth"
                          checked={selected === String(b._id)}
                          onChange={() => setSelected(String(b._id))}
                        />
                      </td>
                      <td className="mono">{b.boothNumber}</td>
                      <td>{b.boothName}</td>
                      <td>{b.buildingName || '—'}</td>
                      <td>{b.locality || '—'}</td>
                      <td className="mono">{b.availableSlots}</td>
                      <td className="muted">{b.reason || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {error && booths.length > 0 ? <p className="field-error">{error}</p> : null}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={saving || loading || booths.length === 0 || !selected}
          >
            {saving ? 'Accepting…' : 'Accept'}
          </button>
        </div>
          </>
        ) : (
          <>
            <h3 className="modal-title">Booth accepted — {allocation.officer?.officerName}</h3>
            <div className="realloc-grid">
              <div className="realloc-box">
                <h4>Previous booth</h4>
                <p><strong>Booth {current?.boothNumber}</strong> — {current?.boothName || '—'}</p>
                <p className="muted">Released — the officer has been moved out of this booth.</p>
              </div>
              <div className="realloc-box realloc-box-accepted">
                <h4>Accepted booth</h4>
                <p><strong>Booth {accepted.booth?.boothNumber}</strong> — {accepted.booth?.boothName || '—'}</p>
                <p className="muted">{accepted.booth?.buildingName || ''}{accepted.booth?.locality ? ` · ${accepted.booth.locality}` : ''}{accepted.booth?.mandal ? ` · ${accepted.booth.mandal}` : ''}</p>
                {accepted.newAllocation?.allocationId ? (
                  <p className="mono muted">{accepted.newAllocation.allocationId}</p>
                ) : null}
              </div>
            </div>

            <div className="notif-section">
              <h4 className="modal-sub">Notification for the accepted booth</h4>
              {accepted.notification ? (
                <>
                  <div className="notif-meta">
                    <span>
                      Status: <strong>{accepted.notification.status}</strong>
                      {accepted.notification.provider ? ` (provider: ${accepted.notification.provider})` : ''}
                    </span>
                    <span className="mono muted">Mobile: {accepted.notification.mobileNumber}</span>
                  </div>
                  <pre className="msg-content notif-message">{accepted.notification.message}</pre>
                  <p className="muted">
                    This notification is saved in the Notifications section with the accepted booth message
                    {accepted.notification.status === 'DEMO_SENT' || accepted.notification.status === 'PENDING' ? ' (demo mode - configure SMS credentials in .env to send a real SMS)' : ''}.
                  </p>
                </>
              ) : (
                <p className="empty-state">
                  Reallocation saved, but the notification could not be generated right now.
                  Use "Send Notification" for this officer on the Allocation page.
                </p>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
