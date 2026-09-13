import { useState } from 'react';
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
    desc: 'Download the allocated-officers list for one Mandal. Case-insensitive (Jami / jami / " JAMI " all match).',
  },
  {
    title: 'Notification Status Report',
    desc: 'SMS delivery status for all messages (Excel)',
    url: '/api/reports/notifications-excel',
  },
];

export default function Reports() {
  const [mandalInput, setMandalInput] = useState('');
  const [downloading, setDownloading] = useState(false);

  const downloadForMandal = async () => {
    const name = mandalInput.trim();
    if (!name) return;
    setDownloading(true);
    try {
      await docDownload(`/api/reports/allocated-officers/${encodeURIComponent(name)}`);
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
                <input
                  type="text"
                                    className="input"
                  value={mandalInput}
                  placeholder="e.g. Jami"
                  onChange={(e) => setMandalInput(e.target.value)}
                  disabled={downloading}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={downloadForMandal}
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