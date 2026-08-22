// WHICH DEADLINE APPLIES TO WHICH REQUIREMENT — the one place that join happens.
//
// A Deadline is keyed by (stage × course) and a RequirementDef is keyed by
// `<courseId>.<stage>`, so something has to reconcile the two. It is here, it is
// pure, and it is tested by the checkpoint harness.

import type { Checkpoint, CheckpointDue, Deadline, RequirementDef } from './types'

/**
 * Does this deadline reach this requirement?
 *
 *   courseId set   → exactly `<courseId>.<requirementKey>`
 *   courseId null  → every def whose key is, or ends with, the stage. This is
 *                    how one row sets a predicted-grade date across all 31
 *                    courses, and it is the same suffix match the board's
 *                    rollups already use.
 */
export function deadlineMatches(
  d: Deadline,
  def: RequirementDef,
  /** Whose track this is. A per-student row reaches nobody else, ever. */
  studentId?: string | null,
): boolean {
  if (d.cohortId !== def.cohortId || d.schoolId !== def.schoolId) return false
  // AN EXTENSION IS A ROW, NOT A FLAG. It is keyed exactly like any other date
  // and resolved by the same rule; it is simply more specific than a course
  // date, which is more specific than the cohort's. So a medical extension
  // needs no second code path and cannot be forgotten by one.
  if (d.studentId != null && d.studentId !== studentId) return false
  if (d.courseId != null) return def.key === `${d.courseId}.${d.requirementKey}`
  return def.key === d.requirementKey || def.key.endsWith(`.${d.requirementKey}`)
}

/** How specific a row is: the cohort's, one course's, or one candidate's. */
function specificity(d: Deadline): number {
  if (d.studentId != null) return 2
  if (d.courseId != null) return 1
  return 0
}

/**
 * THE MOST SPECIFIC DEADLINE WINS.
 *
 * A cohort-wide row sets the default; a course-specific row overrides it for
 * that course. Without this rule a school could not say "everyone by 14 Jan,
 * except Chemistry, which is the 28th" — which is exactly what the real
 * calendar says.
 *
 * Ties are broken by the later `setAt`: if two rows are equally specific, the
 * one decided most recently is the live one.
 */
export function deadlineFor(
  deadlines: Deadline[],
  def: RequirementDef,
  studentId?: string | null,
): Deadline | null {
  let best: Deadline | null = null
  for (const d of deadlines) {
    if (!deadlineMatches(d, def, studentId)) continue
    if (best == null) { best = d; continue }
    const a = specificity(d)
    const b = specificity(best)
    if (a > b) best = d
    else if (a === b && d.setAt > best.setAt) best = d
  }
  return best
}

const DAY = 86_400_000

