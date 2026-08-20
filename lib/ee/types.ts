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
  /**
   * The DP subjects this student is most likely to pick — derived from their
   * enrolments. A SHORTLIST shown first, never a restriction: the full DP
   * subject list is always available beneath it (lib/ee/subjects.ts).
   */
  likelySubjects: string[]
  /** The three reflection sessions, recorded or not. */
  sessions: EeSession[]
  notes: EeSessionNote[]
  /**
   * Is the RPF writable? True once the viva is recorded. The panel is ALWAYS
   * visible so a student knows it is coming — it is the writing that is gated.
   */
  rpfOpen: boolean
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
  /** The three sessions and BOTH sides' notes — the supervisor sees the student's too. */
  sessions: EeSession[]
  notes: EeSessionNote[]
}

// ---------------------------------------------------------------------------
// Reflection sessions — the three required meetings, and what was said
// ---------------------------------------------------------------------------

export type SessionStage = 'r1' | 'r2' | 'viva'

/**
 * A reflection session that HAPPENED.
 *
 * `heldOn` and `recordedAt` are separate on purpose. Michael, 20 Aug: the date
 * of the interaction is what matters, and it is routinely typed in weeks later.
 * Collapsing them would make the record say the meeting happened the day
 * somebody got round to filing it, which is exactly the kind of quiet
 * inaccuracy the authenticity trail exists to prevent.
 *
 * `onBehalf` covers the case Michael named plainly: "sometimes teachers don't
 * do their work." A coordinator can record a session the supervisor held but
 * never filed — which unlocks the RPF through the ordinary `opensAfter` route
 * rather than through an override. The record then says who filed it, and the
 * viva is never marked as having happened when it did not.
 *
 * The ee.r1 / ee.r2 / ee.viva RequirementStates are DERIVED from these rows —
 * the CAS pattern (IB-CAS-Build-Plan.md §2). Nothing is stored twice.
 */
export interface EeSession {
  schoolId: Id
  studentId: Id
  stage: SessionStage
  /** The day the meeting actually happened. */
  heldOn: string
  recordedBy: Id
  recordedByName: string
  recordedAt: string
  /** Set when a coordinator filed it for the supervisor who should have. */
  onBehalf?: boolean
}

/**
 * A note about a session — from EITHER side.
 *
 * Michael, 20 Aug: both the student and the supervisor may add one, and the
 * supervisor sees both. The student's own account of a meeting, written at the
 * time, is authenticity evidence of a kind a supervisor's note alone cannot be:
 * it is the candidate's voice on the record, dated.
 *
 * Optional, always. A required reflection note would produce twenty-four
 * identical sentences and evidence nothing.
 */
export interface EeSessionNote {
  id: Id
  schoolId: Id
  studentId: Id
  stage: SessionStage
  authorType: 'student' | 'staff'
  authorId: Id
  authorName: string
  body: string
  createdAt: string
}
