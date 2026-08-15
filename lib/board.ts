// The coordinator's board — a PROJECTION, nothing more.
//
// Everything here is computed from RequirementDefs and RequirementStates that
// the modules already write. No new Repository method, no stored aggregate, no
// field added to the spine. If this file ever needs one, a module underneath is
// missing something real (IB-Spine-Architecture.md §0).
//
// Two ideas do all the work:
//
//   1. A lane COLLAPSES to a short summary and EXPANDS to its real requirements.
//      Collapsed is the default because collapsed is the answer 95% of the time:
//      85 columns become 9.
//
//   2. WHOSE TURN IS IT. `recordedBy` is already on every def, so bucketing
//      outstanding work by who owes it is free — and it turns "what is missing"
//      (always a long list) into "what is mine" (usually a short one).

import type {
  Board, BoardCell, BoardColumn, BoardGroup, BoardRow, Checkpoint, Course, Lane,
  RequirementDef, RequirementState, Student, User, WaitingOn,
} from './types'
import { displayOf, requirementsFor, stateOf } from './spine'

export const LANE_ORDER: Lane[] = [
  'CAS', 'Extended Essay', 'TOK', 'Internal assessment', 'IB admin',
]

// ---------------------------------------------------------------------------
// What a lane looks like when collapsed
// ---------------------------------------------------------------------------

/**
 * A summary column is one of three shapes:
 *
 *   one       a single requirement, shown as a checkpoint box
 *   fraction  several named requirements, shown as done/total (TK/PPF 2/3)
 *   rollup    the same stage across MANY course-scoped requirements, matched by
 *             key suffix — this is what turns 60 IA columns into one cell
 */
export type LaneSummary =
  | { kind: 'one'; key: string; label: string }
  | { kind: 'fraction'; label: string; keys: string[] }
  | { kind: 'rollup'; label: string; parts: { label: string; suffix: string }[] }

/**
 * A column earns its place here only if the coordinator has to be able to say
 * YES to it before opening IBIS. Everything else is still recorded, still on the
 * student track, still on the module screen — it is simply not the coordinator's
 * problem, so it is not on the coordinator's collapsed view.
 */
export const LANE_SUMMARY: Record<Lane, LaneSummary[]> = {
  CAS: [{ kind: 'one', key: 'cas.complete', label: 'Complete' }],

  // NOTE: no "Graded" column yet — the school holds no internal EE mark today.
  // It arrives with the predicted-grade work, where the EE letter is DERIVED
  // from a mark against the session's boundaries. See IB-Predicted-Grades-Spec.md.
  'Extended Essay': [
    { kind: 'one', key: 'ee.final', label: 'Essay in' },
    { kind: 'one', key: 'ee.viva', label: 'Viva' },
    { kind: 'one', key: 'ee.rpf', label: 'RPF' },
  ],

  TOK: [
    { kind: 'one', key: 'tok.essay', label: 'Essay in' },
    { kind: 'fraction', label: 'TK/PPF', keys: ['tok.ppf1', 'tok.ppf2', 'tok.ppf3'] },
  ],

  // The whole reason the board was unreadable: 30 subject courses × 2 defs = 60
  // columns, of which any one student uses 12. Rolled up it is one cell, and
  // the per-subject view is one click away on the group heading.
  //
  // "Comments" is absent because `ia.teacher_comment` does not exist yet — it is
  // named in the spine's MVP set and in the coordinator spec, and has never been
  // defined. Build only what is real; the rollup gains a third part for free the
  // day that def exists.
  'Internal assessment': [
    {
      kind: 'rollup',
      label: 'Files · marks · comments',
      parts: [
        { label: 'Files', suffix: '.file' },
        { label: 'Marks', suffix: '.mark' },
        { label: 'Comments', suffix: '.comment' },
      ],
    },
  ],

  'IB admin': [
    { kind: 'one', key: 'ib.auth', label: 'Authenticated' },
    { kind: 'one', key: 'ib.pg', label: 'Predicted' },
  ],
}

// ---------------------------------------------------------------------------
// The v8 split: two boards, divided by WHERE THE WORK GOES.
// ---------------------------------------------------------------------------

export type BoardViewKind = 'ib' | 'records'

/**
 * SENT TO IB — only what IBIS or eCoursework will ask for. Six data columns, no
 * horizontal scroll, nothing expands: detail lives in the candidate panel.
 * An EMPTY array removes the lane from this board entirely — internal
 * assessment is school-held, so it lives on the other tab.
 */
