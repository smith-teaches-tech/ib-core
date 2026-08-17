// CAS → spine. The whole point of the module.
//
// Nothing in here is stored (spine invariant #2). `cas.lo3` is `submitted`
// because SOME complete experience has LO3 confirmed on its sign-off — nobody
// records `cas.lo3` and there is no row anywhere that says so.
//
// The consequence worth stating plainly: the completeness board and the student
// track read these states and never learn what an Experience is. EE will do the
// same with reflections, TOK with TK/PPF entries, IAs with files.

import type { RequirementDef, RequirementState, Student } from '../types'
import {
  INTERVIEW_ORDER,
  LEARNING_OUTCOMES,
  type CasData,
  type CasPost,
  type CasSummary,
  type Experience,
  type ExperienceStatus,
  type ExperienceView,
  type InterviewKind,
  type LoKey,
  type LoTally,
  type ProjectStatus,
  type Strand,
  type ThreadEntry,
} from './types'

/** The twelve keys CAS puts on the board. Nothing else in the CAS lane. */
export const CAS_KEYS = {
  outcome: (lo: LoKey) => 'cas.' + lo,
  project: 'cas.project',
  interview: (k: InterviewKind) => 'cas.interview' + (INTERVIEW_ORDER.indexOf(k) + 1),
  complete: 'cas.complete',
} as const

/** A state is only "recorded" from the spine's point of view at submitted+. */
const SUBMITTED = 'submitted' as const
const IN_PROGRESS = 'in_progress' as const

// ---------------------------------------------------------------------------
// Reading the module's own data
// ---------------------------------------------------------------------------

