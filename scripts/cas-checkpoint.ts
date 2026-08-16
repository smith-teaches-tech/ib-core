// IB-CAS-Build-Plan.md §8 step 1 — THE CHECKPOINT.
//
// "If the board and track render CAS correctly without either component being
// edited, the architecture in §2 is sound and the remaining modules can follow
// the same pattern. If they need editing, stop and fix the spine."
//
// Run: npm run checkpoint

import {
  COHORTS, COURSES, ENROLLMENTS, MEMBERSHIPS, REQUIREMENT_DEFS, REQUIREMENT_STATES,
  SAMPLE_REQUESTS, SECTIONS, STUDENTS, TEACHING_ASSIGNMENTS, fixtureRepository as repo,
} from '../lib/data/fixtures'
import { assertLiveCohort, isArchived, sortCohorts } from '../lib/cohorts'
import { CAS_DATA } from '../lib/data/cas-fixtures'
import { summarise } from '../lib/cas/derive'
import { marksWriteGrant } from '../lib/ia/authorize'
import { matchSessionNumbers } from '../lib/ia/sample'
import { iaTotal, templateOf } from '../lib/templates'

const fail: string[] = []
const check = (ok: boolean, msg: string) => {
  console.log((ok ? '  ok    ' : '  FAIL  ') + msg)
  if (!ok) fail.push(msg)
}

