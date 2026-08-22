import Link from 'next/link'
import BoardSearch from '@/components/BoardSearch'
import type { Board, BoardCell } from '@/lib/types'
import type { BoardViewKind } from '@/lib/board'

/**
 * ZOOM 3, v9 — TWO BOARDS SPLIT BY WHERE THE WORK GOES, AND NOTHING EXPANDS.
 *
 *   IB checklist     only what IBIS or eCoursework will ask for. Six data
 *                    columns; fits with no horizontal scroll.
 *   School tracking  IA files/marks/comments, EE supervision, TOK internals —
 *                    held by the school, sampled at most.
 *
 * v7's three in-place detail mechanisms (expanding lanes, drill-down rows, the
 * overloaded PG cell) each solved width by changing the grid's shape. v8's
 * answer: DETAIL NEVER HAPPENS IN THE GRID. Click a candidate and a side panel
 * opens (CandidatePanel); the grid never moves.
 *
 * v9 (17 Aug) — THE BOARD SHOWS WHAT IS IN AND WHAT IS NOT. NOTHING ELSE.
 * The v8 control strip triaged: it hid candidates ("Outstanding only"), split
 * them by whose turn it was, and ranked them by debt. Three problems. The
 * whose-turn buttons were scoped to the visible columns, so "Waiting on
 * teachers" on the IB-checklist tab filtered to nothing every time — the tab has
 * almost no teacher-recorded requirements, they all live on School tracking.
 * "Outstanding only" was the default, so the board opened with candidates
 * already hidden. And "Most outstanding" ordering meant a candidate moved rows
 * as their file changed, which is the opposite of what a register should do.
 *
 * So: every candidate, every time, in an order you chose. What is left is a
 * finder (search) and an order (session number, as IBIS lists them, or A–Z).
 * The whose-turn derivation is UNTOUCHED in lib/board.ts — a module or a later
 * screen may still want it; the board simply stops asking the coordinator to
 * think in it.
 *
 * Still (almost) no client state: tabs, order and the panel are links, and the
 * search box writes `q` into the URL, so the URL is the view and "records tab,
 * A–Z, searching 'hus', this candidate" can be bookmarked.
 */

export type SortKey = 'session' | 'name'

export interface BoardControls {
  view: BoardViewKind
  sort: SortKey
  /** Free-text finder — matches name, session number or personal code. */
  q: string
  /** The open candidate panel — a userId, carried in the URL like everything else. */
  candidate: string | null
}

function toQuery(c: BoardControls, keep: Record<string, string> = {}) {
  const q = new URLSearchParams(keep)
  if (c.view !== 'ib') q.set('view', c.view)
  if (c.sort !== 'session') q.set('sort', c.sort)
  if (c.q) q.set('q', c.q)
  if (c.candidate) q.set('candidate', c.candidate)
  return q
}

function makeHref(
  base: string,
  c: BoardControls,
  patch: Partial<BoardControls>,
  keep: Record<string, string> = {},
) {
  const s = toQuery({ ...c, ...patch }, keep).toString()
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

/**
 * The row's own tally, scoped to THIS tab's columns — the same arithmetic the
 * footer does down each column, done across the row. It replaces v8's
 * stu · tea · you triptych, which asked the reader to hold three numbers and
 * showed an empty teacher bucket on the IB tab every time.
 */
function RowTally({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="mut">·</span>
  return (
    <span
      className={`btot ${fracClass(done, total)}`}
      title={
        done === total
          ? 'Everything on this tab is in'
          : `${total - done} of ${total} still to come in on this tab`
      }
    >
      {done}/{total}
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

  // NOTHING is filtered out except by an explicit search. A blank search box is
  // the whole cohort, always — that is the point of the v9 strip.
  const needle = controls.q.trim().toLowerCase()
  let rows = board.rows
  if (needle) {
    rows = rows.filter((r) =>
      [r.user.name, r.student.sessionNumber ?? '', r.student.personalCode ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }
  // Session number is the IBIS order — zero-padded, so a plain string compare is
  // correct. Blanks sort last either way rather than jumping to the top.
  rows = [...rows].sort((a, b) => {
    if (controls.sort === 'name') return a.user.name.localeCompare(b.user.name)
    const sa = a.student.sessionNumber ?? ''
    const sb = b.student.sessionNumber ?? ''
    if (!sa !== !sb) return sa ? -1 : 1
    return sa.localeCompare(sb)
  })
  const hidden = board.rows.length - rows.length

  const laneTitle = (lane: string) =>
    controls.view === 'records' && lane === 'IB admin' ? 'Registration' : lane

  return (
    <div className="panel">
      <div className="panel-h">
        {/* Labels only — the URL param values ('ib' / 'records') stay as they
            were, so old bookmarks keep working. */}
        <span className="bseg btabs">
          <Link href={href({ view: 'ib' })} className={`btn ${controls.view === 'ib' ? 'on' : ''}`}>
            IB checklist
          </Link>
          <Link
            href={href({ view: 'records' })}
            className={`btn ${controls.view === 'records' ? 'on' : ''}`}
          >
            School tracking
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

      {/* v9: a finder and an order. No triage — see the file header. */}
      <div className="panel-h bcontrols">
        <BoardSearch
          base={base}
          params={Object.fromEntries(toQuery({ ...controls, q: '', candidate: null }, keep))}
          value={controls.q}
        />
        <Seg
          label="Order"
          param="sort"
          controls={controls}
          href={href}
          options={[
            { value: 'session', text: 'Session no. (IBIS)', patch: { sort: 'session' } },
            { value: 'name', text: 'A–Z', patch: { sort: 'name' } },
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
              <th className="lanesep">This tab</th>
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
              <th className="lanesep">in / due</th>
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
                    <RowTally done={r.visible.done} total={r.visible.total} />
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td className="bstick b0" />
                <td className="bstick b1 nm">No match</td>
                <td className="bstick b2" />
                <td colSpan={board.columns.length + 1} className="mut lanesep">
                  {needle ? (
                    <>
                      Nothing in this cohort matches <b>{controls.q}</b> — clear the search to see
                      all {board.rows.length}.
                    </>
                  ) : (
                    <>This cohort has no candidates yet.</>
                  )}
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
              <td className="lanesep">
                <RowTally
                  done={rows.reduce((n, r) => n + r.visible.done, 0)}
                  total={rows.reduce((n, r) => n + r.visible.total, 0)}
                />
              </td>
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
              {hidden} candidate{hidden === 1 ? '' : 's'} hidden by the search — clear it to see all{' '}
              {board.rows.length}
            </b>
          )}
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          {controls.view === 'ib' ? (
            <>
              The board is split by <b>where the work goes</b>. This tab holds only what has to reach
              IBIS or eCoursework — CAS confirmation, EE essay and RPF, TOK essay and TK/PPF, predicted
              grades. The <b>in / due</b> column counts only these. IAs, marks and teacher comments
              are on <b>School tracking</b>; the values behind the marks fractions are on <b>Marks for IBIS</b>.
            </>
          ) : (
            <>
              School-held records: the IA rollup (files · marks · comments across every subject a
              candidate takes), EE supervision, and the TOK internals. The IB sees these only if it
              samples — and when it does, a missing file here is already red. Mark <b>values</b> are on
              <b>Marks for IBIS</b>, one course at a time.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
