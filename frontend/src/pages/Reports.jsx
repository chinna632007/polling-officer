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
    id: 'allocated-mandal',
    mandalSelect: true,
    requireMandal: true,
    title: 'Allocated Officers for a Mandal',
    desc: 'Select a Mandal, then press Download to get its allocated officers (Excel)',
    buildUrl: (m) =>
      m ? `/api/reports/allocated-officers/${encodeURIComponent(m)}` : null,
  },
  {
    id: 'notification-mandal',
    mandalSelect: true,
    requireMandal: false,
    title: 'Notification Status Report',
    desc: 'Select a Mandal and press Download for that Mandal, or "All Mandals" for everything (Excel)',
    buildUrl: (m) =>
      m
        ? `/api/reports/notifications-excel?mandal=${encodeURIComponent(m)}`
        : '/api/reports/notifications-excel',
  },
];

export default function Reports() {
  const [mandalSelections, setMandalSelections] = useState({});
  const [mandals, setMandals] = useState([]);
  const [loadingMandals, setLoadingMandals] = useState(false);
  const [downloading, setDownloading] = useState({});

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

  const setSelection = (reportId, value) => {
    setMandalSelections((prev) => ({ ...prev, [reportId]: value }));
  };

  // Download starts ONLY from the Download button. Selecting never downloads.
  const downloadMandalReport = async (report) => {
    const selected = String(mandalSelections[report.id] || '').trim();
    if (report.requireMandal && !selected) return;
    const url = report.buildUrl(selected);
    if (!url) return;
    setDownloading((prev) => ({ ...prev, [report.id]: true }));
    try {
      await docDownload(url);
    } finally {
      setDownloading((prev) => ({ ...prev, [report.id]: false }));
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
            {report.mandalSelect ? (
              <div className="mandal-download-row">
                <select
                  className="input"
                  value={mandalSelections[report.id] || ''}
                  onChange={(e) => setSelection(report.id, e.target.value)}
                  disabled={Boolean(downloading[report.id]) || loadingMandals}
                >
                  <option value="">
                    {loadingMandals
                      ? 'Loading Mandals…'
                      : report.requireMandal ? 'Select Mandal…' : 'All Mandals'}
                  </option>
                  {mandals.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => downloadMandalReport(report)}
                  disabled={
                    Boolean(downloading[report.id]) ||
                    (report.requireMandal &&
                      !String(mandalSelections[report.id] || '').trim())
                  }
                >
                  {downloading[report.id] ? 'Downloading…' : 'Download .xlsx'}
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