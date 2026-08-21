// WHAT THE TOK MODULE OWNS.
//
// Three tables, and each one exists because the spine genuinely cannot hold it:
// a per-session list of titles, a per-session boundary table, and the teacher's
// one line per TK/PPF interaction. Everything else about TOK is a
// RequirementState like any other. IB-TOK-research.md is the design of record.

import type { Id } from '../types'
import { TOK_TOTAL_MAX } from './rubric'

// ---------------------------------------------------------------------------
// The six prescribed titles
// ---------------------------------------------------------------------------

/**
 * ⚠⚠ TITLES NEVER CARRY OVER TO A NEW COHORT. BLANK, ALWAYS.
 *
 * Michael, 21 Aug, twice: "needs to reset every new cohort… very important" and
 * "TOK Titles should NEVER carry over to new cohort! Blank for new cohort. That
 * could lead to a MAJOR issue."
 *
 * He is right, and the failure is expensive: the IB issues six new titles every
 * session, and an essay written on last May's title is not a response to one of
 * the prescribed titles for the correct examination session — the bottom band,
 * zero. Cohort cloning reuses the same instantiation path (IB-Build-Status.md,
 * architectural rule 2), so this is AN EXCLUSION SOMEBODY HAS TO WRITE, not a
 * default that happens by itself. Asserted in the checkpoint.
 *
 * (Contrast TokBoundaryTable below, which DOES carry forward — deliberately the
 * opposite rule, on the same screen. Both are asserted.)
 */
export interface TokTitle {
  /** 1–6, the IB's own numbering, which the school's filenames also use. */
  number: number
  text: string
  /**
   * Who put it there. A student may type their own title when the teacher has
   * not posted the six yet (Michael's fallback) — it shows as `student` in the
   * teacher's list and can be adopted into the posted set.
   */
  source: 'teacher' | 'student'
  addedBy: Id
  addedAt: string
}

export interface TokTitleSet {
  schoolId: Id
  cohortId: Id
  /** Empty for every new cohort. Never seeded, never cloned. */
  titles: TokTitle[]
  postedBy?: Id
  postedAt?: string
}

export const PRESCRIBED_TITLE_COUNT = 6

/** A set is only "posted" once all six are in — five is a half-finished job. */
export function titlesArePosted(set: TokTitleSet | null | undefined): boolean {
  if (!set) return false
  return set.titles.filter((t) => t.source === 'teacher').length >= PRESCRIBED_TITLE_COUNT
}

// ---------------------------------------------------------------------------
// The boundary table
// ---------------------------------------------------------------------------

/**
 * THE SCHOOL'S OWN A–E TABLE, per cohort. Not the IB's — no official table
 * could be found for any session, and the sources that publish one disagree
 * about whether it moves between sessions.
 *
 * The teacher sets each grade's LOWER bound and the upper follows from the
 * grade above, so the table cannot contain a gap or an overlap. E is always 0
 * upwards, which is why it has no field.
 *
 * CARRIES FORWARD TO A NEW COHORT AS `confirmed: false`. The IB moves these, so
 * a carried table is a starting point and never an answer: until it is
 * confirmed, every indicative letter renders as "on an unconfirmed table".
 * Confirming an unchanged table is one click — it just has to be a click.
 */
export interface TokBoundaryTable {
  schoolId: Id
  cohortId: Id
  /** Lower bound of each grade, out of TOK_TOTAL_MAX. Descending: A > B > C > D. */
  lower: { A: number; B: number; C: number; D: number }
  /** False on a table carried forward from another cohort. */
  confirmed: boolean
  confirmedBy?: Id
  confirmedAt?: string
  /** The cohort this was carried from, if it was. */
  carriedFrom?: Id
}

/**
 * The seed for a school that has never entered one. Consensus across secondary
 * sources — OURS, offered as a starting point, and it arrives unconfirmed like
 * any other carried table.
 */
export const SEED_BOUNDARIES: TokBoundaryTable['lower'] = { A: 22, B: 16, C: 10, D: 4 }

export type TokLetter = 'A' | 'B' | 'C' | 'D' | 'E'

/** Descending, so the first match wins and E is the floor. */
export function letterFor(
  total: number | null | undefined,
  table: TokBoundaryTable | null | undefined,
): TokLetter | null {
  if (total == null || !table) return null
  if (total < 0 || total > TOK_TOTAL_MAX) return null
  const { A, B, C, D } = table.lower
  if (total >= A) return 'A'
  if (total >= B) return 'B'
  if (total >= C) return 'C'
  if (total >= D) return 'D'
  return 'E'
}

/**
 * A table nobody can misread: strictly descending, inside the scale, and D
 * above zero so E has somewhere to live. Returns the problems, empty if sound.
 */
export function boundaryProblems(lower: TokBoundaryTable['lower']): string[] {
  const problems: string[] = []
  const { A, B, C, D } = lower
  const values = [['A', A], ['B', B], ['C', C], ['D', D]] as const
  for (const [name, v] of values) {
    if (!Number.isInteger(v) || v < 1 || v > TOK_TOTAL_MAX) {
      problems.push(`${name} must be a whole number between 1 and ${TOK_TOTAL_MAX}.`)
    }
  }
  if (problems.length) return problems
  if (!(A > B && B > C && C > D)) {
    problems.push('Each grade must start above the one below it — A > B > C > D.')
  }
  return problems
}

