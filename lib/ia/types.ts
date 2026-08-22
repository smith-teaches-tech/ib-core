// The IA marks module's own view shapes — module-owned, like CAS's.
//
// This is NOT a coordinator-view exception (spine architecture §0): the board
// still reads everything it needs through getBoard(). These shapes exist for the
// module's own screen — the mark-entry grid — which shows the VALUES the board
// deliberately compresses to fractions.

import type { Course } from '../types'
import type { IaCriterion } from '../templates'
import type { FileView } from '../files'
import type { ReturnView } from '../returns'
import type { ReleaseBlock } from '../release'

export interface IaMarksRow {
  studentId: string
  name: string
  /** IBIS lists candidates in session-number order; the grid does too. */
  sessionNumber: string | null
  personalCode: string | null
  /** Aligned to the template's criteria; [] when the family is total-only. */
  criterionMarks: (number | null)[]
  /** Total-only mark, for families whose criterion split is unconfirmed. */
  mark: number | null
  /** THE DERIVED TOTAL — iaTotal(), never stored. null until every criterion is in. */
  total: number | null
  comment: string | null
  fileDisplay: 'done' | 'partial' | 'not_started'
  /**
   * THE PAPER ITSELF — null when nothing is uploaded, which is a state the grid
   * and the reader both have to draw rather than hide (§4, state 1).
   *
   * `fileDisplay` stays beside it and is NOT derived from this: a state can be
   * `in_progress` with no artifact yet, and the box on the board has always
   * meant "what has been recorded", not "is there a ref".
   */
  file: FileView | null
  /**
   * THE RETURN THAT IS STILL OUTSTANDING, or null.
   *
   * Beside `file` rather than inside it, because it is about the ABSENCE of a
   * file: it is only ever set when nothing is filed, and it says why nothing is
   * filed. A row with `file: null` and no `returned` is a candidate who has not
   * got round to it; one with `returned` is a candidate who was told to do it
   * again, and the grid should not draw those the same.
   */
  returned: ReturnView | null
  /** exportStatus === 'submitted' on the mark state: typed into IBIS. */
  typed: boolean
  locked: boolean
  /**
   * WHEN THE CANDIDATE WAS LET SEE IT, or null.
   *
   * Releasing is NOT required — a teacher may hand marks back in class, and
   * nothing downstream waits on this: IBIS transcription rides `exportStatus`,
   * a separate axis entirely. It only works the other way, as a lock: once
   * released the mark is not editable in place, and the paper cannot be
   * returned until it is revoked.
   */
  releasedAt: string | null
  /** Why this row cannot be released yet. Empty when it can. */
  releaseBlockers: ReleaseBlock[]
}

export interface IaMarksView {
  course: Course
  cohortId: string
  component: string
  criteria: IaCriterion[]
  markMax: number
  guide: string
  verify: string | null
  /** What this component takes, off the def. Shown when nothing is uploaded. */
  accepts?: string[]
  /** Does the file go to eCoursework? Drives the "to the IB" tag in the reader. */
  exportsToIb: boolean
  /** The designated marker's name, if one is set. */
  marker: string | null
  rows: IaMarksRow[]
}

// ---------------------------------------------------------------------------
// The audit trail — APPEND-ONLY. Events are never edited and never deleted.
// ---------------------------------------------------------------------------

export type MarkEventKind =
  | 'mark' | 'comment' | 'transcribe' | 'unlock' | 'relock'
  // Putting the mark and its justification in front of the candidate, and
  // taking it back. Both are recorded acts: a released mark cannot be edited
  // in place, so the way to change one is to revoke it, and that is a fact
  // somebody asks about later.
  | 'release' | 'revoke'
  // Predicted grades share this trail rather than starting a second one: it is
  // the same course, the same audience, and the same question ("what changed
  // here, and who"). `pg` is a grade written; `pg_unlock` is a locked grade
  // opened for change, and carries the reason that was required to open it.
  | 'pg' | 'pg_unlock'
  // A paper sent back with a note. NOT stored on this trail — ReturnEvent is
  // the record (lib/returns.ts) and `listMarkEvents` folds it in on read, so
  // the course's history is one list without the act being written twice.
  | 'return'

/**
 * One recorded change to a course's marks. Every write through the IA
 * repository appends exactly one of these; nothing anywhere mutates one.
 *
 * `at` is a FULL ISO instant, deliberately unlike the spine's date-only
 * stamps — an audit trail needs the minute, not just the school day.
 */
export interface MarkEvent {
  id: string
  schoolId: string
  cohortId: string
  courseId: string
  /** Null for unlock/relock — those are course-level acts, not per-student. */
  studentId: string | null
  kind: MarkEventKind
  /** The criterion key for mark events ('A', 'B1', …), or 'total' for a total-only family. */
  criterion?: string
  prev: string | number | null
  next: string | number | null
  byUserId: string
  at: string
  /** Set when the write rode a coordinator unlock rather than markership. */
  overrideReason?: string
}

/** The same event with names resolved, ready to list. Newest first. */
export interface MarkEventRow {
  id: string
  at: string
  kind: MarkEventKind
  byName: string
  studentName: string | null
  criterion: string | null
  prev: string | number | null
  next: string | number | null
  overrideReason: string | null
  /** The returned-with note, on a `return` row. Null on every other kind. */
  note?: string | null
}

/**
 * The IBIS moderation sample for one course × cohort.
 *
 * The flow it records: the coordinator enters every candidate's total into
 * IBIS; IBIS names the sampled candidates; the school uploads those
 * candidates' IA files and scores to eCoursework. At most ONE of these lives
 * per course + cohort — saving a new selection replaces the draft, and
 * amending a submitted one reopens it as a draft.
 */
export interface SampleRequest {
  id: string
  schoolId: string
  cohortId: string
  courseId: string
  /** The sampled candidates, by user id. */
  studentIds: string[]
  recordedBy: string
  recordedAt: string
  status: 'draft' | 'submitted'
  /** Set when status is 'submitted' — when it was marked done in eCoursework. */
  submittedAt?: string
}

/**
 * A coordinator's temporary permission to edit a course's marks. Not an event:
 * this is operational state (it expires, it can be ended early); the acts of
 * unlocking and relocking are what land on the trail.
 */
export interface MarkUnlock {
  id: string
  schoolId: string
  cohortId: string
  courseId: string
  userId: string
  reason: string
  createdAt: string
  /** createdAt + 30 minutes. Enforced on every read — the auto re-lock. */
  expiresAt: string
}