const SENT_TO_IB: Record<Lane, LaneSummary[]> = {
  CAS: [{ kind: 'one', key: 'cas.complete', label: 'Complete' }],
  'Extended Essay': [
    { kind: 'one', key: 'ee.final', label: 'Essay in' },
    { kind: 'one', key: 'ee.rpf', label: 'RPF' },
  ],
  TOK: [
    { kind: 'one', key: 'tok.essay', label: 'Essay in' },
    { kind: 'fraction', label: 'TK/PPF', keys: ['tok.ppf1', 'tok.ppf2', 'tok.ppf3'] },
  ],
  'Internal assessment': [],
  'IB admin': [{ kind: 'one', key: 'ib.pg', label: 'Predicted' }],
}

/**
 * SCHOOL RECORDS — held by the school; the IB sees these only if it samples.
 * The honest home for the 60-column problem, as one three-part rollup.
 */
const SCHOOL_RECORDS: Record<Lane, LaneSummary[]> = {
  CAS: [],
  'Extended Essay': [
    {
      kind: 'fraction',
      label: 'Supervision',
      keys: ['ee.rq', 'ee.r1', 'ee.r2', 'ee.viva', 'ee.attest'],
    },
  ],
  TOK: [
    { kind: 'one', key: 'tok.exh', label: 'Exhibition' },
    { kind: 'one', key: 'tok.exhmark', label: 'Exh. mark' },
    { kind: 'one', key: 'tok.title', label: 'Title' },
  ],
  'Internal assessment': [
    {
      kind: 'rollup',
      label: 'Files · marks · comments',
      parts: [
        { label: 'Files', suffix: '.file' },
        { label: 'Marks', suffix: '.mark' },
        { label: 'Comments', suffix: '.comment' },
      ],
    },
  ],
  'IB admin': [
    { kind: 'one', key: 'ib.reg', label: 'Registered' },
    { kind: 'one', key: 'ib.auth', label: 'Authenticated' },
  ],
}

const VIEW_SUMMARY: Record<BoardViewKind, Record<Lane, LaneSummary[]>> = {
  ib: SENT_TO_IB,
  records: SCHOOL_RECORDS,
}

export interface BoardOptions {
  /** Lanes to show in full. Everything else uses the summary. */
  expanded?: Lane[]
  /** Only requirements that feed an IB upload. */
  exportOnly?: boolean
  /**
   * Which v8 board: 'ib' (sent to IB) or 'records' (school held). Unset =
   * the legacy single-board summary, which the checkpoint still exercises.
   * When set, whose-turn counts are scoped to THIS board's columns — the
   * records tab counts IA debts, not TOK essays.
   */
  view?: BoardViewKind
}

// ---------------------------------------------------------------------------
// Building it
// ---------------------------------------------------------------------------

const isComplete = (c: Checkpoint | null) => c?.display === 'done'

/** Outstanding = applicable, not complete, and actually actionable. */
const isOutstanding = (c: Checkpoint | null) =>
  c != null && c.display !== 'done' && c.display !== 'future'

function checkpointsFor(
  studentId: string,
  defs: RequirementDef[],
  states: RequirementState[],
): Map<string, Checkpoint> {
  const byKey = new Map<string, RequirementState | null>()
  for (const d of defs) byKey.set(d.key, stateOf(studentId, d, states))
  const out = new Map<string, Checkpoint>()
  for (const def of defs) {
    const state = byKey.get(def.key) ?? null
    out.set(def.key, { def, state, display: displayOf(def, state, byKey) })
  }
  return out
}

/**
 * Who owes each outstanding thing. `future` never counts — a requirement whose
 * opener is incomplete is nobody's turn yet.
 */
function waitingOn(checkpoints: Iterable<Checkpoint>): WaitingOn {
  const w: WaitingOn = { student: 0, staff: 0, coordinator: 0 }
  for (const c of checkpoints) if (isOutstanding(c)) w[c.def.recordedBy] += 1
  return w
}

