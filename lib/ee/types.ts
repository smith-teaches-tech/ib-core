// EE module-owned entities. The spine does not know these exist — it sees only
// RequirementStates, which the module records or derives (IB-CAS-Build-Plan.md
// §2, the rule that generalises to every module).

import type { Id, StoredRef } from '../types'
import type { ReturnView } from '../returns'

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
  /**
   * DP subjects somebody at the school actually teaches — derived from teaching
   * assignments. Used to WARN, never to filter the list: a subject nobody
   * teaches is a supervision problem for the coordinator to solve, not a
   * registration the system should refuse.
   */
  supportedSubjects: string[]
  /** The three reflection sessions, recorded or not. */
  sessions: EeSession[]
  notes: EeSessionNote[]
  /**
   * Is the RPF writable? True once the viva is recorded. The panel is ALWAYS
   * visible so a student knows it is coming — it is the writing that is gated.
   */
  rpfOpen: boolean
  /**
   * THE ESSAY CAME BACK, and nothing has been filed since (lib/returns.ts).
   *
   * Sits beside `final` rather than on it, because a returned essay HAS no
   * final — the row went with the filing. This is what stops the screen drawing
   * that as "never started".
   */
  returned: ReturnView | null
  /** The finished essay, if it has been filed. */
  final: EeFinal | null
  /** The reflection statement, once submitted. Locks on submission. */
  rpf: { body: string; words: number; submittedAt: string } | null
  /** The released score, if the supervisor has released it. Students see nothing before that. */
  releasedScore: { marks: (number | null)[]; total: number; band: string | null } | null
  /** Locked once filed; only an `items.unlock` holder reopens it. */
  finalLocked: boolean
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
  /**
   * Registered subjects nobody at the school teaches. The EE coordinator's
   * worklist: these candidates need a supervisor found for them.
   */
  unsupportedSubjects: string[]
  /**
   * THE ESSAY CAME BACK, and nothing has been filed since (lib/returns.ts).
   *
   * Sits beside `final` rather than on it, because a returned essay HAS no
   * final — the row went with the filing. This is what stops the screen drawing
   * that as "never started".
   */
  returned: ReturnView | null
  /** The finished essay, so a supervisor can see it is in before the viva. */
  final: EeFinal | null
  /** Filed essays are locked; only an `items.unlock` holder reopens one. */
  finalLocked: boolean
  /**
   * The student's process documents. Michael asked for this in the first pass —
   * "EE coordinator can see everyone and the supervisor and all links and
   * files" — and the first staff screen shipped without them, which made the
   * drawer a summary of work nobody could open.
   */
  links: { stage: 'outline' | 'draft'; label: string; href: string; addedAt: string }[]
  /** The reflection statement — the supervisor reads it to mark Criterion E. */
  rpf: { body: string; words: number; submittedAt: string } | null
  /** Marks entered so far. `null` per criterion means not yet marked. */
  marks: (number | null)[]
  scoring: EeScoring | null
}

/** Somebody who can be given a supervisee. Staff at the school, students excluded. */
export interface EeAssignableStaff {
  userId: Id
  name: string
  /** How many supervisees they already hold in this cohort. */
  load: number
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

// ---------------------------------------------------------------------------
// The finished essay
// ---------------------------------------------------------------------------

/**
 * THE FINAL PDF — and the lock that is the point of it.
 *
 * Michael, 20 Aug: "Final PDF goes in before viva voce so teacher can get ready
 * for viva voce… This is to lock the paper so that it is not changed before/
 * after the viva voce."
 *
 * That is the whole reason the essay stops being a Google Doc link at this
 * step. A link is a live document: it can be edited the night before the viva,
 * or the night after, and the version the supervisor read is gone. A PDF filed
 * here is a fixed artefact, and `ee.viva` carries `opensAfter: 'ee.final'` so
 * the sequence is in the record rather than in everyone's memory.
 *
 * WHY THIS IS A STORED RequirementState AND NOT DERIVED, unlike the sessions:
 * the export module WRITES to `ee.final` — `setJobSubmitted` stamps
 * `exportStatus` onto it when the pack goes to eCoursework. A derived state
 * cannot carry another module's write. So the state is the record and this
 * table carries the detail beside it.
 */
export interface EeFinal {
  schoolId: Id
  studentId: Id
  fileName: string
  /**
   * THE FILE, as one record.
   *
   * Was `storageKey?: string` + `bytes?: number` until 22 Aug — two thirds of a
   * StoredRef, missing the mime, and a second copy of what the requirement
   * state's artifact already carried. It is the same ref that hangs off
   * `ee.final`'s artifact (lib/files.ts), not a copy of it: the artifact is the
   * record every reader already looks at, and this row points at it.
   */
  ref?: StoredRef
  /** What the STUDENT counted. Not measured — see lib/anonymity.ts. */
  declaredWords: number
  submittedAt: string
  /** Cleared only by an `items.unlock` holder, with a typed reason. */
  unlockedBy?: Id
  unlockedByName?: string
  unlockReason?: string
  unlockedAt?: string
}

/**
 * THE SUPERVISOR'S SCORING RECORD — everything around the marks that is not a
 * mark. The marks themselves live on `ee.score`'s `criterionMarks`, because
 * scoring an EE is the IA marks module doing its job (IB-EE-Build-Plan.md §4).
 */
export interface EeScoring {
  schoolId: Id
  studentId: Id
  /**
   * The written justification. Michael, 20 Aug: "Supervisor also needs to write
   * a few sentences after grading to justify score/authenticity."
   *
   * Staff-only, and it travels with the RPF to the IB. Examiner reports say
   * repeatedly that per-criterion justification materially helps a moderator —
   * and it is what an authenticity query is answered from a year later.
   */
  comment: string
  hoursSupervised: number | null
  /**
   * TWO TICKS, deliberately. An acting supervisor can honestly confirm the work
   * is the candidate's own without claiming to have held sessions they were not
   * at. One combined tick would force a false claim or an unsigned attestation.
   */
  attestedSessions: boolean
  attestedAuthentic: boolean
  attestedBy?: Id
  attestedByName?: string
  attestedAt?: string
  releasedBy?: Id
  releasedByName?: string
  releasedAt?: string
}