async function main() {
  console.log('\nCAS → spine checkpoint\n' + '='.repeat(60))

  // 1 — nothing derived is stored (spine invariant #2)
  console.log('\n1. Invariant: nothing derived is stored')
  const casDefs = REQUIREMENT_DEFS.filter((d) => d.lane === 'CAS')
  const casDefIds = new Set(casDefs.map((d) => d.id))
  const cohortsWithCas = new Set(casDefs.map((d) => d.cohortId))
  check(
    [...cohortsWithCas].every((c) => casDefs.filter((d) => d.cohortId === c).length === 12),
    `12 CAS requirement definitions per cohort, across ${cohortsWithCas.size} cohorts`,
  )
  check(
    casDefIds.size === casDefs.length,
    'every CAS definition id is unique across cohorts — two live years share keys, not ids',
  )
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
  //
  // The board now COLLAPSES each lane by default, so this checks both shapes:
  // expanded, every CAS requirement is still a column reading module data; and
  // collapsed, the lane rolls up without inventing anything.
  console.log('\n4. Completeness board (zoom 3)')
  const board = await repo.getBoard('dhahran', 'c15', { expanded: ['CAS'] })
  const casCols = board.columns.filter((c) => c.lane === 'CAS')
  const idx = board.columns.findIndex((c) => c.defKeys[0] === 'cas.lo1')
  check(casCols.length === 12, `12 CAS columns when the lane is expanded (got ${casCols.length})`)
  const litCells = board.rows.reduce(
    (n, r) =>
      n +
      r.cells
        .slice(idx, idx + 12)
        .filter((c) => c.kind === 'check' && c.display !== 'not_started').length,
    0,
  )
  check(litCells > 0, `CAS cells light up from module data (${litCells} non-empty)`)
  check(
    board.rows.every((r) => r.cells.slice(idx, idx + 12).every((c) => c.kind !== 'na')),
    'every candidate is enrolled in CAS, so no CAS cell is not-applicable',
  )

  console.log(
    '\n     ' +
      'candidate'.padEnd(20) +
      casCols.map((c) => c.defKeys[0].replace('cas.', '').slice(0, 4).padEnd(5)).join(''),
  )
  for (const r of board.rows.slice(0, 8)) {
    const glyph = (c: (typeof r.cells)[number]) =>
      c.kind === 'check' && c.display === 'done' ? '  \u25cf  '
        : c.kind === 'check' && c.display === 'partial' ? '  \u25d0  '
        : '  \u00b7  '
    console.log('     ' + r.user.name.padEnd(20) + r.cells.slice(idx, idx + 12).map(glyph).join(''))
  }

  // Collapsed: the coordinator's default. One CAS column, and it is the one
  // thing they have to be able to say yes to before IBIS.
  const collapsed = await repo.getBoard('dhahran', 'c15')
  const casCollapsed = collapsed.columns.filter((c) => c.lane === 'CAS')
  check(casCollapsed.length === 1, `CAS collapses to 1 column (got ${casCollapsed.length})`)
  check(
    casCollapsed[0]?.defKeys[0] === 'cas.complete',
    'and the column it collapses to is cas.complete',
  )
  check(
    collapsed.columns.length < board.columns.length,
    `collapsed is narrower than expanded (${collapsed.columns.length} vs ${board.columns.length} columns)`,
  )
  check(
    collapsed.rows.every(
      (r) =>
        r.waiting.student + r.waiting.staff + r.waiting.coordinator <= r.applicable - r.done,
    ),
    'whose-turn counts never exceed what is genuinely outstanding',
  )
  check(
    collapsed.rows.some((r) => r.waiting.coordinator > 0),
    'and some of it is owed by the coordinator rather than the student',
  )
  const iaRollup = collapsed.columns.find((c) => c.kind === 'rollup')
  check(
    iaRollup != null && iaRollup.defKeys.length > 20,
    `internal assessment rolls ${iaRollup?.defKeys.length ?? 0} course requirements into one column`,
  )

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

  // 6 — two cohorts run at once, and archiving is an act rather than a date
  console.log('\n6. Cohorts')
  const dhahran = sortCohorts(COHORTS.filter((c) => c.schoolId === 'dhahran'))
  for (const c of dhahran) {
    console.log(
      `     ${c.label.padEnd(16)} Cohort ${c.number}  grad ${c.gradYear}  ` +
        `${isArchived(c) ? '· archived' : '· live'}`,
    )
  }
  check(dhahran.filter((c) => !isArchived(c)).length === 2, 'two year groups are live at once')
  check(isArchived(dhahran[dhahran.length - 1]), 'the archived one sorts last')
  check(
    dhahran.every((c) => c.number != null),
    'every cohort carries the school\'s own cohort number as well as the class year',
  )

  const live = dhahran.filter((c) => !isArchived(c))
  const boards = await Promise.all(
    live.map((c) => repo.getBoard('dhahran', c.id, { expanded: ['CAS'] })),
  )
  // An EXPANDED lane is keyed by RequirementDef id, and defs are versioned per
  // cohort — so two live year groups must share no column there. A COLLAPSED
  // lane is deliberately the opposite: its key is a presentation slot ("CAS ->
  // Complete"), identical in every cohort, because it names a job rather than a
  // definition. Both facts matter, so both are asserted.
  const casKeys = boards.map((b) => new Set(b.columns.filter((c) => c.lane === 'CAS').map((c) => c.key)))
  check(
    casKeys[0].size === 12 && casKeys[1].size === 12,
    `both year groups expand CAS to 12 columns (${casKeys[0].size}, ${casKeys[1].size})`,
  )
  check(
    [...casKeys[0]].every((k) => !casKeys[1].has(k)),
    'each year group\'s board uses its OWN requirement definitions',
  )
  const collapsedKeys = boards.map(
    (b) => new Set(b.columns.filter((c) => c.lane !== 'CAS').map((c) => c.key)),
  )
  check(
    [...collapsedKeys[0]].every((k) => collapsedKeys[1].has(k)),
    'while a collapsed lane names the same job in every cohort',
  )
  check(
    boards[0].rows.length > 0 && boards[1].rows.length > 0 &&
      boards[0].rows[0].student.userId !== boards[1].rows[0].student.userId,
    `and its own candidates (${boards[0].rows.length} and ${boards[1].rows.length})`,
  )

  // 7 — IA templates & criterion marks (added with the v8 board + marks build)
  console.log('\n7. IA templates, criterion marks, and the marks module')

  // Every subject course's mark def carries its family's rubric — the right
  // denominator, not a guessed /25.
  const subjects = COURSES.filter((c) => c.type === 'subject')
  const c15Marks = REQUIREMENT_DEFS.filter(
    (d) => d.cohortId === 'c15' && d.key.endsWith('.mark') && d.lane === 'Internal assessment',
  )
  check(
    subjects.every((c) => {
      const d = c15Marks.find((x) => x.key === c.id + '.mark')
      const t = templateOf(c.iaTemplateKey)
      return d != null && d.markMax === t.markMax &&
        (t.criteria.length === 0 ? d.criteria == null : d.criteria?.length === t.criteria.length)
    }),
    `every subject course's mark def matches its template family (${subjects.length} courses)`,
  )
  check(
    c15Marks.every((d) => d.criteria == null || d.criteria.reduce((a, x) => a + x.max, 0) === d.markMax),
    'markMax is always the sum of the criteria — no denominator can drift',
  )
  const spread = new Set(c15Marks.map((d) => d.markMax))
  check(
    spread.size >= 5,
    `mark maxima genuinely differ by family (${[...spread].sort((a, b) => (a ?? 0) - (b ?? 0)).join(', ')}) — the /25 fiction is gone`,
  )
  check(
    REQUIREMENT_DEFS.filter((d) => d.cohortId === 'c15' && d.key.endsWith('.comment')).length ===
      subjects.length,
    'ia.teacher_comment exists for every subject course — named in the MVP set, finally defined',
  )
  check(
    REQUIREMENT_STATES.every(
      (s) => !(s.criterionMarks != null && s.mark != null),
    ),
    'no state stores both criterion marks and a total — the total is derived (invariant #2)',
  )

  // The marks module: write a criterion mark, watch the total derive and the
  // board move, with no board code knowing the module exists.
  const mv = await repo.ia.getMarksView('dhahran', 'bio_sl', 'c15')
  check(mv != null && mv.criteria.length === 4 && mv.markMax === 24,
    `Biology SL marks view: 4 criteria /24 (got ${mv?.criteria.length}/${mv?.markMax})`)
  const target = mv!.rows.find((r) => r.total == null) ?? mv!.rows[0]
  if (target) {
    for (let i = 0; i < 4; i++) {
      await repo.ia.setCriterionMark('dhahran', 'bio_sl', 'c15', target.studentId, i, 5, 'checkpoint')
    }
    const after = await repo.ia.getMarksView('dhahran', 'bio_sl', 'c15')
    const row = after!.rows.find((r) => r.studentId === target.studentId)!
    check(row.total === 20, `four criterion marks of 5 derive a total of 20 (got ${row.total})`)
    const st = REQUIREMENT_STATES.find(
      (s) => s.studentId === target.studentId && s.requirementDefId === 'c15:bio_sl.mark',
    )
    check(st != null && st.mark == null && st.recordStatus === 'marked',
      'the stored state has criterion marks, NO stored total, and recordStatus derived to marked')
    check(iaTotal(c15Marks.find((d) => d.key === 'bio_sl.mark')!.criteria, st!) === 20,
      'iaTotal() reads the same 20 back off the raw state')
    const b = await repo.getBoard('dhahran', 'c15', { view: 'records' })
    const brow = b.rows.find((r) => r.student.userId === target.studentId)!
    const rollup = brow.cells.find((c) => c.kind === 'rollup')
    check(
      rollup != null && rollup.kind === 'rollup' &&
        rollup.parts.some((p) => p.label === 'Marks' && p.done >= 1),
      'and the school-records board sees the new mark through the same states it always read',
    )
  } else {
    check(false, 'found an unmarked Biology SL candidate to exercise the write path')
  }

  // The two v8 boards: split by where the work goes, whose-turn scoped per tab.
  const ib = await repo.getBoard('dhahran', 'c15', { view: 'ib' })
  check(
    ib.columns.length === 6 && !ib.columns.some((c) => c.lane === 'Internal assessment'),
    `"Sent to IB" is six columns and carries no IA lane (got ${ib.columns.length})`,
  )
  const rec = await repo.getBoard('dhahran', 'c15', { view: 'records' })
  check(
    rec.columns.some((c) => c.kind === 'rollup' && c.parts?.length === 3) &&
      !rec.columns.some((c) => c.defKeys.includes('cas.complete')),
    '"School records" rolls IA to files · marks · comments and holds no CAS column',
  )
  check(
    ib.rows.some((r) => {
      const w = r.waiting
      const w2 = rec.rows.find((x) => x.student.userId === r.student.userId)?.waiting
      return w2 != null &&
        w.student + w.staff + w.coordinator !== w2.student + w2.staff + w2.coordinator
    }),
    'whose-turn counts differ between the two tabs — each is scoped to its own columns',
  )

  // Adding a course through setup instantiates its family's defs.
  const newId = await repo.setup.addCourse(
    'dhahran',
    { name: 'ESS SL', subjectGroup: 'Group 4 — Sciences', level: 'SL', iaTemplateKey: 'ess' },
    'c16',
  )
  const newMark = REQUIREMENT_DEFS.find((d) => d.key === newId + '.mark')
  check(
    newMark != null && newMark.markMax === 30 && newMark.criteria?.length === 6 &&
      newMark.cohortId === 'c16',
    `a new ESS course arrives with the ESS rubric — 6 criteria /30, versioned to its cohort`,
  )
  check(
    REQUIREMENT_DEFS.some((d) => d.key === newId + '.comment'),
    'and with a teacher-comment def, so the marks screen is complete on day one',
  )

  // 8 — the reviewed-fix guard rails
  console.log('\n8. Guard rails')

  // (a) editReflection refuses a mismatched entry/experience pair.
  const refl = CAS_DATA.entries.find((e) => e.kind === 'reflection' && !e.supersededBy)!
  const otherExp = CAS_DATA.experiences.find((x) => x.id !== refl.experienceId)!
  let mismatchThrew = false
  try {
    await repo.cas.editReflection('dhahran', refl.id, otherExp.id, 'tampered', 'checkpoint')
  } catch {
    mismatchThrew = true
  }
  check(mismatchThrew, 'editReflection throws on a mismatched entry/experience pair')

  // (b) + (c) The write gate every action's live() helper delegates to: an
  // archived cohort refuses, and an unresolvable ref fails CLOSED. (The server
  // actions themselves need a request-scoped session, so the shared gate is
  // what this harness can exercise.)
  let archivedThrew = false
  try {
    assertLiveCohort(await repo.setup.cohortOf('dhahran', { cohortId: 'c14' }))
  } catch {
    archivedThrew = true
  }
  check(archivedThrew, 'a write gated on the archived Class of 2026 throws')

  let unknownThrew = false
  try {
    assertLiveCohort(await repo.setup.cohortOf('dhahran', { cohortId: 'no_such_cohort' }))
  } catch {
    unknownThrew = true
  }
  check(unknownThrew, 'an unknown cohort ref fails closed instead of bypassing the archive lock')

  // (d) Session numbers normalise on import, so string sort equals numeric sort.
  const subj = (await repo.coursesOfStudent('st24')).find((c) => c.type === 'subject')!
  await repo.setup.importIdentifiers('dhahran', [{
    line: 1, studentId: 'st24', matchedOn: 'email', who: 'Yildiz, Deniz',
    sessionNumber: '2', personalCode: '', resultsPin: '',
  }])
  const mvSess = await repo.ia.getMarksView('dhahran', subj.id, 'c15')
  const nums = (mvSess?.rows ?? [])
    .map((r) => r.sessionNumber)
    .filter((x): x is string => x != null)
  check(nums.includes('0002'), 'an unpadded imported session number lands zero-padded as 0002')
  check(
    nums.length > 1 && nums.every((n, i) => i === 0 || Number(nums[i - 1]) <= Number(n)),
    `marks-grid rows sit in true numeric session order (${nums.length} registered candidates)`,
  )

  // 9 — marks authorization, the audit trail, identifier redaction, cohort cloning
  //
  // The server actions need request scope, so what runs here is exactly what
  // they delegate to: marksWriteGrant (lib/ia/authorize.ts) for the write
  // decision, and the repository for everything it records.
  console.log('\n9. Marks authorization, audit trail, redaction, cohort cloning')

  // (a) Only the designated marker writes. Silva co-teaches Biology SL (the
  // course's ONE implicit section) but is not its marker; Farouk is.
  const bioB = ENROLLMENTS.find((e) => e.sectionId === 'bio_sl_c15_a')!.studentId
  const noCap = () => false
  const silvaGrant = await marksWriteGrant(repo.ia, noCap, 'dhahran', 'bio_sl', 'c15', bioB, 'u_silva')
  const faroukGrant = await marksWriteGrant(repo.ia, noCap, 'dhahran', 'bio_sl', 'c15', bioB, 'u_farouk')
  check(!silvaGrant.allowed, 'co-teacher Silva (assigned, not marker) is refused the write path')
  check(
    faroukGrant.allowed && faroukGrant.overrideReason == null,
    'designated marker Farouk is allowed, with no override attached',
  )
  check(
    (await repo.ia.isMarkerFor('dhahran', 'bio_sl', 'c15', 'u_farouk', bioB)) &&
      !(await repo.ia.isMarkerFor('dhahran', 'bio_sl', 'c15', 'u_silva', bioB)),
    'isMarkerFor agrees: marker of the section containing the student, co-teacher not',
  )

  // (b) The coordinator override: capability + reasoned, unexpired unlock.
  const canOverride = (c: string) => c === 'marks.override'
  const beforeUnlock = await marksWriteGrant(repo.ia, canOverride, 'dhahran', 'bio_sl', 'c15', bioB, 'u_okonjo')
  check(!beforeUnlock.allowed, 'the marks.override capability ALONE does not grant writes — an unlock is required')
  let blankReasonThrew = false
  try {
    await repo.ia.unlockMarks('dhahran', 'bio_sl', 'c15', 'u_okonjo', '   ')
  } catch {
    blankReasonThrew = true
  }
  check(blankReasonThrew, 'an unlock with a blank reason is refused')
  const REASON = 'Marker on leave — moderation deadline'
  await repo.ia.unlockMarks('dhahran', 'bio_sl', 'c15', 'u_okonjo', REASON)
  const duringUnlock = await marksWriteGrant(repo.ia, canOverride, 'dhahran', 'bio_sl', 'c15', bioB, 'u_okonjo')
  check(
    duringUnlock.allowed && duringUnlock.overrideReason === REASON,
    'an unexpired unlock permits the write and hands back its reason',
  )
  await repo.ia.setCriterionMark('dhahran', 'bio_sl', 'c15', bioB, 0, 4, 'u_okonjo')
  let trail = await repo.ia.listMarkEvents('dhahran', 'bio_sl', 'c15')
  check(
    trail[0].kind === 'mark' && trail[0].overrideReason === REASON && trail[0].byName === 'C. Okonjo',
    'the resulting MarkEvent carries the override reason and who wrote it',
  )
  check(trail.some((e) => e.kind === 'unlock' && e.overrideReason === REASON), 'and the unlock itself is on the trail')
  await repo.ia.relockMarks('dhahran', 'bio_sl', 'u_okonjo')
  const afterRelock = await marksWriteGrant(repo.ia, canOverride, 'dhahran', 'bio_sl', 'c15', bioB, 'u_okonjo')
  check(!afterRelock.allowed, 'relocking ends the override early')
  check(
    (await repo.ia.listMarkEvents('dhahran', 'bio_sl', 'c15'))[0].kind === 'relock',
    'and leaves its own event',
  )

  // (c) Every write appends exactly one event, with correct prev → next.
  const mvB = (await repo.ia.getMarksView('dhahran', 'bio_sl', 'c15'))!
  const rowB = mvB.rows.find((r) => r.studentId === bioB)!
  const prevVal = rowB.criterionMarks[1] ?? null
  const trailBefore = (await repo.ia.listMarkEvents('dhahran', 'bio_sl', 'c15')).length
  await repo.ia.setCriterionMark('dhahran', 'bio_sl', 'c15', bioB, 1, 6, 'u_farouk')
  trail = await repo.ia.listMarkEvents('dhahran', 'bio_sl', 'c15')
  check(trail.length === trailBefore + 1, 'a mark write appends exactly one event')
  check(
    trail[0].kind === 'mark' && trail[0].criterion === mvB.criteria[1].key &&
      trail[0].prev === prevVal && trail[0].next === 6 && trail[0].overrideReason == null,
    `the event records ${mvB.criteria[1].key}: ${prevVal ?? '—'} → 6, by the marker, no override`,
  )
  await repo.ia.setComment('dhahran', 'bio_sl', 'c15', bioB, 'Justified per criterion.', 'u_farouk')
  trail = await repo.ia.listMarkEvents('dhahran', 'bio_sl', 'c15')
  check(
    trail[0].kind === 'comment' && trail[0].next === 'Justified per criterion.',
    'a comment write appends its own event carrying the new text',
  )

  // (d) Cloning a cohort's structure — and ONLY its structure.
  const cloneId = await repo.setup.createCohort('dhahran', 'Class of 2029', 2029)
  await repo.setup.cloneCohortStructure('dhahran', 'c15', cloneId)
  const srcSecs = SECTIONS.filter((s) => s.cohortId === 'c15')
  const newSecs = SECTIONS.filter((s) => s.cohortId === cloneId)
  check(
    newSecs.length === srcSecs.length,
    `the clone recreates every section (${newSecs.length} of ${srcSecs.length})`,
  )
  const newSecIds = new Set(newSecs.map((s) => s.id))
  const srcAssign = TEACHING_ASSIGNMENTS.filter((a) => srcSecs.some((s) => s.id === a.sectionId))
  const newAssign = TEACHING_ASSIGNMENTS.filter((a) => newSecIds.has(a.sectionId))
  check(
    newAssign.length === srcAssign.length &&
      newAssign.some((a) => a.teacherId === 'u_farouk' && a.isDesignatedMarker),
    `teacher assignments come across, markership included (${newAssign.length})`,
  )
  const cloneMark = REQUIREMENT_DEFS.find((d) => d.cohortId === cloneId && d.key === 'bio_sl.mark')
  check(
    cloneMark != null && cloneMark.criteria?.length === 4 && cloneMark.markMax === 24 &&
      cloneMark.id === `${cloneId}:bio_sl.mark`,
    'fresh IA defs are instantiated from the current templates, versioned to the new cohort',
  )
  check(!ENROLLMENTS.some((e) => newSecIds.has(e.sectionId)), 'zero enrolments cloned')
  const cloneDefIds = new Set(
    REQUIREMENT_DEFS.filter((d) => d.cohortId === cloneId).map((d) => d.id),
  )
  check(
    !REQUIREMENT_STATES.some((s) => cloneDefIds.has(s.requirementDefId)),
    'zero recorded states cloned',
  )
  check(!isArchived(COHORTS.find((c) => c.id === cloneId)!), 'the new cohort arrives live')

  // (e) Identifier redaction at the track boundary — fail closed.
  const redacted = await repo.getTrack('dhahran', 'st01')
  check(
    redacted != null && redacted.student.sessionNumber == null &&
      redacted.student.personalCode == null && redacted.student.resultsPin == null,
    'a track fetched without the identifiers capability carries no session number, personal code or PIN',
  )
  const withIds = await repo.getTrack('dhahran', 'st01', { includeIdentifiers: true })
  check(
    withIds!.student.sessionNumber != null && withIds!.student.resultsPin == null,
    'an identifier holder gets the numbers — and the PIN still never leaves through a track',
  )
  check(await repo.teachesStudent('dhahran', 'u_farouk', bioB), 'the panel gate: Farouk teaches that Biology student')
  const silvaSecs = new Set(
    TEACHING_ASSIGNMENTS.filter((a) => a.teacherId === 'u_silva').map((a) => a.sectionId),
  )
  const notSilvas = STUDENTS.find(
    (st) =>
      st.cohortId === 'c15' &&
      !ENROLLMENTS.some((e) => e.studentId === st.userId && silvaSecs.has(e.sectionId)),
  )!
  check(
    !(await repo.teachesStudent('dhahran', 'u_silva', notSilvas.userId)),
    'and Silva cannot reach a student outside his own courses',
  )

  // 10 — the coordinator-dashboard simplification (2026-08): sections are an
  // invisible implementation detail, courses carry everything user-facing.
  console.log('\n10. Course-level operations, remove-course, the sample, the district guard')

  // (a) Course-level wrappers resolve the implicit section internally, and
  // markership keeps exactly-one semantics.
  const physSec = SECTIONS.find((s) => s.courseId === 'phys_sl' && s.cohortId === 'c16')!
  const stray = STUDENTS.find(
    (s) =>
      s.cohortId === 'c16' &&
      !ENROLLMENTS.some((e) => e.studentId === s.userId && e.sectionId === physSec.id),
  )!
  await repo.setup.enrolInCourse('dhahran', 'c16', 'phys_sl', stray.userId)
  check(
    ENROLLMENTS.some((e) => e.studentId === stray.userId && e.sectionId === physSec.id),
    'enrolInCourse lands on the course\'s one implicit section',
  )
  await repo.setup.unenrolFromCourse('dhahran', 'c16', 'phys_sl', stray.userId)
  check(
    !ENROLLMENTS.some((e) => e.studentId === stray.userId && e.sectionId === physSec.id),
    'unenrolFromCourse removes it again',
  )

  await repo.setup.assignTeacherToCourse('dhahran', 'c16', 'phys_sl', 'u_silva')
  check(
    TEACHING_ASSIGNMENTS.some(
      (a) => a.sectionId === physSec.id && a.teacherId === 'u_silva' && a.isDesignatedMarker,
    ),
    'the first teacher assigned to a course becomes its designated marker',
  )
  await repo.setup.setCourseMarker('dhahran', 'c16', 'phys_sl', 'u_farouk')
  check(
    TEACHING_ASSIGNMENTS.some(
      (a) => a.sectionId === physSec.id && a.teacherId === 'u_farouk' && a.isDesignatedMarker,
    ) &&
      !TEACHING_ASSIGNMENTS.some(
        (a) => a.sectionId === physSec.id && a.teacherId === 'u_silva' && a.isDesignatedMarker,
      ),
    'setCourseMarker moves the ONE markership — setting the new clears the old',
  )
  let lastMarkerThrew = false
  try {
    await repo.setup.setDesignatedMarker('dhahran', 'u_farouk', physSec.id, false)
  } catch {
    lastMarkerThrew = true
  }
  check(lastMarkerThrew, 'clearing the LAST marker is refused — a markerless course is unmarkable')
  await repo.setup.unassignTeacherFromCourse('dhahran', 'c16', 'phys_sl', 'u_silva')
  check(
    !TEACHING_ASSIGNMENTS.some((a) => a.sectionId === physSec.id && a.teacherId === 'u_silva'),
    'unassignTeacherFromCourse removes the assignment',
  )

  // (b) Remove-course: refused the moment recorded work exists; clean removal
  // otherwise. Biology SL c15 carries states AND mark events by now; the ESS
  // course added in section 7 carries nothing.
  let removeThrew = false
  try {
    await repo.setup.removeCourse('dhahran', 'bio_sl', 'c15')
  } catch {
    removeThrew = true
  }
  check(removeThrew, 'removing a course with recorded work is refused — archive the cohort instead')
  check(
    SECTIONS.some((s) => s.courseId === 'bio_sl' && s.cohortId === 'c15') &&
      REQUIREMENT_DEFS.some((d) => d.cohortId === 'c15' && d.key === 'bio_sl.mark'),
    'and the refusal deleted nothing',
  )
  await repo.setup.removeCourse('dhahran', newId, 'c16')
  check(
    !SECTIONS.some((s) => s.courseId === newId) &&
      !REQUIREMENT_DEFS.some(
        (d) => d.scope.kind === 'course' && d.scope.courseId === newId,
      ) &&
      !ENROLLMENTS.some((e) => e.sectionId === `${newId}_a`),
    'a course with nothing recorded removes cleanly — defs, implicit section and enrolments',
  )
  check(
    !COURSES.some((c) => c.id === newId),
    'and leaves the catalogue too, since no other cohort runs it',
  )

  // (c) The moderation sample: paste-matching maps session numbers (any
  // format) to the right students, flags unknowns, and persists as the ONE
  // SampleRequest per course + cohort.
  const mvSample = (await repo.ia.getMarksView('dhahran', 'bio_sl', 'c15'))!
  const cands = mvSample.rows.map((r) => ({
    studentId: r.studentId,
    sessionNumber: r.sessionNumber,
  }))
  // Rows whose session number is unique in this course — the import in 8(d)
  // deliberately created a duplicate 0002, which must not make this flaky.
  const uniq = mvSample.rows.filter(
    (r) =>
      r.sessionNumber != null &&
      mvSample.rows.filter((x) => x.sessionNumber === r.sessionNumber).length === 1,
  )
  const [ra, rb] = uniq
  const pasted = `IBIS sample:\n  candidate ${Number(ra.sessionNumber)};${rb.sessionNumber}\n  9999`
  const match = matchSessionNumbers(pasted, cands)
  check(
    match.studentIds.length === 2 &&
      match.studentIds[0] === ra.studentId && match.studentIds[1] === rb.studentId,
    'pasted session numbers — unpadded, any separators — match the right students',
  )
  check(
    match.unknown.length === 1 && match.unknown[0] === '9999',
    'a number matching no candidate is flagged "no candidate", never dropped silently',
  )
  const saved = await repo.ia.saveSampleRequest(
    'dhahran', 'bio_sl', 'c15', [...match.studentIds, 'not_a_student'], 'u_michael',
  )
  check(
    saved.status === 'draft' &&
      saved.studentIds.length === 2 && !saved.studentIds.includes('not_a_student'),
    'the selection persists as a draft SampleRequest, non-candidates dropped',
  )
  await repo.ia.setSampleSubmitted('dhahran', 'bio_sl', 'c15', true, 'u_michael')
  const submitted = await repo.ia.getSampleRequest('dhahran', 'bio_sl', 'c15')
  check(
    submitted != null && submitted.status === 'submitted' && submitted.submittedAt != null,
    'marking it submitted stamps the timestamp',
  )
  await repo.ia.saveSampleRequest('dhahran', 'bio_sl', 'c15', [ra.studentId], 'u_michael')
  check(
    SAMPLE_REQUESTS.filter((s) => s.courseId === 'bio_sl' && s.cohortId === 'c15').length === 1 &&
      (await repo.ia.getSampleRequest('dhahran', 'bio_sl', 'c15'))!.status === 'draft',
    'amending replaces the ONE live request per course + cohort and reopens it as a draft',
  )

  // (d) Exactly one district coordinator — the repo-level guard, so no screen
  // can create a second however it is asked.
  let districtMsg = ''
  try {
    await repo.setup.setPreset('dhahran', 'u_okonjo', 'district')
  } catch (e) {
    districtMsg = e instanceof Error ? e.message : String(e)
  }
  check(
    districtMsg.includes('already a district coordinator'),
    'a second district-tier assignment is refused — transfer instead',
  )
  await repo.setup.setPreset('dhahran', 'u_okonjo', 'school_full')
  const okonjo = MEMBERSHIPS.find((m) => m.userId === 'u_okonjo' && m.schoolId === 'dhahran')!
  check(
    okonjo.presetKey === 'school_full' &&
      okonjo.addedCapabilities.length === 0 && okonjo.removedCapabilities.length === 0,
    'a legitimate preset change lands and clears deviations recorded against the old preset',
  )

  // -------------------------------------------------------------------------
  // 11 — Download for IBIS. The upload board is a PROJECTION over defs, states
  // and SampleRequests (IB-Export-and-Samples.md §4: the spine needed nothing
  // new); its one write stamps only the export axis, and only what was in the
  // pack.
  // -------------------------------------------------------------------------
  console.log('\n11. Download for IBIS — the upload board')
  const DONE_11 = new Set(['submitted', 'marked', 'released'])
  const board11 = await repo.export.getUploadBoard('dhahran', 'c15')
  if (!board11) return check(false, 'upload board built for c15')
  const jobKeys11 = board11.cohortJobs.map((j) => j.key)
  const g6Set = new Set(
    COURSES.filter(
      (c) => c.type === 'subject' && c.subjectGroup.startsWith('Group 6'),
    ).map((c) => c.id),
  )
  check(
    ['ee.essay', 'ee.rppf', 'tok.essay', 'tok.tkppf'].every((k) => jobKeys11.includes(k)) &&
      jobKeys11.some((k) => k.startsWith('g6:')) &&
      jobKeys11.filter((k) => k.startsWith('g6:')).every((k) => g6Set.has(k.slice(3))),
    'cohort jobs: the four core packs plus one per running Group 6 course',
  )
  check(
    board11.sampleJobs.every((s) => !g6Set.has(s.courseId)) &&
      board11.sampleJobs.some((s) => s.kind === 'tok_exhibition'),
    'Group 6 uploads for every candidate, never sampled; the exhibition is sampled',
  )

  const essayJob = board11.cohortJobs.find((j) => j.key === 'ee.essay')!
  const sns11 = essayJob.rows
    .map((r) => r.sessionNumber)
    .filter((x): x is string => x != null)
  check(
    essayJob.rows.every(
      (r) => r.fileName === `${r.sessionNumber ?? 'no-session-number'}_EE_essay.pdf`,
    ) && sns11.every((v, i) => i === 0 || sns11[i - 1] <= v),
    'pack rows carry sessionNo_Component names, in IBIS candidate order',
  )

  const eeFinalDef = REQUIREMENT_DEFS.find((d) => d.cohortId === 'c15' && d.key === 'ee.final')!
  check(
    essayJob.ready ===
      essayJob.rows.filter((r) =>
        REQUIREMENT_STATES.some(
          (s) =>
            s.requirementDefId === eeFinalDef.id &&
            s.studentId === r.studentId &&
            DONE_11.has(s.recordStatus),
        ),
      ).length,
    'ready counts derive from RequirementStates — nothing is stored to make the board',
  )

  const ppfJob = board11.cohortJobs.find((j) => j.key === 'tok.tkppf')!
  const ppfDefs11 = ['tok.ppf1', 'tok.ppf2', 'tok.ppf3'].map(
    (k) => REQUIREMENT_DEFS.find((d) => d.cohortId === 'c15' && d.key === k)!,
  )
  check(
    ppfJob.kind === 'forms' &&
      ppfJob.rows.every((r) => r.source === 'generated') &&
      ppfJob.ready ===
        ppfJob.rows.filter((r) =>
          ppfDefs11.every((d) =>
            REQUIREMENT_STATES.some(
              (s) =>
                s.requirementDefId === d.id &&
                s.studentId === r.studentId &&
                DONE_11.has(s.recordStatus),
            ),
          ),
        ).length,
    'a TK/PPF slot is present only when all three interactions are typed — the official form, generated',
  )

  const bioSample = board11.sampleJobs.find((s) => s.courseId === 'bio_sl')
  check(
    bioSample != null &&
      bioSample.sample != null &&
      bioSample.sample.status === 'draft' &&
      bioSample.sample.size === 1,
    "a sample row mirrors the live SampleRequest the IA module recorded — same entity, no copy",
  )

  const typedIa = board11.typedJobs.find((t) => t.key === 'ia_marks')!
  check(
    typedIa.total === board11.iaFiles.reduce((a, g) => a + g.rows.length, 0) &&
      board11.iaFiles.length ===
        board11.sampleJobs.filter((s) => s.kind === 'ia').length +
          jobKeys11.filter((k) => k.startsWith('g6:')).length,
    'the all-IAs download and the transcription total cover every enrolment in every subject course',
  )

  await repo.export.setJobSubmitted('dhahran', 'c15', 'ee.essay', true)
  const after11 = (await repo.export.getUploadBoard('dhahran', 'c15'))!.cohortJobs.find(
    (j) => j.key === 'ee.essay',
  )!
  const missing11 = new Set(after11.rows.filter((r) => !r.present).map((r) => r.studentId))
  check(
    after11.submitted &&
      after11.rows.filter((r) => r.present).every((r) => r.submitted) &&
      REQUIREMENT_STATES.filter(
        (s) => s.requirementDefId === eeFinalDef.id && missing11.has(s.studentId),
      ).every((s) => s.exportStatus !== 'submitted'),
    'marking a pack submitted stamps exportStatus on exactly the slots that were in it',
  )
  await repo.export.setJobSubmitted('dhahran', 'c15', 'ee.essay', false)
  check(
    REQUIREMENT_STATES.filter((s) => s.requirementDefId === eeFinalDef.id).every(
      (s) => s.exportStatus == null,
    ),
    'amending clears the stamp and stores nothing — invariant #2 on the export axis',
  )

  let archived11 = ''
  try {
    await repo.export.setJobSubmitted('dhahran', 'c14', 'ee.essay', true)
  } catch (e) {
    archived11 = e instanceof Error ? e.message : String(e)
  }
  check(
    archived11.includes('archived'),
    'an archived cohort refuses the write — a record, not a workspace',
  )

  console.log('\n' + '='.repeat(60))
  if (fail.length) {
    console.log(`CHECKPOINT FAILED — ${fail.length} problem(s). Fix the spine before building screens.\n`)
    process.exit(1)
  }
  console.log('CHECKPOINT PASSED — the board and track render CAS with no edit to either component.\n')
}

main()
