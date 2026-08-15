import Link from 'next/link'
import type { Board, BoardCell, WaitingOn } from '@/lib/types'
import type { BoardViewKind } from '@/lib/board'

/**
 * ZOOM 3, v8 — TWO BOARDS SPLIT BY WHERE THE WORK GOES, AND NOTHING EXPANDS.
 *
 *   Sent to IB       only what IBIS or eCoursework will ask for. Six data
 *                    columns; fits with no horizontal scroll.
 *   School records   IA files/marks/comments, EE supervision, TOK internals —
 *                    held by the school, sampled at most.
 *
 * v7's three in-place detail mechanisms (expanding lanes, drill-down rows, the
 * overloaded PG cell) each solved width by changing the grid's shape. v8's
 * answer: DETAIL NEVER HAPPENS IN THE GRID. Click a candidate and a side panel
 * opens (CandidatePanel); the grid never moves.
 *
 * Still no client state: tabs, filters and the panel are all links, so the URL
 * is the view and "records tab, teachers, session order, this candidate" can be
 * bookmarked.
 */

export type RowFilter = 'outstanding' | 'all'
export type SortKey = 'outstanding' | 'session'
export type TurnKey = 'any' | 'student' | 'staff' | 'coordinator'

export interface BoardControls {
  view: BoardViewKind
  rows: RowFilter
  sort: SortKey
  turn: TurnKey
  /** The open candidate panel — a userId, carried in the URL like everything else. */
  candidate: string | null
}

function makeHref(
  base: string,
  c: BoardControls,
  patch: Partial<BoardControls>,
  keep: Record<string, string> = {},
) {
  const next = { ...c, ...patch }
  const q = new URLSearchParams(keep)
  if (next.view !== 'ib') q.set('view', next.view)
  if (next.rows !== 'outstanding') q.set('rows', next.rows)
  if (next.sort !== 'outstanding') q.set('sort', next.sort)
  if (next.turn !== 'any') q.set('turn', next.turn)
  if (next.candidate) q.set('candidate', next.candidate)
  const s = q.toString()
  return s ? `${base}?${s}` : base
}

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
        <span className="s" title="Waiting on the student">{w.student}</span>
      )}
      {w.staff > 0 && (
        <span className="t" title="Waiting on a teacher">{w.staff}</span>
      )}
      {w.coordinator > 0 && (
        <span className="m" title="Waiting on you">{w.coordinator}</span>
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
  keep?: Record<string, string>
}) {
  const href = (patch: Partial<BoardControls>) => makeHref(base, controls, patch, keep)
  const laneStart = new Set<number>()
  let at = 0
  for (const g of board.groups) {
    laneStart.add(at)
    at += g.span
  }

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

  const laneTitle = (lane: string) =>
    controls.view === 'records' && lane === 'IB admin' ? 'Registration' : lane

  return (
    <div className="panel">
      <div className="panel-h">
        <span className="bseg btabs">
          <Link href={href({ view: 'ib' })} className={`btn ${controls.view === 'ib' ? 'on' : ''}`}>
            Sent to IB
          </Link>
          <Link
            href={href({ view: 'records' })}
            className={`btn ${controls.view === 'records' ? 'on' : ''}`}
          >
            School records
          </Link>
        </span>
        <span className="mut bhint">
          {controls.view === 'ib'
            ? 'Only what IBIS or eCoursework will ask for'
            : 'Held by the school — the IB sees these only if it samples'}
        </span>
        <span className="spacer" />
        <h2 style={{ fontSize: 13 }}>
          {cohortLabel} — {rows.length} candidate{rows.length === 1 ? '' : 's'}
        </h2>
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
            { value: 'session', text: 'Session no. (IBIS)', patch: { sort: 'session' } },
          ]}
        />
        <span className="spacer" />
        <span className="mut bhint">
          Nothing here expands — <b>click a candidate</b> for the full picture
        </span>
      </div>

      <div className="bscroll">
        <table className="board v8">
          <thead>
            <tr className="bgroups">
              <th className="bstick b0" />
              <th className="bstick b1" />
              <th className="bstick b2" />
              {board.groups.map((g) => (
                <th key={g.lane} colSpan={g.span} className="lanesep">
                  {laneTitle(g.lane)}
                </th>
              ))}
              <th className="lanesep">Waiting on</th>
            </tr>
            <tr className="bcols">
              <th className="bstick b0">#</th>
              <th className="bstick b1">Candidate</th>
              <th className="bstick b2">Code</th>
              {board.columns.map((c, i) => (
                <th key={c.key} className={laneStart.has(i) ? 'lanesep' : undefined}>
                  {c.label}
                </th>
              ))}
              <th className="lanesep">stu · tea · you</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const open = controls.candidate === r.student.userId
              return (
                <tr key={r.student.userId} className={open ? 'sel' : undefined}>
                  <td className="bstick b0 sn">{r.student.sessionNumber ?? '—'}</td>
                  <td className="bstick b1 nm">
                    <Link
                      className="candlink"
                      href={href({ candidate: open ? null : r.student.userId })}
                      title="Open this candidate's full picture"
                    >
                      {r.user.name}
                      <span className="chev">›</span>
                    </Link>
                  </td>
                  <td className="bstick b2 pc">{r.student.personalCode ?? '—'}</td>
                  {r.cells.map((cell, i) => (
                    <td
                      key={board.columns[i].key}
                      className={laneStart.has(i) ? 'lanesep' : undefined}
                    >
                      <Cell cell={cell} />
                    </td>
                  ))}
                  <td className="lanesep">
                    <Waiting w={r.waiting} />
                  </td>
                </tr>
              )
            })}
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
          <span className="k"><i className="cellbox done" /> Recorded</span>
          <span className="k"><i className="cellbox partial" /> In progress</span>
          <span className="k"><i className="cellbox" /> Not started</span>
          <span className="k"><i className="cellbox future" /> Not open yet</span>
          <span className="k"><i className="cellbox na" /> Not applicable</span>
          <span className="spacer" />
          {hidden > 0 && (
            <b>
              {hidden} candidate{hidden === 1 ? '' : 's'} hidden by this filter
            </b>
          )}
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          {controls.view === 'ib' ? (
            <>
              The board is split by <b>where the work goes</b>. This tab holds only what has to reach
              IBIS or eCoursework — CAS confirmation, EE essay and RPF, TOK essay and TK/PPF, predicted
              grades. Whose-turn counts are scoped to these columns. IAs, marks and teacher comments
              are on <b>School records</b>; the values behind the marks fractions are on <b>IA marks</b>.
            </>
          ) : (
            <>
              School-held records: the IA rollup (files · marks · comments across every subject a
              candidate takes), EE supervision, and the TOK internals. The IB sees these only if it
              samples — and when it does, a missing file here is already red. Mark <b>values</b> are on
              the <b>IA marks</b> screen, one course at a time.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
