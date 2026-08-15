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
