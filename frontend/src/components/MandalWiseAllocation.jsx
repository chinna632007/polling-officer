import MandalSection from './MandalSection';
import BoothWiseAllocation from './BoothWiseAllocation';

const keyOf = (v) => String(v || '').trim().toLowerCase();

/**
 * MANDAL-WISE ALLOCATION (spec STEP 6 / STEP 7 / STEP 8)
 * -------------------------------------------------------
 * Renders one expandable card PER Mandal. Data from different Mandals is never
 * mixed. Each card shows:
 *   - Total Officers / Total Booths / Allocated / Unallocated / Available Slots
 *   - every booth of the Mandal with its allocated officer list (booth-wise view)
 *   - every unallocated officer of the Mandal with a clear reason
 */
export default function MandalWiseAllocation({
  groups = [],
  allocationsByBooth = {},
  unallocatedList = [],
}) {
  if (groups.length === 0) {
    return <p className="empty-state">No officers or booths uploaded yet.</p>;
  }

  return (
    <div className="mandal-wise">
      {groups.map((g) => {
        const capacity = g.booths.reduce((s, b) => s + (b.requiredOfficers || 0), 0);
        const allocatedCount = g.allocated.length;
        const unallocated = unallocatedList.filter(
          (o) => keyOf(o.mandal || '') === g.key
        );
        const availableSlots = Math.max(0, capacity - allocatedCount);

        return (
          <MandalSection
            key={g.key}
            title={g.mandalName}
            badgeLabel="Officers"
            count={g.officers.length}
            defaultOpen
            stats={[
              { label: 'Total Officers', value: g.officers.length },
              { label: 'Total Booths', value: g.booths.length },
              { label: 'Allocated', value: allocatedCount },
              { label: 'Unallocated', value: unallocated.length },
              { label: 'Available Slots', value: availableSlots },
            ]}
          >
            {g.booths.length === 0 ? (
              <div className="boothwise-grid">
                <section className="card booth-card">
                  <header className="booth-head">
                    <span className="mandal-title">{g.mandalName} Mandal</span>
                    <span className="badge badge-red">No Booths</span>
                  </header>
                  <div className="booth-meta muted">
                    <span className="inline-note">No booths available in {g.mandalName} Mandal.</span>
                  </div>
                  {unallocated.length > 0 ? (
                    <p className="page-subtitle">
                      {unallocated.length} officer(s) remain unallocated - they are never
                      moved to another Mandal.
                    </p>
                  ) : null}
                </section>
              </div>
            ) : (
              <BoothWiseAllocation booths={g.booths} allocationsByBooth={allocationsByBooth} />
            )}

            {unallocated.length > 0 ? (
              <details className="unallocated-box" open={false}>
                <summary className="unallocated-summary">
                  Unallocated Officers in {g.mandalName} Mandal ({unallocated.length})
                </summary>
                <div className="table-wrap">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Officer ID</th>
                        <th>Officer Name</th>
                        <th>Designation</th>
                        <th>Officer Locality</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unallocated.map((o, i) => (
                        <tr key={o._id}>
                          <td className="mono">{i + 1}</td>
                          <td className="mono">{o.officerId}</td>
                          <td>{o.officerName}</td>
                          <td>{o.designation || '—'}</td>
                          <td>{o.locality || '—'}</td>
                          <td>
                            <span className="inline-note">{o.unallocatedReason}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </MandalSection>
        );
      })}
    </div>
  );
}