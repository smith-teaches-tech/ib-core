// The IA marks module's own view shapes — module-owned, like CAS's.
//
// This is NOT a coordinator-view exception (spine architecture §0): the board
// still reads everything it needs through getBoard(). These shapes exist for the
// module's own screen — the mark-entry grid — which shows the VALUES the board
// deliberately compresses to fractions.

import type { Course } from '../types'
import type { IaCriterion } from '../templates'

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
  /** exportStatus === 'submitted' on the mark state: typed into IBIS. */
  typed: boolean
  locked: boolean
}

export interface IaMarksView {
  course: Course
  cohortId: string
  component: string
  criteria: IaCriterion[]
  markMax: number
  guide: string
  verify: string | null
  /** The designated marker's name, if one is set. */
  marker: string | null
  rows: IaMarksRow[]
}

// ---------------------------------------------------------------------------
// The audit trail — APPEND-ONLY. Events are never edited and never deleted.
// ---------------------------------------------------------------------------

export type MarkEventKind = 'mark' | 'comment' | 'transcribe' | 'unlock' | 'relock'

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
