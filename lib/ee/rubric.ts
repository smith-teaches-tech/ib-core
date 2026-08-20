// THE EE RUBRIC — first assessment May 2027.
//
// Source: the school's "Extended Essay — Rubric & Supervisor Grading Guide"
// (Michael, 19 Aug 2026).
//
// ─────────────────────────────────────────────────────────────────────────────
// PROVENANCE, WHICH IS NOT A FOOTNOTE
//
// Criterion names, mark totals, strands and guiding questions are the IB's,
// from the 2027 extended essay guide and subject brief.
//
// THE BAND WORDING IS NOT. The IB publishes its verbatim markbands only in the
// full guide on the Programme Resource Centre, and the school's document is
// explicit that its band text is "a practical grading aid written for
// supervisors", to be confirmed against the official markbands before predicted
// grades are submitted.
//
// That distinction is carried in the DATA (`bandSource`, `boundariesAreOfficial`)
// rather than in this comment, because a supervisor reading a paraphrase and
// believing it to be the markband is the specific failure this file exists to
// prevent. Any screen rendering a band MUST render its provenance too.
// ─────────────────────────────────────────────────────────────────────────────

export const RUBRIC_VERSION = 'ee-2027-school-aid-v1'

/** Shown wherever band text appears. Not optional, not dismissible. */
export const BAND_PROVENANCE =
  'Band wording is a school grading aid, not the IB’s verbatim markbands. ' +
  'Confirm against the official guide before submitting predicted grades.'

export interface RubricBand {
  /** '5–6', '0' — as a supervisor says it. */
  label: string
  min: number
  max: number
  /**
   * A few words. THE COLLAPSED STATE OF THE MARKING SCREEN.
   *
   * Michael, 20 Aug: "The rubric is large… so should be brief key points that
   * can be expanded." Five criteria of full band text is a wall nobody reads at
   * the moment of marking; a marker placing an essay needs the ladder at a
   * glance and opens only the band they are deciding between.
   */
  summary: string
  guidance: string
}

export interface RubricCriterion {
  key: 'A' | 'B' | 'C' | 'D' | 'E'
  label: string
  max: number
  /** The IB's own strands. */
  strands: string[]
  /** The IB's guiding question for this criterion. */
  guidingQuestion: string
  /** Highest band first. NOTE: the ladder differs per criterion — see below. */
  bands: RubricBand[]
  /** The school's supervisor guidance, headed as in the source document. */
  notes?: { heading: string; points: string[] }[]
}

/**
 * THE BAND LADDER IS NOT UNIFORM, and a marking screen must not assume it is:
 * A, B and C run 5–6 / 3–4 / 1–2 / 0; D runs 7–8 / 5–6 / 3–4 / 1–2 / 0; and
 * E runs 3–4 / 1–2 / 0 — three bands, not four. Rendering a fixed four-row
 * ladder would invent a band for E that does not exist.
 */
