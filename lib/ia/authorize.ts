// THE one answer to "may this user write this course's marks for this student?"
//
// Factored out of the server actions so the checkpoint harness (which has no
// request scope and so cannot call an action) exercises the same decision the
// actions apply. Both callers hand in the repository and a `can` — the actions
// pass session.can, the harness passes whatever capability set it is testing.
//
// The rule (product owner's decision, 2026-08):
//
//   1. The DESIGNATED MARKER of a section of the course containing the student
//      writes. Co-teachers are read-only — the model keeps room for them, but
//      the IB holds one person responsible for the marks.
//   2. A `marks.override` holder does NOT get direct writes. They get them only
//      while holding an unexpired unlock for the course (unlockMarks — reason
//      required, 30 minutes, every write stamped with the reason).
//   3. Everyone else: no.

import type { IaRepository } from '../data/repository'
import type { CapabilityKey } from '../types'

export interface MarksWriteGrant {
  allowed: boolean
  /** Set when the write rides a coordinator unlock rather than markership. */
  overrideReason: string | null
}

export async function marksWriteGrant(
  ia: IaRepository,
  can: (capability: CapabilityKey) => boolean,
  schoolId: string,
  courseId: string,
  cohortId: string,
  studentId: string,
  userId: string,
): Promise<MarksWriteGrant> {
  if (await ia.isMarkerFor(schoolId, courseId, cohortId, userId, studentId)) {
    return { allowed: true, overrideReason: null }
  }
  if (can('marks.override')) {
    // activeUnlock enforces the expiry — the auto re-lock lives in the repo.
    const unlock = await ia.activeUnlock(schoolId, courseId, userId)
    if (unlock) return { allowed: true, overrideReason: unlock.reason }
  }
  return { allowed: false, overrideReason: null }
}
