// THE one answer to "may this user write this course's predicted grades?"
//
// Factored out like lib/ia/authorize.ts so the checkpoint harness exercises the
// same decision the server actions apply.
//
// The rule (product owner's decision, 2026-08-18) — and note how it DIFFERS
// from the IA rule next door, because the two are different acts:
//
//   1. The DESIGNATED MARKER of a section of the course containing the student
//      writes. Same person as for the IA: one person is accountable per course.
//   2. THE COORDINATOR TIER WRITES DIRECTLY — no unlock ceremony, no 30-minute
//      window. An IA mark is a submission the school designated somebody else
//      to make, so a coordinator reaching into it should cost something. A
//      predicted grade is a professional judgement the coordinator is jointly
//      accountable for: they are the person who types the April set into IBIS
//      and signs for it. Making them ask permission to touch it would be
//      theatre.
//   3. Everyone else: no.
//
// The per-cell LOCK is a separate mechanism aimed at a different problem
// (accidental change) and applies to both of the above equally — see
// lib/pg/actions.ts. Being allowed to write does not mean being allowed to
// overwrite.

import type { IaRepository } from '../data/repository'
import type { CapabilityKey } from '../types'
import type { PgStudentView } from './types'

export interface PgWriteGrant {
  allowed: boolean
  /** 'marker' | 'coordinator' — which rule admitted them. Lands on the trail. */
  as: 'marker' | 'coordinator' | null
}

/**
 * The coordinator tier, identified by CAPABILITY rather than by role name —
 * the same test the course page already uses to decide who may read any course.
 * `marks.transcribe` is the person who sits with IBIS open and types the April
 * set in, which is exactly the person this rule means. No preset gives it to a
 * teacher.
 */
export const isCoordinatorTier = (can: (c: CapabilityKey) => boolean) =>
  can('marks.transcribe') || can('marks.override')

export async function pgWriteGrant(
  ia: IaRepository,
  can: (capability: CapabilityKey) => boolean,
  schoolId: string,
  courseId: string,
  cohortId: string,
  studentId: string,
  userId: string,
): Promise<PgWriteGrant> {
  if (await ia.isMarkerFor(schoolId, courseId, cohortId, userId, studentId)) {
    return { allowed: true, as: 'marker' }
  }
  if (isCoordinatorTier(can)) return { allowed: true, as: 'coordinator' }
  return { allowed: false, as: null }
}

/**
 * CROSS-COURSE VISIBILITY, applied.
 *
 * Without `grades.cross_course` a teacher still sees this candidate's predicted
 * grades — but only for the courses they actually teach. That is strictly more
 * useful than hiding the section, and it is the honest reading of the
 * capability's name: the thing being granted is seeing the OTHER courses.
 *
 * `filled` is recomputed rather than carried over, because a fraction counted
 * over rows that are no longer shown is a lie in a small font.
 */
export function restrictStudentView(
  view: PgStudentView,
  allowedCourseIds: Set<string>,
): { view: PgStudentView; hidden: number } {
  const courses = view.courses.filter((c) => allowedCourseIds.has(c.courseId))
  return {
    hidden: view.courses.length - courses.length,
    view: {
      ...view,
      courses,
      filled: view.points.map((_, i) => ({
        done: courses.filter((c) => c.grades[i] != null).length,
        total: courses.length,
      })),
    },
  }
}
