import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { docDownload } from '../services/download';

/**
 * Reports page - every report is generated server-side as an .xlsx download.
 */
const REPORTS = [
  {
    title: 'Officer List',
    desc: 'Complete officer master data (Excel)',
    url: '/api/reports/officers-excel',
  },
  {
    title: 'Booth List',
    desc: 'All polling booths with capacity status (Excel)',
    url: '/api/reports/booths-excel',
  },
  {
    title: 'Allocated Officers',
    desc: 'Officers assigned to booths with compatibility scores (Excel)',
    url: '/api/reports/allocation-excel',
  },
    {
    title: 'Unallocated Officers',
    desc: 'Officers who could not be allocated (Excel)',
    url: '/api/reports/unallocated-officers',
  },
  {
    title: 'Allocation by Mandal',
    desc: 'All Mandals in ONE sheet - each row shows its Mandal, sorted by Officer ID ascending (Excel)',
    url: '/api/reports/allocation-by-mandal',
  },
    {
    mandalInput: true,
    title: 'Allocated Officers for a Mandal',
    desc: 'Pick a Mandal from the list (built from officers + booths) to download its allocated officers (Excel)',
  },
  {
    title: 'Notification Status Report',
    desc: 'SMS delivery status for all messages (Excel)',
    url: '/api/reports/notifications-excel',
  },
];

export default function Reports() {
  const [mandalInput, setMandalInput] = useState('');
  const [mandals, setMandals] = useState([]);
  const [loadingMandals, setLoadingMandals] = useState(false);
  const [downloading, setDownloading] = useState(false);

  /** Unique Mandal names present in the officers AND booths masters. */
  const loadMandals = useCallback(async () => {
    setLoadingMandals(true);
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
      setMandals([...names].sort((a, b) => a.localeCompare(b)));
    } finally {
      setLoadingMandals(false);
    }
  }, []);

  useEffect(() => {
    loadMandals().catch(() => {});
  }, [loadMandals]);

  const downloadForMandal = async (name) => {
    const target = String(name || mandalInput || '').trim();
    if (!target) return;
    setDownloading(true);
    try {
      await docDownload(`/api/reports/allocated-officers/${encodeURIComponent(target)}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Download Excel reports generated from live data</p>
        </div>
      </div>

      <div className="report-grid">
        {REPORTS.map((report) => (
          <div key={report.title} className="card report-card">
            <h3 className="card-title">{report.title}</h3>
            <p className="report-desc">{report.desc}</p>
            {report.mandalInput ? (
              <div className="mandal-download-row">
                <select
                  className="input"
                  value={mandalInput}
                  onChange={(e) => {
                    const name = e.target.value;
                    setMandalInput(name);
                    // Selecting a Mandal downloads that Mandal's data immediately.
                    if (name) downloadForMandal(name);
                  }}
                  disabled={downloading || loadingMandals}
                >
                  <option value="">
                    {loadingMandals ? 'Loading Mandals…' : 'Select Mandal…'}
                  </option>
                  {mandals.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => downloadForMandal()}
                  disabled={downloading || !mandalInput.trim()}
                >
                  {downloading ? 'Downloading…' : 'Download .xlsx'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => docDownload(report.url)}
              >
                Download .xlsx
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}