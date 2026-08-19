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

/**
 * THE REGISTRATION — subject(s), research question, title.
 *
 * Three separate fields rather than one text blob, because the IBIS
 * registration export (IB-EE-research.md #12) needs them individually:
 * student · subject · title/RQ · supervisor. `ee.rq` goes `submitted` when the
 * registration validates, which is what makes the requirement mean something
 * rather than "the student typed in a box".
 */
export interface EeRegistration {
  schoolId: Id
  cohortId: Id
  studentId: Id
  /**
   * ONE subject, or TWO for the interdisciplinary pathway. An array rather than
   * a string plus an optional second, because the title page and the IBIS
   * export both treat "subject of registration" as a list.
   */
  subjects: Id[]
  /**
   * Required for, and only for, a two-subject registration. Not directly
   * assessed — but it is named on the title page and registered with the IB, so
   * a missing one is a registration error, which is the expensive kind.
   */
  framework?: string | null
  researchQuestion: string
  title: string
  updatedAt: string
  updatedBy: Id
}

/**
 * A cached answer to "can we open this Google Doc?" for one link artifact.
 *
 * Not a field on `Artifact`: that is a spine type, and growing it for one
 * module's convenience is how nine objects becomes eleven. `checkedAt` is here
 * so a stale answer can be shown as stale rather than as fact.
 */
export interface EeLinkCheck {
  artifactId: Id
  checkedAt: string
  reachable: boolean
}

// ---------------------------------------------------------------------------
// View shapes — computed on read, stored nowhere.
// ---------------------------------------------------------------------------

/**
 * What the student's own EE screen needs BEYOND the spine.
 *
 * Deliberately does not carry the checkpoints: those come from `getTrack`, so
 * the EE screen renders the same derived requirements the board and the track
 * do rather than a second opinion about them. If this view ever grows a
 * `checkpoints` field, something has started keeping its own copy.
 */
export interface EeStudentView {
  studentId: Id
  studentName: string
  registration: EeRegistration | null
  /** Live validation of the SAVED registration — empty means `ee.rq` is complete. */
  problems: { field: string; message: string }[]
  supervisor: ResolvedSupervisor | null
  /** The student's own subject courses — what they may register the essay in. */
  subjectChoices: { id: Id; name: string }[]
}

export interface EeRosterRow {
  studentId: Id
  studentName: string
  sessionNumber: string | null
  supervisor: ResolvedSupervisor | null
  registration: EeRegistration | null
  /** done / total across the ten EE requirements, from the spine. */
  done: number
  total: number
  /** Requirements past their date and not in. */
  late: number
}
