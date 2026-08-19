// THE STAFF VIEW — supervisees for a supervisor, the cohort for `ee.manage`.
//
// The scope is decided in the repository (`getRoster`'s `forUserId`), not here.
// This component renders whatever it is given and has no opinion about who may
// see whom — a component that decides scope is a component that can forget to.

import type { EeRosterRow } from '@/lib/ee/types'

export default function EeRoster({
  rows,
  cohortLabel,
  scope,
}: {
  rows: EeRosterRow[]
  cohortLabel: string
  /** 'mine' — a supervisor's own supervisees. 'all' — the whole cohort. */
  scope: 'mine' | 'all'
}) {
  const unallocated = rows.filter((r) => r.supervisor?.acting).length

  return (
    <>
      <h1>Extended Essay</h1>
      <p className="sub">
        {cohortLabel} ·{' '}
        {scope === 'mine'
          ? `${rows.length} ${rows.length === 1 ? 'supervisee' : 'supervisees'}`
          : `${rows.length} candidates`}
      </p>

      {scope === 'all' && unallocated > 0 && (
        <div className="note" style={{ marginBottom: 14 }}>
          <b>{unallocated} not yet allocated a supervisor.</b> They sit with you until they are —
          nobody is ever unassigned, so this is a worklist rather than a gap.
        </div>
      )}

      <div className="panel">
        <div className="panel-b" style={{ padding: 0 }}>
          <table className="eeroster">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Supervisor</th>
                <th>Subject</th>
                <th>Research question</th>
                <th style={{ textAlign: 'right' }}>Recorded</th>
                <th style={{ textAlign: 'right' }}>Late</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.studentId}>
                  <td>
                    <b>{r.studentName}</b>
                    {r.sessionNumber && <span className="mut"> · {r.sessionNumber}</span>}
                  </td>
                  <td>
                    {r.supervisor ? (
                      <>
                        {r.supervisor.name}
                        {r.supervisor.acting && <span className="pill grey">acting</span>}
                      </>
                    ) : (
                      <span className="mut">—</span>
                    )}
                  </td>
                  <td>
                    {r.registration?.subjects.length ? (
                      <>
                        {r.registration.subjects.join(' + ')}
                        {r.registration.framework && (
                          <div className="mut" style={{ fontSize: 11.5 }}>
                            {r.registration.framework}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="pill grey">not registered</span>
                    )}
                  </td>
                  <td className="eerq">
                    {r.registration?.researchQuestion ?? <span className="mut">—</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {r.done} / {r.total}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {r.late > 0 ? <span className="pill bad">{r.late}</span> : <span className="mut">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-b">
          <div className="note gold">
            <b>Read-only for now.</b> Recording reflection sessions, marking against the rubric,
            attesting and releasing are the next steps — see <b>IB-EE-Build-Plan.md</b> §8. What is
            live here is the record: registrations the students wrote, supervisors as allocated, and
            progress derived from the same requirements the coordinator board reads.
          </div>
        </div>
      </div>
    </>
  )
}