export const EE_CRITERIA: RubricCriterion[] = [
  {
    key: 'A',
    label: 'Framework for the essay',
    max: 6,
    strands: ['research question', 'research methods', 'structure'],
    guidingQuestion:
      'Do the research question, the research methods, and the structural conventions followed provide an effective framework for the essay?',
    bands: [
      {
        label: '5–6', min: 5, max: 6,
        summary: 'Focused, answerable question · method justified · discipline’s structure throughout',
        guidance:
          'The research question is sharply focused, stated consistently, and genuinely answerable in 4,000 words. Methods and sources are well chosen for the subject and explained clearly enough that a reader could follow the approach. The essay follows the structural conventions of its discipline throughout, and the required elements are all present and correct.',
      },
      {
        label: '3–4', min: 3, max: 4,
        summary: 'Question drifts or over-scoped · method thinly explained · structure uneven',
        guidance:
          'The research question is stated and broadly answerable, but drifts in wording between title page, introduction and conclusion, or is wider than the word limit comfortably allows. Methods are appropriate but thinly explained. Structure is recognisable but uneven — sections do not consistently do the work the discipline expects of them.',
      },
      {
        label: '1–2', min: 1, max: 2,
        summary: 'Vague or unanswerable question · little method · generic essay structure',
        guidance:
          'The research question is vague, descriptive, or so broad that no 4,000-word essay could answer it. Little or no account of method. Structure is generic essay-writing rather than the conventions of the subject; required elements may be missing.',
      },
      {
        label: '0', min: 0, max: 0,
        summary: 'Below the bands above',
        guidance: 'Does not reach a standard described by the bands above.',
      },
    ],
    notes: [
      {
        heading: 'What separates 5–6 from 3–4',
        points: [
          'The same research question appears, word for word, on the title page, in the introduction and in the conclusion.',
          'Method is justified, not just named — why this source base, this text, this data set.',
          'Scope is realistic. "To what extent" questions with three sub-questions are almost always over-scoped.',
        ],
      },
      {
        heading: 'Do not reward',
        points: [
          'A well-formatted essay with a question that cannot be argued either way.',
          'A methodology section copied from a template with no bearing on what the student actually did.',
        ],
      },
    ],
  },
  {
    key: 'B',
    label: 'Knowledge and understanding',
    max: 6,
    strands: ['knowledge', 'understanding — terminology', 'understanding — concepts'],
    guidingQuestion:
      'Does the student demonstrate the knowledge and understanding of the subject matter being used in their research?',
    bands: [
      {
        label: '5–6', min: 5, max: 6,
        summary: 'Accurate and clearly their own · terminology precise · concepts applied, not just defined',
        guidance:
          'Knowledge is accurate, relevant and clearly the student’s own. Subject terminology is used precisely and consistently, in the way a specialist would use it. Concepts are applied to the material rather than defined and abandoned — the reader sees the discipline doing work on the topic.',
      },
      {
        label: '3–4', min: 3, max: 4,
        summary: 'Sound but partly general · terminology mostly right · concepts applied loosely',
        guidance:
          'Knowledge is sound but partly general; some material is included because it was found rather than because it serves the question. Terminology is mostly correct with occasional slips or inconsistency. Concepts are named and explained accurately but applied only loosely.',
      },
      {
        label: '1–2', min: 1, max: 2,
        summary: 'Thin, dated or inaccurate · terminology avoided or misused',
        guidance:
          'Knowledge is thin, dated, or substantially inaccurate. Terminology is avoided, misused, or replaced by everyday language. Little evidence the student is working inside a subject discipline at all.',
      },
      {
        label: '0', min: 0, max: 0,
        summary: 'Below the bands above',
        guidance: 'Does not reach a standard described by the bands above.',
      },
    ],
    notes: [
      {
        heading: 'Supervisor notes',
        points: [
          'Interdisciplinary essays must show credible knowledge in BOTH subjects. A strong essay in one subject with a decorative nod to the second sits at 3–4, not 5–6.',
          'Long definitional passages are a warning sign: defining a concept is knowledge; using it is understanding.',
          'Accuracy matters more than volume. A short, correct treatment outscores a long, muddled one.',
        ],
      },
    ],
  },
  {
    key: 'C',
    label: 'Analysis and line of argument',
    max: 6,
    strands: ['analysis', 'line of argument'],
    guidingQuestion:
      'Does the student analyse the information presented in the essay and produce a coherent line of argument?',
    bands: [
      {
        label: '5–6', min: 5, max: 6,
        summary: 'Evidence interpreted · one traceable line from question to conclusion',
        guidance:
          'Evidence is interpreted, not merely reported: the student explains what it shows and why it matters to the question. The argument runs in a single traceable line from research question through evidence to conclusion, each section advancing it. A reader can state the essay’s case in one sentence after finishing.',
      },
      {
        label: '3–4', min: 3, max: 4,
        summary: 'Analysis intermittent · argument discernible but loses direction',
        guidance:
          'Analysis is present but intermittent — stretches of description sit between the analytical passages. The argument is discernible but loses direction; some sections are relevant to the topic without advancing the case. The conclusion follows from the essay but not inevitably.',
      },
      {
        label: '1–2', min: 1, max: 2,
        summary: 'Largely descriptive · no sustained argument',
        guidance:
          'Largely descriptive or narrative. Evidence is presented and left to speak for itself. No sustained argument — the essay is a sequence of information about the topic rather than a case answering a question.',
      },
      {
        label: '0', min: 0, max: 0,
        summary: 'Below the bands above',
        guidance: 'Does not reach a standard described by the bands above.',
      },
    ],
    notes: [
      {
        heading: 'The diagnostic test',
        points: [
          'Read only the first and last sentence of every paragraph. If those sentences alone carry the argument, this is a 5–6. If they read as a list of topics, it is a 3–4 at best.',
          'Ask of each paragraph: what work is this doing for the research question? Paragraphs that cannot answer are the ones costing marks.',
        ],
      },
      {
        heading: 'Do not confuse with Criterion D',
        points: [
          'C is whether the argument HOLDS TOGETHER. D is whether the student then stands back and WEIGHS it. An essay can score well in C and poorly in D.',
        ],
      },
    ],
  },
  {
    key: 'D',
    label: 'Discussion and evaluation',
    max: 8,
    strands: ['discussion', 'evaluation'],
    guidingQuestion: 'Does the student discuss the findings and evaluate the essay?',
    bands: [
      {
        label: '7–8', min: 7, max: 8,
        summary: 'Conclusion answers the question · set in context · limitations named and consequences drawn',
        guidance:
          'The conclusion answers the research question clearly and follows logically from the evidence presented. Findings are set in a wider scholarly context. The student evaluates genuinely — naming specific limitations of method, source base and reasoning, and explaining what those limitations do to the strength of the conclusion. Unresolved questions are identified honestly.',
      },
      {
        label: '5–6', min: 5, max: 6,
        summary: 'Clear conclusion · evaluation present but uneven',
        guidance:
          'A clear conclusion that answers the question, with some contextualisation. Evaluation is present and specific in places but uneven — perhaps strong on source limitations and silent on method, or listing limitations without saying what follows from them.',
      },
      {
        label: '3–4', min: 3, max: 4,
        summary: 'Conclusion restates or overreaches · evaluation generic',
        guidance:
          'The conclusion restates the essay rather than answering the question, or reaches beyond what the evidence supports. Evaluation is generic — "more time would have helped", "the sample was small" — with no consequence drawn.',
      },
      {
        label: '1–2', min: 1, max: 2,
        summary: 'Summary only · no meaningful evaluation',
        guidance:
          'Little discussion beyond summary. No meaningful evaluation, or evaluation limited to an apology for the essay’s length.',
      },
      {
        label: '0', min: 0, max: 0,
        summary: 'Below the bands above',
        guidance: 'Does not reach a standard described by the bands above.',
      },
    ],
    notes: [
      {
        heading: 'Why this criterion decides grades',
        points: [
          'At 8 marks it is over a quarter of the total, and it is the criterion most often left underdeveloped because it lives at the end of the essay — exactly where students run out of words and time.',
          'Word-limit interaction: an essay that runs past 4,000 words loses its conclusion to the cut-off. That damages D more than any other criterion. Flag over-length drafts early on these grounds.',
        ],
      },
      {
        heading: 'The evaluation test',
        points: [
          'A real limitation changes what the student may claim. If the stated limitation could be deleted without altering the conclusion, it is decoration, not evaluation.',
        ],
      },
    ],
  },
  {
    key: 'E',
    label: 'Reflection',
    max: 4,
    strands: ['reflection — assessed via the Reflection and Progress Form (RPF)'],
    guidingQuestion:
      'Does the student evaluate the effect of the extended essay learning experience on them as a learner?',
    bands: [
      {
        label: '3–4', min: 3, max: 4,
        summary: 'Evaluates growth with concrete evidence from this project · skills named and connected',
        guidance:
          'The statement evaluates the student’s development as a learner with concrete evidence from this project: a decision that had to be reversed, a method that failed and what replaced it, a view that changed under the weight of evidence. Skills gained are named and connected to future contexts. The voice is analytical and specific to this essay — it could not describe anyone else’s.',
      },
      {
        label: '1–2', min: 1, max: 2,
        summary: 'Descriptive not evaluative · would fit almost any essay',
        guidance:
          'Reflection is descriptive rather than evaluative: an account of what was done and when, or general statements about time management and stress. Skills are asserted rather than evidenced. The statement would fit almost any extended essay.',
      },
      {
        label: '0', min: 0, max: 0,
        summary: 'No statement, or nothing about their learning',
        guidance: 'No reflective statement, or nothing that addresses the student’s learning.',
      },
    ],
    notes: [
      {
        heading: 'Supervisor notes',
        points: [
          'Point students at their Researcher’s Reflection Space when drafting. A statement written from memory in one sitting almost always lands at 1–2.',
          'Four marks is over a tenth of the total, earned from 500 words. It is the best return on effort in the whole EE — say so to students who treat it as paperwork.',
          'Where a claim in the statement is contradicted by what you observed across the three sessions, that is a reason to look harder, not to mark generously.',
        ],
      },
    ],
  },
]