/** Date-only comparison in the school's day, not UTC midnight. */
export function daysUntil(dueAt: string, today: string): number {
  const a = Date.parse(dueAt + 'T00:00:00Z')
  const b = Date.parse(today + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((a - b) / DAY)
}

export function addDays(ymd: string, n: number): string {
  const t = Date.parse(ymd.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(t)) return ymd
  return new Date(t + n * DAY).toISOString().slice(0, 10)
}

/**
 * HOW LONG AFTER ARRIVING before a student can be late for anything.
 *
 * A number, not a policy screen. Two weeks is a guess the school can change in
 * one place; what matters is that the rule exists at all. See
 * IB-Mobility-and-Transfers.md §8 decision 7.
 */
export const JOIN_GRACE_DAYS = 14

/**
 * The date before which NOTHING this student owes can be counted late.
 *
 * INVARIANT #8: a requirement is never overdue before the student could have
 * started it. This is the mobility twin of `opensAfter` — that one says a
 * requirement cannot be late before its opener is done, this one says it cannot
 * be late before the student arrived. A DP2 joiner would otherwise open their
 * first screen to forty red cells for deadlines that passed while they were at
 * another school, which is the endless-list problem wearing a different hat.
 *
 * Crucially it is a RULE, not a configuration: it reads one date every student
 * already has, applies identically to all of them, and adds no per-student
 * requirement setting anywhere — which is the line the spine exists to hold.
 */
export function lateFrom(student: { joinedAt?: string } | null | undefined): string | null {
  if (!student?.joinedAt) return null
  return addDays(student.joinedAt, JOIN_GRACE_DAYS)
}

/**
 * Attach the applicable deadline to a checkpoint.
 *
 * `late` is FALSE for anything already done and for anything 'future' — a
 * requirement whose opener is not complete is nobody's turn yet, so it cannot
 * be overdue. That rule is from the settled doc and it matters: without it, the
 * RPF is late the moment the viva date passes, whether or not the viva happened.
 */
export function withDue(
  cp: Checkpoint,
  deadlines: Deadline[],
  today: string,
  /** From `lateFrom(student)` — omitted means the student started with the cohort. */
  notBefore?: string | null,
  /** Whose track this is, so a per-student extension can be found. */
  studentId?: string | null,
): Checkpoint {
  const d = deadlineFor(deadlines, cp.def, studentId)
  if (!d) return cp
  const daysAway = daysUntil(d.dueAt, today)

  // Lateness is measured from the LATER of the deadline and the student's
  // grace date. `dueAt` and `daysAway` are untouched: the cohort's date is the
  // record and the student should still see it. Only the verdict moves.
  const deferred = notBefore != null && notBefore > d.dueAt
  const measureFrom = deferred ? notBefore : d.dueAt

  const due: CheckpointDue = {
    dueAt: d.dueAt,
    isMajor: d.isMajor,
    late:
      cp.display !== 'done' &&
      cp.display !== 'future' &&
      daysUntil(measureFrom, today) < 0,
    daysAway,
    ...(deferred ? { deferredTo: notBefore } : {}),
  }
  return { ...cp, due }
}

/**
 * THE STUDENT'S NON-DISMISSIBLE WARNING, derived.
 *
 * Michael, 19 Aug: a warning that does not go away until the work is in —
 * especially for anything the IB receives. This is not the alert engine the
 * standing cautions forbid: it ranks nothing, pushes nothing, and cannot be
 * dismissed, because it is not a message. It is the state of the record, and it
 * ends when the record changes.
 *
 * Qualifies when: the IB receives it (`exportTarget`), it is the STUDENT's to
 * record, and it is not in. One aggregated warning, never one per item — nine
 * banners on a DP1 student's home would teach them to scroll past.
 */
export function studentOwedToIb(checkpoints: Checkpoint[]): Checkpoint[] {
  return checkpoints.filter(
    (c) =>
      c.def.exportTarget != null &&
      c.def.recordedBy === 'student' &&
      c.display !== 'done' &&
      c.display !== 'future',
  )
}

/** How loud the warning is. Presence never changes; weight does. */
export function warningLevel(owed: Checkpoint[]): 'none' | 'quiet' | 'soon' | 'late' {
  if (owed.length === 0) return 'none'
  if (owed.some((c) => c.due?.late)) return 'late'
  if (owed.some((c) => c.due != null && c.due.daysAway <= 14)) return 'soon'
  return 'quiet'
}

/**
 * THE STAGE a def belongs to — the half of its key that a deadline is keyed by.
 *
 *   'bio_sl.file'    → 'file'        (course-scoped: everything after the course id)
 *   'bio_sl.pg.p2'   → 'pg.p2'
 *   'tok.essay'      → 'essay'
 *   'ib.auth'        → 'ib.auth'     (programme-scoped: the whole key IS the stage)
 *
 * Course ids never contain a dot, which is what makes the first dot the seam.
 */
export function stageOf(def: RequirementDef): string {
  if (def.scope.kind === 'programme') return def.key
  const i = def.key.indexOf('.')
  return i < 0 ? def.key : def.key.slice(i + 1)
}

// ---------------------------------------------------------------------------
// WHO OWNS A DATE — the rule, stated once, in data
// ---------------------------------------------------------------------------

/**
 * THE ONE RULE (settled with Michael, 22 Aug 2026):
 *
 *   A stage may carry a date only if the STUDENT does the work,
 *   or it is a reporting commitment the COORDINATOR owns.
 *
 * Everything else follows. A mark has no due date — marking is staff work and a
 * date on it is pressure with nothing behind it; the coordinator's predicted-
 * grade points already say when marks are needed, because a predicted grade IS
 * the mark by the time it matters. A teacher comment has no date for the same
 * reason. This is not a filter applied on the way to a screen — an undatable
 * stage cannot be dated by anyone, so there is no date to leak.
 *
 * `tier` then says WHO may set the ones that exist:
 *
 *   'programme' → the coordinator's Due Date Centre. Moving it moves more than
 *                 one course, or the IB is waiting for it.
 *   'course'    → a module milestone. The designated marker sets it for their
 *                 own course, or leaves it blank and runs their own pacing
 *                 elsewhere. Unset is a legitimate, permanent state.
 *   'none'      → not a date. Nobody sets it, including the coordinator.
 *
 * A 'course' tier never means the coordinator is locked out — she sets
 * anything. It means the teacher is not.
 */
export type DeadlineTier = 'programme' | 'course' | 'none'

/**
 * Stages that are dated even though a student does not record them.
 *
 * Predicted grades: the coordinator's three reporting points, staff-facing.
 * CAS `complete`: the coordinator confirms it, but the WORK is the candidate's
 * and "CAS finished by 1 April" is a real school deadline. It is the only
 * coordinator-recorded stage a candidate sees a date for, and it is named here
 * rather than inferred, so adding a second one is a decision somebody makes.
 */
const COORDINATOR_DATED = new Set(['complete'])
const isPgStage = (stage: string) => stage.startsWith('pg.')

/**
 * MODULE MILESTONES — the teacher's dates, by lane.
 *
 * Deliberately short. These are the dates that never leave one classroom: if
 * the TOK teacher moves the exhibition by a week, nobody outside TOK needs to
 * know. Everything else datable — the final PDF the IB receives, the EE
 * calendar, CAS completion, the reporting points — is programme-wide and the
 * coordinator's, because moving it means telling more than one person.
 *
 * Keyed by LANE as well as stage because `draft` means two different things:
 * an IA draft is the subject teacher's pacing, while the EE draft is a date on
 * the programme's EE calendar set at the planning meeting.
 */
const TEACHER_MILESTONES: Record<string, ReadonlySet<string>> = {
  'TOK': new Set(['title', 'prompt', 'exh']),
  'Internal assessment': new Set(['proposal', 'draft']),
}

/** The defs a stage covers, in one cohort's worth of definitions. */
function defsOfStage(stage: string, defs: RequirementDef[]): RequirementDef[] {
  return defs.filter((d) => stageOf(d) === stage)
}

/**
 * MAY A CANDIDATE SEE THIS DATE?
 *
 * One rule, used by the track, the home list and the due-date resolution alike,
 * so the three cannot drift apart again. (They had three different filters on
 * 21 Aug, and one of them was showing thirty teachers' marking deadlines to the
 * students whose work was being marked.)
 *
 * The warning on the student's home page is deliberately NARROWER than this —
 * it adds `exportTarget != null`, because it is about what the IB will not
 * receive, not about everything with a date. One rule for whether a date shows;
 * a second, tighter one for whether it shouts.
 */
export function studentMaySee(def: RequirementDef): boolean {
  return def.recordedBy === 'student' || COORDINATOR_DATED.has(stageOf(def))
}

/** Which tier a stage belongs to. See `DeadlineTier`. */
export function tierOfStage(stage: string, defs: RequirementDef[]): DeadlineTier {
  if (isPgStage(stage)) return 'programme'
  const hits = defsOfStage(stage, defs)
  if (hits.length === 0) return 'none'
  if (!hits.every(studentMaySee)) return 'none'
  const lane = hits[0].lane
  return TEACHER_MILESTONES[lane]?.has(stage) ? 'course' : 'programme'
}

/** Why a row is locked for this viewer — the sentence the screen shows. */
export function lockReason(tier: DeadlineTier, isMarker: boolean): string {
  if (tier === 'none') return 'not a due date'
  if (tier === 'programme') return 'the coordinator\u2019s'
  return isMarker ? '' : 'not your course'
}

/**
 * The stages that exist in a cohort, each with a human label and whether it is
 * naturally cohort-wide (every course has it, so one date covers them all).
 * Derived from the defs, so a new module's stages appear in the picker the day
 * its definitions do.
 */
export function stagesIn(defs: RequirementDef[]): {
  key: string
  label: string
  cohortWide: boolean
  lane: string
  /** Who may set it. 'none' stages are not offered to anybody. */
  tier: DeadlineTier
}[] {
  const seen = new Map<string, { key: string; label: string; cohortWide: boolean; lane: string; n: number }>()
  for (const def of defs) {
    const key = stageOf(def)
    const tail = def.label.includes(' — ') ? def.label.split(' — ').slice(1).join(' — ') : def.label
    const prev = seen.get(key)
    if (prev) prev.n += 1
    else seen.set(key, { key, label: tail, cohortWide: false, lane: def.lane, n: 1 })
  }
  // A stage on many courses is one a cohort-wide date makes sense for; a stage
  // on one course (the core modules) is named by that course and is not.
  return [...seen.values()]
    .map((s) => ({
      key: s.key, label: s.label, cohortWide: s.n > 1, lane: s.lane,
      tier: tierOfStage(s.key, defs),
    }))
    .sort((a, b) => a.lane.localeCompare(b.lane) || a.label.localeCompare(b.label))
}
