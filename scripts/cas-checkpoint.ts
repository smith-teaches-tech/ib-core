// IB-CAS-Build-Plan.md §8 step 1 — THE CHECKPOINT.
//
// "If the board and track render CAS correctly without either component being
// edited, the architecture in §2 is sound and the remaining modules can follow
// the same pattern. If they need editing, stop and fix the spine."
//
// Run: npm run checkpoint

import { REQUIREMENT_DEFS, REQUIREMENT_STATES, fixtureRepository as repo } from '../lib/data/fixtures'
import { CAS_DATA } from '../lib/data/cas-fixtures'
import { summarise } from '../lib/cas/derive'

const fail: string[] = []
const check = (ok: boolean, msg: string) => {
  console.log((ok ? '  ok    ' : '  FAIL  ') + msg)
  if (!ok) fail.push(msg)
}

async function main() {
  console.log('\nCAS → spine checkpoint\n' + '='.repeat(60))

  // 1 — nothing derived is stored (spine invariant #2)
  console.log('\n1. Invariant: nothing derived is stored')
  const casDefIds = new Set(REQUIREMENT_DEFS.filter((d) => d.lane === 'CAS').map((d) => d.id))
  check(casDefIds.size === 12, `12 CAS requirement definitions (got ${casDefIds.size})`)
  check(
    REQUIREMENT_STATES.every((s) => !casDefIds.has(s.requirementDefId)),
    'no CAS RequirementState is stored in the fixtures',
  )
  check(
    REQUIREMENT_DEFS.filter((d) => d.lane === 'CAS').every((d) => d.exportTarget == null),
    'no CAS requirement carries an exportTarget (CAS is not assessed)',
  )

  // 2 — the track renders CAS from experiences, with no edit to Track.tsx
  console.log('\n2. Student track (zoom 1) — Layla Ahmed')
  const track = await repo.getTrack('dhahran', 'st01')
  if (!track) return check(false, 'track built')
  const cas = track.lanes.find((l) => l.lane === 'CAS')
  if (!cas) return check(false, 'CAS lane present on the track')

  for (const c of cas.checkpoints) {
    console.log(`     ${c.display.padEnd(12)} ${c.def.label}`)
  }
  const s = summarise('st01', CAS_DATA)
  check(cas.total === 12, `12 CAS checkpoints (got ${cas.total})`)
  check(s.outcomes.length === 7, `7/7 outcomes confirmed from experiences (got ${s.outcomes.length})`)
  check(
    cas.checkpoints.filter((c) => c.def.key.startsWith('cas.lo') && c.display === 'done').length === 7,
    'all seven LO checkpoints render as done',
  )
  check(
    cas.checkpoints.find((c) => c.def.key === 'cas.project')?.display === 'done',
    'the project checkpoint is done — derived from a complete isProject experience',
  )
  check(
    cas.checkpoints.filter((c) => c.def.key.startsWith('cas.interview') && c.display === 'done')
      .length === 3,
    'all three interview checkpoints are done — derived from locked Interview records',
  )

  // 3 — a partially-done student shows partial, not done
  console.log('\n3. Student track — Marcus Chen (mid-programme)')
  const t2 = await repo.getTrack('dhahran', 'st04')
  const cas2 = t2?.lanes.find((l) => l.lane === 'CAS')
  const s2 = summarise('st04', CAS_DATA)
  console.log(`     confirmed ${s2.outcomes.join(', ') || '—'} · claimed-only ${s2.claimed.join(', ') || '—'}`)
  check(
    Boolean(cas2?.checkpoints.some((c) => c.display === 'partial')),
    'claimed-but-unconfirmed outcomes render as in progress, never as done',
  )
  check(
    cas2?.checkpoints.find((c) => c.def.key === 'cas.interview2')?.display === 'not_started',
    'the interim interview he has not had is not_started',
  )

  // 4 — the board, unedited
  console.log('\n4. Completeness board (zoom 3)')
  const board = await repo.getBoard('dhahran', 'c15')
  const casCols = board.columns.filter((c) => c.lane === 'CAS')
  const idx = board.columns.findIndex((c) => c.key === 'cas.lo1')
  check(casCols.length === 12, `12 CAS columns on the board (got ${casCols.length})`)
  const litCells = board.rows.reduce(
    (n, r) => n + r.cells.slice(idx, idx + 12).filter((c) => c && c.display !== 'not_started').length,
    0,
  )
  check(litCells > 0, `CAS cells light up from module data (${litCells} non-empty)`)
  check(
    board.rows.every((r) => r.cells.slice(idx, idx + 12).every((c) => c !== null)),
    'every candidate is enrolled in CAS, so no CAS cell is not-applicable',
  )

  console.log('\n     ' + 'candidate'.padEnd(20) + casCols.map((c) => c.key.replace('cas.', '').slice(0, 4).padEnd(5)).join(''))
  for (const r of board.rows.slice(0, 8)) {
    const glyph = (d?: string) => (d === 'done' ? '  ●  ' : d === 'partial' ? '  ◐  ' : '  ·  ')
    console.log('     ' + r.user.name.padEnd(20) + r.cells.slice(idx, idx + 12).map((c) => glyph(c?.display)).join(''))
  }

  // 5 — the module's own roster agrees with the spine's derived view
  console.log('\n5. Module roster and spine agree')
  const roster = await repo.cas.getRoster('dhahran', 'c15')
  check(roster.length === 24, `24 roster rows (got ${roster.length})`)
  let agree = true
  for (const row of roster) {
    const tr = await repo.getTrack('dhahran', row.studentId)
    const done = tr!.lanes
      .find((l) => l.lane === 'CAS')!
      .checkpoints.filter((c) => c.def.key.startsWith('cas.lo') && c.display === 'done').length
    if (done !== row.summary.outcomes.length) {
      agree = false
      console.log(`     mismatch ${row.studentName}: board ${done} vs roster ${row.summary.outcomes.length}`)
    }
  }
  check(agree, 'every roster row matches its own track, for all 24 candidates')

  const totals = await repo.cas.getTotals('dhahran', 'c15')
  console.log(
    `\n     cohort: ${totals.students} students · ${totals.atRisk} at risk · ` +
      `avg ${totals.avgOutcomes}/7 outcomes · ${totals.projectsComplete} projects complete`,
  )

  console.log('\n' + '='.repeat(60))
  if (fail.length) {
    console.log(`CHECKPOINT FAILED — ${fail.length} problem(s). Fix the spine before building screens.\n`)
    process.exit(1)
  }
  console.log('CHECKPOINT PASSED — the board and track render CAS with no edit to either component.\n')
}

main()
