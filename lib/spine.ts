// The three derivation functions the whole product is built on, plus the
// student track. The coordinator board is a projection over these and lives in
// lib/board.ts — it reads them and adds nothing.
//
// Nothing here is stored. Course lists, progress counts and board cells are all
// computed — the moment one is cached, a section move desynchronises it.

import type {
  Checkpoint, Course, Enrollment, Lane, RequirementDef,
  RequirementState, Section, Student, StudentTrack, TrackLane, User,
} from './types'

const LANE_ORDER: Lane[] = [
  'CAS', 'Extended Essay', 'TOK', 'Internal assessment', 'IB admin',
]

/** A student's courses are DERIVED from their enrolments. Never stored. */
export function coursesOf(
  studentId: string,
  enrollments: Enrollment[],
  sections: Section[],
  courses: Course[],
): Course[] {
  const sectionIds = new Set(
    enrollments.filter((e) => e.studentId === studentId).map((e) => e.sectionId),
  )
  const courseIds = new Set(
    sections.filter((s) => sectionIds.has(s.id)).map((s) => s.courseId),
  )
  return courses.filter((c) => courseIds.has(c.id))
}

/**
 * THE rule, and the answer to "students take different courses":
 *
 *   requirements(student) = programme-scoped defs
 *                         ∪ defs for every course they are enrolled in
 *
 * A student in English A SL is not enrolled in English A HL, so HL requirements
 * never reach them. There is no per-level branching anywhere.
 */
export function requirementsFor(
  student: Student,
  defs: RequirementDef[],
  studentCourses: Course[],
): RequirementDef[] {
  const courseIds = new Set(studentCourses.map((c) => c.id))
  return defs
    .filter((d) => d.schoolId === student.schoolId && d.cohortId === student.cohortId)
    .filter((d) => d.scope.kind === 'programme' || courseIds.has(d.scope.courseId))
    .sort((a, b) => a.order - b.order)
}

/**
 * Absence means not-applicable, so a missing state is synthesised as not_started.
 *
 * THIS IS ALSO THE ONE PLACE DETACHED STATES ARE FILTERED (invariant #9). A
 * state whose enrolment has closed is retained but must not reach any derived
 * view, and putting the filter here rather than at each call site is what makes
 * that true of the track, the board, every count and every export at once —
 * lib/board.ts calls this function too. The student's record history is the
 * only surface that reads the raw array.
 */
export function stateOf(
  studentId: string,
  def: RequirementDef,
  states: RequirementState[],
): RequirementState | null {
  return (
    states.find(
      (s) =>
        s.studentId === studentId &&
        s.requirementDefId === def.id &&
        s.detachedAt == null,
    ) ?? null
  )
}

/** The counterpart: what a student filed against courses they have since left. */
export function detachedStatesOf(
  studentId: string,
  states: RequirementState[],
): RequirementState[] {
  return states.filter((s) => s.studentId === studentId && s.detachedAt != null)
}

function isComplete(state: RequirementState | null): boolean {
  return (
    state != null &&
    (state.recordStatus === 'submitted' ||
      state.recordStatus === 'marked' ||
      state.recordStatus === 'released')
  )
}

/**
 * How a checkpoint renders. `future` is the important one: a requirement whose
 * opener is not yet complete is visible (so the student can see what's coming)
 * but is never counted as outstanding or overdue.
 */
export function displayOf(
  def: RequirementDef,
  state: RequirementState | null,
  byKey: Map<string, RequirementState | null>,
): Checkpoint['display'] {
  if (isComplete(state)) return 'done'
  if (state?.recordStatus === 'in_progress') return 'partial'
  // An opener that is not in this student's def set can never complete — treat
  // the dependent normally rather than parking it at 'future' forever.
  if (def.opensAfter && byKey.has(def.opensAfter) && !isComplete(byKey.get(def.opensAfter) ?? null)) {
    return 'future'
  }
  return 'not_started'
}

function checkpointsFor(
  studentId: string,
  defs: RequirementDef[],
  states: RequirementState[],
): Checkpoint[] {
  const byKey = new Map<string, RequirementState | null>()
  for (const d of defs) byKey.set(d.key, stateOf(studentId, d, states))
  return defs.map((def) => {
    const state = byKey.get(def.key) ?? null
    return { def, state, display: displayOf(def, state, byKey) }
  })
}

/** ZOOM 1 — one student, full detail. The finish-line track. */
export function buildTrack(
  student: Student,
  user: User,
  defs: RequirementDef[],
  studentCourses: Course[],
  states: RequirementState[],
): StudentTrack {
  const mine = requirementsFor(student, defs, studentCourses)
  const checkpoints = checkpointsFor(student.userId, mine, states)

  const lanes: TrackLane[] = LANE_ORDER.map((lane) => {
    const cps = checkpoints.filter((c) => c.def.lane === lane)
    return {
      lane,
      checkpoints: cps,
      done: cps.filter((c) => c.display === 'done').length,
      total: cps.length,
    }
  }).filter((l) => l.total > 0)

  return {
    student,
    user,
    lanes,
    done: checkpoints.filter((c) => c.display === 'done').length,
    total: checkpoints.length,
  }
}