export const EE_MARK_MAX = EE_CRITERIA.reduce((n, c) => n + c.max, 0) // 30

/** The four rules the source document puts beside the rubric. Shown on the marking screen. */
export const MARKING_DISCIPLINE = [
  { rule: 'Best fit, not tick-box.', detail: 'Award the band the essay as a whole best matches; a single weak strand does not cap the criterion.' },
  { rule: 'Mark each criterion independently.', detail: 'A weak research question is penalised in A — do not punish it again in C and D.' },
  { rule: 'Reward what is there.', detail: 'Do not deduct for what a different essay might have done.' },
  { rule: 'Stop at 4,000 words.', detail: 'Anything beyond is not read, so criteria that depend on the conclusion — chiefly D — are marked as though it does not exist.' },
]

/**
 * INDICATIVE ONLY, and the flag is the point.
 *
 * The IB does not publish boundaries until the subject report after the first
 * May 2027 session. A UI that shows "24/30 = A" without saying so would be
 * asserting a boundary nobody set — the same class of invented requirement the
 * CAS strip refuses when it declines to set a target.
 */
export const boundariesAreOfficial = false
export const INDICATIVE_BOUNDARIES: { grade: 'A' | 'B' | 'C' | 'D' | 'E'; min: number; max: number }[] = [
  { grade: 'A', min: 24, max: 30 },
  { grade: 'B', min: 19, max: 23 },
  { grade: 'C', min: 14, max: 18 },
  { grade: 'D', min: 7, max: 13 },
  { grade: 'E', min: 0, max: 6 },
]