// ---------------------------------------------------------------------------
// TK/PPF — the teacher's one line per interaction
// ---------------------------------------------------------------------------

export type InteractionNumber = 1 | 2 | 3

/**
 * WHAT THE TEACHER PICKS AFTER EACH CONVERSATION.
 *
 * Michael, 21 Aug: "a dropdown of choices though … like one line … I did this
 * last year." His sheet held these as bare TRUE/FALSE columns; a line records
 * the same fact plus what the conversation actually was, and still rolls up to
 * his boolean on the board.
 *
 * The purposes come from the form itself: (1) discussing the prescribed titles
 * and choosing one, (2) initial explorations leading to a plan, (3) comments on
 * the one permitted full draft.
 *
 * EVERY INTERACTION CARRIES THE HONEST NEGATIVES. Michael: "Sometimes the
 * student doesn't get an interaction (late work) in that case the teacher can
 * write no feedback was given." The IB publishes no guidance on a missed
 * interaction and nothing says an incomplete form invalidates an essay — so a
 * not-held line is a SCHOOL-SIDE COMPLIANCE FLAG, never a penalty on the
 * student, and `held: false` is what the board counts.
 */
export interface InteractionLine {
  key: string
  label: string
  /** False for the negatives — the interaction did not really happen. */
  held: boolean
}

const NOT_HELD: InteractionLine[] = [
  { key: 'not_held', label: 'Interaction did not take place', held: false },
]

export const INTERACTION_LINES: Record<InteractionNumber, InteractionLine[]> = {
  1: [
    { key: 'reviewed_titles', label: 'Reviewed all six titles, unpacked the shortlist', held: true },
    { key: 'key_terms', label: 'Discussed key terms and possible areas of knowledge', held: true },
    { key: 'confirmed_title', label: 'Confirmed the final choice of title', held: true },
    { key: 'no_title_yet', label: 'Titles discussed — student had not chosen one', held: true },
    ...NOT_HELD,
  ],
  2: [
    { key: 'plan_and_aoks', label: 'Discussed the essay plan and choice of AOKs', held: true },
    { key: 'knowledge_questions', label: 'Discussed the knowledge questions arising from the title', held: true },
    { key: 'examples_argument', label: 'Discussed real-life examples and the central argument', held: true },
    { key: 'no_plan', label: 'Student was behind — no plan to discuss', held: true },
    ...NOT_HELD,
  ],
  3: [
    { key: 'full_draft', label: 'Full draft read — global comments given', held: true },
    { key: 'partial_draft', label: 'Partial draft read — global comments given', held: true },
    { key: 'no_draft', label: 'Student had no draft — no feedback was given', held: true },
    ...NOT_HELD,
  ],
}

export function interactionLine(n: InteractionNumber, key: string): InteractionLine | null {
  return INTERACTION_LINES[n].find((l) => l.key === key) ?? null
}

/**
 * The form permits ONE teacher comment, at the end — not one per interaction.
 * Read from the blank official PDF: page 2 is a single `Teacher's comments:`
 * box above the declarations. The three lines above compose a draft of it, and
 * the teacher edits and signs. The year's small acts become the form.
 */
export const TEACHER_COMMENT_IS_SINGLE = true

/**
 * ⚠ THE IB SETS NO WORD OR CHARACTER LIMIT ON THE TK/PPF. None appears anywhere
 * on the form. The 100/150/250, the 500 total and the 689 characters are one
 * school's guidance and a PDF field's capacity respectively. So this is the
 * SCHOOL's number, it is soft, and nothing may block a submit on it.
 */
export const SCHOOL_INTERACTION_WORD_GUIDANCE: Record<InteractionNumber, number> =
  { 1: 100, 2: 150, 3: 250 }

// ---------------------------------------------------------------------------
// Authorship
// ---------------------------------------------------------------------------

/**
 * A FIELD, BECAUSE IT WAS ALREADY NEEDED.
 *
 * Five of the 34 justifications on Michael's May 2026 sheet carry an authorship
 * concern buried mid-paragraph — "the clearest AI fingerprint", "a completely
 * different writing style (AI produced)" — and there is a "Cohort 14: TOK-AI
 * Reports" file beside it in the same folder. Buried in prose it is unfindable
 * in April. As a field it is a list.
 *
 * Deliberately NOT a judgement of the student: it records what the marker saw.
 */
export type AuthorshipConcern =
  | 'none'
  | 'style_shift'
  | 'reads_as_ai'
  | 'referred'

export const AUTHORSHIP_LABELS: Record<AuthorshipConcern, string> = {
  none: 'No concern',
  style_shift: 'Style shifts between sections',
  reads_as_ai: 'Passage reads as AI-generated',
  referred: 'Referred to the IB coordinator',
}

export const AUTHORSHIP_ORDER: AuthorshipConcern[] =
  ['none', 'style_shift', 'reads_as_ai', 'referred']
