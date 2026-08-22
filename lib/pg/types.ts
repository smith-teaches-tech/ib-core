// The predicted-grades module's own view shapes and its reporting points.
//
// Same rule as lib/ia/types.ts: these exist for the module's own screen, which
// shows the VALUES the coordinator board compresses to fractions. The board
// still reads everything it needs through getBoard().

import type { Course, GradeScaleKey } from '../types'

/**
 * THE THREE REPORTING POINTS.
 *
 * Hardcoded here for now, and that is a decision with an expiry date: the spec
 * (IB-Predicted-Grades-Spec.md §1) makes these a `ReportingPoint` object on the
 * session, because the labels are still open and a school that reports four
 * times a year is not wrong. Everything downstream already reads this array
 * rather than the literals, so promoting it to session data is a repository
 * method and no change anywhere else.
 *
 * ONLY THE LAST ONE GOES TO THE IB. That is the single fact that makes the
 * April column different, and it is carried by `exportTarget` on the def — not
 * by a component knowing that April is special.
 */
export interface ReportingPoint {
  /** The def key suffix: `<courseId>.pg.p1`. */
  key: 'p1' | 'p2' | 'p3'
  label: string
  /** True for the point that is transcribed into IBIS. */
  toIb: boolean
}

/**
 * NO DATE LIVES HERE. These three carried advisory prose — "June, end of DP1",
 * "April, with the IA marks" — which read as a deadline while being nobody's
 * decision, and stayed on screen whether or not the coordinator had set the
 * real one. Michael, 22 Aug: *"nothing hardcoded... set by coordinator in case
 * this changes in the future."* A column now shows the date she set, or it
 * shows nothing.
 *
 * The predicted-grade points are also where "when do I need the marks?" is
 * answered: a predicted grade is what an IA mark becomes by the time it
 * matters, so `.mark` has no date of its own. See lib/deadlines.ts.
 */
export const REPORTING_POINTS: ReportingPoint[] = [
  { key: 'p1', label: 'End Y1', toIb: false },
  { key: 'p2', label: 'Jan Y2', toIb: false },
  { key: 'p3', label: 'Apr Y2', toIb: true },
]

/** The def key for one course × one point. The ONE place this string is built. */
export const pgKey = (courseId: string, point: ReportingPoint['key']) =>
  `${courseId}.pg.${point}`

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

export interface PgCell {
  /** The recorded grade, exactly as written ('5', 'B'), or null. */
  grade: string | null
  /**
   * Locked means: recorded, and not currently open for change. It is a guard
   * against a stray keystroke, NOT a permission boundary — whoever may write
   * may unlock, with a reason. See lib/pg/actions.ts.
   */
  locked: boolean
  /** Who recorded it, and when — shown in the unlock panel, not in the grid. */
  by: string | null
  at: string | null
  /** The reason given the last time this grade was opened for change. */
  openReason: string | null
}

export interface PgRow {
  studentId: string
  name: string
  /** IBIS candidate order, same as the marks grid. */
  sessionNumber: string | null
  /** The IA total, as EVIDENCE. Read-only here; the IA screen owns it. */
  iaTotal: number | null
  iaMax: number | null
  /** One per reporting point, in REPORTING_POINTS order. */
  cells: PgCell[]
}

export interface PgView {
  course: Course
  cohortId: string
  scale: GradeScaleKey
  points: ReportingPoint[]
  /**
   * The DUE DATE for each point, aligned to `points`, or null where none is set.
   *
   * The point's own `due` string is advisory prose ("April, with the IA marks").
   * This is the real date, out of the Deadline record — set once by the
   * coordinator and seen by every teacher above the cells they have to fill.
   */
  pointDue: (string | null)[]
  /** The designated marker's name, if one is set. */
  marker: string | null
  rows: PgRow[]
}

// ---------------------------------------------------------------------------
// The whole-student view — what the candidate panel renders
// ---------------------------------------------------------------------------

export interface PgStudentCourse {
  courseId: string
  courseName: string
  scale: GradeScaleKey
  /** One per reporting point; null where nothing is recorded. */
  grades: (string | null)[]
}

export interface PgStudentView {
  points: ReportingPoint[]
  courses: PgStudentCourse[]
  /**
   * How many of this student's predicted-grade requirements are filled at each
   * point, out of how many apply. The honest denominator: a student taking six
   * subjects plus TOK has seven, and nobody has to know that number in advance.
   */
  filled: { done: number; total: number }[]
}
