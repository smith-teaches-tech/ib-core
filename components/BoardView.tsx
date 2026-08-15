import Link from 'next/link'
import type { Board, Lane } from '@/lib/types'

/**
 * ZOOM 3 — every student, every requirement. The same data as the track,
 * compressed to one row each.
 *
 * This replaces the attention queue. A queue grows without limit and becomes
 * wallpaper; a board is bounded — rows grow with the cohort, columns never do.
 * You scan for holes, and the holes are the work.
 *
 * A null cell means the requirement doesn't apply to that student, because they
 * aren't enrolled in that course. That is the whole answer to "students take
 * different subjects" and it costs nothing to compute.
 */
export default function BoardView({
  board,
  cohortLabel,
  exportOnly,
}: {
  board: Board
  cohortLabel: string
  exportOnly: boolean
}) {
  const totalCells = board.rows.reduce((n, r) => n + r.applicable, 0)
  const doneCells = board.rows.reduce((n, r) => n + r.done, 0)

  // Draw a divider wherever the lane changes.
  const laneStarts = new Set<number>()
  let last: Lane | null = null
  board.columns.forEach((c, i) => {
    if (c.lane !== last) laneStarts.add(i)
    last = c.lane
  })

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>
          {cohortLabel} — {board.rows.length} candidates × {board.columns.length} requirements
        </h2>
        <span className="spacer" />
        <Link className="btn sm" href={exportOnly ? '/' : '/?export=1'}>
          {exportOnly ? 'Show all requirements' : 'Export-blocking only'}
        </Link>
        <button className="btn pri sm">⤓ Build export pack</button>
      </div>

      <div className="panel-b" style={{ overflowX: 'auto' }}>
        <table className="board">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th style={{ width: 128 }}>Candidate</th>
              {board.columns.map((c, i) => (
                <th
                  key={c.id}
                  className="rot"
                  style={laneStarts.has(i) && i > 0 ? { borderLeft: '2px solid #d6dde4' } : undefined}
                >
                  {c.label}
                </th>
              ))}
              <th style={{ width: 56 }}>Done</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((r) => {
              const pct = r.applicable === 0 ? 0 : r.done / r.applicable
              return (
                <tr key={r.student.userId}>
                  <td className="sn">{r.student.sessionNumber}</td>
                  <td className="nm">{r.user.name}</td>
                  {r.cells.map((c, i) => (
                    <td
                      key={i}
                      style={laneStarts.has(i) && i > 0 ? { borderLeft: '2px solid #d6dde4' } : undefined}
                    >
                      <i
                        className={`cellbox ${c ? c.display : 'na'}`}
                        title={
                          c
                            ? `${board.columns[i].label} — ${c.display.replace('_', ' ')}`
                            : `${board.columns[i].label} — not applicable (not enrolled)`
                        }
                      />
                    </td>
                  ))}
                  <td
                    style={{
                      fontWeight: 700,
                      color: pct > 0.85 ? 'var(--ok)' : pct > 0.6 ? 'var(--gold)' : 'var(--warn)',
                    }}
                  >
                    {r.done}/{r.applicable}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="panel-b" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="legend">
          <span className="caps">Legend</span>
          <span className="k"><i className="cellbox done" /> Recorded</span>
          <span className="k"><i className="cellbox partial" /> In progress</span>
          <span className="k"><i className="cellbox" /> Not started</span>
          <span className="k"><i className="cellbox future" /> Not open yet</span>
          <span className="k"><i className="cellbox na" /> Not applicable</span>
          <span className="spacer" />
          <b>{doneCells} of {totalCells} recorded</b>
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          Hatched cells are requirements that <b>don&rsquo;t apply</b> — that student isn&rsquo;t
          enrolled in the course. Requirements are defined once per course; a student&rsquo;s set is
          simply the union of what they take, so English HL and English SL carry different rows
          with no special handling.
        </div>
        {exportOnly && (
          <div className="note gold" style={{ marginTop: 10 }}>
            Filtered to requirements with an IB export target. What&rsquo;s left is precisely what
            stands between you and a complete upload.
          </div>
        )}
      </div>
    </div>
  )
}
