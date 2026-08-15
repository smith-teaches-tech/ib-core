import Link from 'next/link'
import type { Board, BoardCell, Lane, WaitingOn } from '@/lib/types'

/**
 * ZOOM 3 — every candidate, compressed to one row.
 *
 * This is a READINESS board, not a completeness board. A column earns its place
 * only if the coordinator has to be able to say YES to it before opening IBIS.
 * Everything else is still recorded, still on the student track, still on the
 * module screen — it is simply not the coordinator's problem, so it is not on
 * the coordinator's screen. That is what took 85 columns down to 9.
 *
 * Two things carry the design:
 *
 *   click a LANE HEADING       → that lane expands into its real requirements
 *   the WAITING ON column      → student · teacher · you, from `recordedBy`
 *
 * No client state: every control is a link and this stays a server component.
 * The URL is the view, so "teachers, export-blocking" can be bookmarked.
 */

export type RowFilter = 'outstanding' | 'all'
export type SortKey = 'outstanding' | 'session'
export type TurnKey = 'any' | 'student' | 'staff' | 'coordinator'

export interface BoardControls {
  expanded: Lane[]
  rows: RowFilter
  sort: SortKey
  turn: TurnKey
  exportOnly: boolean
}

/**
 * Every control is a link, so the URL carries the whole view. `keep` is for
 * params that are not the board's own — the cohort, chiefly — which must survive
 * every toggle or switching year group silently resets your filters.
 */
function makeHref(
  base: string,
  c: BoardControls,
  patch: Partial<BoardControls>,
  keep: Record<string, string> = {},
) {
  const next = { ...c, ...patch }
  const q = new URLSearchParams(keep)
  if (next.expanded.length) q.set('expand', next.expanded.join(','))
  if (next.rows !== 'outstanding') q.set('rows', next.rows)
  if (next.sort !== 'outstanding') q.set('sort', next.sort)
  if (next.turn !== 'any') q.set('turn', next.turn)
  if (next.exportOnly) q.set('export', '1')
  const s = q.toString()
  return s ? `${base}?${s}` : base
}

const toggleLane = (expanded: Lane[], lane: Lane) =>
  expanded.includes(lane) ? expanded.filter((l) => l !== lane) : [...expanded, lane]

function fracClass(done: number, total: number) {
  if (total === 0 || done === 0) return 'zero'
  if (done === total) return 'ok'
  return done / total >= 0.6 ? 'mid' : 'bad'
}

function Cell({ cell }: { cell: BoardCell }) {
  if (cell.kind === 'na') {
    return <i className="cellbox na" title="Not applicable — not enrolled in this course" />
  }
  if (cell.kind === 'check') {
    return (
      <i
        className={`cellbox ${cell.display === 'not_started' ? '' : cell.display}`}
        title={cell.title}
      />
    )
  }
  if (cell.kind === 'fraction') {
    return (
      <span className={`bfrac ${fracClass(cell.done, cell.total)}`} title={cell.title}>
        {cell.done}/{cell.total}
      </span>
    )
  }
  return (
    <span className="brollup" title={cell.title}>
      {cell.parts.map((p) => (
        <span
          key={p.label}
          className={`bfrac ${fracClass(p.done, p.total)}`}
          title={`${p.label} — ${p.done} of ${p.total}`}
        >
          {p.done}/{p.total}
        </span>
      ))}
    </span>
  )
}

/**
 * Whose turn is it. The reframe that matters: "what is missing" is always a long
 * list; "what is mine" usually is not.
 */
function Waiting({ w }: { w: WaitingOn }) {
  if (w.student + w.staff + w.coordinator === 0) {
    return (
      <span className="turn">
        <span className="z">clear</span>
      </span>
    )
  }
  return (
    <span className="turn">
      {w.student > 0 && (
        <span className="s" title="Waiting on the student">
          {w.student}
        </span>
      )}
      {w.staff > 0 && (
        <span className="t" title="Waiting on a teacher">
          {w.staff}
        </span>
      )}
      {w.coordinator > 0 && (
        <span className="m" title="Waiting on you">
          {w.coordinator}
        </span>
      )}
    </span>
  )
}

