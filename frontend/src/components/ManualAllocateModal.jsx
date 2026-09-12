import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../services/api';
import Spinner from './Spinner';

export default function ManualAllocateModal({ open, unallocatedOfficers = [], onClose, onDone }) {
  const [officerId, setOfficerId] = useState('');
  const [booths, setBooths] = useState([]);
  const [selectedBooth, setSelectedBooth] = useState('');
  const [loadingBooths, setLoadingBooths] = useState(false);
  const [officerDetail, setOfficerDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setOfficerId(''); setBooths([]); setSelectedBooth('');
      setOfficerDetail(null); setError(null);
    }
  }, [open ]);

  if (!open) return null;

  const officer = unallocatedOfficers.find((o) => String(o.officerId) === String(officerId) || String(o._id) === String(officerId)) || null;

  const loadBooths = async (id) => {
    if (!id) return;
    setLoadingBooths(true); setError(null); setSelectedBooth('');
    try {
      const { data } = await api.get(`/api/allocation/suitable-booths/${encodeURIComponent(id)}`);
      setOfficerDetail(data.data?.officer || null);
      setBooths(data.data?.booths || []);
    } catch (err) { setError(getErrorMessage(err)); setBooths([]); }
    finally { setLoadingBooths(false); }
  };

  const submit = async () => {
    if (!officerId || !selectedBooth) { setError('Please select an officer and a booth.'); return; }
    setSaving(true); setError(null);
    try {
      await api.post('/api/allocation/manual', {
        officerId: officerDetail?.officerId || officer?.officerId || officerId,
        boothId: selectedBooth,
      });
      if (onDone) await onDone();
      onClose();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Manual Allocate Officer</h3>
        <label className="field-label" htmlFor="manual-officer">Unallocated officer</label>
        <select id="manual-officer" className="input" value={officerId}
          onChange={(e) => { setOfficerId(e.target.value); loadBooths(e.target.value); }}>
          <option value="">Select an unallocated officer...</option>
          {unallocatedOfficers.map((o) => (
            <option key={o._id} value={o.officerId}>{o.officerId} - {o.officerName} ({o.mandal})</option>
          ))}
        </select>
        {(officer || officerDetail) ? (
          <div className="realloc-box">
            <h4>Officer details</h4>
            <p><strong>{officerDetail?.officerName || officer?.officerName}</strong> ({officerDetail?.officerId || officer?.officerId})</p>
            <p className="muted">Designation: {officerDetail?.designation || officer?.designation || '-'} | Mobile: {officerDetail?.mobileNumber || officer?.mobileNumber || '-'}</p>
            <p className="muted">Mandal: {officerDetail?.mandal || officer?.mandal || '-'} | Locality: {officerDetail?.locality || officer?.locality || '-'}</p>
          </div>
        ) : null}
        <h4 className="modal-sub">Suitable booths (same Mandal, capacity, different locality first)</h4>
        {loadingBooths ? (<Spinner label="Loading suitable booths..." />
        ) : !officerId ? (<p className="empty-state">Select an officer to see suitable booths.</p>
        ) : booths.length === 0 ? (<p className="empty-state">No suitable booth with free capacity for this officer.</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-sm">
              <thead><tr><th></th><th>Booth No.</th><th>Booth Name</th><th>Locality</th><th>Mandal</th><th>Free slots</th><th>Reason</th></tr></thead>
              <tbody>
                {booths.map((b) => (
                  <tr key={b._id}>
                    <td><input type="radio" name="manual-booth" checked={selectedBooth === String(b.boothId) || selectedBooth === String(b._id)} onChange={() => setSelectedBooth(String(b.boothId))} /></td>
                    <td className="mono">{b.boothNumber}</td>
                    <td>{b.boothName}</td>
                    <td>{b.locality || '-'}</td>
                    <td>{b.mandal || '-'}</td>
                    <td className="mono">{b.availableSlots}</td>
                    <td className="muted">{b.isFallback ? `Fallback Allocation - ${b.reason || ''}` : (b.reason || '-')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error ? <p className="field-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || !officerId || !selectedBooth}>
            {saving ? 'Allocating...' : 'Allocate Officer'}
          </button>
        </div>
      </div>
    </div>
  );
}