export function buildBoard(
  students: Student[],
  users: User[],
  defs: RequirementDef[],
  coursesByStudent: Map<string, Course[]>,
  states: RequirementState[],
  options: BoardOptions = {},
): Board {
  const expanded = new Set(options.expanded ?? [])
  const visible = options.exportOnly ? defs.filter((d) => d.exportTarget != null) : defs
  const summary = options.view ? VIEW_SUMMARY[options.view] : LANE_SUMMARY

  // ---- columns, lane by lane ------------------------------------------------
  const columns: BoardColumn[] = []
  const groups: BoardGroup[] = []

  for (const lane of LANE_ORDER) {
    const laneDefs = visible.filter((d) => d.lane === lane).sort((a, b) => a.order - b.order)
    if (laneDefs.length === 0) continue
    // A v8 view removes a lane from its board on purpose — the other tab has it.
    if (options.view && summary[lane].length === 0 && !expanded.has(lane)) continue

    const start = columns.length
    const isExpanded = expanded.has(lane)

    if (isExpanded) {
      for (const d of laneDefs) {
        columns.push({ key: d.id, label: d.label, lane, kind: 'check', defKeys: [d.key] })
      }
    } else {
      for (const s of summary[lane]) {
        if (s.kind === 'one') {
          if (!laneDefs.some((d) => d.key === s.key)) continue
          columns.push({ key: `${lane}:${s.key}`, label: s.label, lane, kind: 'check', defKeys: [s.key] })
        } else if (s.kind === 'fraction') {
          const keys = s.keys.filter((k) => laneDefs.some((d) => d.key === k))
          if (keys.length === 0) continue
          columns.push({ key: `${lane}:${s.label}`, label: s.label, lane, kind: 'fraction', defKeys: keys })
        } else {
          const parts = s.parts.map((p) => ({
            label: p.label,
            keys: laneDefs.filter((d) => d.key.endsWith(p.suffix)).map((d) => d.key),
          })).filter((p) => p.keys.length > 0)
          if (parts.length === 0) continue
          columns.push({
            key: `${lane}:rollup`,
            label: s.label,
            lane,
            kind: 'rollup',
            defKeys: parts.flatMap((p) => p.keys),
            parts: parts.map((p) => ({ label: p.label, keys: p.keys })),
          })
        }
      }
      // A lane whose summary matched nothing still has requirements underneath —
      // say so rather than dropping it silently.
      if (columns.length === start) {
        columns.push({
          key: `${lane}:none`, label: `${laneDefs.length} requirements`, lane,
          kind: 'fraction', defKeys: laneDefs.map((d) => d.key),
        })
      }
    }

    groups.push({ lane, span: columns.length - start, expanded: isExpanded })
  }

  // ---- rows -----------------------------------------------------------------
  const rows: BoardRow[] = students.map((student) => {
    const user = users.find((u) => u.id === student.userId)!
    const mine = requirementsFor(student, defs, coursesByStudent.get(student.userId) ?? [])
    const cps = checkpointsFor(student.userId, mine, states)

    const cells: BoardCell[] = columns.map((col) => {
      const owned = col.defKeys.map((k) => cps.get(k) ?? null).filter((c): c is Checkpoint => c != null)
      if (owned.length === 0) return { kind: 'na' }

      if (col.kind === 'check') {
        const c = owned[0]
        return { kind: 'check', display: c.display, title: `${c.def.label} — ${c.display.replace('_', ' ')}` }
      }
      if (col.kind === 'fraction') {
        const done = owned.filter(isComplete).length
        return { kind: 'fraction', done, total: owned.length, title: `${col.label} — ${done} of ${owned.length}` }
      }
      const parts = (col.parts ?? []).map((p) => {
        const got = p.keys.map((k) => cps.get(k) ?? null).filter((c): c is Checkpoint => c != null)
        return { label: p.label, done: got.filter(isComplete).length, total: got.length }
      }).filter((p) => p.total > 0)
      return {
        kind: 'rollup',
        parts,
        title: parts.map((p) => `${p.label} ${p.done}/${p.total}`).join(' · '),
      }
    })

    const all = [...cps.values()]
    // A v8 board's whose-turn counts are scoped to ITS columns: the records tab
    // counts IA debts, the IB tab counts upload blockers. The legacy board keeps
    // counting everything, which is what the checkpoint asserts.
    const visibleKeys = options.view ? new Set(columns.flatMap((c) => c.defKeys)) : null
    const counted = visibleKeys ? all.filter((c) => visibleKeys.has(c.def.key)) : all
    return {
      student,
      user,
      cells,
      waiting: waitingOn(counted),
      done: all.filter(isComplete).length,
      applicable: all.length,
    }
  })

  // ---- the footer: read the board downwards as well as across ---------------
  const totals = columns.map((_, i) => {
    let done = 0
    let total = 0
    for (const r of rows) {
      const c = r.cells[i]
      if (c.kind === 'na') continue
      total += 1
      if (c.kind === 'check' && c.display === 'done') done += 1
      if (c.kind === 'fraction' && c.done === c.total) done += 1
      if (c.kind === 'rollup' && c.parts.every((p) => p.done === p.total)) done += 1
    }
    return total === 0 ? null : { done, total }
  })

  return { groups, columns, rows, totals }
}

/** The export builder is a filter, not a bespoke feature. */
export const exportBlocking = (d: RequirementDef) => d.exportTarget != null
