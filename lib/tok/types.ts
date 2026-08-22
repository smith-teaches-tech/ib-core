// WHAT THE TOK MODULE OWNS.
//
// Three tables, and each one exists because the spine genuinely cannot hold it:
// a per-session list of titles, a per-session boundary table, and the teacher's
// one line per TK/PPF interaction. Everything else about TOK is a
// RequirementState like any other. IB-TOK-research.md is the design of record.

import type { Id, StoredRef } from '../types'
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
  /**
   * The same fact as a clause, for composing the teacher's one comment on the
   * official form. A separate field rather than string-munging the label,
   * because the label is a thing you PICK and the clause is a thing you READ,
   * and the day someone rewords one they should not silently reword the other.
   */
  clause: string
}

const NOT_HELD: InteractionLine[] = [
  {
    key: 'not_held', label: 'Interaction did not take place', held: false,
    clause: 'this interaction did not take place',
  },
]

export const INTERACTION_LINES: Record<InteractionNumber, InteractionLine[]> = {
  1: [
    { key: 'reviewed_titles', label: 'Reviewed all six titles, unpacked the shortlist', held: true,
      clause: 'we reviewed all six prescribed titles and unpacked the shortlist' },
    { key: 'key_terms', label: 'Discussed key terms and possible areas of knowledge', held: true,
      clause: 'we discussed the key terms of the titles and the areas of knowledge they opened up' },
    { key: 'confirmed_title', label: 'Confirmed the final choice of title', held: true,
      clause: 'the final choice of title was confirmed' },
    { key: 'no_title_yet', label: 'Titles discussed — student had not chosen one', held: true,
      clause: 'we discussed the titles, though no choice had been made at that point' },
    ...NOT_HELD,
  ],
  2: [
    { key: 'plan_and_aoks', label: 'Discussed the essay plan and choice of AOKs', held: true,
      clause: 'we discussed the essay plan and the choice of areas of knowledge' },
    { key: 'knowledge_questions', label: 'Discussed the knowledge questions arising from the title', held: true,
      clause: 'we discussed the knowledge questions arising from the title' },
    { key: 'examples_argument', label: 'Discussed real-life examples and the central argument', held: true,
      clause: 'we discussed the real-life examples and the central argument' },
    { key: 'no_plan', label: 'Student was behind — no plan to discuss', held: true,
      clause: 'we met, but no plan had been prepared to discuss' },
    ...NOT_HELD,
  ],
  3: [
    { key: 'full_draft', label: 'Full draft read — global comments given', held: true,
      clause: 'a full draft was presented and I gave comments of a global nature on it' },
    { key: 'partial_draft', label: 'Partial draft read — global comments given', held: true,
      clause: 'a partial draft was presented and I gave comments of a global nature on it' },
    { key: 'no_draft', label: 'Student had no draft — no feedback was given', held: true,
      clause: 'we met, but no draft was available and so no feedback was given on one' },
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

// ---------------------------------------------------------------------------
// What the module stores, and what the student's screen reads
// ---------------------------------------------------------------------------

/**
 * A FILED PDF — the exhibition or the essay. Same shape as EeFinal and for the
 * same reason: filing is what locks it, so there is no separate lock button.
 */
export interface TokFile {
  schoolId: Id
  studentId: Id
  kind: 'exh' | 'essay'
  fileName: string
  /** The student counts, before they file. The measured count needs the bytes. */
  declaredWords: number
  submittedAt: string
  /**
   * THE FILE, as one record — the same StoredRef that hangs off the
   * requirement state's artifact (lib/files.ts), not a copy. Replaced
   * `storageKey` + `bytes` on 22 Aug: those were two thirds of a ref, and the
   * missing third (the mime) is what the viewer needs to decide whether it can
   * show the thing at all.
   */
  ref?: StoredRef
  unlockedBy?: Id
  unlockedByName?: string
  unlockReason?: string
  unlockedAt?: string
}

/**
 * THE ESSAY DRAFT — a link, and deliberately NOT a requirement def.
 *
 * Michael, 21 Aug: "Draft not necessary here because only TOK teacher needs it,
 * unlike the complexity of EE." The rule is the one EE established: a def exists
 * when the school tracks something for EVERY candidate AGAINST A DATE. Nobody
 * chases the TOK draft on a deadline — the teacher just needs to read it before
 * the third interaction. So it is module-owned data, not a checkpoint, and it
 * never appears on the board.
 */
export interface TokDraft {
  schoolId: Id
  studentId: Id
  href: string
  addedAt: string
}

/**
 * THE TEACHER'S ONE LINE PER INTERACTION — the school's record of the meeting.
 *
 * It is NOT part of the official form (the form's three boxes are the
 * candidate's; the teacher gets one comment at the end). It exists because the
 * meeting is a real event that the student's write-up depends on, and because
 * three picked lines compose a draft of that one comment in March.
 */
export interface TokInteractionLog {
  schoolId: Id
  studentId: Id
  n: InteractionNumber
  lineKey: string
  /** The day the meeting actually happened. */
  heldOn: string
  loggedBy: Id
  loggedByName: string
  loggedAt: string
}

/**
 * THE PROSE BESIDE A MARK — two texts, not one.
 *
 * Taken from Michael's own May 2026 marking sheet, which kept two columns and
 * maintained the distinction across all 34 candidates:
 *
 *   `Comments`               his chronological walkthrough, first person, with
 *                            his reactions in brackets — "(which ones?)",
 *                            "Which one is it?". Private. Median 325 words.
 *   `Student-facing Comments` the same judgement rewritten, band-anchored,
 *                            closing on "to reach the Excellent band...".
 *                            Median 300 words.
 *
 * A single free-text box would have collapsed a distinction a real marker
 * already maintains by hand, so the model keeps both. The NUMBER lives on the
 * RequirementState like every other mark; only the prose is module-owned.
 */
export interface TokMark {
  schoolId: Id
  studentId: Id
  kind: 'exh' | 'essay'
  /** Private to staff. Never leaves with the mark. */
  note: string
  /** Goes to the student when the mark is released. */
  comment: string
  /** A FIELD, not a sentence buried mid-paragraph where April cannot find it. */
  authorship: AuthorshipConcern
  authorshipNote?: string
  markedBy: Id
  markedByName: string
  markedAt: string
  releasedAt?: string
}

// ---- the student's screen -------------------------------------------------

export interface TokFileView {
  fileName: string
  declaredWords: number
  submittedAt: string
  /**
   * The file, so the screen can SHOW it rather than saying "viewing needs cloud
   * storage" — which is what both TOK and EE said until 22 Aug. MediaViewer
   * itself says the honest thing while the bytes go nowhere, and it says it
   * once, in one place.
   */
  ref?: StoredRef
  locked: boolean
  unlockReason?: string
  unlockedByName?: string
  unlockedAt?: string
}

export interface TokInteractionView {
  n: InteractionNumber
  /**
   * What the teacher logged, if they have. RENDERS ABOVE THE STUDENT'S BOX —
   * it is the prompt a student actually needs to write the entry, and it means
   * they are never staring at an empty field wondering which meeting this was.
   */
  logged: { lineKey: string; label: string; held: boolean; heldOn: string; byName: string } | null
  /** The student's own write-up. Locks on submit. */
  entry: { body: string; words: number; submittedAt: string } | null
  open: boolean
  /** Why it is shut, in the student's own terms. Never a bare disabled field. */
  closedReason?: string
}

/** One candidate on a staff marking screen. Same shape for both instruments. */
/**
 * THE TEACHER'S HALF OF THE OFFICIAL FORM — one comment box and two signatures.
 *
 * A module table rather than an artifact on `tok.ppfsign`, for one reason: a
 * teacher drafts, saves, edits and only then signs. If the comment lived on the
 * sign-off state there would be nowhere to keep it before the sign-off exists.
 */
export interface TokPpf {
  schoolId: Id
  studentId: Id
  /** Composed from the three interaction lines, then edited. */
  comment: string
  updatedAt: string
  signedAt?: string
  signedBy?: Id
  signedByName?: string
}

/** The TK/PPF as the essay screen needs it — the form, both halves. */
export interface TokPpfView {
  interactions: TokInteractionView[]
  comment: string
  signedAt: string | null
  signedByName: string | null
  /** Written up by the student, out of three. What the board counts. */
  written: number
}

/**
 * WHAT STANDS BESIDE A PREDICTED LETTER — evidence, never an answer.
 *
 * The exhibition mark and the essay mark are read from the marking screens; the
 * total and the indicative letter are derived here and stored nowhere. A
 * teacher can accept the indicative letter or type another, and the one they
 * type is the one that goes to IBIS. IB-TOK-research.md §2.
 */
export interface TokEvidenceRow {
  studentId: Id
  studentName: string
  exhibition: number | null
  essay: number | null
  /** null unless BOTH marks are in — a half-built total is not two thirds of an answer. */
  total: number | null
  indicative: TokLetter | null
  /** False while the boundary table is carried-forward and unconfirmed. */
  tableConfirmed: boolean
}

export interface TokMarkingRow {
  studentId: Id
  studentName: string
  sessionNumber: string | null
  /** Exhibition only — the chosen IA prompt. */
  promptNumber: number | null
  /** Essay only — the chosen prescribed title. */
  title: { number: number | null; text: string } | null
  file: TokFileView | null
  mark: number | null
  prose: {
    note: string
    comment: string
    authorship: AuthorshipConcern
    authorshipNote?: string
  } | null
  releasedAt: string | null
  markedByName: string | null
  /** Essay screen only. The exhibition has no form behind it. */
  ppf?: TokPpfView
  /** Essay screen only — the one draft the IB permits a teacher to comment on. */
  draftHref?: string | null
}

export interface TokStudentView {
  studentId: Id
  studentName: Id
  teacherName: string | null
  /** 1–35, or null. Chosen from the fixed list; never typed. */
  promptNumber: number | null
  exhibition: TokFileView | null
  /** Only once the teacher has RELEASED it. Before that the student sees nothing. */
  exhibitionMark: { mark: number; level: string; comment: string | null; releasedAt: string } | null
  title: { number: number | null; text: string; source: 'teacher' | 'student' } | null
  /** Empty when the teacher has not posted the six yet — then the student may type. */
  titlesPosted: TokTitle[]
  draftHref: string | null
  essay: TokFileView | null
  interactions: TokInteractionView[]
  signedOffAt: string | null
}

/**
 * WHEN A STUDENT MAY WRITE UP INTERACTION n.
 *
 * ⚠ THE TEACHER'S LOG IS NO LONGER A GATE — reversed 22 Aug, and this reverses
 * a standing caution, so the reason is recorded rather than the change.
 *
 * Michael: *"TK/PPF should NOT be locked behind the teacher filling out the
 * planning form or adding what was talked about… Even dates do not need to be
 * the same… do not connect these… teacher notes, apparently, are optional and
 * only serve to help authenticate that an interaction took place. They don't
 * go to IBIS. Only the TK/PPF does."*
 *
 * That settles what the two things ARE, and they are not two halves of one
 * record:
 *
 *   the TK/PPF        the candidate's, submitted to the IB, three dated boxes
 *   the teacher's log OPTIONAL, ours, never uploaded — corroboration that an
 *                     interaction took place, useful if authenticity is queried
 *
 * Gating the first on the second made the school's optional note a precondition
 * for the IB's required form. A student whose teacher had not got round to
 * typing a line could not write up a meeting they had actually attended — the
 * system blocking the submission it exists to collect. The dates are
 * independent for the same reason: they are two people's records of the same
 * afternoon, not one record with two authors.
 *
 * WHAT REMAINS is the chain: write up interaction 1 before 2. The TK/PPF form
 * itself is three boxes in chronological order, so that one is the form's shape
 * rather than the school's policy. [DECISION] if that should go too.
 */
export function interactionOpen(
  n: InteractionNumber,
  previousSubmitted: boolean,
): { open: boolean; closedReason?: string } {
  if (n > 1 && !previousSubmitted) {
    return { open: false, closedReason: `Write up interaction ${n - 1} first.` }
  }
  return { open: true }
}
