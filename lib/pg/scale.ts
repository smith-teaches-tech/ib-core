// THE SCALES A PREDICTED GRADE IS RECORDED ON — as data, not as a branch.
//
// This tiny file is what makes "the predicted-grades screen is the same screen
// for every course" true rather than aspirational. A subject predicts 1–7; TOK
// predicts a letter A–E. Those are the only two differences between Biology's
// predicted-grades screen and TOK's, and both live here, so the grid never asks
// what kind of course it is looking at — it asks the def for its scale and
// renders the values it is given.
//
// Adding a third scale later (a retake band, a school-internal 1–9) is a row in
// this array. It is deliberately NOT possible to add one by editing a
// component.

import type { GradeScaleKey } from '../types'

export interface GradeScale {
  key: GradeScaleKey
  /** Every legal value, in the order they should be offered. */
  values: string[]
  /** What the column header says under the point name. */
  label: string
  /** For the cell input: a single character is enough for both scales today. */
  placeholder: string
}

export const GRADE_SCALES: Record<GradeScaleKey, GradeScale> = {
  points_1_7: {
    key: 'points_1_7',
    values: ['1', '2', '3', '4', '5', '6', '7'],
    label: '1–7',
    placeholder: '–',
  },
  letter_a_e: {
    key: 'letter_a_e',
    values: ['A', 'B', 'C', 'D', 'E'],
    label: 'A–E',
    placeholder: '–',
  },
}

export const scaleOf = (key: GradeScaleKey | undefined): GradeScale =>
  GRADE_SCALES[key ?? 'points_1_7']

/**
 * THE one validity check. Returns the canonical value ('b' → 'B') or null.
 *
 * Deliberately not a regex in the action and another in the component: a
 * predicted grade is valid exactly when it is one of the scale's values, and
 * every caller — server action, repository, checkpoint harness — asks here.
 */
export function normaliseGrade(
  raw: string | null | undefined,
  scaleKey: GradeScaleKey | undefined,
): string | null {
  if (raw == null) return null
  const v = raw.trim().toUpperCase()
  if (v === '') return null
  return scaleOf(scaleKey).values.includes(v) ? v : null
}

/** Is this a grade the IB would accept for this scale? Used to refuse a write. */
export const isValidGrade = (raw: string, scaleKey: GradeScaleKey | undefined): boolean =>
  normaliseGrade(raw, scaleKey) != null
