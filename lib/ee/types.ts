// EE module-owned entities. The spine does not know these exist — it sees only
// RequirementStates, which the module records or derives (IB-CAS-Build-Plan.md
// §2, the rule that generalises to every module).

import type { Id } from '../types'

/**
 * WHO SUPERVISES WHOM. One row per student per supervisor, history preserved.
 *
 * Why this is a module-owned table and not a Section per supervisor — which was
 * the recommendation until the code was read:
 *
 * `lib/data/fixtures.ts` records a settled product decision from August 2026 —
 * "EXACTLY ONE section per running course per cohort … nothing user-facing ever
 * shows a section label again". Supervisor-as-section would put N sections on
 * the EE course and quietly reopen a decision that was made deliberately, to
 * buy a reassignment path this table gives anyway. It would also lose
 * `endedAt`: a section move leaves no trace of who supervised before, and the
 * one thing EE supervision history has to survive is a supervisor leaving.
 *
 * So: sections stay invisible, and supervision lives with the module that
 * means something by it.
 */
export interface EeSupervision {
  schoolId: Id
  cohortId: Id
  studentId: Id
  supervisorId: Id
  assignedBy: Id
  assignedAt: string
  /** Set when the assignment ends. The row is never deleted — see the file note. */
  endedAt?: string | null
}

/** The resolved answer to "who is responsible for this student's EE right now?" */
export interface ResolvedSupervisor {
  /** Never null. See INVARIANT #12 in lib/ee/supervision.ts. */
  userId: Id
  name: string
  /**
   * True when nobody has been assigned and this is the EE coordinator standing
   * in. It is not a warning — it is the correct state in September — but it
   * must never be invisible, because an attestation signed while acting is a
   * different fact from one signed by the supervisor who held the sessions.
   */
  acting: boolean
}