/** Entries still in the visible thread, newest first. Superseded ones drop out. */
export function visibleThread(experienceId: string, entries: ThreadEntry[]): ThreadEntry[] {
  return entries
    .filter((e) => e.experienceId === experienceId && !e.supersededBy)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

/**
 * What a sign-off actually confirmed. NOT what the student claimed.
 *
 * The distinction is the honest part of the whole module: a student can claim
 * LO6 on everything they do, and it counts for nothing until a supervisor or the
 * coordinator says they saw it.
 */
export function confirmedOutcomesOf(
  experience: Experience,
  entries: ThreadEntry[],
): LoKey[] {
  if (experience.status !== 'complete') return []
  const set = new Set<LoKey>()
  for (const e of entries) {
    if (e.experienceId !== experience.id || e.kind !== 'signoff' || e.supersededBy) continue
    for (const lo of e.confirmedOutcomes ?? []) set.add(lo)
  }
  return LEARNING_OUTCOMES.map((l) => l.key).filter((k) => set.has(k))
}

/**
 * Reading order for a portfolio that may run to dozens of experiences.
 *
 * Three bands, because a flat date sort buries the wrong things: something
 * waiting on a decision must not sink under six finished experiences just
 * because it was started first, and finished work should not compete for
 * attention with live work at all.
 *
 *   0  waiting on somebody   submitted · returned · awaiting sign-off
 *   1  live                  draft · approved
 *   2  finished              complete
 *   3  ruled out             rejected  (hidden from the student entirely)
 *
 * Newest first inside each band, dated by when the band was entered — so a
 * completed experience is ordered by when it completed, and the oldest finished
 * work ends up at the very bottom where it belongs.
 */
const BAND: Record<ExperienceStatus, number> = {
  submitted: 0,
  returned: 0,
  awaiting_signoff: 0,
  draft: 1,
  approved: 1,
  complete: 2,
  rejected: 3,
}

const bandDate = (e: Experience) =>
  e.status === 'complete' ? (e.completedAt ?? e.createdAt) : e.createdAt

export function sortExperiences(list: Experience[]): Experience[] {
  return [...list].sort((a, b) => {
    const band = BAND[a.status] - BAND[b.status]
    if (band !== 0) return band
    const ad = bandDate(a)
    const bd = bandDate(b)
    return ad < bd ? 1 : ad > bd ? -1 : a.title.localeCompare(b.title)
  })
}

/** Everything a student has on the go, minus what was ruled out. */
export function experiencesOf(studentId: string, data: CasData): Experience[] {
  return sortExperiences(
    data.experiences.filter((e) => e.studentId === studentId && e.status !== 'rejected'),
  )
}

export function viewsOf(studentId: string, data: CasData): ExperienceView[] {
  return experiencesOf(studentId, data).map((experience) => ({
    experience,
    entries: visibleThread(experience.id, data.entries),
    confirmedOutcomes: confirmedOutcomesOf(experience, data.entries),
    // The NEWEST unused request — a re-request voids its predecessors, and the
    // link the student is shown must be the one that can still sign.
    request:
      data.requests
        .filter((r) => r.experienceId === experience.id && !r.usedAt)
        .reduce<(typeof data.requests)[number] | null>(
          (best, r) => (best == null || r.sentAt >= best.sentAt ? r : best),
          null,
        ),
  }))
}

// ---------------------------------------------------------------------------
// The module summary — one student, everything the roster and the tiles need
// ---------------------------------------------------------------------------

export function summarise(studentId: string, data: CasData): CasSummary {
  const mine = experiencesOf(studentId, data)
  const counted = mine.filter((e) => e.status !== 'draft')

  const strandSet = new Set<Strand>()
  for (const e of counted) for (const s of e.strands) strandSet.add(s)

  const confirmed = new Set<LoKey>()
  for (const e of mine) for (const lo of confirmedOutcomesOf(e, data.entries)) confirmed.add(lo)

  const claimed = new Set<LoKey>()
  for (const e of counted) {
    if (e.status === 'complete') continue
    for (const lo of e.claimedOutcomes) if (!confirmed.has(lo)) claimed.add(lo)
  }

  const projects = mine.filter((e) => e.isProject && e.status !== 'draft')
  const project: ProjectStatus = projects.some((e) => e.status === 'complete')
    ? 'complete'
    : projects.length > 0
      ? 'in_progress'
      : 'none'

  const order = LEARNING_OUTCOMES.map((l) => l.key)

  // Counts, not sets. `outcomes`/`claimed` above answer "has this happened at
  // all" — the question the board asks. These answer "how often", which is the
  // only way to see that a student met LO1 seven times and LO6 once. Per
  // EXPERIENCE on both sides: see the LoTally doc comment for why not per
  // reflection.
  const confirmedIn = new Map<string, LoKey[]>(
    mine.map((e) => [e.id, confirmedOutcomesOf(e, data.entries)]),
  )
  const tallies: LoTally[] = order.map((key) => ({
    key,
    confirmed: mine.filter((e) => confirmedIn.get(e.id)?.includes(key)).length,
    // Drafts included on purpose — see LoTally.open.
    open: mine.filter((e) => e.status !== 'complete' && e.claimedOutcomes.includes(key)).length,
  }))

  // The timeline. Superseded entries drop out for the same reason they drop out
  // of the thread: an edit is one post, not two. The prior version stays in the
  // record — it is just not a second dot.
  const titleOf = new Map(mine.map((e) => [e.id, e.title]))
  const posts: CasPost[] = data.entries
    .filter(
      (e) =>
        !e.supersededBy &&
        (e.kind === 'reflection' || e.kind === 'evidence') &&
        titleOf.has(e.experienceId),
    )
    .map((e) => ({
      at: e.createdAt,
      kind: e.kind as CasPost['kind'],
      experienceId: e.experienceId,
      experienceTitle: titleOf.get(e.experienceId) ?? '',
    }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))

  return {
    strands: (['C', 'A', 'S'] as Strand[]).filter((s) => strandSet.has(s)),
    outcomes: order.filter((k) => confirmed.has(k)),
    claimed: order.filter((k) => claimed.has(k)),
    tallies,
    posts,
    project,
    unapproved: mine.filter((e) => e.status === 'submitted').length,
    awaiting: mine.filter((e) => e.status === 'awaiting_signoff').length,
    interviews: data.interviews.filter((i) => i.studentId === studentId).length,
    indicator: data.indicators.find((i) => i.studentId === studentId)?.value ?? null,
    complete: data.completions.some((c) => c.studentId === studentId),
  }
}

/** Can the coordinator honestly confirm CAS complete? The gate on cas.complete. */
export function completionGate(summary: CasSummary): { ready: boolean; missing: string[] } {
  const missing: string[] = []
  if (summary.outcomes.length < 7) {
    missing.push(`${7 - summary.outcomes.length} learning outcome(s) not yet confirmed`)
  }
  if (summary.project !== 'complete') missing.push('CAS project not complete')
  if (summary.interviews < 3) missing.push(`${3 - summary.interviews} interview(s) not recorded`)
  return { ready: missing.length === 0, missing }
}

// ---------------------------------------------------------------------------
// The crossing point — module entities become RequirementStates
// ---------------------------------------------------------------------------

/**
 * Derive every CAS RequirementState for every student, on read.
 *
 * Call this wherever the spine reads states. Do NOT cache the result: an
 * experience completed a second ago must show on the board a second later, and a
 * cached copy is exactly the desynchronisation invariant #2 forbids.
 */
export function deriveCasStates(
  students: Student[],
  defs: RequirementDef[],
  data: CasData,
): RequirementState[] {
  // Keyed BY COHORT, not just by key. Two live cohorts each carry a definition
  // called `cas.lo1`, and a flat key→def map would silently keep one of them —
  // which would attach one class's states to the other class's definitions.
  const byCohort = new Map<string, Map<string, RequirementDef>>()
  for (const d of defs) {
    if (d.lane !== 'CAS') continue
    let m = byCohort.get(d.cohortId)
    if (!m) byCohort.set(d.cohortId, (m = new Map()))
    m.set(d.key, d)
  }
  if (byCohort.size === 0) return []

  const out: RequirementState[] = []

  const push = (
    student: Student,
    key: string,
    recordStatus: typeof SUBMITTED | typeof IN_PROGRESS,
    recordedAt?: string,
    recordedBy?: string,
  ) => {
    const def = byCohort.get(student.cohortId)?.get(key)
    if (!def) return
    out.push({
      studentId: student.userId,
      requirementDefId: def.id,
      schoolId: student.schoolId,
      recordStatus,
      artifacts: [],
      recordedAt,
      recordedBy,
    })
  }

  for (const student of students) {
    const mine = experiencesOf(student.userId, data)
    if (
      mine.length === 0 &&
      data.interviews.every((i) => i.studentId !== student.userId) &&
      data.completions.every((c) => c.studentId !== student.userId)
    ) {
      // Nothing recorded at all. Absence is the record — no not_started rows.
      continue
    }

    // --- the seven outcomes -------------------------------------------------
    // submitted: some COMPLETE experience had it confirmed at sign-off.
    // in_progress: some live experience claims it. Claiming is not evidence.
    const confirmedAt = new Map<LoKey, string | undefined>()
    const claimed = new Set<LoKey>()
    for (const e of mine) {
      for (const lo of confirmedOutcomesOf(e, data.entries)) {
        if (!confirmedAt.has(lo)) confirmedAt.set(lo, e.completedAt)
      }
      if (e.status !== 'draft' && e.status !== 'complete') {
        for (const lo of e.claimedOutcomes) claimed.add(lo)
      }
    }
    for (const { key } of LEARNING_OUTCOMES) {
      if (confirmedAt.has(key)) push(student, CAS_KEYS.outcome(key), SUBMITTED, confirmedAt.get(key))
      else if (claimed.has(key)) push(student, CAS_KEYS.outcome(key), IN_PROGRESS)
    }

    // --- the project --------------------------------------------------------
    const doneProject = mine.find((e) => e.isProject && e.status === 'complete')
    const liveProject = mine.find((e) => e.isProject && e.status !== 'draft')
    if (doneProject) push(student, CAS_KEYS.project, SUBMITTED, doneProject.completedAt)
    else if (liveProject) push(student, CAS_KEYS.project, IN_PROGRESS)

    // --- the three interviews ----------------------------------------------
    // A saved interview locks. An unlocked one is a draft the coordinator is
    // still writing, which is honestly in_progress rather than done.
    for (const kind of INTERVIEW_ORDER) {
      const iv = data.interviews.find((i) => i.studentId === student.userId && i.kind === kind)
      if (!iv) continue
      push(
        student,
        CAS_KEYS.interview(kind),
        iv.lockedAt ? SUBMITTED : IN_PROGRESS,
        iv.conductedOn,
        iv.conductedBy,
      )
    }

    // --- CAS complete -------------------------------------------------------
    // The one CAS requirement RECORDED rather than derived: the coordinator
    // confirms it. CAS is not assessed and nothing is uploaded to eCoursework,
    // so this def carries no exportTarget. [VERIFY] how completion reaches IBIS.
    const done = data.completions.find((c) => c.studentId === student.userId)
    if (done) push(student, CAS_KEYS.complete, SUBMITTED, done.confirmedAt, done.confirmedBy)
  }

  return out
}
