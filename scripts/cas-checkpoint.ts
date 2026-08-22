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
import { DEV_USERS } from '../lib/session'
import { CAS_DATA } from '../lib/data/cas-fixtures'
import { summarise } from '../lib/cas/derive'
import { MAX_RECORDING_SECONDS, extensionFor } from '../lib/cas/recording'
import { marksWriteGrant } from '../lib/ia/authorize'
import { pgWriteGrant, restrictStudentView } from '../lib/pg/authorize'
import { REPORTING_POINTS, pgKey } from '../lib/pg/types'
import { normaliseGrade } from '../lib/pg/scale'
import {
  JOIN_GRACE_DAYS, addDays, deadlineFor, deadlineMatches, daysUntil, lateFrom, stageOf,
  studentMaySee, tierOfStage,
  stagesIn, studentOwedToIb, warningLevel, withDue,
} from '../lib/deadlines'
import { cohortStart, EE_SUPERVISION } from '../lib/data/fixtures'
import { detachedStatesOf, stateOf } from '../lib/spine'
import { LANE_SUMMARY } from '../lib/board'
import { attestationLabel, eeCoordinatorId, supervisorFor } from '../lib/ee/supervision'
import { casWindow } from '../lib/cas/window'
import { EE_EARLY_FILED, EE_EARLY_NO_VIVA, EE_REGISTRATIONS, TOK_EARLY_EXH } from '../lib/data/fixtures'
import { BAND_PROVENANCE, EE_CRITERIA, boundariesAreOfficial, indicativeGrade } from '../lib/ee/rubric'
import { registrationComplete, subjectWarnings, validateRegistration } from '../lib/ee/registration'
import { DP_SUBJECTS, isDpSubject, subjectForCourse } from '../lib/ee/subjects'
import { anonymityPreflight, preflightPasses } from '../lib/anonymity'
import {
  countWords, criterionOpen, hoursProblem, markingGates, releaseBlockers, summariseScore,
  supervisionHours,
} from '../lib/ee/scoring'
import { DEADLINES } from '../lib/data/fixtures'
import { matchSessionNumbers } from '../lib/ia/sample'
import { NAMING_PATTERN, packFileName, packFolderPath, slug, splitName } from '../lib/export/naming'
import { IA_PROMPTS, PROMPT_COUNT, PROMPT_PROVENANCE, promptLabel, promptText } from '../lib/tok/prompts'
import {
  BAND_PROVENANCE as TOK_BAND_PROVENANCE, ESSAY_INSTRUMENT, ESSAY_WEIGHT, EXHIBITION_INSTRUMENT,
  EXHIBITION_WEIGHT, INSTRUMENTS, TOK_MARK_MAX, TOK_TOTAL_MAX, bandFor, tokTotal,
} from '../lib/tok/rubric'
import {
  AUTHORSHIP_ORDER, INTERACTION_LINES, PRESCRIBED_TITLE_COUNT, SEED_BOUNDARIES,
  boundaryProblems, interactionLine, interactionOpen, letterFor, titlesArePosted,
} from '../lib/tok/types'
import {
  MARK_EVENTS, TOK_BOUNDARIES, TOK_FILES, TOK_INTERACTION_LOGS, TOK_MARKS, TOK_TITLE_SETS,
} from '../lib/data/fixtures'
import { canRelease, promptDistribution, releaseBlockers as tokReleaseBlockers, summariseMarking } from '../lib/tok/marking'
import { canSign, composeTeacherComment, signBlockers, signWarnings } from '../lib/tok/ppf'
import { TOK_PPF } from '../lib/data/fixtures'
import { iaTotal, templateOf } from '../lib/templates'
import { resolveCapabilities } from '../lib/capabilities'
import { AUDIO_ONLY, PDF_ONLY, accepted, acceptsIn, describeAccepts, formatRefusal } from '../lib/accepts'
import { fileOf, filesOf } from '../lib/files'

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

  // 3b — the consistency strip: counts and dots, both derived, neither stored
  //
  // The strip added 17 Aug answers a question the seven checkpoints cannot:
  // whether a student kept showing up over eighteen months. These assertions
  // pin the two things that make it honest — that a count is a count of
  // EXPERIENCES, and that the timeline is the thread's own dates in order.
  console.log('\n3b. Consistency strip (CAS, 17 Aug)')
  const strip = summarise('st01', CAS_DATA)
  check(strip.tallies.length === 7, `seven tallies, always (got ${strip.tallies.length})`)
  check(
    strip.tallies.every((t) => t.confirmed >= 0 && t.open >= 0),
    'no negative counts',
  )
  check(
    strip.tallies.filter((t) => t.confirmed > 0).length === strip.outcomes.length,
    'a tally is confirmed exactly when the outcome is confirmed — the strip and the board agree',
  )
  {
    // A count is per experience, so it can never exceed the number of
    // experiences the student has. If this ever fails, something has started
    // counting reflections.
    const experiences = CAS_DATA.experiences.filter((e) => e.studentId === 'st01').length
    check(
      strip.tallies.every((t) => t.confirmed + t.open <= experiences),
      `no outcome is counted more often than the student has experiences (${experiences})`,
    )
  }
  check(
    strip.posts.every((p, i) => i === 0 || strip.posts[i - 1].at <= p.at),
    'the timeline is in date order, oldest first',
  )
  check(
    strip.posts.every((p) => p.kind === 'reflection' || p.kind === 'evidence'),
    'only reflections and evidence are dots — sign-offs and staff notes are not the student showing up',
  )
  check(
    strip.posts.length ===
      CAS_DATA.entries.filter(
        (e) =>
          !e.supersededBy &&
          (e.kind === 'reflection' || e.kind === 'evidence') &&
          CAS_DATA.experiences.some((x) => x.id === e.experienceId && x.studentId === 'st01'),
      ).length,
    `every visible post is a dot and no post is counted twice (${strip.posts.length})`,
  )
  check(
    await repo.cas.isCasComplete('dhahran', 'st01') === strip.complete,
    'the freeze check and the summary agree on whether CAS is confirmed',
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
    ['ee.essay', 'ee.rpf', 'tok.essay', 'tok.tkppf'].every((k) => jobKeys11.includes(k)) &&
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
  // ⚑ UPDATED 21 Aug — the naming scheme is now generated (lib/export/naming.ts,
  // §16 below). Session number still leads, because it is what IBIS puts on
  // screen while the coordinator uploads; the name and subject follow it.
  check(
    essayJob.rows.every(
      (r) => /^(\d{4}_)?[A-Za-z-]+_[A-Za-z-]+_ee_[a-z-]+\.pdf$/.test(r.fileName) &&
        (r.sessionNumber == null) === !/^\d{4}_/.test(r.fileName),
    ) && sns11.every((v, i) => i === 0 || sns11[i - 1] <= v),
    'pack rows carry generated {sessionNo}_{Last}_{First}_{component} names, in IBIS candidate order',
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

  // THE STAMP TEST MOVED FROM ee.essay TO tok.essay, and the reason is the
  // point of the EE build: the Class of 2027's EE pack is now legitimately
  // EMPTY. Their final essay is due 13 Nov 2026 and the fixture clock is
  // August, so not one candidate has submitted — which is correct, and which
  // this test cannot use, because `submitted` requires `ready > 0`. Previously
  // the pack looked partly ready because the generic roll had fabricated
  // states nothing could produce. The mechanism is unchanged; only the vehicle
  // is, and §13 asserts the emptiness directly rather than losing it.
  // AND NOW FROM tok.essay TO A GROUP 6 PORTFOLIO, for the same reason again:
  // TOK's fabricated states went the way EE's did on 20 Aug, so the Class of
  // 2027's TOK packs are legitimately empty too. A Group 6 portfolio reads from
  // `<courseId>.file`, which IS still generically seeded — and that is a
  // defensible fixture rather than a lie, because the IA marks module EXISTS
  // and can produce those states. The line is not "was this rolled?" but "could
  // anything in the product have written it?"
  const stampJob = board11.cohortJobs.find((j) => j.key.startsWith('g6:') && j.ready > 0)!
  const stampDef = REQUIREMENT_DEFS.find(
    (d) => d.cohortId === 'c15' && d.key === `${stampJob.key.slice(3)}.file`,
  )!
  await repo.export.setJobSubmitted('dhahran', 'c15', stampJob.key, true)
  const after11 = (await repo.export.getUploadBoard('dhahran', 'c15'))!.cohortJobs.find(
    (j) => j.key === stampJob.key,
  )!
  const missing11 = new Set(after11.rows.filter((r) => !r.present).map((r) => r.studentId))
  check(
    after11.submitted &&
      after11.rows.filter((r) => r.present).every((r) => r.submitted) &&
      REQUIREMENT_STATES.filter(
        (s) => s.requirementDefId === stampDef.id && missing11.has(s.studentId),
      ).every((s) => s.exportStatus !== 'submitted'),
    'marking a pack submitted stamps exportStatus on exactly the slots that were in it',
  )
  await repo.export.setJobSubmitted('dhahran', 'c15', stampJob.key, false)
  check(
    REQUIREMENT_STATES.filter((s) => s.requirementDefId === stampDef.id).every(
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


  // -------------------------------------------------------------------------
  console.log('\n12. Predicted grades — the template, and the lock')

  const pgDefs = REQUIREMENT_DEFS.filter((d) => d.lane === 'Predicted grades')
  const pgC15 = pgDefs.filter((d) => d.cohortId === 'c15')
  const pgCourses = new Set(
    pgC15.map((d) => (d.scope.kind === 'course' ? d.scope.courseId : 'programme')),
  )
  check(
    pgC15.length === pgCourses.size * REPORTING_POINTS.length,
    `three reporting points per course — ${pgCourses.size} courses, ${pgC15.length} definitions`,
  )
  check(
    pgC15.every((d) => d.scope.kind === 'course'),
    'every predicted-grade definition is COURSE-scoped — the old programme-scoped ib.pg is gone',
  )
  check(
    REQUIREMENT_DEFS.every((d) => d.key !== 'ib.pg'),
    'no ib.pg definition survives anywhere — one value per course per point, or nothing',
  )
  const eeCourse = COURSES.find((c) => c.type === 'ee')
  check(
    eeCourse != null && !pgCourses.has(eeCourse.id),
    'the extended essay has NO predicted-grade definitions — graded once, its own module, later',
  )
  const tokCourse = COURSES.find((c) => c.type === 'tok')!
  check(
    pgC15.filter((d) => d.scope.kind === 'course' && d.scope.courseId === tokCourse.id)
      .every((d) => d.gradeScale === 'letter_a_e'),
    'TOK predicts on the LETTER scale; every subject predicts 1–7',
  )
  check(
    pgC15.filter((d) => d.gradeScale === 'points_1_7').length === (pgCourses.size - 1) * 3,
    'the scale is the ONLY difference between a subject course and TOK',
  )
  check(
    pgC15.filter((d) => d.exportTarget === 'ibis_predicted').length === pgCourses.size &&
      pgC15.filter((d) => d.exportTarget === 'ibis_predicted').every((d) => d.key.endsWith('.p3')),
    'exportTarget sits on the APRIL definition alone — that is what makes April the IB’s',
  )

  // --- the scale is the one validity rule ---
  check(
    normaliseGrade('b', 'letter_a_e') === 'B' && normaliseGrade('8', 'points_1_7') === null &&
      normaliseGrade('F', 'letter_a_e') === null && normaliseGrade('7', 'points_1_7') === '7',
    'one validity check for every scale — “b” normalises to B, 8 and F are refused',
  )

  // --- who may write ---
  const bioPg = COURSES.find((c) => c.name.startsWith('Biology'))!
  const markerId = TEACHING_ASSIGNMENTS.find((a) => {
    const sec = SECTIONS.find((x) => x.id === a.sectionId)
    return a.isDesignatedMarker && sec?.courseId === bioPg.id && sec?.cohortId === 'c15'
  })!.teacherId
  const aStudent = ENROLLMENTS.find((e) =>
    SECTIONS.some((x) => x.id === e.sectionId && x.courseId === bioPg.id && x.cohortId === 'c15'),
  )!.studentId

  const asMarker = await pgWriteGrant(
    repo.ia, () => false, 'dhahran', bioPg.id, 'c15', aStudent, markerId,
  )
  const asCoordinator = await pgWriteGrant(
    repo.ia, (c) => c === 'marks.transcribe', 'dhahran', bioPg.id, 'c15', aStudent, 'u_haddad',
  )
  const asOtherTeacher = await pgWriteGrant(
    repo.ia, (c) => c === 'pg.manage', 'dhahran', bioPg.id, 'c15', aStudent, 'u_silva',
  )
  check(asMarker.allowed && asMarker.as === 'marker', 'the designated marker writes predicted grades')
  check(
    asCoordinator.allowed && asCoordinator.as === 'coordinator',
    'the coordinator tier writes DIRECTLY — no unlock ceremony, unlike an IA mark',
  )
  check(
    !asOtherTeacher.allowed,
    'pg.manage alone is not enough — another course’s teacher is refused',
  )

  // --- the lock ---
  const view0 = (await repo.pg.getView('dhahran', bioPg.id, 'c15'))!
  const locked = view0.rows.find((r) => r.cells[0].locked)!
  let lockErr = ''
  try {
    await repo.pg.setGrade('dhahran', bioPg.id, 'c15', locked.studentId, 'p1', '1', markerId)
  } catch (e) {
    lockErr = e instanceof Error ? e.message : String(e)
  }
  check(lockErr.toLowerCase().includes('locked'), 'a locked predicted grade REFUSES the write')
  const stillThere = (await repo.pg.getView('dhahran', bioPg.id, 'c15'))!
    .rows.find((r) => r.studentId === locked.studentId)!.cells[0].grade
  check(stillThere === locked.cells[0].grade, 'the refused write changed nothing')

  let noReason = ''
  try {
    await repo.pg.unlockGrade('dhahran', bioPg.id, 'c15', locked.studentId, 'p1', '  ', markerId)
  } catch (e) {
    noReason = e instanceof Error ? e.message : String(e)
  }
  check(noReason.toLowerCase().includes('reason'), 'unlocking without a reason is refused')

  await repo.pg.unlockGrade(
    'dhahran', bioPg.id, 'c15', locked.studentId, 'p1', 'Mock result arrived after entry.', markerId,
  )
  const opened = (await repo.pg.getView('dhahran', bioPg.id, 'c15'))!
    .rows.find((r) => r.studentId === locked.studentId)!.cells[0]
  check(
    !opened.locked && opened.openReason === 'Mock result arrived after entry.',
    'unlocking opens exactly that cell and carries its reason',
  )

  const was = opened.grade
  const now = was === '7' ? '6' : '7'
  await repo.pg.setGrade('dhahran', bioPg.id, 'c15', locked.studentId, 'p1', now, markerId)
  const after = (await repo.pg.getView('dhahran', bioPg.id, 'c15'))!
    .rows.find((r) => r.studentId === locked.studentId)!.cells[0]
  check(after.grade === now && after.locked, 'saving writes the new grade and RE-LOCKS it')

  const pgTrail = await repo.ia.listMarkEvents('dhahran', bioPg.id, 'c15')
  const change = pgTrail.find((e) => e.kind === 'pg')
  check(
    change != null && change.prev === was && change.next === now &&
      change.overrideReason === 'Mock result arrived after entry.',
    'the change lands on the SAME trail as the IA marks, carrying the reason it was opened with',
  )
  check(
    pgTrail.some((e) => e.kind === 'pg_unlock'),
    'the unlock is itself an event — nothing about a change is inferred',
  )

  let bad = ''
  try {
    // p3 is empty for everyone (April has not happened), so this reaches the
    // scale check rather than stopping at the lock.
    await repo.pg.setGrade('dhahran', bioPg.id, 'c15', locked.studentId, 'p3', 'Z', markerId)
  } catch (e) {
    bad = e instanceof Error ? e.message : String(e)
  }
  check(bad.includes('not a valid grade'), 'an off-scale value is refused rather than stored')
  check(
    (await repo.pg.getView('dhahran', bioPg.id, 'c15'))!
      .rows.find((r) => r.studentId === locked.studentId)!.cells[2].grade == null,
    'and nothing was written when it was refused',
  )

  // --- the whole-student view, and the cross-course capability ---
  const student = (await repo.pg.getStudentView('dhahran', aStudent))!
  check(
    student.courses.length > 1 && student.courses.some((c) => c.scale === 'letter_a_e'),
    `one candidate's predicted grades span every course they take — ${student.courses.length} of them, TOK included`,
  )
  check(
    student.filled.every((f) => f.total === student.courses.length),
    'the denominator is derived from enrolment — nobody is asked for a grade in a course they do not take',
  )
  const restricted = restrictStudentView(student, new Set([bioPg.id]))
  check(
    restricted.view.courses.length === 1 && restricted.hidden === student.courses.length - 1,
    'without grades.cross_course a teacher keeps their OWN course and loses the others',
  )
  check(
    restricted.view.filled.every((f) => f.total === 1),
    'the fraction is recounted over what is shown — a total over hidden rows would be a lie',
  )

  // --- archived years ---
  const c14Pg = REQUIREMENT_DEFS.filter((d) => d.lane === 'Predicted grades' && d.cohortId === 'c14')
  check(c14Pg.length > 0, 'the archived cohort has its predicted grades — a record, not an absence')


  // -------------------------------------------------------------------------
  console.log('\n13. Due dates — the record, the match, and who may move one')

  const dueForSource = require('fs').readFileSync(
    require('path').join(__dirname, '../../lib/data/deadline-repo.ts'), 'utf8',
  ) as string
  const dlC15 = DEADLINES.filter((d) => d.cohortId === 'c15')
  check(dlC15.length > 0, `${dlC15.length} deadlines seeded for the graduating cohort`)
  check(
    DEADLINES.every((d) => d.decidedBy.trim().length > 0 && d.setBy.length > 0),
    'every deadline records WHO DECIDED it — a date is a decision people made, not a fact',
  )

  // --- every seeded row actually reaches a requirement ---
  const orphans = DEADLINES.filter(
    (d) => !REQUIREMENT_DEFS.some((def) => deadlineMatches(d, def)),
  )
  check(
    orphans.length === 0,
    orphans.length === 0
      ? 'every deadline lands on at least one requirement — no silent orphans'
      : `ORPHAN DEADLINES: ${orphans.map((d) => d.courseId + '/' + d.requirementKey).join(', ')}`,
  )

  // --- the stage seam ---
  const bioFile = REQUIREMENT_DEFS.find(
    (d) => d.cohortId === 'c15' && d.key === bioPg.id + '.file',
  )!
  const bioPgP2 = REQUIREMENT_DEFS.find((d) => d.cohortId === 'c15' && d.key.endsWith('.pg.p2'))!
  const auth = REQUIREMENT_DEFS.find((d) => d.cohortId === 'c15' && d.key === 'ib.auth')!
  check(stageOf(bioFile) === 'file', "a course-scoped key's stage is everything after the course id")
  check(stageOf(bioPgP2) === 'pg.p2', "'<course>.pg.p2' has stage 'pg.p2', not 'pg'")
  check(stageOf(auth) === 'ib.auth', 'a programme-scoped def IS its own stage')
  const stages = stagesIn(REQUIREMENT_DEFS.filter((d) => d.cohortId === 'c15'))
  check(
    stages.some((x) => x.key === 'pg.p2' && x.cohortWide) &&
      stages.some((x) => x.key === 'file' && x.cohortWide),
    'stages shared by many courses are offered as cohort-wide; the picker is derived from the defs',
  )

  // --- ONE cohort-wide row covers every course ---
  const pgP2Rows = REQUIREMENT_DEFS.filter((d) => d.cohortId === 'c15' && d.key.endsWith('.pg.p2'))
  const pgDate = dlC15.find((d) => d.requirementKey === 'pg.p2')!
  check(
    pgP2Rows.length > 1 && pgP2Rows.every((def) => deadlineMatches(pgDate, def)),
    `one cohort-wide predicted-grade row dates all ${pgP2Rows.length} courses at once`,
  )
  check(
    !deadlineMatches(pgDate, bioFile),
    'and it does NOT bleed onto a different stage — suffix matching is anchored at the dot',
  )

  // --- MOST SPECIFIC WINS ---
  const wide = { ...pgDate, id: 'dl_test_wide', requirementKey: 'file', courseId: null, dueAt: '2027-01-14' }
  const narrow = { ...pgDate, id: 'dl_test_narrow', requirementKey: 'file', courseId: bioPg.id, dueAt: '2027-01-28' }
  check(
    deadlineFor([wide, narrow], bioFile)?.id === 'dl_test_narrow',
    'a course-specific date overrides a cohort-wide one — "everyone by the 14th, except Chemistry"',
  )
  check(
    deadlineFor([narrow, wide], bioFile)?.id === 'dl_test_narrow',
    'and it wins regardless of the order the rows arrive in',
  )

  // --- late is derived, and never fires on the wrong thing ---
  const doneCp = { def: bioFile, state: null, display: 'done' as const }
  const futureCp = { def: bioFile, state: null, display: 'future' as const }
  const openCp = { def: bioFile, state: null, display: 'not_started' as const }
  const past = [{ ...wide, dueAt: '2020-01-01' }]
  check(withDue(doneCp, past, '2027-01-20').due?.late === false, 'work that is IN is never late')
  check(
    withDue(futureCp, past, '2027-01-20').due?.late === false,
    "a 'future' requirement is never late — its opener has not happened, so it is nobody's turn",
  )
  check(withDue(openCp, past, '2027-01-20').due?.late === true, 'incomplete + a date that has passed = late')
  check(daysUntil('2027-01-20', '2027-01-14') === 6, 'days are counted in whole school days, not UTC hours')

  // --- WHO MAY MOVE A DATE ---
  // Section 12 already established this course and its designated marker.
  const bioCourseId = bioPg.id
  const dlMarkerId = markerId
  const c15Defs = REQUIREMENT_DEFS.filter((d) => d.cohortId === 'c15')

  // --- THE TIER RULE: a date belongs to whoever does the work ---
  check(
    tierOfStage('mark', c15Defs) === 'none' &&
      tierOfStage('comment', c15Defs) === 'none' &&
      tierOfStage('exhmark', c15Defs) === 'none' &&
      tierOfStage('score', c15Defs) === 'none',
    'marking and commenting are NOT due dates \u2014 staff work carries no deadline, on any course',
  )
  check(
    tierOfStage('file', c15Defs) === 'programme' &&
      tierOfStage('essay', c15Defs) === 'programme' &&
      tierOfStage('pg.p2', c15Defs) === 'programme' &&
      tierOfStage('ib.auth', c15Defs) === 'programme' &&
      tierOfStage('complete', c15Defs) === 'programme',
    'the final upload, the reporting points, CAS and IB authentication are the coordinator\u2019s',
  )
  check(
    tierOfStage('title', c15Defs) === 'course' &&
      tierOfStage('exh', c15Defs) === 'course' &&
      tierOfStage('prompt', c15Defs) === 'course',
    'module milestones are the teacher\u2019s \u2014 they never leave one classroom',
  )
  check(
    ['lo1','lo2','lo3','lo4','lo5','lo6','lo7','project'].every(
      (k) => tierOfStage(k, c15Defs) === 'none',
    ) && tierOfStage('complete', c15Defs) === 'programme',
    'CAS HAS ONE DATE \u2014 the portfolio complete. An outcome is evidence inside it, not something handed in on a Tuesday',
  )
  check(
    tierOfStage('draft', c15Defs) === 'programme',
    "and 'draft' is read WITH ITS LANE: the EE draft is on the programme's EE calendar, not a teacher's",
  )

  // --- no seeded date sits on work its owner cannot do ---
  const wrongOwner = DEADLINES.filter((d) => {
    const hits = REQUIREMENT_DEFS.filter((def) => deadlineMatches(d, def))
    return hits.length > 0 && !hits.every((def) => studentMaySee(def) || def.lane === 'Predicted grades')
  })
  check(
    wrongOwner.length === 0,
    wrongOwner.length === 0
      ? 'and NOT ONE seeded date lands on staff-recorded work \u2014 the thirty IA mark dates are gone'
      : `DATES ON SOMEBODY ELSE'S WORK: ${wrongOwner.map((d) => d.courseId + '/' + d.requirementKey).join(', ')}`,
  )
  check(
    !DEADLINES.some((d) => d.requirementKey === 'mark'),
    'a predicted-grade point is when marks are needed; `.mark` has no date of its own anywhere',
  )

  // --- WHO MAY MOVE A DATE ---
  // Section 12 already established this course and its designated marker.
  const dlTokMarker = 'u_adeyemi'
  check(
    !(await repo.deadlines.maySet('dhahran', 'c15', dlMarkerId, 'file', bioCourseId, false)),
    'the designated marker is REFUSED the final upload date \u2014 the stagger is one person\u2019s decision',
  )
  check(
    await repo.deadlines.maySet('dhahran', 'c15', dlTokMarker, 'exh', 'tok', false),
    'but sets their own module milestone \u2014 the exhibition date never leaves the TOK room',
  )
  check(
    !(await repo.deadlines.maySet('dhahran', 'c15', dlMarkerId, 'pg.p2', null, false)),
    'and is REFUSED a predicted-grade date \u2014 that is a cohort-wide commitment, coordinator only',
  )
  check(
    !(await repo.deadlines.maySet('dhahran', 'c15', 'u_silva', 'exh', 'tok', false)),
    'another course\u2019s teacher is refused',
  )
  check(
    await repo.deadlines.maySet('dhahran', 'c15', 'u_haddad', 'pg.p2', null, true),
    'a deadlines.set holder sets anything, including predicted grades',
  )
  check(
    !(await repo.deadlines.maySet('dhahran', 'c15', 'u_haddad', 'mark', bioCourseId, true)),
    'but NOT a marking date \u2014 an undatable stage is refused to the coordinator too, so there is no date to leak',
  )
  check(
    !(await repo.deadlines.maySet('dhahran', 'c15', dlTokMarker, 'exh', null, false)),
    'a teacher cannot set a cohort-wide date even on a stage they own',
  )

  // --- A PER-STUDENT EXTENSION is the most specific row there is ---
  const extStudent = STUDENTS.find((st) => st.cohortId === 'c15')!.userId
  const otherStudent = STUDENTS.filter((st) => st.cohortId === 'c15')[1]!.userId
  check(
    await repo.deadlines.maySet('dhahran', 'c15', dlMarkerId, 'file', bioCourseId, false, extStudent),
    'the marker MAY extend one candidate on their own course \u2014 they are the one who knows why',
  )
  check(
    !(await repo.deadlines.maySet('dhahran', 'c15', 'u_silva', 'file', bioCourseId, false, extStudent)),
    'a teacher who does not mark that course still cannot, extension or not',
  )
  const ext = {
    ...pgDate, id: 'dl_test_ext', requirementKey: 'file', courseId: bioPg.id,
    studentId: extStudent, dueAt: '2027-03-15',
  }
  check(
    deadlineFor([wide, narrow, ext], bioFile, extStudent)?.id === 'dl_test_ext',
    'one candidate\u2019s extension beats the course date, which beats the cohort\u2019s',
  )
  check(
    deadlineFor([wide, narrow, ext], bioFile, otherStudent)?.id === 'dl_test_narrow',
    'and it reaches NOBODY else \u2014 an extension is a row, not a policy',
  )
  check(
    deadlineFor([wide, narrow, ext], bioFile)?.id === 'dl_test_narrow',
    'a read with no candidate in hand sees the cohort\u2019s record, never somebody\u2019s extension',
  )

  // --- UNSET IS OFFERED, NEVER DEMANDED ---
  const unsetCoord = await repo.deadlines.listUnset('dhahran', 'c15', {
    userId: 'u_haddad', hasDeadlinesSet: true,
  })
  check(
    unsetCoord.length > 0 && unsetCoord.every((u) => u.tier === 'programme'),
    `the coordinator's list is ${unsetCoord.length} PROGRAMME dates with none set \u2014 not a list of other people's pacing decisions`,
  )
  check(
    !unsetCoord.some((u) => u.lane === 'CAS'),
    'and not one CAS row \u2014 the only CAS date is the portfolio, and it is set',
  )
  check(
    !unsetCoord.some((u) => DEADLINES.some((d) => d.cohortId === 'c15' && d.requirementKey === u.key)),
    'nothing already dated appears on it',
  )
  const unsetTeacher = await repo.deadlines.listUnset('dhahran', 'c15', {
    userId: dlTokMarker, hasDeadlinesSet: false,
  })
  check(
    unsetTeacher.every((u) => u.tier === 'course' && u.courseId != null),
    'a teacher is offered ONLY their own module milestones \u2014 an empty row you cannot fill is an accusation',
  )
  check(
    unsetTeacher.some((u) => u.key === 'prompt') && unsetTeacher.some((u) => u.key === 'ppf1'),
    'the prompt and the TK/PPF interactions among them \u2014 nobody has dated these and nobody has to; Google Classroom is a legitimate answer',
  )
  check(
    (await repo.deadlines.listUnset('dhahran', 'c15', { userId: 'u_silva', hasDeadlinesSet: false }))
      .every((u) => u.courseId === 'busman_sl' || u.tier === 'course'),
    'and somebody who marks one course is offered that course, not the programme',
  )

  // --- MOVING A DATE SUPERSEDES IT ---
  const beforeCount = (await repo.deadlines.list('dhahran', 'c15')).length
  const original = (await repo.deadlines.list('dhahran', 'c15'))
    .find((d) => d.requirementKey === 'file' && d.courseId === bioCourseId)!
  const moved = await repo.deadlines.set(
    'dhahran', 'c15',
    { requirementKey: 'file', courseId: bioCourseId, dueAt: '2027-02-18', isMajor: true, decidedBy: 'Pushed at the Feb meeting' },
    dlMarkerId,
  )
  const afterList = await repo.deadlines.list('dhahran', 'c15')
  check(afterList.length === beforeCount, 'moving a date replaces the live row rather than adding a second one')
  check(
    moved.supersedes === original.id && moved.dueAt === '2027-02-18',
    'and the new row NAMES the one it replaced — a moved date has a predecessor, not an edit history of none',
  )
  check(
    (await repo.deadlines.forDef('dhahran', 'c15', bioFile))?.dueAt === '2027-02-18',
    'the requirement immediately reads the new date',
  )

  // --- somebody's own dates ---
  const aCandidate = STUDENTS.find((st) => st.cohortId === 'c15')!.userId
  const studentDue = await repo.deadlines.dueFor('dhahran', aCandidate)
  check(studentDue.length > 0, `a candidate has ${studentDue.length} dates of their own`)
  check(
    studentDue.every((d) => !d.deadline.requirementKey.startsWith('pg.')),
    'and NOT ONE of them is a predicted-grade date — those are staff-facing',
  )
  check(
    !/excludePg/.test(dueForSource),
    'and there is NO FLAG to get that wrong \u2014 the filter was deleted, because a rule that a caller has to remember is not a rule',
  )
  check(
    studentDue.every((d) =>
      REQUIREMENT_DEFS.filter((def) => deadlineMatches(d.deadline, def)).some(studentMaySee),
    ),
    'ONE RULE for what a candidate sees: a date is theirs if the work is \u2014 the same predicate the track uses',
  )
  const teacherDue = await repo.deadlines.dueFor('dhahran', dlMarkerId)
  check(
    teacherDue.length > 0 && teacherDue.every((d) => d.total > 0),
    'a teacher\u2019s dates carry the fraction of their roster that is in',
  )

  // --- THE STUDENT'S NON-DISMISSIBLE WARNING ---
  const tr = (await repo.getTrack('dhahran', aCandidate, { includeIdentifiers: false }))!
  const cps = tr.lanes.flatMap((l) => l.checkpoints)
  check(
    cps.some((c) => c.due != null),
    'the track carries the applicable deadline on its checkpoints — derived on read, never stored',
  )
  const owed = studentOwedToIb(cps)
  check(
    owed.every((c) => c.def.exportTarget != null && c.def.recordedBy === 'student'),
    'the warning counts only work the IB receives AND the student owes',
  )
  check(
    owed.every((c) => c.display !== 'done' && c.display !== 'future'),
    'nothing finished and nothing not-yet-open is ever in it',
  )
  check(
    warningLevel([]) === 'none',
    'a student who owes nothing gets no warning at all — the only way to clear it is to do the work',
  )
  const fakeLate = [{ def: bioFile, state: null, display: 'not_started' as const, due: { dueAt: '2020-01-01', isMajor: true, late: true, daysAway: -400 } }]
  check(warningLevel(fakeLate) === 'late', 'a passed date makes it loud; presence never changed, only weight')

  // --- predicted-grade columns read the real date ---
  const pgv = (await repo.pg.getView('dhahran', bioCourseId, 'c15'))!
  check(
    pgv.pointDue[1] === pgDate.dueAt,
    'a predicted-grade column shows the date the coordinator set, not prose about roughly when',
  )
  check(
    pgv.pointDue.length === pgv.points.length,
    'one date slot per reporting point, aligned — a column can be dateless without shifting the others',
  )

  // =====================================================================
  // 12. MOBILITY — IB-Mobility-and-Transfers.md
  // =====================================================================

  console.log('\n12a. joinedAt, and invariant #8 (never overdue before you arrived)')

  check(
    STUDENTS.every((s) => typeof s.joinedAt === 'string' && s.joinedAt.length === 10),
    'every student carries a join date — no student is undated',
  )
  const joiners = STUDENTS.filter((s) => s.joinedAt > cohortStart(s.cohortId))
  check(
    joiners.length === 1 && joiners[0].cohortId === 'c15',
    'exactly one fixture student joined after their cohort began — the rules are exercised, not just written',
  )
  const joiner = joiners[0]
  const mobSettled = STUDENTS.filter((s) => s !== joiner)
  check(
    mobSettled.every((s) => s.joinedAt === cohortStart(s.cohortId)),
    'everyone else is backfilled to the day their programme started — a true date, not a placeholder',
  )
  check(
    lateFrom(joiner) === addDays(joiner.joinedAt, JOIN_GRACE_DAYS),
    `the grace date is the join date plus ${JOIN_GRACE_DAYS} days`,
  )
  check(lateFrom({} as never) === null, 'no join date means no deferral — the rule fails open, not closed')

  const anyDef = REQUIREMENT_DEFS.find((d) => d.key.endsWith('.file'))!
  const mobPassed = [{
    id: 'dl_test', schoolId: 'dhahran', cohortId: anyDef.cohortId,
    requirementKey: stageOf(anyDef), courseId: null, dueAt: '2026-02-01',
    isMajor: true, decidedBy: 'test', setBy: 'test', setAt: '2025-09-01',
  }]
  const mobOpenCp = { def: anyDef, state: null, display: 'not_started' as const }
  const mobToday = '2026-08-19'

  const mobPlain = withDue(mobOpenCp, mobPassed, mobToday)
  check(mobPlain.due?.late === true, 'a student who was here all along is late for a date that has passed')

  const mobDeferred = withDue(mobOpenCp, mobPassed, mobToday, '2026-12-01')
  check(mobDeferred.due?.late === false, 'a student who arrives after the deadline is NOT late for it')
  check(mobDeferred.due?.deferredTo === '2026-12-01', 'and the record says why, rather than silently not flagging')
  check(
    mobDeferred.due?.dueAt === '2026-02-01' && mobDeferred.due?.daysAway === mobPlain.due?.daysAway,
    'the cohort date and the countdown are UNCHANGED — only the verdict moves, because the date is the record',
  )

  const mobExpired = withDue(mobOpenCp, mobPassed, mobToday, '2026-03-01')
  check(
    mobExpired.due?.late === true,
    'grace runs out: once the deferred date passes, a joiner is late like anyone else',
  )
  const doneCp2 = { def: anyDef, state: null, display: 'done' as const }
  const futureCp2 = { def: anyDef, state: null, display: 'future' as const }
  check(
    withDue(doneCp2, mobPassed, mobToday, '2026-01-01').due?.late === false &&
      withDue(futureCp2, mobPassed, mobToday, '2026-01-01').due?.late === false,
    'work that is in, and work that has not opened, are never late whatever the join date',
  )

  console.log('\n12b. Detached states — invariant #9 (an enrolment change never destroys a state)')

  const bioSection = SECTIONS.find((s) => s.courseId === 'bio_sl' && s.cohortId === 'c15')!
  const victim = ENROLLMENTS.find((e) => e.sectionId === bioSection.id)!.studentId
  const bioDefs = REQUIREMENT_DEFS.filter(
    (d) => d.cohortId === 'c15' && d.scope.kind === 'course' && d.scope.courseId === 'bio_sl',
  )
  const mobBeforeCount = REQUIREMENT_STATES.length
  const beforeVisible = bioDefs.filter((d) => stateOf(victim, d, REQUIREMENT_STATES) != null).length
  check(beforeVisible > 0, `the victim has ${beforeVisible} recorded Biology state(s) to lose`)

  const trackBefore = (await repo.getTrack('dhahran', victim))!

  await repo.setup.unenrolFromCourse('dhahran', 'c15', 'bio_sl', victim)

  check(
    REQUIREMENT_STATES.length === mobBeforeCount,
    'unenrolling DELETED NOTHING — the array is exactly as long as it was',
  )
  check(
    bioDefs.every((d) => stateOf(victim, d, REQUIREMENT_STATES) == null),
    'and yet stateOf returns none of them — filtered in one place, so board and track inherit it',
  )
  check(
    detachedStatesOf(victim, REQUIREMENT_STATES).length === beforeVisible,
    'the work is retrievable from the record history, which is the difference between an archive and a loss',
  )
  const trackAfter = (await repo.getTrack('dhahran', victim))!
  check(
    trackAfter.total < trackBefore.total,
    'the track drops the requirements they no longer owe rather than showing them as outstanding',
  )

  await repo.setup.enrolInCourse('dhahran', 'c15', 'bio_sl', victim)
  check(
    bioDefs.filter((d) => stateOf(victim, d, REQUIREMENT_STATES) != null).length === beforeVisible &&
      detachedStatesOf(victim, REQUIREMENT_STATES).length === 0,
    're-enrolling brings every one of them back — nobody uploads the same essay twice',
  )
  const trackRestored = (await repo.getTrack('dhahran', victim))!
  check(
    trackRestored.total === trackBefore.total && trackRestored.done === trackBefore.done,
    'and the track is byte-for-byte where it started',
  )

  // The §2.1 claim, asserted rather than believed.
  console.log('\n12c. A section move moves NOTHING (IB-Mobility-and-Transfers.md §2.1)')

  // `setup.addSection` REFUSES to mint a second group — one section per course
  // per cohort is enforced in the data layer, not just a fixture convention.
  // (That refusal is also what settles the EE-supervision modelling question:
  // a supervisor cannot be a section, because the product will not make one.)
  // So the second section is built directly, to assert the SPINE's claim rather
  // than the setup API's: a RequirementDef is scoped to a COURSE, so nothing
  // whatsoever hangs off which group a student sits in.
  check(
    (await repo.setup.addSection('dhahran', 'bio_sl', 'c15', 'B')) === bioSection.id,
    'the setup API refuses to create a second section — one per course per cohort, enforced',
  )
  SECTIONS.push({
    id: 'bio_sl_c15_b', schoolId: 'dhahran', courseId: 'bio_sl', cohortId: 'c15', label: 'B',
  })
  {
    const t0 = (await repo.getTrack('dhahran', victim))!
    await repo.setup.enrolStudent('dhahran', victim, 'bio_sl_c15_b')
    await repo.setup.unenrolStudent('dhahran', victim, bioSection.id)
    const t1 = (await repo.getTrack('dhahran', victim))!
    check(
      t1.total === t0.total && t1.done === t0.done &&
        detachedStatesOf(victim, REQUIREMENT_STATES).length === 0,
      'moving between two sections of the same course changes nothing at all — not one state detaches',
    )
    // ...and back, so the fixture is left exactly as it was found.
    await repo.setup.enrolStudent('dhahran', victim, bioSection.id)
    await repo.setup.unenrolStudent('dhahran', victim, 'bio_sl_c15_b')
    SECTIONS.splice(SECTIONS.findIndex((s) => s.id === 'bio_sl_c15_b'), 1)
    const t2 = (await repo.getTrack('dhahran', victim))!
    check(
      t2.total === t0.total && t2.done === t0.done &&
        detachedStatesOf(victim, REQUIREMENT_STATES).length === 0,
      'and moving back is equally free — the fixture is left as it was found',
    )
  }

  console.log('\n12d. EE supervision — invariant #12 (always a responsible adult)')

  const eeCoord = eeCoordinatorId('dhahran', MEMBERSHIPS)
  check(eeCoord != null, 'the school has an EE coordinator to fall back to')
  const techHolder = MEMBERSHIPS.find(
    (m) => m.schoolId === 'dhahran' && m.roles.includes('ee_coordinator') && m.presetKey === 'tech_admin',
  )
  check(
    techHolder != null && eeCoord !== techHolder.userId,
    'two people hold the role and the fallback is NOT tech support — the rule is deterministic, not array order',
  )

  const mobSupervision = await repo.ee.listSupervision('dhahran', 'c15')
  check(
    mobSupervision.length > 0 && mobSupervision.every((r) => r.supervisor != null),
    'every student in the graduating cohort resolves to somebody — there is no unassigned state',
  )
  const mobActing = mobSupervision.filter((r) => r.supervisor!.acting)
  check(
    mobActing.length === 4 && mobActing.every((r) => r.supervisor!.userId === eeCoord),
    'the four not yet allocated sit with the EE coordinator, flagged acting — correct, and never invisible',
  )
  const dp1 = await repo.ee.listSupervision('dhahran', 'c16')
  check(
    dp1.length > 0 && dp1.every((r) => r.supervisor!.acting),
    'a cohort two weeks in resolves entirely to the coordinator — which IS their allocation list',
  )
  check(
    attestationLabel(mobActing[0].supervisor!).includes('acting'),
    'an attestation signed while acting says so — a different claim from one signed by the real supervisor',
  )

  const mobTarget = mobSupervision.find((r) => !r.supervisor!.acting)!
  const rowsBefore = EE_SUPERVISION.length
  const previousId = mobTarget.supervisor!.userId
  await repo.ee.assignSupervisor('dhahran', 'c15', mobTarget.studentId, 'u_farouk', 'u_msmith')
  const mobNow = await repo.ee.getSupervisor('dhahran', mobTarget.studentId)
  check(mobNow?.userId === 'u_farouk' && mobNow?.acting === false, 'reassignment takes effect immediately')
  check(
    EE_SUPERVISION.length === rowsBefore + 1 &&
      EE_SUPERVISION.some((r) => r.studentId === mobTarget.studentId && r.supervisorId === previousId && r.endedAt != null),
    'and it ENDS the old row rather than editing it — the previous supervisor stays named on what they held',
  )
  // Put them back. Reassignment is append-only by design, so this leaves three
  // rows and the original supervisor live — which is the honest restore, and
  // §13f depends on it: it needs a teacher who genuinely supervises nobody.
  await repo.ee.assignSupervisor('dhahran', 'c15', mobTarget.studentId, previousId, 'u_msmith')
  check(
    (await repo.ee.getSupervisor('dhahran', mobTarget.studentId))?.userId === previousId,
    'and reassigning back restores them, leaving the trail rather than erasing it',
  )

  console.log('\n12e. The CAS window opens when the student did')

  const mobNormal = STUDENTS.find((s) => s.cohortId === 'c15' && s !== joiner)!
  const wNormal = casWindow(2027, mobNormal.joinedAt)
  check(
    wNormal.start === '2025-08-01' && wNormal.joinedLate === false,
    'a student who started with the cohort gets the full programme window, exactly as before',
  )
  const wJoiner = casWindow(2027, joiner.joinedAt)
  check(
    wJoiner.start === joiner.joinedAt && wJoiner.joinedLate === true,
    'a mid-programme joiner’s line begins the day she arrived, not five months of blank months earlier',
  )
  check(
    wJoiner.end === wNormal.end,
    'the end never moves — CAS is still due in the April of the exam year for everyone',
  )
  check(
    casWindow(2027).start === '2025-08-01',
    'and with no join date at all the window is unchanged — the argument is optional, nothing regressed',
  )

  // =====================================================================
  // 13. EXTENDED ESSAY — step 1, the gate (IB-EE-Build-Plan.md §8)
  // =====================================================================

  console.log('\n13a. The requirement set')

  const eeDefs15 = REQUIREMENT_DEFS.filter((d) => d.cohortId === 'c15' && d.lane === 'Extended Essay')
  check(eeDefs15.length === 10, `ten EE definitions per cohort (found ${eeDefs15.length})`)
  const eeKeys = new Set(eeDefs15.map((d) => d.key))
  check(
    ['ee.outline', 'ee.draft', 'ee.score'].every((k) => eeKeys.has(k)),
    'outline, draft and score exist as defs — they are tracked for every candidate against a date',
  )
  check(
    ['ee.outline', 'ee.draft'].every((k) => eeDefs15.find((d) => d.key === k)!.exportTarget == null),
    'and neither carries an exportTarget, because the IB never sees them — the two questions are separate',
  )
  const scoreDef = eeDefs15.find((d) => d.key === 'ee.score')!
  check(
    scoreDef.criteria?.length === 5 &&
      scoreDef.markMax === 30 &&
      scoreDef.criteria!.reduce((n, x) => n + x.max, 0) === 30,
    'ee.score is five criteria summing to 30 — the IA marks module scores EE, not a second engine',
  )
  check(
    scoreDef.criteria!.map((x) => x.max).join(',') === '6,6,6,8,4',
    'A6 · B6 · C6 · D8 · E4 — D is the highest weighted, as the 2027 guide has it',
  )

  console.log('\n13b. The rubric is a paraphrase, and says so')

  check(boundariesAreOfficial === false, 'grade boundaries are flagged as NOT official — the IB has not published any for 2027')
  check(BAND_PROVENANCE.length > 0 && /not the IB/i.test(BAND_PROVENANCE),
    'band wording carries its provenance in the DATA, so no screen can render a band without it')
  check(
    EE_CRITERIA.find((x) => x.key === 'E')!.bands.length === 3 &&
      EE_CRITERIA.find((x) => x.key === 'D')!.bands.length === 5,
    'the band ladder differs per criterion — E has three, D has five; a fixed four-row grid would invent one',
  )
  check(
    EE_CRITERIA.every((x) => x.bands[0].max === x.max && x.bands[x.bands.length - 1].min === 0),
    'every ladder runs from the criterion maximum down to zero, with no gap at either end',
  )
  check(
    indicativeGrade(30) === 'A' && indicativeGrade(0) === 'E' && indicativeGrade(13) === 'D',
    'the indicative boundaries cover the whole range',
  )

  console.log('\n13c. Registration — what ee.rq actually means')

  check(
    validateRegistration({ subjects: ['biology'], researchQuestion: 'q', title: 't' }).length === 0,
    'a single-subject registration with a question and a title is valid',
  )
  check(
    validateRegistration({ subjects: ['biology', 'psychology'], researchQuestion: 'q', title: 't' })
      .some((p) => p.field === 'framework'),
    'an interdisciplinary essay without one of the five frameworks is refused — an unregistered one is a registration error',
  )
  check(
    validateRegistration({ subjects: ['ess', 'psychology'], framework: 'movement and time', researchQuestion: 'q', title: 't' })
      .some((p) => p.field === 'subjects'),
    'ESS and Literature and Performance cannot be half of an interdisciplinary pair — they are already cross-disciplinary',
  )
  check(
    validateRegistration({ subjects: ['biology'], framework: 'movement and time', researchQuestion: 'q', title: 't' })
      .some((p) => p.field === 'framework'),
    'and a framework on a single-subject essay is refused too — the rule runs both ways',
  )
  // THE SUBJECT LIST IS THE IB'S, NOT THE SCHOOL'S — an essay can be registered
  // in a subject ISG does not timetable, which the first build got wrong.
  check(
    validateRegistration({ subjects: ['bio_hl'], researchQuestion: 'q', title: 't' })
      .some((p) => p.field === 'subjects'),
    'a school COURSE id is not a subject — registration is in a DP subject, and IBIS would refuse the other',
  )
  check(
    ['film', 'theatre', 'global_politics', 'psychology', 'physics'].every(isDpSubject),
    'Film, Theatre, Global politics, Psychology and Physics are all registrable, whether or not the school teaches them',
  )
  const taught = new Set(
    COURSES.filter((c) => c.type === 'subject')
      .map((c) => subjectForCourse(c.id))
      .filter((k): k is string => k != null),
  )
  const untaught = DP_SUBJECTS.filter((x) => !taught.has(x.key))
  check(
    untaught.length > 0 && untaught.some((x) => x.key === 'film'),
    `${untaught.length} DP subjects the school does not timetable are still registrable — Film among them, which is the point of separating the two lists`,
  )

  const rqDef15 = eeDefs15.find((d) => d.key === 'ee.rq')!
  const c15students = STUDENTS.filter((s) => s.cohortId === 'c15')
  check(
    c15students.every((s) => {
      const hasState = REQUIREMENT_STATES.some(
        (x) => x.studentId === s.userId && x.requirementDefId === rqDef15.id,
      )
      return hasState === registrationComplete(EE_REGISTRATIONS.find((r2) => r2.studentId === s.userId))
    }),
    'ee.rq is complete for exactly those students whose registration validates — the state and the record behind it cannot disagree',
  )
  check(
    EE_REGISTRATIONS.some((r2) => r2.subjects.length === 2 && r2.framework != null),
    'one interdisciplinary registration exists, so the two-subject pathway is exercised rather than merely permitted',
  )

  console.log('\n13d. The fabricated EE states are gone')

  const aheadKeys = ['ee.draft', 'ee.r2', 'ee.final', 'ee.viva', 'ee.rpf', 'ee.attest', 'ee.score']
  const aheadIds = new Set(eeDefs15.filter((d) => aheadKeys.includes(d.key)).map((d) => d.id))
  // TWO NAMED EARLY FINISHERS, and nobody else (22 Aug). The rule did not
  // loosen — "no state for work no screen can produce" still holds, and these
  // two ARE produced: filed, viva recorded, reflection in. Without them the EE
  // marking screen has nothing to mark and cannot be looked at at all.
  const earlyIds = new Set([EE_EARLY_FILED, EE_EARLY_NO_VIVA].filter(Boolean))
  check(
    REQUIREMENT_STATES.every(
      (s) => !aheadIds.has(s.requirementDefId) || earlyIds.has(s.studentId),
    ),
    'the only Class of 2027 states for work still ahead belong to the two named early finishers — nobody else has EE progress the product could not produce',
  )
  check(
    earlyIds.size === 2 &&
      [...earlyIds].every((id) =>
        EE_SUPERVISION.some((x) => x.studentId === id && x.supervisorId === 'u_farouk'),
      ),
    'and both are R. Farouk’s, because the screen they exist to make visible is the SUBJECT TEACHER’s',
  )
  check(
    [...earlyIds].every((id) =>
      registrationComplete(EE_REGISTRATIONS.find((r2) => r2.studentId === id)),
    ),
    'and both registered a subject — filing a finished essay for a subject nobody registered would be a different kind of lie',
  )
  const eeBoard15 = (await repo.export.getUploadBoard('dhahran', 'c15'))!
  check(
    eeBoard15.cohortJobs.find((j) => j.key === 'ee.essay')!.ready === 2 &&
      eeBoard15.cohortJobs.find((j) => j.key === 'ee.rpf')!.ready === 1,
    'the EE upload pack reads two essays and ONE reflection ready — the second finisher has had no viva, so their RPF cannot exist yet',
  )
  const eeBoard14 = (await repo.export.getUploadBoard('dhahran', 'c14'))!
  const essay14 = eeBoard14.cohortJobs.find((j) => j.key === 'ee.essay')!
  check(
    essay14.total > 0 && essay14.ready === essay14.total,
    'and a graduated cohort reads fully ready — the zero above is a fact about the calendar, not a broken pipeline',
  )

  console.log('\n13e. The board and track render EE with no edit to either')

  const eeTrackStudent = c15students.find((s) =>
    REQUIREMENT_STATES.some((x) => x.studentId === s.userId && x.requirementDefId === rqDef15.id),
  )!
  const eeTrack = (await repo.getTrack('dhahran', eeTrackStudent.userId))!
  const eeLane = eeTrack.lanes.find((l) => l.lane === 'Extended Essay')!
  check(eeLane.checkpoints.length === 10, 'the student track shows all ten EE checkpoints')
  check(
    eeLane.checkpoints.find((cp) => cp.def.key === 'ee.rq')!.display === 'done',
    'registration reads done on the track, from a state the registration produced',
  )
  check(
    eeLane.checkpoints.find((cp) => cp.def.key === 'ee.rpf')!.display === 'future',
    'and the RPF reads FUTURE, not overdue — opensAfter: ee.viva, and the viva has not happened',
  )
  const eeBoardView = (await repo.getBoard('dhahran', 'c15'))!
  check(
    eeBoardView.groups.some((g) => g.lane === 'Extended Essay') && eeBoardView.rows.length > 0,
    'the coordinator board carries an Extended Essay group built from the same states',
  )

  console.log('\n13f. Where EE appears — supervision is the third source of reach')

  const someSupervisor = (await repo.ee.listSupervision('dhahran', 'c15'))
    .map((r2) => r2.supervisor!)
    .find((sv) => !sv.acting)!
  const supSpaces = await repo.mySpaces('dhahran', someSupervisor.userId)
  check(
    supSpaces.some((g) => g.courses.some((x) => x.id === 'ee')),
    'a supervisor has an Extended Essay space',
  )
  // REACH IS PER COHORT, which is why these are asked per cohort. R. Farouk
  // supervises three c15 essays (since 22 Aug) and none in c16 — so the c16
  // answer is the one that moves, and his c15 space must not move with it.
  const nonSupervisor = 'u_farouk'
  const eeIn = (spaces2: Awaited<ReturnType<typeof repo.mySpaces>>, cohortId: string) =>
    spaces2.some((g) => g.cohort.id === cohortId && g.courses.some((x) => x.id === 'ee'))

  const beforeSpaces = await repo.mySpaces('dhahran', nonSupervisor)
  check(
    !eeIn(beforeSpaces, 'c16'),
    'a teacher who supervises nobody IN THAT YEAR GROUP has no EE space there — not an empty one, none',
  )
  check(
    eeIn(beforeSpaces, 'c15'),
    'and a subject teacher who supervises three essays in ANOTHER year group has one there — supervision is a relationship, not a capability',
  )
  const orphan = (await repo.ee.listSupervision('dhahran', 'c16'))[0]
  await repo.ee.assignSupervisor('dhahran', 'c16', orphan.studentId, nonSupervisor, 'u_msmith')
  const afterSpaces = await repo.mySpaces('dhahran', nonSupervisor)
  check(
    eeIn(afterSpaces, 'c16'),
    'give them one supervisee and the space appears — in that cohort, derived, nothing stored',
  )
  await repo.ee.assignSupervisor('dhahran', 'c16', orphan.studentId, 'u_adeyemi', 'u_msmith')
  const restoredSpaces = await repo.mySpaces('dhahran', nonSupervisor)
  check(
    !eeIn(restoredSpaces, 'c16') && eeIn(restoredSpaces, 'c15'),
    'reassign their last supervisee and it goes again — from that year group only, leaving the other alone',
  )

  console.log('\n13g. Reflection sessions, and the RPF gate')

  const sessionStudent = 'st01'
  const eeView0 = (await repo.ee.getStudentView('dhahran', sessionStudent))!
  check(
    eeView0.sessions.some((x) => x.stage === 'r1'),
    'session 1 is on the student view, derived from EE_SESSIONS rather than stored twice',
  )
  check(
    eeView0.sessions.every((x) => x.heldOn <= x.recordedAt),
    'heldOn and recordedAt are separate — a meeting typed up a week later still reads as held on the day',
  )
  check(
    eeView0.notes.some((n) => n.authorType === 'student') &&
      eeView0.notes.some((n) => n.authorType === 'staff'),
    'both sides can write about a session, and the supervisor sees both — the student\u2019s voice is on the record, dated',
  )
  check(eeView0.rpfOpen === false, 'the RPF is closed before the viva')

  const vivaDef = eeDefs15.find((d) => d.key === 'ee.viva')!
  const rpfDef = eeDefs15.find((d) => d.key === 'ee.rpf')!
  const track0 = (await repo.getTrack('dhahran', sessionStudent))!
  const lane0 = track0.lanes.find((l) => l.lane === 'Extended Essay')!
  check(
    lane0.checkpoints.find((cp) => cp.def.id === rpfDef.id)!.display === 'future',
    'and the track shows it locked, not overdue',
  )

  // The coordinator files a viva the supervisor held but never entered — the
  // route Michael asked for, taken WITHOUT an override of opensAfter.
  await repo.ee.recordSession(
    'dhahran', sessionStudent, 'viva', '2026-11-28', 'u_msmith', 'Michael Smith', true,
  )
  const eeView1 = (await repo.ee.getStudentView('dhahran', sessionStudent))!
  check(eeView1.rpfOpen === true, 'recording the viva opens the RPF — no override, no unlock token')
  const lane1 = (await repo.getTrack('dhahran', sessionStudent))!
    .lanes.find((l) => l.lane === 'Extended Essay')!
  check(
    lane1.checkpoints.find((cp) => cp.def.id === vivaDef.id)!.display === 'done' &&
      lane1.checkpoints.find((cp) => cp.def.id === rpfDef.id)!.display !== 'future',
    'the viva reads done on the track and the RPF is no longer locked — one derivation, both screens',
  )
  check(
    REQUIREMENT_STATES.every((x) => x.requirementDefId !== vivaDef.id),
    'and NOTHING was stored against ee.viva — it is derived from the session, per invariant #2',
  )
  check(
    eeView1.sessions.find((x) => x.stage === 'viva')?.onBehalf === true,
    'the record says a coordinator filed it, not the supervisor — a different fact, kept as one',
  )

  console.log('\n13h. No teacher for that subject — a warning, never a blocker')

  const filmView = (await repo.ee.getStudentView('dhahran', 'st07'))!
  check(
    filmView.registration?.subjects[0] === 'film',
    'a fixture candidate is registered in Film, which ISG does not teach — the path is walked, not merely written',
  )
  check(
    !filmView.supportedSubjects.includes('film') &&
      !filmView.supportedSubjects.includes('theatre') &&
      ['biology', 'maths_aa', 'psychology'].every((k) => filmView.supportedSubjects.includes(k)),
    'supported subjects are DERIVED from what the school runs — Biology, Maths and Psychology in; Film and Theatre out',
  )
  check(
    subjectWarnings(['film'], filmView.supportedSubjects).length === 1 &&
      subjectWarnings(['biology'], filmView.supportedSubjects).length === 0,
    'so Film warns and Biology does not',
  )
  check(
    validateRegistration(filmView.registration!).length === 0,
    'and the registration is VALID — a warning travels on a different channel from a problem',
  )

  // The load-bearing one: the save must go through.
  const saveFilm = await repo.ee.saveRegistration('dhahran', 'c15', 'st07', {
    subjects: ['theatre'], framework: null,
    researchQuestion: filmView.registration!.researchQuestion,
    title: filmView.registration!.title,
  })
  check(
    saveFilm.ok && saveFilm.problems.length === 0,
    'saving a subject nobody teaches SUCCEEDS — the school decides who supervises, not the form',
  )
  const roster13h = await repo.ee.getRoster('dhahran', 'c15', null)
  check(
    roster13h.find((r2) => r2.studentId === 'st07')?.unsupportedSubjects.includes('theatre') === true,
    'and it surfaces on the coordinator\u2019s roster, which is who Michael said would oversee it',
  )
  const flagged = roster13h.filter((r2) => r2.unsupportedSubjects.length > 0)
  check(
    flagged.length === 1,
    'exactly one candidate needs a supervisor found — the warning is specific, not a blanket',
  )
  // Put the fixture back.
  await repo.ee.saveRegistration('dhahran', 'c15', 'st07', {
    subjects: ['film'], framework: null,
    researchQuestion: filmView.registration!.researchQuestion,
    title: filmView.registration!.title,
  })

  console.log('\n13i. The finished PDF — the sequence, and the lock')

  const finalDef15 = eeDefs15.find((d) => d.key === 'ee.final')!
  check(
    finalDef15.order < vivaDef.order && vivaDef.order < rpfDef.order,
    'the essay comes before the viva, and the viva before the RPF — the order is in the defs',
  )
  check(
    vivaDef.opensAfter === 'ee.final' && rpfDef.opensAfter === 'ee.viva',
    'and it is ENFORCED by opensAfter, not left to everyone remembering it',
  )

  const pdfStudent = 'st02'
  const notFiled = (await repo.ee.getStudentView('dhahran', pdfStudent))!
  check(
    notFiled.final == null && notFiled.finalLocked === false,
    'a Class of 2027 candidate has not filed — their essay is due in November',
  )
  const laneA = (await repo.getTrack('dhahran', pdfStudent))!
    .lanes.find((l) => l.lane === 'Extended Essay')!
  check(
    laneA.checkpoints.find((cp) => cp.def.id === vivaDef.id)!.display === 'future',
    'so their viva reads LOCKED — a viva cannot precede the paper it is about',
  )

  const goodDecl = { anonymous: true, underLimit: true }
  check(
    preflightPasses(anonymityPreflight({
      personalCode: 'p117', identifiersState: 'confirmed',
      declaredWords: 3900, wordLimit: 4000, declarations: goodDecl,
    })),
    'the pre-flight passes on a confirmed code, a count under the limit and both ticks',
  )
  // ⚑ CORRECTED 21 Aug. This used to assert the opposite, and the opposite was
  // the defect: a student filing in November cannot have a code the IB issues
  // in January, and blocking them produced the January reopen-and-resubmit
  // exercise. The code is applied at EXPORT.
  check(
    preflightPasses(anonymityPreflight({
      personalCode: 'p117', identifiersState: 'unconfirmed',
      declaredWords: 3900, wordLimit: 4000, declarations: goodDecl,
    })),
    'an UNCONFIRMED code does NOT block filing — finishing it is the coordinator’s job, not a reason to stop a student',
  )
  check(
    preflightPasses(anonymityPreflight({
      personalCode: null, identifiersState: 'missing',
      declaredWords: 3900, wordLimit: 4000, declarations: goodDecl,
    })),
    'and NO code at all does not block either — in November nobody has one, which is exactly when the EE is due',
  )
  check(
    anonymityPreflight({
      personalCode: null, identifiersState: 'missing',
      declaredWords: 3900, wordLimit: 4000, declarations: goodDecl,
    }).find((c) => c.key === 'code')!.status === 'waiting',
    'it reports WAITING and says the code is added at export — informational, never a gate',
  )
  check(
    !preflightPasses(anonymityPreflight({
      personalCode: 'p117', identifiersState: 'confirmed',
      declaredWords: 3900, wordLimit: 4000, declarations: { anonymous: false, underLimit: true },
    })),
    'but the two declarations a student CAN verify on the day still block — their name, and the limit',
  )
  check(
    !preflightPasses(anonymityPreflight({
      personalCode: 'p117', identifiersState: 'confirmed',
      declaredWords: 4200, wordLimit: 4000, declarations: goodDecl,
    })),
    'and so does a declared count over the limit',
  )
  check(
    anonymityPreflight({
      personalCode: 'p117', identifiersState: 'confirmed',
      declaredWords: 3900, wordLimit: 4000, declarations: goodDecl,
    }).some((c) => c.status === 'waiting'),
    'the automatic name-and-school scan reports WAITING, and waiting never blocks — the student is not to blame for storage',
  )

  const eeRef1 = {
    id: 'sr_ee_1', name: 'Al-Rashid_EE.pdf', mime: 'application/pdf', bytes: 812_400,
    key: 'stub://ee/1', addedAt: '2026-08-22',
  }
  await repo.ee.submitFinal('dhahran', pdfStudent, 'Al-Rashid_EE.pdf', 3842, eeRef1)
  const filedNow = (await repo.ee.getStudentView('dhahran', pdfStudent))!
  check(
    filedNow.final?.ref?.key === 'stub://ee/1' && filedNow.final?.ref?.bytes === 812_400,
    'the StorageAdapter ref and the file size are recorded even while the bytes go nowhere — the record of the upload is real',
  )
  check(
    filedNow.final?.declaredWords === 3842 && filedNow.finalLocked === true,
    'FILING IS WHAT LOCKS IT — there is no separate lock button, because an editable paper is not a fixed artefact',
  )
  const laneB = (await repo.getTrack('dhahran', pdfStudent))!
    .lanes.find((l) => l.lane === 'Extended Essay')!
  check(
    laneB.checkpoints.find((cp) => cp.def.id === finalDef15.id)!.display === 'done' &&
      laneB.checkpoints.find((cp) => cp.def.id === vivaDef.id)!.display !== 'future',
    'and filing opens the viva — the supervisor can now hold it, with the paper in front of them',
  )

  await repo.ee.unlockFinal('dhahran', pdfStudent, 'u_msmith', 'Michael Smith', 'Wrong file uploaded.')
  const reopened = (await repo.ee.getStudentView('dhahran', pdfStudent))!
  check(
    reopened.finalLocked === false && reopened.final?.unlockReason === 'Wrong file uploaded.',
    'an items.unlock holder can reopen it, and the typed reason is kept on the record',
  )
  await repo.ee.submitFinal('dhahran', pdfStudent, 'Al-Rashid_EE_v2.pdf', 3844, {
    ...eeRef1, id: 'sr_ee_2', name: 'Al-Rashid_EE_v2.pdf', key: 'stub://ee/2', bytes: 815_000,
  })
  const refiled = (await repo.ee.getStudentView('dhahran', pdfStudent))!
  check(
    refiled.finalLocked === true && refiled.final?.unlockReason === 'Wrong file uploaded.',
    'refiling locks it again and does NOT erase the unlock — who reopened a finished paper is the question that gets asked later',
  )

  const filed14 = (await repo.ee.getStudentView('dhahran', STUDENTS.find((x) => x.cohortId === 'c14')!.userId))!
  check(
    filed14.final != null && filed14.finalLocked === true,
    'and the graduated cohort\u2019s essays are all filed and locked, which is why their pack reads ready',
  )

  console.log('\n13j. The staff view — the work, and allocation')

  const staffRows = await repo.ee.getRoster('dhahran', 'c15', null)
  const withLinks = staffRows.find((r2) => r2.links.length > 0)
  check(
    withLinks != null && withLinks.links.every((l) => /^https?:/.test(l.href)),
    'staff can open the students\u2019 process documents — the drawer shows work, not a summary of work',
  )
  const filedRow = staffRows.find((r2) => r2.final != null)
  check(
    filedRow != null && filedRow.finalLocked === true,
    'and the filed essay is on the row, showing as locked',
  )

  // BOTH COORDINATORS, ONE VIEW — the thing Michael expected to be settled.
  const asEe = await repo.ee.getRoster('dhahran', 'c15', null)
  check(
    asEe.length === STUDENTS.filter((x) => x.cohortId === 'c15').length,
    'an ee.manage holder sees the whole cohort — the EE coordinator and the IB coordinator hold the same capability, so they get the same list',
  )
  const oneSup = (await repo.ee.listSupervision('dhahran', 'c15'))
    .map((r2) => r2.supervisor!).find((sv) => !sv.acting)!
  const asSupervisor = await repo.ee.getRoster('dhahran', 'c15', oneSup.userId)
  check(
    asSupervisor.length > 0 && asSupervisor.length < asEe.length &&
      asSupervisor.every((r2) => r2.supervisor?.userId === oneSup.userId),
    'a supervisor sees their own supervisees and nobody else\u2019s — decided in the repository, not filtered in a component',
  )

  const assignable = await repo.ee.listAssignableStaff('dhahran', 'c15')
  check(
    assignable.length > 0 && assignable.every((p2) => !p2.userId.startsWith('st')),
    'the allocation list is staff only — no student can be given a supervisee',
  )
  check(
    assignable.some((p2) => p2.load > 0),
    'and it carries each person\u2019s current load, so the work can be spread rather than discovered in February',
  )
  const beforeLoad = assignable.find((p2) => p2.userId === 'u_adeyemi')!.load
  const unallocated = asEe.find((r2) => r2.supervisor?.acting)!
  await repo.ee.assignSupervisor('dhahran', 'c15', unallocated.studentId, 'u_adeyemi', 'u_msmith')
  const afterLoad = (await repo.ee.listAssignableStaff('dhahran', 'c15'))
    .find((p2) => p2.userId === 'u_adeyemi')!.load
  check(afterLoad === beforeLoad + 1, 'allocating moves the load count — it is derived, not typed in')

  console.log('\n13k. Marking — the per-criterion gate, and release')

  check(
    EE_CRITERIA.every((c) => c.bands.every((b) => b.summary.length > 0 && b.summary.length < 110)),
    'every band has a short summary as well as its full text — the rubric collapses before it expands',
  )

  const g0 = markingGates({ finalFiled: false, rpfIn: false })
  check(
    !criterionOpen('A', g0) && !criterionOpen('E', g0),
    'nothing is markable before the essay is filed',
  )
  const g1 = markingGates({ finalFiled: true, rpfIn: false })
  check(
    ['A', 'B', 'C', 'D'].every((k) => criterionOpen(k, g1)) && !criterionOpen('E', g1),
    'THE RULE: with the essay filed and no reflection yet, A–D are open and E is not — a supervisor marks four criteria before the viva and does not read the essay a third time',
  )
  const g2 = markingGates({ finalFiled: true, rpfIn: true })
  check(criterionOpen('E', g2), 'and E opens when the reflection arrives — it is marked from it')

  const partial = [6, 5, 5, 7, null]
  const ps = summariseScore(partial)
  check(
    ps.entered === 4 && ps.soFar === 23 && ps.total === null && ps.band === null,
    'a partial mark has NO total and NO band — a grade off four of five criteria would be a lie',
  )
  const full = summariseScore([6, 5, 5, 7, 3])
  check(full.total === 26 && full.band === 'A', 'a complete one totals 26, which is inside the indicative A band (24+)')
  check(
    summariseScore([5, 4, 4, 6, 2]).band === 'B' && summariseScore([1, 1, 1, 1, 1]).band === 'E',
    'and the ladder below lands where the boundaries say — 21 is a B, 5 is an E',
  )

  const noBlockers = releaseBlockers({
    marks: [6, 5, 5, 7, 3], attestedSessions: true, attestedAuthentic: true,
    comment: 'x'.repeat(60),
  })
  check(noBlockers.length === 0, 'five marks, both ticks and a written justification clear release')
  check(
    releaseBlockers({ marks: partial, attestedSessions: true, attestedAuthentic: true, comment: 'x'.repeat(60) })
      .some((b) => b.key === 'marks'),
    'an unmarked criterion blocks release',
  )
  check(
    releaseBlockers({ marks: [6, 5, 5, 7, 3], attestedSessions: false, attestedAuthentic: true, comment: 'x'.repeat(60) })
      .some((b) => b.key === 'sessions') &&
    releaseBlockers({ marks: [6, 5, 5, 7, 3], attestedSessions: true, attestedAuthentic: false, comment: 'x'.repeat(60) })
      .some((b) => b.key === 'authentic'),
    'and BOTH attestation ticks are required separately — someone covering for a colleague can sign one without the other',
  )
  check(
    releaseBlockers({ marks: [6, 5, 5, 7, 3], attestedSessions: true, attestedAuthentic: true, comment: 'ok' })
      .some((b) => b.key === 'comment'),
    'a two-word justification does not count as one',
  )

  check(
    countWords('It  changed   how I read.') === 5 &&
      countWords('The\u00a0“turning”\u00a0point was ‘clear’.') === 5,
    'the word counter survives pasted text — non-breaking spaces and smart quotes come with every Google Doc',
  )

  // --- the round trip, against real data ---
  const marker14 = STUDENTS.find((x) => x.cohortId === 'c14')!.userId
  const rows14 = await repo.ee.getRoster('dhahran', 'c14', null)
  const marked14 = rows14.find((r2) => r2.studentId === marker14)!
  check(
    marked14.rpf != null && marked14.rpf.words > 50,
    'a graduated candidate\u2019s reflection statement is on the supervisor\u2019s row, ready to mark Criterion E from',
  )
  check(
    marked14.scoring?.releasedAt != null && summariseScore(marked14.marks).complete,
    'and their score is complete and released',
  )
  const attestDef14 = REQUIREMENT_DEFS.find((d) => d.cohortId === 'c14' && d.key === 'ee.attest')
  check(
    attestDef14 != null &&
      REQUIREMENT_STATES.every((x) => x.requirementDefId !== attestDef14.id),
    'the attestation is DERIVED from the scoring record — nothing is stored against ee.attest',
  )
  const track14 = (await repo.getTrack('dhahran', marker14))!
  check(
    track14.lanes.find((l) => l.lane === 'Extended Essay')!
      .checkpoints.find((cp) => cp.def.key === 'ee.attest')!.display === 'done',
    'and it still reads done on the track, from the same derivation',
  )

  console.log('\n13l. Supervision hours — capped, and visible to payroll')

  check(
    hoursProblem(4.5) === null && hoursProblem(5) === null,
    'up to five hours is fine',
  )
  check(
    hoursProblem(6) != null && hoursProblem(-1) != null,
    'over five is refused, and so is negative — the school pays against this, so it is a cap not a nudge',
  )
  check(hoursProblem(null) === null, 'and not-yet-logged is not an error, it is just not logged')

  const hoursRows = await repo.ee.getRoster('dhahran', 'c14', null)
  const byPerson = supervisionHours(hoursRows)
  check(
    byPerson.length > 0 && byPerson.every((h) => h.students > 0),
    'hours group by supervisor, which is the shape payroll asks for',
  )
  check(
    byPerson.reduce((n, h) => n + h.students, 0) === hoursRows.length,
    'and every candidate is counted against exactly one supervisor — nobody falls between two',
  )
  const c15Hours = supervisionHours(await repo.ee.getRoster('dhahran', 'c15', null))
  check(
    c15Hours.reduce((n, h) => n + h.missing, 0) > 0,
    'a cohort mid-programme shows candidates NOT yet logged — a payroll run that treated those as zero would underpay somebody',
  )

  console.log('\n14. TOK — the last dice-rolled numbers are gone')

  const tokDefs15 = REQUIREMENT_DEFS.filter((d) => d.cohortId === 'c15' && d.lane === 'TOK')
  const tokAhead = new Set(
    tokDefs15.filter((d) => ['tok.exh', 'tok.exhmark', 'tok.ppf2', 'tok.ppf3', 'tok.ppfsign',
      'tok.essay', 'tok.essaymark']
      .includes(d.key)).map((d) => d.id),
  )
  // THREE NAMED EARLY FILERS, and only the exhibition (22 Aug). The rule did
  // not loosen: the essay is due 5 March and NOTHING is seeded for it, for
  // anybody — six months out there is no honest way to have one filed.
  check(
    REQUIREMENT_STATES.every(
      (x) => !tokAhead.has(x.requirementDefId) || TOK_EARLY_EXH.includes(x.studentId),
    ),
    'the only Class of 2027 states for TOK work ahead belong to the three named early exhibition filers',
  )
  const essayAhead = new Set(
    tokDefs15.filter((d) => ['tok.essay', 'tok.essaymark'].includes(d.key)).map((d) => d.id),
  )
  check(
    REQUIREMENT_STATES.every((x) => !essayAhead.has(x.requirementDefId)),
    'and NOT ONE essay is seeded for them — it is due 5 March, so a filed one would be a fixture lying about the calendar',
  )
  const tokBoard = (await repo.export.getUploadBoard('dhahran', 'c15'))!
  check(
    tokBoard.cohortJobs.find((j) => j.key === 'tok.essay')!.ready === 0 &&
      tokBoard.cohortJobs.find((j) => j.key === 'tok.tkppf')!.ready === 0,
    'so the TOK packs read zero ready, like the EE ones',
  )
  const tokBoard14 = (await repo.export.getUploadBoard('dhahran', 'c14'))!
  const tokEssay14 = tokBoard14.cohortJobs.find((j) => j.key === 'tok.essay')!
  check(
    tokEssay14.total > 0 && tokEssay14.ready === tokEssay14.total,
    'and a graduated cohort still reads fully ready — again a fact about the calendar, not a broken pipeline',
  )

  // THE WHOLE POINT, stated once: every lane the board shows is now either
  // produced by a built module or genuinely empty.
  const boardNow = await repo.getBoard('dhahran', 'c15')
  const producible = new Set(['CAS', 'Extended Essay', 'TOK', 'Internal assessment', 'Predicted grades', 'IB admin'])
  check(
    boardNow.groups.every((g) => producible.has(g.lane)),
    'every lane on the coordinator board is now backed by a module that can write it, or is honestly empty',
  )

  console.log('\n15. CAS on a phone — a spoken reflection IS a reflection')

  const voiceStudent = 'st01'
  const voiceExp = (await repo.cas.getStudentView('dhahran', voiceStudent))!
    .experiences.find((x) => x.experience.status !== 'complete')!.experience.id
  const before15 = (await repo.cas.getStudentView('dhahran', voiceStudent))!.summary
  const beforeRefl = before15.posts.filter((p2) => p2.kind === 'reflection').length
  const beforeEvid = before15.posts.filter((p2) => p2.kind === 'evidence').length

  await repo.cas.addReflection(
    'dhahran', voiceExp, '', 'Layla Ahmed',
    {
      audio: {
        id: 'ref_v1', name: 'reflection.m4a', mime: 'audio/mp4', bytes: 402_113,
        key: 'stub://voice/1', addedAt: '2026-08-20', title: 'After the last match',
      },
      transcript: 'Realised I had been organising rather than coaching.',
    },
  )
  const after15 = (await repo.cas.getStudentView('dhahran', voiceStudent))!.summary
  check(
    after15.posts.filter((p2) => p2.kind === 'reflection').length === beforeRefl + 1,
    'THE ONE THAT MATTERS: an audio-only reflection counts as a REFLECTION on the timeline — a filled dot, not a ring',
  )
  check(
    after15.posts.filter((p2) => p2.kind === 'evidence').length === beforeEvid,
    'and it adds NOTHING to the evidence count — a student who speaks must not read as one who only uploaded files',
  )

  const voiceEntry = (await repo.cas.getStudentView('dhahran', voiceStudent))!
    .experiences.find((x) => x.experience.id === voiceExp)!
    .entries.find((x) => x.media?.some((m) => m.mime === 'audio/mp4'))!
  check(
    voiceEntry.kind === 'reflection' && !voiceEntry.body,
    'the entry is kind:reflection with no typed body — the recording is the substance',
  )
  check(
    voiceEntry.transcript === 'Realised I had been organising rather than coaching.',
    'the required one-liner is on the entry, which is what keeps the portfolio readable',
  )
  check(
    voiceEntry.media?.[0].title === 'After the last match',
    'and the recording carries the title the student gave it, not `reflection.m4a`',
  )

  // The reply, and the reason it is not an edit.
  await repo.cas.addReflection(
    'dhahran', voiceExp, 'Watching it back, the substitutions were the giveaway.', 'Layla Ahmed',
    { inReplyTo: voiceEntry.id },
  )
  const replied = (await repo.cas.getStudentView('dhahran', voiceStudent))!
  const reply = replied.experiences.find((x) => x.experience.id === voiceExp)!
    .entries.find((x) => x.inReplyTo === voiceEntry.id)!
  check(
    reply.kind === 'reflection' && reply.inReplyTo === voiceEntry.id,
    'reflecting later on an earlier upload is a REPLY, attached to what it answers',
  )
  check(
    replied.summary.posts.filter((p2) => p2.kind === 'reflection').length === beforeRefl + 2,
    'and it is its OWN dated post — an edit would have collapsed two acts of engagement into one, which is exactly what the consistency strip exists to count',
  )

  check(
    MAX_RECORDING_SECONDS === 180,
    'the recording cap is three minutes, and the recorder keeps what it has rather than discarding it',
  )
  check(
    extensionFor('audio/mp4') === 'm4a' && extensionFor('audio/webm;codecs=opus') === 'webm',
    'the file extension matches what the browser actually recorded — Safari and Chrome do not agree, and IB-Media-and-Uploads.md §3 is why that matters',
  )

  console.log('\n16. The demo students — both ends of the cohort')

  const demoIds = DEV_USERS.filter((u) => u.id.startsWith('st')).map((u) => u.id)
  check(
    ['st01', 'st24', 'st11'].every((id) => demoIds.includes(id)),
    'the switcher offers three states, not one — a screen only ever demoed against a finished portfolio hides every empty state it has',
  )

  const done = (await repo.cas.getStudentView('dhahran', 'st01'))!
  const midway = (await repo.cas.getStudentView('dhahran', 'st24'))!
  const empty = (await repo.cas.getStudentView('dhahran', 'st11'))!

  check(done.summary.outcomes.length === 7, 'Layla: all seven outcomes — the finished end')

  // THE MOST USEFUL DEMO OF THE THREE. Four experiences and nothing confirmed
  // is what most of a cohort looks like in September, and it is the only one
  // that shows the claimed-vs-confirmed distinction the whole roster turns on
  // (IB-CAS-Build-Plan.md §10.4).
  check(
    midway.experiences.length >= 3 && midway.summary.outcomes.length === 0,
    `Deniz: ${midway.experiences.length} experiences and ${midway.summary.outcomes.length} outcomes confirmed — busy, nothing signed off`,
  )
  check(
    midway.summary.tallies.some((t) => t.open > 0),
    'so her strip shows amber CLAIMED outcomes against no green confirmed ones — the gap that is the whole point of counting confirmations',
  )
  check(
    midway.joinedAt > '2025-08-01',
    'and she is the transfer student, so her CAS window opens when she arrived rather than a year before it',
  )

  check(
    empty.experiences.length === 0 && !empty.summary.complete,
    'Pieter: nothing at all — the true empty state, which no other student in the fixture shows',
  )

  console.log('\n15a. TOK — the requirement set')

  const tokTenDefs = REQUIREMENT_DEFS.filter((d) => d.cohortId === 'c15' && d.lane === 'TOK')
  check(tokTenDefs.length === 10, `ten TOK definitions per cohort (found ${tokTenDefs.length})`)
  const tokKeys = new Set(tokTenDefs.map((d) => d.key))
  check(
    ['tok.prompt', 'tok.ppfsign', 'tok.essaymark'].every((k) => tokKeys.has(k)),
    'prompt, sign-off and predicted essay mark exist as defs — each is chased for every candidate',
  )
  check(
    !tokKeys.has('tok.draft'),
    'and the essay draft is NOT a def — only the TOK teacher needs it, so it is a field, not a board column',
  )
  const essayMarkDef = tokTenDefs.find((d) => d.key === 'tok.essaymark')!
  check(
    essayMarkDef.markMax === TOK_MARK_MAX && essayMarkDef.exportTarget == null,
    'tok.essaymark is a mark out of 10 with NO exportTarget — the IB marks the real essay; this is the school reading it',
  )
  check(
    [essayMarkDef, tokTenDefs.find((d) => d.key === 'tok.exhmark')!]
      .every((d) => d.criteria == null),
    'and neither TOK mark carries criteria, because neither instrument has any — no invented criterion split',
  )
  check(
    tokTenDefs.find((d) => d.key === 'tok.ppfsign')!.opensAfter === 'tok.ppf3',
    'the sign-off opens only after the third interaction — a teacher cannot sign a form the student has not finished',
  )
  check(
    tokTenDefs.filter((d) => d.exportTarget != null).map((d) => d.key).sort().join(',') === 'tok.essay,tok.exh',
    'exactly two TOK defs are sent to the IB as files: the exhibition and the essay',
  )

  check(
    (LANE_SUMMARY.TOK.find((c) => c.kind === 'fraction') as { keys: string[] }).keys.length === 4,
    'and the TK/PPF column counts FOUR parts, not three — the form is one document and is not finished until the teacher has signed it',
  )

  console.log('\n15b. The 35 IA prompts — fixed, and chosen rather than typed')

  check(PROMPT_COUNT === 35 && IA_PROMPTS.length === 35, `all 35 IA prompts are present (found ${PROMPT_COUNT})`)
  check(
    IA_PROMPTS.every((t) => t.trim() === t && t.endsWith('?')),
    'every prompt is a question with no stray whitespace — they are rendered verbatim, so they are stored verbatim',
  )
  check(
    new Set(IA_PROMPTS).size === 35,
    'and no two are identical',
  )
  check(
    promptText(34) === 'In what ways do our values affect our acquisition of knowledge?' &&
      promptText(35) === 'In what ways do values affect the production of knowledge?',
    '34 and 35 are distinct — they differ by two words and are the pair a copy-paste corrupts',
  )
  check(
    promptText(6)!.includes('organize'),
    'prompt 6 keeps the IB’s -ize spelling',
  )
  check(promptLabel(3)!.startsWith('3. '), 'prompts label 1-based, as every IB document numbers them')
  check(promptText(0) === null && promptText(36) === null, 'and asking for one that does not exist returns nothing rather than guessing')
  check(/MyIB/.test(PROMPT_PROVENANCE), 'the prompt list carries its provenance in the DATA, like every other reproduction')

  console.log('\n15c. The two instruments — one holistic judgement each')

  for (const inst of INSTRUMENTS) {
    check(inst.max === TOK_MARK_MAX && inst.bands.length === 6, `${inst.key}: marked out of 10 across six bands`)
    check(
      inst.bands[0].to === inst.max && inst.bands[inst.bands.length - 1].to === 0,
      `${inst.key}: the ladder runs from the maximum down to zero`,
    )
    // No gaps and no overlaps: every mark 0..10 lands in exactly one band.
    const hits = Array.from({ length: inst.max + 1 }, (_, m) => inst.bands.filter((b) => m >= b.from && m <= b.to).length)
    check(hits.every((n) => n === 1), `${inst.key}: every mark from 0 to 10 falls in exactly one band`)
    check(inst.question.endsWith('?'), `${inst.key}: the marker answers ONE question, and it is stored as one`)
  }
  check(
    bandFor(EXHIBITION_INSTRUMENT, 8)!.level === 'Good' && bandFor(ESSAY_INSTRUMENT, 3)!.level === 'Basic',
    'a mark resolves to its band',
  )
  check(
    bandFor(ESSAY_INSTRUMENT, 11) === null && bandFor(ESSAY_INSTRUMENT, null) === null,
    'and a mark outside the scale resolves to nothing rather than to the nearest band',
  )
  check(
    /MyIB/.test(TOK_BAND_PROVENANCE),
    'band wording carries its provenance, so no screen can render a band without saying where it came from',
  )
  check(
    !INSTRUMENTS.some((i) => i.bands.some((b) => /ways of knowing|counterclaim/i.test(b.descriptor))),
    'and neither instrument mentions "ways of knowing" or "counterclaims" — the tell that the pre-2022 rubric has been pasted in',
  )

  console.log('\n15d. The /30, and the letter it never sets')

  check(
    ESSAY_WEIGHT === 2 && EXHIBITION_WEIGHT === 1 && TOK_TOTAL_MAX === 30,
    'the essay counts twice and the exhibition once — the IB’s published 2/3 and 1/3, as arithmetic',
  )
  check(tokTotal(7, 7) === 21 && tokTotal(10, 10) === 30, 'the total is exhibition + 2 x essay')
  check(
    tokTotal(7, null) === null && tokTotal(null, 7) === null,
    'and a half-built total is NOTHING rather than a number — one mark in is not two thirds of an answer',
  )
  const table15 = TOK_BOUNDARIES.find((b) => b.cohortId === 'c15')!
  check(
    letterFor(21, table15) === 'B' && letterFor(24, table15) === 'A' && letterFor(0, table15) === 'E',
    'the total maps to a letter through the table',
  )
  check(
    letterFor(null, table15) === null && letterFor(21, null) === null,
    'no total and no table both produce no letter — never a default grade',
  )
  check(
    Array.from({ length: 31 }, (_, n) => letterFor(n, table15)).every((l) => l != null),
    'and every total from 0 to 30 lands somewhere — the table cannot leave a candidate ungraded',
  )
  check(boundaryProblems(SEED_BOUNDARIES).length === 0, 'the seed table is sound')
  check(
    boundaryProblems({ A: 16, B: 22, C: 10, D: 4 }).length > 0 &&
      boundaryProblems({ A: 22, B: 16, C: 10, D: 0 }).length > 0 &&
      boundaryProblems({ A: 40, B: 16, C: 10, D: 4 }).length > 0,
    'and an out-of-order, zero-floored or off-scale table is refused rather than silently applied',
  )

  console.log('\n15e. Titles never carry over. Boundaries do, unconfirmed.')

  check(
    TOK_TITLE_SETS.find((t) => t.cohortId === 'c16') == null,
    'THE NEW COHORT HAS NO TITLE SET AT ALL — the six change every session, and an essay on last May’s title scores zero',
  )
  check(
    titlesArePosted(TOK_TITLE_SETS.find((t) => t.cohortId === 'c16')) === false &&
      titlesArePosted(TOK_TITLE_SETS.find((t) => t.cohortId === 'c15')) === true,
    'so c16 reads "not posted" and c15 reads "posted" — the empty state is a fact, not a gap',
  )
  check(
    TOK_TITLE_SETS.every((t) => t.titles.length === PRESCRIBED_TITLE_COUNT &&
      t.titles.map((x) => x.number).join(',') === '1,2,3,4,5,6'),
    'a posted set is exactly six, numbered 1-6 as the IB numbers them and the school’s filenames use',
  )
  check(
    TOK_BOUNDARIES.find((b) => b.cohortId === 'c15')!.carriedFrom === 'c14' &&
      TOK_BOUNDARIES.find((b) => b.cohortId === 'c15')!.confirmed === false,
    'the boundary table DOES carry forward — and arrives unconfirmed, so nothing computed from it looks settled',
  )
  check(
    TOK_BOUNDARIES.find((b) => b.cohortId === 'c14')!.confirmed === true,
    'while the finished year’s table is confirmed, because somebody confirmed it',
  )

  console.log('\n15f. TK/PPF — the lines, and the honest negatives')

  for (const n of [1, 2, 3] as const) {
    const lines = INTERACTION_LINES[n]
    check(lines.length >= 4, `interaction ${n}: ${lines.length} lines to choose from`)
    check(
      lines.some((l) => !l.held) && lines[lines.length - 1].key === 'not_held',
      `interaction ${n}: carries a not-held line, last — the IB gives no guidance on a missed interaction, so we record one honestly`,
    )
    check(new Set(lines.map((l) => l.key)).size === lines.length, `interaction ${n}: no duplicate keys`)
  }
  check(
    interactionLine(3, 'no_draft')!.held === true,
    '"student had no draft — no feedback was given" counts as HELD: the meeting happened, the work did not',
  )
  check(
    interactionLine(3, 'not_held')!.held === false,
    'and only a meeting that did not happen reads as not held — which is a school compliance flag, never a mark against the student',
  )
  check(
    interactionLine(1, 'full_draft') === null,
    'the lines are scoped per interaction — a draft cannot be read at the title-choosing meeting',
  )
  check(
    AUTHORSHIP_ORDER[0] === 'none' && AUTHORSHIP_ORDER.length === 4,
    'authorship is a FIELD with a default of no concern — five of last year’s 34 comments buried one in prose, where April could not find it',
  )

  console.log('\n15g. The TOK fixtures are still honest')

  const tokStates15 = REQUIREMENT_STATES.filter((st) => {
    const d = REQUIREMENT_DEFS.find((x) => x.id === st.requirementDefId)
    return d?.cohortId === 'c15' && d.lane === 'TOK'
  })
  const seededKeys = new Set(
    tokStates15.map((st) => REQUIREMENT_DEFS.find((x) => x.id === st.requirementDefId)!.key),
  )
  const notEarly = new Set(
    tokStates15
      .filter((st) => !TOK_EARLY_EXH.includes(st.studentId))
      .map((st) => REQUIREMENT_DEFS.find((x) => x.id === st.requirementDefId)!.key),
  )
  check(
    ['tok.exh', 'tok.exhmark', 'tok.ppf2', 'tok.ppf3', 'tok.ppfsign', 'tok.essay', 'tok.essaymark']
      .every((k) => !notEarly.has(k)),
    'for everyone but the three early filers, NOT ONE state exists for TOK work still ahead — no exhibition, no marks, no sign-off, no essay',
  )
  check(
    !seededKeys.has('tok.exhmark'),
    'and not one of the three has been MARKED — they filed this week, which is the state a TOK teacher actually opens the screen in',
  )
  check(
    seededKeys.has('tok.title') && seededKeys.has('tok.prompt') && seededKeys.has('tok.ppf1'),
    'while the work they HAVE done — titles, some prompts, a first interaction — is all there',
  )
  const c14Signed = REQUIREMENT_STATES.filter((st) => {
    const d = REQUIREMENT_DEFS.find((x) => x.id === st.requirementDefId)
    return d?.cohortId === 'c14' && d.key === 'tok.ppfsign'
  })
  check(
    c14Signed.length > 0 && c14Signed.every((st) => st.recordedBy === 'H. Adeyemi'),
    'and the graduated cohort HAS its sign-offs, recorded by staff — an unsigned finished year would be a lie in the other direction',
  )

  console.log('\n15h. The student cannot write up a meeting that never happened')

  // THE INVARIANT THIS TABLE EXISTS FOR. The teacher's log is what opens the
  // student's box, so a TK/PPF entry with no held log behind it would mean a
  // student wrote up a meeting nobody recorded. Derived rather than rolled,
  // precisely so two dice can never disagree.
  const ppfStates = REQUIREMENT_STATES.filter((st) => {
    const d = REQUIREMENT_DEFS.find((x) => x.id === st.requirementDefId)
    return d != null && /^tok\.ppf[123]$/.test(d.key)
  })
  check(ppfStates.length > 0, `${ppfStates.length} TK/PPF entries exist to check`)
  check(
    ppfStates.every((st) => {
      const d = REQUIREMENT_DEFS.find((x) => x.id === st.requirementDefId)!
      const n = Number(d.key.slice(-1))
      const log = TOK_INTERACTION_LOGS.find((l) => l.studentId === st.studentId && l.n === n)
      return log != null && (interactionLine(n as 1 | 2 | 3, log.lineKey)?.held ?? false)
    }),
    'EVERY written-up interaction has a held teacher log behind it — nobody wrote up a meeting the teacher never recorded',
  )
  check(
    TOK_INTERACTION_LOGS.some((l) => l.lineKey === 'no_draft'),
    'and the honest negative is exercised, not merely permitted — one candidate turned up to the third meeting without a draft',
  )

  check(interactionOpen(1, null, true).open === false, 'no log at all: the box is shut')
  check(
    /tell your TOK teacher or IB coordinator/.test(interactionOpen(1, null, true).closedReason ?? ''),
    'and it says who can fix it — the way through is to RECORD THE MEETING, never to override the gate',
  )
  check(
    interactionOpen(2, { held: true }, false).open === false &&
      interactionOpen(2, { held: true }, true).open === true,
    'the chain holds too: interaction 2 waits for 1 to be written up',
  )
  check(
    interactionOpen(3, { held: false }, true).open === false,
    'and a meeting recorded as NOT held opens nothing — there is nothing to write up',
  )

  console.log('\n15i. The student screens — files, locks and the code that is not their job')

  const tokC15 = STUDENTS.find(
    (x) => x.cohortId === 'c15' && x.schoolId === 'dhahran' && !TOK_EARLY_EXH.includes(x.userId),
  )!
  const tokBefore = (await repo.tok.getStudentView('dhahran', tokC15.userId))!
  check(
    tokBefore.exhibition == null && tokBefore.essay == null && tokBefore.exhibitionMark == null,
    'a Class of 2027 candidate has filed nothing and been marked on nothing — the exhibition is due in November',
  )
  check(
    tokBefore.titlesPosted.length === 6,
    'their six titles ARE posted, so the title panel offers a list rather than a text box',
  )

  const badPrompt = await repo.tok.setPrompt('dhahran', tokC15.userId, 36)
  check(!badPrompt.ok, 'a prompt outside the fixed 35 is refused rather than stored')
  await repo.tok.setPrompt('dhahran', tokC15.userId, 13)
  check(
    (await repo.tok.getStudentView('dhahran', tokC15.userId))!.promptNumber === 13,
    'and a real one is stored as a NUMBER, so the wording always renders from the fixed list',
  )

  await repo.tok.submitFile('dhahran', tokC15.userId, 'exh', {
    fileName: 'Ahmed_TOK Exhibition_May 27.pdf',
    declaredWords: 934,
    ref: {
      id: 'sr_tok_1', name: 'Ahmed_TOK Exhibition_May 27.pdf', mime: 'application/pdf',
      bytes: 402_100, key: 'stub://tok/1', addedAt: '2026-08-22',
    },
  })
  const tokAfter = (await repo.tok.getStudentView('dhahran', tokC15.userId))!
  check(
    tokAfter.exhibition?.locked === true && tokAfter.exhibition?.declaredWords === 934,
    'FILING IS WHAT LOCKS IT — there is no separate lock button, here or in EE',
  )
  check(
    TOK_FILES.some((f) => f.studentId === tokC15.userId && f.ref?.key === 'stub://tok/1' && f.ref?.bytes === 402_100),
    'and the storage ref and size are recorded even while the bytes go nowhere — the record of the upload is real',
  )
  const tokLane = (await repo.getTrack('dhahran', tokC15.userId))!.lanes.find((l) => l.lane === 'TOK')!
  check(
    tokLane.checkpoints.find((cp) => cp.def.key === 'tok.exh')!.display === 'done',
    'the track picks it up with no edit to Track.tsx — the module wrote a state, and the spine did the rest',
  )
  check(
    tokAfter.exhibitionMark == null,
    'and the mark is still absent, because filing is not marking',
  )

  // The gate is re-checked on the server. A screen that hides a button is
  // courtesy; this is where the promise is kept.
  const shut = await repo.tok.submitInteraction('dhahran', tokC15.userId, 3, 'trying it on')
  check(!shut.ok, 'a student cannot submit an interaction the teacher has not recorded, even by calling the write directly')

  const tokC14 = STUDENTS.find((x) => x.cohortId === 'c14' && x.schoolId === 'dhahran')!
  const graduated = (await repo.tok.getStudentView('dhahran', tokC14.userId))!
  check(
    graduated.exhibitionMark != null && graduated.exhibitionMark!.comment != null,
    'a graduated candidate sees their released mark AND the comment that came with it',
  )
  check(
    graduated.exhibitionMark!.level.length > 0,
    'with the band named — "Good" carries more than 8/10 does, which is how the marker wrote it',
  )
  check(
    graduated.interactions.every((i) => i.entry != null),
    'and all three interactions written up, because that year actually finished',
  )

  console.log('\n15j. Exhibition marking — the gate, the trail and the two texts')

  const markRows = await repo.tok.getMarkingRoster('dhahran', 'c15', 'exh')
  check(markRows.length === 24, `one row per candidate (${markRows.length})`)
  check(
    markRows.every((r) => r.mark == null && r.releasedAt == null),
    'nothing in the Class of 2027 is marked yet — the exhibition was only just filed',
  )

  // AUTHORIZATION IS THE IA RULE, unchanged. The harness calls the same
  // marksWriteGrant the server action calls, so the two cannot drift.
  const tokMarker = 'u_adeyemi'
  const tokNotMarker = 'u_msmith'
  const markStudent = markRows.find((r) => r.file != null)!.studentId
  check(
    (await marksWriteGrant(repo.ia, () => false, 'dhahran', 'tok', 'c15', markStudent, tokMarker)).allowed,
    'the designated TOK marker may write',
  )
  check(
    !(await marksWriteGrant(repo.ia, () => false, 'dhahran', 'tok', 'c15', markStudent, tokNotMarker)).allowed,
    'a co-teacher on the same section may NOT — the IB holds one person responsible for the marks',
  )
  check(
    (await marksWriteGrant(repo.ia, (c) => c === 'marks.override', 'dhahran', 'tok', 'c15', markStudent, tokNotMarker)).allowed === false,
    'and marks.override alone is not enough — it buys an unlock, not a write',
  )

  const eventsBefore = MARK_EVENTS.length
  await repo.tok.saveMark('dhahran', markStudent, 'exh', 8, { id: tokMarker, name: 'H. Adeyemi', overrideReason: null })
  const afterMark = (await repo.tok.getMarkingRoster('dhahran', 'c15', 'exh')).find((r) => r.studentId === markStudent)!
  check(afterMark.mark === 8, 'a mark saves onto the RequirementState like every other mark')
  check(
    MARK_EVENTS.length === eventsBefore + 1 &&
      MARK_EVENTS[MARK_EVENTS.length - 1].courseId === 'tok' &&
      MARK_EVENTS[MARK_EVENTS.length - 1].criterion === 'exhibition',
    'and appends to the SAME MarkEvent trail as the course’s other marks — one history per course, not one per kind',
  )
  await repo.tok.saveMark('dhahran', markStudent, 'exh', 99, { id: tokMarker, name: 'H. Adeyemi', overrideReason: null })
  check(
    (await repo.tok.getMarkingRoster('dhahran', 'c15', 'exh')).find((r) => r.studentId === markStudent)!.mark === 10,
    'a mark above the maximum is clamped rather than stored — the instrument is out of 10',
  )
  await repo.tok.saveMark('dhahran', markStudent, 'exh', 8, { id: tokMarker, name: 'H. Adeyemi', overrideReason: null })

  // RELEASE IS GATED ON THE JUSTIFICATION. The exhibition mark is the one the
  // school sends for moderation; an unjustified mark is a number, not a
  // judgement — and it is also what the student reads.
  const noComment = await repo.tok.releaseMark('dhahran', markStudent, 'exh', { id: tokMarker, name: 'H. Adeyemi' })
  check(!noComment.ok, 'a mark with no comment CANNOT be released — an unjustified mark is a number rather than a judgement')
  check(
    tokReleaseBlockers({ mark: 8, comment: '   ', filed: true }).length === 1,
    'and whitespace is not a comment',
  )
  check(
    tokReleaseBlockers({ mark: null, comment: 'good', filed: false }).length === 2,
    'nothing filed and nothing marked are two separate reasons, both stated',
  )
  check(canRelease({ mark: 8, comment: 'Justified against the instrument.', filed: true }),
    'and a filed, marked, justified exhibition releases')

  await repo.tok.saveProse('dhahran', markStudent, 'exh', {
    note: 'Third object repeats the first. Contexts specific.',
    comment: 'All three objects sit in specific contexts. The third repeats the first object’s argument, which keeps this in the Good band.',
    authorship: 'none',
  }, { id: tokMarker, name: 'H. Adeyemi' })
  const released = await repo.tok.releaseMark('dhahran', markStudent, 'exh', { id: tokMarker, name: 'H. Adeyemi' })
  check(released.ok, 'with a comment it releases')

  const studentSees = (await repo.tok.getStudentView('dhahran', markStudent))!
  check(
    studentSees.exhibitionMark?.mark === 8 && studentSees.exhibitionMark?.level === 'Good',
    'and the STUDENT now sees the mark and its band — the same number, from the same state, not a copy',
  )
  check(
    (studentSees.exhibitionMark?.comment ?? '').includes('Good band'),
    'with the released comment, and not the private note',
  )
  const prose = TOK_MARKS.find((m) => m.studentId === markStudent && m.kind === 'exh')!
  check(
    prose.note !== prose.comment && !studentSees.exhibitionMark!.comment!.includes('Third object repeats'),
    'THE PRIVATE NOTE NEVER LEAVES — two texts, and only one of them is released',
  )

  // A released mark is not editable in place; revoking is the way back.
  await repo.tok.saveMark('dhahran', markStudent, 'exh', 3, { id: tokMarker, name: 'H. Adeyemi', overrideReason: null })
  check(
    (await repo.tok.getMarkingRoster('dhahran', 'c15', 'exh')).find((r) => r.studentId === markStudent)!.mark === 8,
    'a RELEASED mark cannot be overwritten in place — the way back is to revoke, which is a recorded act',
  )
  await repo.tok.revokeMark('dhahran', markStudent, 'exh', { id: tokMarker, name: 'H. Adeyemi' })
  const revoked = (await repo.tok.getStudentView('dhahran', markStudent))!
  check(revoked.exhibitionMark == null, 'and after a revoke the student sees nothing again')

  const exhJob = (await repo.export.getUploadBoard('dhahran', 'c15'))!
    .sampleJobs.find((j) => j.kind === 'tok_exhibition')!
  check(
    exhJob.pickerHref != null && exhJob.pickerHref.includes('screen=exh'),
    'and the export board’s exhibition sample now has somewhere to go — the picker the board has been waiting for is the marking screen',
  )

  console.log('\n15k. What the marking screen derives')

  const tiles = summariseMarking(markRows)
  check(
    tiles.candidates === 24 && tiles.filed >= 1,
    `tiles derive from the rows: ${tiles.filed} filed of ${tiles.candidates}`,
  )
  check(
    summariseMarking([]).candidates === 0,
    'an empty cohort summarises to zeroes rather than throwing — the first day of a new year group',
  )
  const c14Rows = await repo.tok.getMarkingRoster('dhahran', 'c14', 'exh')
  check(
    summariseMarking(c14Rows).flagged === 0 &&
      summariseMarking(await repo.tok.getMarkingRoster('dhahran', 'c14', 'essay')).flagged > 0,
    'the authorship count is a COUNT of what a marker recorded, not a threshold — and the graduated year has some',
  )
  const dist = promptDistribution(c14Rows)
  check(
    dist.length > 0 && dist.every((d) => d.number >= 1 && d.number <= 35),
    'the prompt distribution falls out of the rows — no extra screen, no extra query',
  )
  check(
    dist.every((d, i) => i === 0 || dist[i - 1].count >= d.count),
    'and it is ordered by how many chose each, which is the order a teacher wants it in',
  )

  console.log('\n15l. The six titles — posted, tallied, and never carried over')

  const c16Titles = await repo.tok.getTitleSet('dhahran', 'c16')
  check(c16Titles == null, 'the new year group has NO title set — nothing was carried, cloned or copied')
  const typedBefore = await repo.tok.listTypedTitles('dhahran', 'c16')
  check(typedBefore.length === 0, 'and nobody has typed one yet either')

  // The fallback for the year the teacher has not got to it.
  await repo.tok.setTitle('dhahran', STUDENTS.find((x) => x.cohortId === 'c16')!.userId, {
    number: null, source: 'student',
    text: 'Does it matter that our knowledge is provisional?',
  })
  const typedAfter = await repo.tok.listTypedTitles('dhahran', 'c16')
  check(
    typedAfter.length === 1,
    'a student may type their own when nothing is posted — and it surfaces in the teacher’s list as theirs',
  )
  const adopted = await repo.tok.adoptTitle('dhahran', 'c16', typedAfter[0].text, { id: 'u_adeyemi', name: 'H. Adeyemi' })
  check(adopted.ok, 'the teacher adopts it in one click')
  const c16After = (await repo.tok.getTitleSet('dhahran', 'c16'))!
  check(
    c16After.titles.length === 1 && c16After.titles[0].number === 1 && c16After.titles[0].source === 'teacher',
    'so the list fills itself, starting at title 1',
  )
  check(
    (await repo.tok.listTypedTitles('dhahran', 'c16')).length === 0,
    'and it stops being an orphan the moment it is adopted',
  )
  check(
    !(await repo.tok.adoptTitle('dhahran', 'c16', typedAfter[0].text, { id: 'u_adeyemi', name: 'H. Adeyemi' })).ok,
    'adopting the same title twice is refused rather than duplicating it',
  )
  const dup = await repo.tok.setTitles('dhahran', 'c16', [
    { number: 1, text: 'One' }, { number: 1, text: 'Two' },
  ], { id: 'u_adeyemi', name: 'H. Adeyemi' })
  check(!dup.ok, 'two titles sharing a number is refused')
  check(
    !(await repo.tok.setTitles('dhahran', 'c16', [{ number: 7, text: 'Seven' }], { id: 'u_adeyemi', name: 'H. Adeyemi' })).ok,
    'and so is a seventh — the IB issues six',
  )

  console.log('\n15m. The TK/PPF — the teacher’s half, and the sentence it composes')

  const ppfStudent = STUDENTS.find((x) => x.cohortId === 'c15')!.userId
  const badLine = await repo.tok.logInteraction('dhahran', ppfStudent, 1, 'full_draft', '2026-09-20', { id: 'u_adeyemi', name: 'H. Adeyemi' })
  check(!badLine.ok, 'a draft cannot be read at the title-choosing meeting — the lines are scoped per interaction')
  const badDate = await repo.tok.logInteraction('dhahran', ppfStudent, 1, 'reviewed_titles', 'yesterday', { id: 'u_adeyemi', name: 'H. Adeyemi' })
  check(!badDate.ok, 'and the meeting needs the day it actually happened, not a word')

  const composed = composeTeacherComment({
    studentName: 'Chen, Marcus',
    logged: [
      { n: 3, lineKey: 'full_draft', heldOn: '2027-02-19' },
      { n: 1, lineKey: 'reviewed_titles', heldOn: '2026-10-14' },
      { n: 2, lineKey: 'plan_and_aoks', heldOn: '2027-01-20' },
    ],
  })
  check(
    composed.startsWith('Marcus engaged with the essay process across three recorded interactions.'),
    'the comment composes from the year’s logged lines — three small acts become the form',
  )
  check(
    composed.indexOf('2026-10-14') < composed.indexOf('2027-01-20') &&
      composed.indexOf('2027-01-20') < composed.indexOf('2027-02-19'),
    'in interaction order, whatever order they were logged in',
  )
  check(
    composed.includes('global nature'),
    'and it uses each line’s CLAUSE rather than its label — a label is picked, a clause is read',
  )
  check(
    composeTeacherComment({ studentName: 'Chen, Marcus', logged: [] }) === '',
    'with nothing logged it composes nothing rather than a hollow sentence',
  )
  check(
    composeTeacherComment({
      studentName: 'Chen, Marcus',
      logged: [{ n: 1, lineKey: 'not_held', heldOn: '2026-10-14' }],
    }).startsWith('No interactions with Marcus were recorded.'),
    'and a meeting that did not happen is said plainly, not dressed up',
  )

  console.log('\n15n. Signing — what blocks it, what only warns, and what it cannot hide')

  const signMe = STUDENTS.find((x) => x.cohortId === 'c15' && x.userId !== ppfStudent)!.userId
  const unsignedYet = await repo.tok.signPpf('dhahran', signMe, { id: 'u_adeyemi', name: 'H. Adeyemi' })
  check(!unsignedYet.ok, 'a form with no teacher comment cannot be signed — the declaration is about the comment')
  check(
    signBlockers({ comment: '   ', signedAt: null }).length === 1,
    'and whitespace is not a comment',
  )

  await repo.tok.saveTeacherComment('dhahran', signMe, 'Engaged throughout; presented a full draft.', { id: 'u_adeyemi', name: 'H. Adeyemi' })
  const signRow = (await repo.tok.getMarkingRoster('dhahran', 'c15', 'essay')).find((r) => r.studentId === signMe)!
  const warns = signWarnings(signRow.ppf!)
  check(
    warns.length > 0 && warns[0].includes('not been written up'),
    'a form the student has not finished WARNS rather than refusing — the IB gives no guidance on a missed interaction',
  )
  check(canSign({ ...signRow.ppf!, comment: 'Engaged throughout.' }), 'so it can still be signed')

  const signed = await repo.tok.signPpf('dhahran', signMe, { id: 'u_adeyemi', name: 'H. Adeyemi' })
  check(signed.ok, 'and it signs')

  // THE THING THAT MAKES THE WARNING SAFE. Signing early must never let a pack
  // claim readiness it does not have.
  const boardAfterSign = (await repo.export.getUploadBoard('dhahran', 'c15'))!
  const tkppfJob = boardAfterSign.cohortJobs.find((j) => j.key === 'tok.tkppf')!
  check(
    tkppfJob.rows.find((r) => r.studentId === signMe)!.present === false,
    'A SIGNED BUT SHORT FORM STILL READS NOT-READY on the export — signing early cannot make a pack lie',
  )
  check(
    (tkppfJob.rows.find((r) => r.studentId === signMe)!.detail ?? '').includes('of 4'),
    'and the row says how short it is, counting the three interactions AND the signature',
  )

  await repo.tok.saveTeacherComment('dhahran', signMe, 'REWRITTEN AFTER SIGNING', { id: 'u_adeyemi', name: 'H. Adeyemi' })
  check(
    TOK_PPF.find((x) => x.studentId === signMe)!.comment !== 'REWRITTEN AFTER SIGNING',
    'a SIGNED comment cannot be edited in place — "I confirm that my comments above are accurate" stops being true if it changes underneath',
  )
  await repo.tok.unsignPpf('dhahran', signMe, { id: 'u_adeyemi', name: 'H. Adeyemi' })
  const unsigned = (await repo.tok.getMarkingRoster('dhahran', 'c15', 'essay')).find((r) => r.studentId === signMe)!
  check(unsigned.ppf!.signedAt == null, 'reopening it clears the signature')
  check(
    !REQUIREMENT_STATES.some((st) => {
      const d = REQUIREMENT_DEFS.find((x) => x.id === st.requirementDefId)
      return d?.key === 'tok.ppfsign' && st.studentId === signMe
    }),
    'and REMOVES the state rather than blanking it — a sign-off that did not happen leaves no record',
  )

  console.log('\n15o. One derivation of the form, read from both ends')

  const c14Ppf = STUDENTS.find((x) => x.cohortId === 'c14')!.userId
  const staffSees = (await repo.tok.getMarkingRoster('dhahran', 'c14', 'essay')).find((r) => r.studentId === c14Ppf)!
  const pupilSees = (await repo.tok.getStudentView('dhahran', c14Ppf))!
  check(
    staffSees.ppf!.interactions.map((i) => `${i.n}:${i.open}:${i.entry != null}`).join('|') ===
      pupilSees.interactions.map((i) => `${i.n}:${i.open}:${i.entry != null}`).join('|'),
    'the teacher’s screen and the student’s read ONE derivation of the form — two would disagree about whether a box is open, and the disagreement would land on the student',
  )
  check(
    staffSees.ppf!.signedAt != null && pupilSees.signedOffAt === staffSees.ppf!.signedAt,
    'and one answer about whether it is signed',
  )
  check(
    staffSees.ppf!.written === 3,
    'the graduated year’s forms are complete, because that year actually finished',
  )

  console.log('\n15p. The boundary table — carried, unconfirmed, and never an answer')

  const c16Table = (await repo.tok.getBoundaries('dhahran', 'c16'))!
  check(
    c16Table.carriedFrom === 'c15' && c16Table.confirmed === false,
    'a new year group CARRIES the previous table forward — and it arrives unconfirmed, so nothing derived from it looks settled',
  )
  check(
    JSON.stringify(c16Table.lower) === JSON.stringify(SEED_BOUNDARIES),
    'with last year’s numbers, so a teacher changes only what changed rather than retyping four numbers',
  )
  // ⚠ THE OPPOSITE RULE TO THE TITLES, on the same screen, deliberately.
  check(
    (await repo.tok.getTitleSet('dhahran', 'c16'))!.titles.length < PRESCRIBED_TITLE_COUNT,
    'while the TITLES carried nothing at all — two adjacent pieces of session data with opposite rules, both asserted',
  )

  const badTable = await repo.tok.setBoundaries('dhahran', 'c16', { A: 16, B: 22, C: 10, D: 4 }, { id: 'u_adeyemi', name: 'H. Adeyemi' })
  check(!badTable.ok, 'an out-of-order table is refused rather than silently applied')
  const goodTable = await repo.tok.setBoundaries('dhahran', 'c16', { A: 23, B: 17, C: 11, D: 5 }, { id: 'u_adeyemi', name: 'H. Adeyemi' })
  check(goodTable.ok, 'a sound one saves')
  check(
    (await repo.tok.getBoundaries('dhahran', 'c16'))!.confirmed === true,
    'and saving IS confirming — a teacher who typed the numbers has looked at them',
  )

  console.log('\n15q. The evidence beside the letter')

  const evidence = await repo.tok.getEvidence('dhahran', 'c15')
  check(evidence.length === 24, 'one row per candidate')
  const withBoth = evidence.find((e) => e.exhibition != null && e.essay != null)
  const withOne = evidence.find((e) => e.exhibition != null && e.essay == null)
  check(
    withOne != null && withOne.total == null && withOne.indicative == null,
    'ONE mark in gives no total and no letter — a half-built total is not two thirds of an answer',
  )
  if (withBoth) {
    check(
      withBoth.total === withBoth.exhibition! + withBoth.essay! * 2,
      'and both in gives exhibition + 2 x essay, which is the IB’s published 2/3 and 1/3 as arithmetic',
    )
  }
  const c15Table = (await repo.tok.getBoundaries('dhahran', 'c15'))!
  check(
    evidence.every((e) => e.tableConfirmed === c15Table.confirmed),
    'every row carries whether the table behind it is confirmed — the letter is never shown without that',
  )

  // THE SAFETY PROPERTY OF THE WHOLE /30 PATH.
  const evStudent = evidence[0].studentId
  await repo.tok.saveMark('dhahran', evStudent, 'exh', 8, { id: 'u_adeyemi', name: 'H. Adeyemi', overrideReason: null })
  await repo.tok.saveMark('dhahran', evStudent, 'essay', 8, { id: 'u_adeyemi', name: 'H. Adeyemi', overrideReason: null })
  const ev2 = (await repo.tok.getEvidence('dhahran', 'c15')).find((e) => e.studentId === evStudent)!
  check(ev2.total === 24 && ev2.indicative === 'A', 'the letter derives from the marks as they are entered')
  // DERIVED AND NEVER SAVED. Deriving a letter must not write one — the letter
  // that goes to IBIS is the one a teacher typed, and nothing else.
  const statesBefore = REQUIREMENT_STATES.length
  const pgBefore = JSON.stringify(
    REQUIREMENT_STATES.filter((st) => {
      const d = REQUIREMENT_DEFS.find((x) => x.id === st.requirementDefId)
      return d?.key?.startsWith('tok.pg.')
    }).map((st) => [st.studentId, st.grade]),
  )
  await repo.tok.getEvidence('dhahran', 'c15')
  const pgAfterJson = JSON.stringify(
    REQUIREMENT_STATES.filter((st) => {
      const d = REQUIREMENT_DEFS.find((x) => x.id === st.requirementDefId)
      return d?.key?.startsWith('tok.pg.')
    }).map((st) => [st.studentId, st.grade]),
  )
  check(
    REQUIREMENT_STATES.length === statesBefore && pgBefore === pgAfterJson,
    'reading the evidence WRITES NOTHING — the indicative letter informs, it never sets, and the letter that goes to IBIS is still the one a teacher typed',
  )

  console.log('\n15r. Due dates on TOK — whose they are, and where there are none')

  const tokDeadlines = DEADLINES.filter((d) => d.cohortId === 'c15' && d.courseId === 'tok')
  check(
    !tokDeadlines.some((d) => d.requirementKey === 'exhmark'),
    'THE EXHIBITION MARK HAS NO DUE DATE — marking is staff work, and a date on it is pressure with nothing behind it (Michael, 21 Aug)',
  )
  check(
    !tokDeadlines.some((d) => d.requirementKey === 'prompt'),
    'and the prompt has none either — the teacher has not set one, and an unset date is BLANK rather than invented',
  )
  check(
    tokDeadlines.filter((d) => ['title', 'exh'].includes(d.requirementKey))
      .every((d) => d.decidedBy.includes('Adeyemi')),
    'the module milestones that DO have dates are the teacher’s, not the planning meeting’s — decidedBy is what says which',
  )
  check(
    tokDeadlines.some((d) => d.requirementKey === 'essay' && d.decidedBy.includes('planning')),
    'while the essay deadline stays the school’s, because it is the one the IB upload depends on',
  )
  const promptCp = (await repo.getTrack('dhahran', evStudent))!
    .lanes.find((l) => l.lane === 'TOK')!
    .checkpoints.find((c) => c.def.key === 'tok.prompt')!
  check(
    promptCp.due == null,
    'so a student with no prompt date sees no date — not a default, not a guess, nothing',
  )

  // ⚑ THE SAME PROBLEM, THIRTY TIMES OVER. Michael spotted it on the TOK
  // exhibition mark; a probe found six staff-recorded checkpoints carrying a
  // due date on ONE student's track — "English HL IA mark, due 28 Jan" is a
  // date for the teacher, about work the candidate cannot do, and it could go
  // late on them for somebody else's lateness.
  //
  // 22 AUG: THE FILTER IS NO LONGER WHAT SAVES US. The stage itself is
  // undatable now, so a staff-recorded checkpoint carries no date on ANY read —
  // staff's or the candidate's. The `asCandidate` filter stays as the second
  // line, and this assertion is the first: there is nothing to filter.
  const asStaff = (await repo.getTrack('dhahran', evStudent))!
  const asCandidate = (await repo.getTrack('dhahran', evStudent, { asCandidate: true }))!
  const staffDated = (t: typeof asStaff) => t.lanes.flatMap((l) => l.checkpoints)
    .filter((c) => c.def.recordedBy === 'staff' && c.due != null)
  check(
    staffDated(asStaff).length === 0,
    'NOT ONE staff-recorded checkpoint carries a date, even on a staff read — the thirty IA mark dates are gone at the source',
  )
  check(
    staffDated(asCandidate).length === 0,
    'and a CANDIDATE reading their own track sees none either — a date on somebody else’s work is not theirs to be late for',
  )
  check(
    asCandidate.lanes.flatMap((l) => l.checkpoints).length ===
      asStaff.lanes.flatMap((l) => l.checkpoints).length,
    'and the checkpoints themselves still show — they should know a mark is coming, they just do not get a deadline for it',
  )
  check(
    staffDated(asCandidate).length === 0 &&
      asCandidate.lanes.flatMap((l) => l.checkpoints)
        .filter((c) => c.def.recordedBy === 'student' && c.due != null).length > 0,
    'their OWN dates are untouched — this drops one kind of date, not dates',
  )

  console.log('\n17. Generated filenames — the twenty-two-file argument')

  // Last session's archive is the case for this file existing: ten TOK essays
  // in eight formats, twelve EEs in five. Every assertion below is one of those
  // defects made structurally impossible.
  check(
    packFileName({ sessionNumber: '0004', name: 'Chen, Marcus', parts: ['tok', 'essay'] })
      === '0004_Chen_Marcus_tok_essay.pdf',
    'the pattern: session number, surname, first name, component',
  )
  check(
    packFileName({ sessionNumber: '0004', name: 'Chen, Marcus', parts: ['ee', 'Biology'] })
      === '0004_Chen_Marcus_ee_biology.pdf',
    'the EE carries its SUBJECT — an EE folder full of "_ee.pdf" says nothing about what you are holding',
  )
  check(
    packFileName({ sessionNumber: '0004', name: 'Chen, Marcus', parts: ['Biology HL', 'ia'] })
      === '0004_Chen_Marcus_biology-hl_ia.pdf',
    'and an IA carries its course, so two IAs side by side on a desktop are never indistinguishable',
  )

  // The names in last year's folder, which are the real test.
  check(splitName('Ahmed, Layla').last === 'Ahmed' && splitName('Ahmed, Layla').first === 'Layla',
    '"Last, First" splits as written')
  check(splitName('Layla Ahmed').last === 'Ahmed', 'and a name with no comma falls back to the last token as the surname')
  check(slug('Al-Rashid') === 'Al-Rashid', 'a hyphenated surname survives intact')
  check(slug('Wei Ling') === 'Wei-Ling', 'a two-word given name becomes one readable token rather than two segments')
  check(slug("O'Brien") === 'OBrien', 'an apostrophe is dropped, not turned into a hyphen')
  check(slug('Gonzalez Gil') === 'Gonzalez-Gil', 'and so does a two-word surname')
  check(slug('Muñoz') === 'Munoz', 'diacritics fold rather than surviving into a filename')
  check(
    packFileName({ sessionNumber: '0009', name: "O'Brien, Cian", parts: ['tok', 'exhibition'] })
      === '0009_OBrien_Cian_tok_exhibition.pdf',
    'end to end on the awkward one',
  )
  check(
    !packFileName({ sessionNumber: '0004', name: 'Chen, Marcus', parts: ['tok', 'essay'] }).includes('..'),
    'and nothing ever produces a double extension — last session managed ".pdf.pdf" by hand',
  )

  // A candidate with no session number cannot be uploaded at all, so the
  // missing prefix is a fact for the manifest — never a string in a filename.
  const unregistered = packFileName({ sessionNumber: null, name: 'Chen, Marcus', parts: ['tok', 'essay'] })
  check(
    unregistered === 'Chen_Marcus_tok_essay.pdf' && !unregistered.includes('no-session'),
    'an unregistered candidate gets a usable name rather than "no-session-number" buried in the middle of one',
  )

  check(
    packFolderPath({ subjectGroup: null, courseName: null, component: 'TOK' }) === 'Core/TOK',
    'the group is navigation and lives in the FOLDER; core work sits under Core/',
  )
  check(
    packFolderPath({ subjectGroup: 'Group 4 — Sciences', courseName: 'Biology HL', component: 'IA' })
      === 'Group 4 — Sciences/Biology HL/IA',
    'and a subject sits three levels down, exactly as the school’s Drive is already organised',
  )
  check(NAMING_PATTERN.startsWith('{sessionNo}'), 'the pattern is published so the export board can show it beside a live example')

  // And the board actually uses it.
  const namedBoard = (await repo.export.getUploadBoard('dhahran', 'c14'))!
  const tokEssayJob = namedBoard.cohortJobs.find((j) => j.key === 'tok.essay')!
  check(
    tokEssayJob.rows.every((r) => /^\d{4}_[A-Za-z-]+_[A-Za-z-]+_tok_essay\.pdf$/.test(r.fileName)),
    'EVERY row on the export board is named by the generator — not one is typed, so not one can be "Tittle 4"',
  )
  check(
    new Set(tokEssayJob.rows.map((r) => r.fileName)).size === tokEssayJob.rows.length,
    'and every name in a pack is unique, which a surname-only scheme could not promise',
  )
  const eeEssayJob = namedBoard.cohortJobs.find((j) => j.key === 'ee.essay')!
  check(
    eeEssayJob.rows.some((r) => /_ee_[a-z-]+\.pdf$/.test(r.fileName) && !r.fileName.endsWith('_ee_essay.pdf')),
    'and a registered EE names its subject rather than falling back to the word "essay"',
  )


  // =========================================================================
  // READING A PAPER, AND MARKING IT BESIDE THE PAPER
  // claude/IB-Reading-and-Marking-Papers.md — build steps 1, 2 and 4.
  // =========================================================================

  console.log('\n18. Reading a paper — files are real objects, and every file def says what it accepts')

  const fileDefs = REQUIREMENT_DEFS.filter((d) => d.cohortId === 'c15' && d.artifact === 'file')
  check(
    fileDefs.length > 0 && fileDefs.every((d) => d.accepts != null && d.accepts.length > 0),
    'every requirement that takes a file says what it accepts — EE, both TOK components and every subject IA',
  )
  const bioFileDef = fileDefs.find((d) => d.key === 'bio_sl.file')!
  check(
    bioFileDef.accepts?.includes('application/pdf') === true,
    'a scientific investigation asks for a PDF, because that is what eCoursework receives',
  )
  const oralDef = fileDefs.find(
    (d) => templateOf(COURSES.find((c) => c.id === d.key.replace('.file', ''))?.iaTemplateKey).key
      === 'lang_b_io',
  )
  check(
    oralDef != null && oralDef.accepts?.some((a) => a.startsWith('audio/')) === true,
    'and a Language B individual oral asks for AUDIO — off the course template, with nobody maintaining a list of screens',
  )

  check(
    formatRefusal(PDF_ONLY, { name: 'essay-final.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      ?.includes('File → Download → PDF') === true,
    'a .docx is REFUSED where the IB receives a PDF, and the refusal names the four clicks that fix it rather than saying "wrong format"',
  )
  check(
    accepted(PDF_ONLY, { name: 'ia.pdf', mime: 'application/octet-stream' }),
    'but a real PDF whose mime the browser could not name is still accepted — refusing on mime alone would refuse real work',
  )
  check(
    accepted(AUDIO_ONLY, { name: 'oral.m4a', mime: 'audio/x-m4a' }) &&
      formatRefusal(AUDIO_ONLY, { name: 'oral.pdf', mime: 'application/pdf' }) != null,
    'an oral takes a recording and refuses a PDF — the same one rule, read the other way round',
  )
  check(
    accepted(undefined, { name: 'anything.zip', mime: 'application/zip' }),
    'a def with no accepts fails OPEN — absent means "anything", never "nothing", so a def written before this existed still works',
  )
  check(
    describeAccepts(PDF_ONLY) === 'a PDF' && describeAccepts(AUDIO_ONLY) === 'an audio recording',
    'and what is accepted is said in words a student reads, not in mime types',
  )
  const anyTrack = (await repo.getTrack('dhahran', STUDENTS.find((s) => s.cohortId === 'c15')!.userId))!
  check(
    acceptsIn(anyTrack, 'ee.final')?.includes('application/pdf') === true,
    'the upload action reads `accepts` off the DEF through the track it already fetched — so work filed under one session’s rules keeps being read under them',
  )

  console.log('\n18b. A file artifact is a RECORD, not a filename')

  const seededFiles = REQUIREMENT_STATES
    .filter((st) => st.artifacts.some((a) => a.kind === 'file'))
    .flatMap((st) => st.artifacts.filter((a) => a.kind === 'file'))
  check(
    seededFiles.length > 0 && seededFiles.every((a) => a.file != null),
    'EVERY seeded file artifact carries a real StoredRef — before this a green box on the board had a filename behind it and no file',
  )
  check(
    seededFiles.every((a) => a.file!.bytes > 0 && a.file!.mime.length > 0 && a.file!.key.length > 0),
    'with a size, a type and an opaque key — the three things MediaViewer needs to say something honest while the bytes go nowhere',
  )
  check(
    seededFiles.some((a) => /_v3\.pdf$|^IA_final|-final\.pdf$/i.test(a.file!.name)),
    'and the fixtures use the names STUDENTS give files, because "IA_final_v3.pdf" is exactly the problem the reader exists to solve',
  )
  // FIXTURES NEVER LIE — and a seeded .pdf against a component that receives
  // audio would be a fixture lying about a component.
  const oralStates = REQUIREMENT_STATES.filter((st) => {
    const d = REQUIREMENT_DEFS.find((x) => x.id === st.requirementDefId)
    return d?.accepts?.some((a) => a.startsWith('audio/')) === true
  }).flatMap((st) => st.artifacts.filter((a) => a.kind === 'file'))
  check(
    oralStates.length > 0 && oralStates.every((a) => a.file!.mime.startsWith('audio/')),
    'and an individual oral is seeded as a RECORDING, not a PDF — the fixture follows the def’s accepts rather than assuming everything is a paper',
  )

  console.log('\n18c. The old file is kept, superseded, not deleted')

  const supStudent = STUDENTS.find((s) => s.cohortId === 'c15' && s.sessionNumber != null)!.userId
  const supDef = REQUIREMENT_DEFS.find((d) => d.cohortId === 'c15' && d.key === 'ee.final')!
  await repo.ee.submitFinal('dhahran', supStudent, 'first.pdf', 3000, {
    id: 'sr_a', name: 'first.pdf', mime: 'application/pdf', bytes: 111_000, key: 'k/a', addedAt: '2026-08-22',
  })
  await repo.ee.unlockFinal('dhahran', supStudent, 'u_msmith', 'Michael Smith', 'Wrong file.')
  await repo.ee.submitFinal('dhahran', supStudent, 'second.pdf', 3010, {
    id: 'sr_b', name: 'second.pdf', mime: 'application/pdf', bytes: 112_000, key: 'k/b', addedAt: '2026-08-22',
  })
  const supState = REQUIREMENT_STATES.find(
    (st) => st.studentId === supStudent && st.requirementDefId === supDef.id,
  )!
  check(
    fileOf(supState)?.ref.name === 'second.pdf',
    'the CURRENT file is the newest one that has not been superseded — one function, so no screen picks its own',
  )
  check(
    filesOf(supState).some((f) => f.ref.name === 'first.pdf' && f.supersededAt != null),
    'and the replaced paper is still there, marked superseded — "which version did the supervisor read" is asked a year later',
  )
  check(
    new Set(supState.artifacts.map((a) => a.id)).size === supState.artifacts.length,
    'and each version has its own id — refiling twice in one day is exactly what "wrong file, try again" looks like, so the id carries the ref rather than the date',
  )

  console.log('\n18d. The reader morph — one screen, two shapes')

  const readerView = (await repo.ia.getMarksView('dhahran', 'bio_sl', 'c15'))!
  check(
    readerView.rows.every((r) => 'file' in r),
    'the marks view carries the PAPER, not just a box colour — the grid and the reader read one row',
  )
  check(
    readerView.exportsToIb === true && readerView.accepts?.includes('application/pdf') === true,
    'and it carries what the def says: this file goes to eCoursework, as a PDF',
  )
  const sessionOrder = readerView.rows
    .map((r) => r.sessionNumber)
    .filter((n): n is string => n != null)
  check(
    sessionOrder.every((n, i) => i === 0 || sessionOrder[i - 1] <= n),
    'the candidate strip is the grid’s own order — session number, the order IBIS lists candidates — so moving between grid and paper never means finding your place again',
  )
  const noFileMarked = REQUIREMENT_DEFS.filter((d) => d.cohortId === 'c15' && d.key.endsWith('.mark'))
    .length > 0 &&
    (await Promise.all(
      COURSES.filter((c) => c.type === 'subject').slice(0, 12).map((c) =>
        repo.ia.getMarksView('dhahran', c.id, 'c15'),
      ),
    )).some((v) => v?.rows.some((r) => r.total != null && r.file == null))
  check(
    noFileMarked,
    'the fixtures contain a candidate MARKED WITH NO FILE — the dangerous one, and a state a screen only ever drawn against a finished candidate would never show',
  )

  // VIEWING IS VIEWING. Michael, 22 Aug: "no. viewing is viewing." A screen
  // that records who looked at what becomes a screen people perform at, so the
  // guard is an assertion rather than a comment.
  const eventsBeforeRead = MARK_EVENTS.length
  await repo.ia.getMarksView('dhahran', 'bio_sl', 'c15')
  await repo.ia.getMarksView('dhahran', 'bio_sl', 'c15')
  check(
    MARK_EVENTS.length === eventsBeforeRead,
    'opening a paper records NOTHING — no "seen by", no count, nothing on the export board. Viewing is viewing',
  )

  const readerRpfDef = REQUIREMENT_DEFS.find((d) => d.cohortId === 'c15' && d.key === 'ee.rpf')!
  check(
    readerRpfDef.markMax == null && readerRpfDef.artifact !== 'mark',
    'the EE reflection statement carries NO MARK — the case that proves the reader generalises, because "check it is the right file" has to work for things nobody grades',
  )
  const exhMarkDef = REQUIREMENT_DEFS.find((d) => d.cohortId === 'c15' && d.key === 'tok.exhmark')!
  check(
    exhMarkDef.markMax === 10 && exhMarkDef.criteria == null,
    'and the TOK exhibition is one total out of ten with no criteria — the right-hand side is derived from the requirement, never invented per module',
  )


  console.log('\n19. The teacher’s surfaces — what a subject teacher may reach')

  // claude/IB-Teacher-Student-View-Spec.md. Michael, 22 Aug: "Clicking on the
  // student (or the file) should do what clicking on the FILE does."
  const farouk = resolveCapabilities(
    MEMBERSHIPS.find((m) => m.userId === 'u_farouk' && m.schoolId === 'dhahran')!,
  )
  check(
    farouk.has('ia.manage') && farouk.has('pg.manage'),
    'a subject teacher keeps what a subject teacher does — their own IA marks and their own predicted grades',
  )
  check(
    !farouk.has('cas.manage') && !farouk.has('ee.manage') && !farouk.has('tok.manage'),
    'and holds NONE of the Core capabilities — they were school-wide, so every teacher could edit any candidate’s CAS',
  )
  const adeyemi = resolveCapabilities(
    MEMBERSHIPS.find((m) => m.userId === 'u_adeyemi' && m.schoolId === 'dhahran')!,
  )
  check(
    adeyemi.has('cas.manage') && adeyemi.has('ee.manage') && adeyemi.has('tok.manage'),
    'the person who actually runs CAS, EE and TOK holds all three — a job held by the person who holds it, not by a preset',
  )

  // THE BRANCH THAT HAD NEVER RENDERED. `all = session.can('ee.manage')` was
  // true for every teacher, so the supervisor-scoped roster was dead code from
  // the day it was written.
  const faroukEe = await repo.ee.getRoster('dhahran', 'c15', 'u_farouk')
  const wholeEe = await repo.ee.getRoster('dhahran', 'c15', null)
  check(
    faroukEe.length > 0 && faroukEe.length < wholeEe.length,
    'a supervising subject teacher sees SOME of the year group’s essays — the scoped roster finally renders',
  )
  check(
    faroukEe.every((r) => r.supervisor?.userId === 'u_farouk'),
    'and every row on it is one of theirs — scoping is the argument to getRoster, not a filter in the component',
  )

  // SUPERVISION IS NOT ENROLMENT. The gate on a student's record is
  // `teachesStudent`, which is enrolment-only — so the person writing about a
  // candidate can be the one person locked out of them. Spec §4.
  const supervisedNotTaught: string[] = []
  for (const r of faroukEe) {
    if (!(await repo.teachesStudent('dhahran', 'u_farouk', r.studentId))) {
      supervisedNotTaught.push(r.studentId)
    }
  }
  check(
    supervisedNotTaught.length > 0,
    'a supervisor supervises candidates they do not teach — which is why `teachesStudent` alone is the wrong gate on a student’s record',
  )

  console.log('\n' + '='.repeat(60))
  if (fail.length) {
    console.log(`CHECKPOINT FAILED — ${fail.length} problem(s). Fix the spine before building screens.\n`)
    process.exit(1)
  }
  console.log('CHECKPOINT PASSED — the board and track render CAS with no edit to either component.\n')
}

main()