function Seg<K extends keyof BoardControls>({
  label,
  param,
  options,
  controls,
  href,
}: {
  label: string
  param: K
  options: { value: string; text: string; patch: Partial<BoardControls> }[]
  controls: BoardControls
  href: (patch: Partial<BoardControls>) => string
}) {
  return (
    <>
      <span className="caps">{label}</span>
      <span className="bseg">
        {options.map((o) => (
          <Link
            key={o.value}
            href={href(o.patch)}
            className={`btn sm ${String(controls[param]) === o.value ? 'on' : ''}`}
          >
            {o.text}
          </Link>
        ))}
      </span>
    </>
  )
}

export default function BoardView({
  board,
  cohortLabel,
  controls,
  base,
  keep = {},
}: {
  board: Board
  cohortLabel: string
  controls: BoardControls
  base: string
  /** Params outside the board's control that every link must preserve. */
  keep?: Record<string, string>
}) {
  const href = (patch: Partial<BoardControls>) => makeHref(base, controls, patch, keep)
  // Where each lane starts, so the divider lands in the right place.
  const laneStart = new Set<number>()
  let at = 0
  for (const g of board.groups) {
    laneStart.add(at)
    at += g.span
  }
  const expandedLanes = new Set(board.groups.filter((g) => g.expanded).map((g) => g.lane))

  // Filtering and ordering are PRESENTATION, so they happen here rather than in
  // the repository — the board handed back is the same board either way.
  const outstanding = (w: WaitingOn) => w.student + w.staff + w.coordinator
  let rows = board.rows
  if (controls.rows === 'outstanding') rows = rows.filter((r) => outstanding(r.waiting) > 0)
  const turn = controls.turn
  if (turn !== 'any') rows = rows.filter((r) => r.waiting[turn] > 0)
  rows = [...rows].sort((a, b) =>
    controls.sort === 'outstanding'
      ? outstanding(b.waiting) - outstanding(a.waiting)
      : (a.student.sessionNumber ?? '').localeCompare(b.student.sessionNumber ?? ''),
  )

  const hidden = board.rows.length - rows.length

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>
          {cohortLabel} — {rows.length} candidate{rows.length === 1 ? '' : 's'} ×{' '}
          {board.columns.length} column{board.columns.length === 1 ? '' : 's'}
        </h2>
        <span className="spacer" />
        <Link
          className="btn sm"
          href={href({ exportOnly: !controls.exportOnly })}
        >
          {controls.exportOnly ? 'Show all requirements' : 'Export-blocking only'}
        </Link>
        <button className="btn pri sm">⤓ Build export pack</button>
      </div>

      <div className="panel-h bcontrols">
        <Seg
          label="Rows"
          param="rows"
          controls={controls}
          href={href}
          options={[
            { value: 'outstanding', text: 'Outstanding only', patch: { rows: 'outstanding' } },
            { value: 'all', text: `All ${board.rows.length}`, patch: { rows: 'all' } },
          ]}
        />
        <Seg
          label="Waiting on"
          param="turn"
          controls={controls}
          href={href}
          options={[
            { value: 'any', text: 'Anyone', patch: { turn: 'any' } },
            { value: 'student', text: 'Students', patch: { turn: 'student' } },
            { value: 'staff', text: 'Teachers', patch: { turn: 'staff' } },
            { value: 'coordinator', text: 'You', patch: { turn: 'coordinator' } },
          ]}
        />
        <Seg
          label="Order"
          param="sort"
          controls={controls}
          href={href}
          options={[
            { value: 'outstanding', text: 'Most outstanding', patch: { sort: 'outstanding' } },
            { value: 'session', text: 'Session no.', patch: { sort: 'session' } },
          ]}
        />
        <span className="spacer" />
        <span className="mut bhint">Click a lane heading to expand it</span>
      </div>

      <div className="bscroll">
        <table className="board">
          <thead>
            <tr className="bgroups">
              <th className="bstick b0" />
              <th className="bstick b1" />
              <th className="bstick b2" />
              {board.groups.map((g) => (
                <th key={g.lane} colSpan={g.span} className="lanesep">
                  <Link
                    href={href({ expanded: toggleLane(controls.expanded, g.lane) })}
                  >
                    {g.lane}
                    <span className="chev">{g.expanded ? '▾' : '▸'}</span>
                  </Link>
                </th>
              ))}
              <th className="lanesep">Waiting on</th>
            </tr>
            <tr className="bcols">
              <th className="bstick b0">#</th>
              <th className="bstick b1">Candidate</th>
              <th className="bstick b2">Code</th>
              {board.columns.map((c, i) => (
                <th
                  key={c.key}
                  className={`${expandedLanes.has(c.lane) ? 'rot' : ''} ${
                    laneStart.has(i) ? 'lanesep' : ''
                  }`}
                >
                  {c.label}
                </th>
              ))}
              <th className="lanesep">stu · tea · you</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.student.userId}>
                <td className="bstick b0 sn">{r.student.sessionNumber ?? '—'}</td>
                <td className="bstick b1 nm">{r.user.name}</td>
                <td className="bstick b2 pc">{r.student.personalCode ?? '—'}</td>
                {r.cells.map((cell, i) => (
                  <td key={board.columns[i].key} className={laneStart.has(i) ? 'lanesep' : undefined}>
                    <Cell cell={cell} />
                  </td>
                ))}
                <td className="lanesep">
                  <Waiting w={r.waiting} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="bstick b0" />
                <td className="bstick b1 nm">Nothing outstanding</td>
                <td className="bstick b2" />
                <td colSpan={board.columns.length + 1} className="mut lanesep">
                  Every candidate in this filter is clear.
                </td>
              </tr>
            )}
          </tbody>

          {/* Read the board downwards as well as across: one column, whole cohort. */}
          <tfoot>
            <tr>
              <th className="bstick b0" />
              <th className="bstick b1">Cohort ready</th>
              <th className="bstick b2" />
              {board.columns.map((c, i) => {
                const t = board.totals[i]
                return (
                  <td key={c.key} className={laneStart.has(i) ? 'lanesep' : undefined}>
                    {t == null ? (
                      <span className="mut">·</span>
                    ) : (
                      <span className={`btot ${fracClass(t.done, t.total)}`}>
                        {t.done}/{t.total}
                      </span>
                    )}
                  </td>
                )
              })}
              <td className="lanesep" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="panel-b" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="legend">
          <span className="caps">Legend</span>
          <span className="k">
            <i className="cellbox done" /> Recorded
          </span>
          <span className="k">
            <i className="cellbox partial" /> In progress
          </span>
          <span className="k">
            <i className="cellbox" /> Not started
          </span>
          <span className="k">
            <i className="cellbox future" /> Not open yet
          </span>
          <span className="k">
            <i className="cellbox na" /> Not applicable
          </span>
          <span className="spacer" />
          {hidden > 0 && (
            <b>
              {hidden} candidate{hidden === 1 ? '' : 's'} hidden by this filter
            </b>
          )}
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          Lanes are <b>collapsed</b> to what has to be true before IBIS opens. Internal assessment rolls
          up across every subject a candidate takes, so 30 courses never become 60 columns of hatching.
          Expanding a lane shows its real requirements — and the number, name and code stay pinned while
          you scroll, so you can always tell whose row you are on.
        </div>
        {controls.exportOnly && (
          <div className="note gold" style={{ marginTop: 10 }}>
            Filtered to requirements with an IB export target. What&rsquo;s left is precisely what stands
            between you and a complete upload.
          </div>
        )}
      </div>
    </div>
  )
}