export function indicativeGrade(total: number): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  return INDICATIVE_BOUNDARIES.find((b) => total >= b.min && total <= b.max)?.grade ?? null
}

/**
 * THE WORD COUNT — 4,000, and what it does and does not include.
 *
 * Rendered beside the student's own declaration, because the number they type
 * is only meaningful if they counted the same things. The reflective statement
 * is NOT part of the 4,000; students routinely believe it is.
 */
export const WORD_LIMIT = 4000
export const WORD_COUNT_RULES = {
  counted: [
    'introduction', 'body', 'conclusion', 'quotations',
    'explanatory footnotes that carry argument',
  ],
  notCounted: [
    'title page', 'contents page', 'references and bibliography',
    'purely referential footnotes', 'appendices', 'tables of data',
    'equations, diagrams and short labels',
    'the 500-word reflective statement',
  ],
  caveat:
    'The 2027 brief states only the inclusions; the exclusion list carries over from the previous guide. Confirm against the assessment procedures.',
}

/** The 2027 title page — what the anonymity pre-flight checks against. */
export const TITLE_PAGE_REQUIRED = [
  'Title of the essay',
  'Research question',
  'Subject of registration — both subjects if interdisciplinary',
  'The interdisciplinary framework, if applicable',
  'Word count',
]
export const TITLE_PAGE_FORBIDDEN = ['name', 'school', 'candidate number', 'supervisor']
/** Withdrawn for 2027. Kept named so nobody re-adds it from an older guide. */
export const TITLE_PAGE_WITHDRAWN = ['category (withdrawn for 2027)']

/**
 * THE TWO PATHWAYS — and the reason `EeRegistration.subjects` is an array.
 *
 * Interdisciplinary essays take any two DP subjects and MUST be registered
 * under one of five frameworks, which is named on the title page. The framework
 * is not directly assessed, but an unregistered one is a registration error,
 * which is the expensive kind.
 */
export const INTERDISCIPLINARY_FRAMEWORKS = [
  'power and equality',
  'culture and identity',
  'movement and time',
  'evidence and measurement',
  'sustainability and development',
] as const
export type InterdisciplinaryFramework = (typeof INTERDISCIPLINARY_FRAMEWORKS)[number]

/**
 * Already cross-disciplinary, so they may NOT be used in the interdisciplinary
 * pathway. Matched on SUBJECT KEY from lib/ee/subjects.ts — not on course id,
 * because a student can register in a subject the school does not teach.
 */
export const NOT_ELIGIBLE_INTERDISCIPLINARY = ['ess', 'lit_perf']
