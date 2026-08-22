// IA TEMPLATE FAMILIES — the internally assessed component per subject family,
// as data. This is IB-Course-Templates.md §3 built: a course arrives with the
// requirement set of its family, so "the standard IA" stops being a fiction.
//
// GROUPED, deliberately: the school runs ~30 subject courses across a dozen
// families. A new course picks its family (defaulted from its subject group) and
// gets the right rubric and the right mark maximum with no code change.
//
// EVERY NUMBER BELOW WAS READ OFF SOURCES FOR THE MAY 2027 SESSION on
// 15 Aug 2026 — guide versions are recorded per family, and unresolved
// uncertainty is carried in `verify` so it SHOWS IN THE UI rather than hiding
// in a comment. Families whose criterion split is unconfirmed ship as a single
// total (criteria: []) — honest, and the grid gains criterion columns the day
// the guide is checked. See claude/IB-IA-Marks-Spec.md for sources.
//
// Templates version with the cohort's defs (a def created from a template is
// immutable once states exist) — a guide change between sessions versions
// forward, never rewrites.

import { AUDIO_ONLY, PDF_ONLY } from './accepts'

/**
 * Two families take something other than a PDF, and they are marked [VERIFY]
 * rather than asserted: Visual Arts uploads artwork images alongside the written
 * parts, and Film uploads a reel. Both are widened rather than narrowed — an
 * `accepts` that is too tight REFUSES real work, which is worse than one that is
 * too loose, so where the guide has not been read the list errs open.
 */
const IMAGE = ['image/jpeg', 'image/png', 'image/webp']
const VIDEO = ['video/mp4', 'video/quicktime']

export interface IaCriterion {
  key: string
  label: string
  max: number
}

/**
 * A COMPONENT OF A COURSE BESIDES ITS INTERNAL ASSESSMENT.
 *
 * A family is named for its IA, and for nineteen of ISG's thirty-one courses
 * that is the whole story. It is not the whole story anywhere else:
 *
 *   Language A HL      the individual oral (IA, sampled) PLUS the HL ESSAY,
 *                      which is EXTERNALLY assessed and uploaded for EVERY HL
 *                      candidate. At ISG that is the largest block of files the
 *                      product was missing — see IB-Upload-Coverage-and-Folders.md.
 *   Classical lang HL  research dossier (IA) plus the HL composition (external)
 *   Visual arts        resolved artworks (IA) plus two whole-cohort externals
 *   Music, Theatre     two or three whole-cohort externals each
 *
 * ⚠ The IB's own public course pages call the Language A HL essay INTERNAL. The
 * subject guides are right and the course pages are wrong: at HL the individual
 * oral is the only IA. Do not resolve this from a course page.
 *
 * WHY THIS IS NOT A PATCH TO /export: the upload board is a projection over
 * `RequirementDef.exportTarget`. A component that is missing from the board is
 * a missing DEFINITION, never a missing special case. Declaring it here is what
 * makes it appear — in the board, the track, the deadlines and the packs — with
 * no screen edited anywhere.
 */
export interface TemplateComponent {
  /** The middle segment of the def key: `eng_hl` + `.hl_essay` + `.file`. */
  key: string
  /** What the IB calls it. */
  label: string
  /**
   * WHO AWARDS THE MARK THAT COUNTS — not whether anyone at school marks it.
   *
   * These are two questions and collapsing them was wrong (Michael, 22 Aug:
   * *"I imagine our IB English HL teacher grades those 'IAs' to generate
   * predicted grades. And will of course need to provide at least student
   * feedback (even if none goes to IBIS) and authenticate."*).
   *
   *   internal   the school's mark IS the mark. It is typed into IBIS, and the
   *              def carries exportTarget: 'ibis_ia_marks'.
   *   external   the IB marks the real thing. The school still reads it and
   *              records a mark — that is what a predicted grade is made of,
   *              and it is what the candidate gets back as feedback — but the
   *              number goes NOWHERE near IBIS, so the def carries NO
   *              exportTarget at all.
   *
   * PRECEDENT, and the shape to copy: `tok.essaymark` has always worked this
   * way — "the IB marks the real essay; this is the school reading it."
   *
   * Whether there is a mark at all is a SEPARATE question again, answered by
   * `markMax`: a component with no maximum gets a file and a comment and
   * nothing to score.
   */
  assessment: 'internal' | 'external'
  /** HL-only or SL-only. Absent means both levels take it. */
  level?: 'HL' | 'SL'
  /**
   * Does the IB receive this for EVERY candidate, or only if the moderation
   * sample names them? The whole-cohort/sampled split the export board draws.
   */
  upload: 'all' | 'sample'
  accepts: string[]
  /** Absent means the candidate makes it. See RequirementDef.producedBy. */
  producedBy?: 'student' | 'teacher'
  /**
   * ABSENT MEANS NOBODY SCORES THIS — no mark def is made and no screen asks
   * for a number. Present means the school records one, whether or not it ever
   * reaches the IB (see `assessment`). markMax is the sum of the criteria, as
   * everywhere; an unconfirmed split ships as `criteria: []` and a total.
   */
  criteria?: IaCriterion[]
  markMax?: number
  guide: string
  verify?: string
}

export interface IaTemplate {
  key: string
  /** Family name as the add-course picker shows it. */
  label: string
  /** What the IB calls the internally assessed component. */
  component: string
  /**
   * The rubric. EMPTY means the criterion split is not yet confirmed against
   * the current guide — the mark is recorded as a single total out of markMax
   * until it is. Never invent a split to fill this in.
   */
  criteria: IaCriterion[]
  markMax: number
  /**
   * WHAT THE IB RECEIVES for this component, as mime types. Copied onto every
   * `.file` def the family produces (`RequirementDef.accepts`), which is how a
   * Language A oral asks for audio and a scientific investigation asks for a PDF
   * with nobody maintaining a list of screens. See lib/accepts.ts.
   */
  accepts: string[]
  /**
   * WHO MAKES THE ASSESSED ARTEFACT. Absent means 'student', which is true of
   * nineteen of the school's thirty-one subject courses.
   *
   * 'teacher' is the oral families, and it is not a nicety: for Language B and
   * ab initio the candidate submits NOTHING AT ALL — the teacher conducts the
   * oral, records it, supplies the visual stimulus, and collects and retains
   * the stimulus and the candidate's fifteen minutes of prep notes afterwards.
   * A screen that says "no file uploaded" at a Language B student is not merely
   * unhelpful, it is a false accusation about work they were never asked to do.
   *
   * Translated into `recordedBy` on the `.file` def at creation — see
   * instantiateIaDefs — so nothing downstream needs a second field to consult.
   * Researched 22 Aug 2026: claude/IB-IA-Artefacts-and-Templates-Research.md §3.
   */
  producedBy?: 'student' | 'teacher'
  /** Which guide these numbers came from — display it, so nobody trusts a stale rubric silently. */
  guide: string
  /** Unresolved [VERIFY] — shown as a flag wherever the rubric is shown. */
  verify?: string
  /** Subject groups this family is offered under; drives the picker default. */
  groups: string[]
  /**
   * EVERYTHING ELSE THIS COURSE HANDS IN, beyond the IA above.
   *
   * Deliberately named `other` rather than folding the IA into a components
   * array: the IA keeps the def keys it has always had (`<course>.file`,
   * `.mark`, `.comment`), so thirty-one existing courses need no migration and
   * nothing that looks those keys up has to change. Other components are named
   * — `<course>.<component>.file` — which still ends with `.file`, so the
   * board's rollup (lib/board.ts, matched by key SUFFIX) picks them up untouched.
   */
  otherComponents?: TemplateComponent[]
}

const G1 = 'Group 1 — Studies in Language and Literature'
const G2 = 'Group 2 — Language Acquisition'
const G3 = 'Group 3 — Individuals and Societies'
const G4 = 'Group 4 — Sciences'
const G5 = 'Group 5 — Mathematics'
const G6 = 'Group 6 — The Arts'

export const IA_TEMPLATES: IaTemplate[] = [
  {
    key: 'lang_a_io',
    label: 'Language A — individual oral (/40)',
    component: 'Individual oral',
    criteria: [
      { key: 'A', label: 'Knowledge, understanding and interpretation', max: 10 },
      { key: 'B', label: 'Analysis and evaluation', max: 10 },
      { key: 'C', label: 'Focus and organization', max: 10 },
      { key: 'D', label: 'Language', max: 10 },
    ],
    markMax: 40,
    accepts: AUDIO_ONLY,
    producedBy: 'teacher',
    guide: 'Language A guide, 2019 · first assessment M21 · same criteria HL & SL',
    verify:
      '⚠ GUIDE EDITION: a revised Language A guide is first assessed M26, so M27 sits the NEW edition, not the 2019 one these numbers came from. Secondary sources report the 2024 changes as Paper 2 and text counts only, with the individual oral unchanged — confirm on MyIB before a live cohort.',
    groups: [G1],
    otherComponents: [
      {
        key: 'hl_essay',
        label: 'HL essay',
        // EXTERNALLY assessed — the school does not mark it. 1,200–1,500 words
        // on one of the works studied. Uploaded for EVERY HL candidate, which
        // is what makes it a whole-cohort job rather than a sampled one.
        assessment: 'external',
        level: 'HL',
        upload: 'all',
        accepts: PDF_ONLY,
        producedBy: 'student',
        // THE TEACHER MARKS IT — for the predicted grade, and for the feedback
        // the candidate gets back. The number never goes to IBIS, because the
        // IB marks the real thing; `assessment: 'external'` is what withholds
        // the exportTarget. Same shape as tok.essaymark.
        markMax: 20,
        // ⚠ criteria: [] DELIBERATELY. The four-criterion split is widely
        // repeated but was not read off a guide in this session, and the rule
        // does not bend: NEVER INVENT A CRITERION SPLIT. It records as one
        // total out of the confirmed maximum until somebody checks MyIB, and
        // the grid says so on screen.
        criteria: [],
        guide: 'Language A guides (Literature; Language and Literature) · /20, external, 20% at HL · both courses share the rubric',
        verify:
          '/20 and 20% at HL are well corroborated but were not read in an IB primary; the A–D split (5 each) rests on secondary sources only, and Criterion C\u2019s label is disputed ("Focus, organization and development" vs "Coherence, focus and organisation"). Check the guide on MyIB, then add the criteria. Also unconfirmed: that every HL candidate uploads rather than a sample — no source states it for this component.',
      },
    ],
  },
  {
    key: 'lang_b_io',
    label: 'Language B / ab initio — individual oral (/30)',
    component: 'Individual oral',
    criteria: [
      { key: 'A', label: 'Language', max: 12 },
      { key: 'B1', label: 'Message — stimulus', max: 6 },
      { key: 'B2', label: 'Message — conversation', max: 6 },
      { key: 'C', label: 'Interactive skills — communication', max: 6 },
    ],
    markMax: 30,
    accepts: AUDIO_ONLY,
    producedBy: 'teacher',
    guide: 'Language B / ab initio guides, 2018 · first assessment M20 · marks identical HL & SL',
    groups: [G2],
  },
  {
    key: 'busman',
    label: 'Business Management — research project (/25)',
    component: 'Business research project',
    criteria: [
      { key: 'A', label: 'Integration of a key concept', max: 5 },
      { key: 'B', label: 'Supporting documents', max: 4 },
      { key: 'C', label: 'Selection and application of tools and theories', max: 4 },
      { key: 'D', label: 'Analysis and evaluation', max: 5 },
      { key: 'E', label: 'Conclusions', max: 3 },
      { key: 'F', label: 'Structure', max: 2 },
      { key: 'G', label: 'Presentation', max: 2 },
    ],
    markMax: 25,
    accepts: PDF_ONLY,
    guide: 'Business Management guide, 2022 · first assessment M24 · identical HL & SL',
    groups: [G3],
  },
  {
    key: 'econ',
    label: 'Economics — portfolio of three commentaries (/45)',
    component: 'Portfolio (3 commentaries)',
    // Criteria a–e are applied PER COMMENTARY (/14 each); f once for the
    // portfolio. The commentary subtotal is the practical marking grain here —
    // recording 15 sub-cells for one IA would be form-filling, not marking.
    criteria: [
      { key: 'C1', label: 'Commentary 1 (criteria a–e)', max: 14 },
      { key: 'C2', label: 'Commentary 2 (criteria a–e)', max: 14 },
      { key: 'C3', label: 'Commentary 3 (criteria a–e)', max: 14 },
      { key: 'F', label: 'Rubric requirements (whole portfolio)', max: 3 },
    ],
    markMax: 45,
    accepts: PDF_ONLY,
    guide: 'Economics guide, 2020 · first assessment M22 · identical HL & SL',
    groups: [G3],
  },
  {
    key: 'glopo_sl',
    label: 'Global Politics SL — engagement project (/24)',
    component: 'Engagement project',
    criteria: [
      { key: 'A', label: 'Explanation and justification', max: 4 },
      { key: 'B', label: 'Process', max: 3 },
      { key: 'C', label: 'Analysis and synthesis', max: 8 },
      { key: 'D', label: 'Evaluation and reflection', max: 6 },
      { key: 'E', label: 'Communication', max: 3 },
    ],
    markMax: 24,
    accepts: PDF_ONLY,
    guide: 'Global Politics guide, NEW · first assessment M26 — the old engagement activity (/20) does not apply',
    verify: 'Per-criterion split rests on one secondary source — confirm against the guide on MyIB before a live cohort.',
    groups: [G3],
  },
  {
    key: 'glopo_hl',
    label: 'Global Politics HL — engagement project (/30)',
    component: 'Engagement project + recommendation',
    criteria: [
      { key: 'A', label: 'Explanation and justification', max: 4 },
      { key: 'B', label: 'Process', max: 3 },
      { key: 'C', label: 'Analysis and synthesis', max: 8 },
      { key: 'D', label: 'Evaluation and reflection', max: 6 },
      { key: 'E', label: 'Communication', max: 3 },
      { key: 'F', label: 'Recommendation (HL only)', max: 6 },
    ],
    markMax: 30,
    accepts: PDF_ONLY,
    guide: 'Global Politics guide, NEW · first assessment M26 · HL adds criterion F',
    verify: 'Per-criterion split rests on one secondary source — confirm against the guide on MyIB before a live cohort.',
    groups: [G3],
  },
  {
    key: 'psych',
    label: 'Psychology — research proposal (/24)',
    component: 'Research proposal',
    // M27 is the FIRST session of the new guide. Total and task are confirmed;
    // the criterion split of the 24 is not published in the open sbs PDF, so the
    // mark is a single total until the full guide is checked on MyIB.
    criteria: [],
    markMax: 24,
    accepts: PDF_ONLY,
    guide: 'Psychology guide, NEW · FIRST ASSESSMENT M27 — the old /22 experimental report does not apply',
    verify: 'Criterion split of the /24 unconfirmed — check the full guide on MyIB, then add the criteria here.',
    groups: [G3],
  },
  {
    key: 'history',
    label: 'History — historical investigation (/25)',
    component: 'Historical investigation',
    criteria: [
      { key: 'A', label: 'Identification and evaluation of sources', max: 6 },
      { key: 'B', label: 'Investigation', max: 15 },
      { key: 'C', label: 'Reflection', max: 4 },
    ],
    markMax: 25,
    accepts: PDF_ONLY,
    guide: 'History guide, 2015 · first assessment M17 (new guide is M28) · identical HL & SL',
    groups: [G3],
  },
  {
    key: 'sciences',
    label: 'Sciences (Bio · Chem · Phys) — scientific investigation (/24)',
    component: 'Scientific investigation',
    criteria: [
      { key: 'A', label: 'Research design', max: 6 },
      { key: 'B', label: 'Data analysis', max: 6 },
      { key: 'C', label: 'Conclusion', max: 6 },
      { key: 'D', label: 'Evaluation', max: 6 },
    ],
    markMax: 24,
    accepts: PDF_ONLY,
    guide: 'Biology / Chemistry / Physics guides, 2023 · first assessment M25 · identical HL & SL',
    groups: [G4],
  },
  {
    key: 'ess',
    label: 'ESS — individual investigation (/30)',
    component: 'Individual investigation',
    criteria: [
      { key: 'A', label: 'Research question and inquiry', max: 4 },
      { key: 'B', label: 'Strategy', max: 4 },
      { key: 'C', label: 'Method', max: 4 },
      { key: 'D', label: 'Treatment of data', max: 6 },
      { key: 'E', label: 'Analysis and conclusion', max: 6 },
      { key: 'F', label: 'Evaluation', max: 6 },
    ],
    markMax: 30,
    accepts: PDF_ONLY,
    guide: 'ESS guide, NEW · first assessment M26 — NOT the /24 sciences model',
    verify: 'Criterion B label ("Strategy") varies between sources — confirm the exact wording if displayed verbatim.',
    groups: [G4],
  },
  {
    key: 'math',
    label: 'Mathematics (AA · AI) — exploration (/20)',
    component: 'Mathematical exploration',
    criteria: [
      { key: 'A', label: 'Presentation', max: 4 },
      { key: 'B', label: 'Mathematical communication', max: 4 },
      { key: 'C', label: 'Personal engagement', max: 3 },
      { key: 'D', label: 'Reflection', max: 3 },
      { key: 'E', label: 'Use of mathematics', max: 6 },
    ],
    markMax: 20,
    accepts: PDF_ONLY,
    guide: 'Mathematics guides, 2019 · first assessment M21 · identical AA/AI, HL/SL (E descriptors differ at HL)',
    groups: [G5],
  },
  {
    key: 'va_sl',
    label: 'Visual Arts SL — resolved artworks (/32)',
    component: 'Resolved artworks',
    criteria: [
      { key: 'A', label: 'Coherence of body of artworks', max: 8 },
      { key: 'B', label: 'Conceptual realization', max: 12 },
      { key: 'C', label: 'Technical resolution', max: 12 },
    ],
    markMax: 32,
    accepts: [...PDF_ONLY, ...IMAGE],
    guide: 'Visual Arts guide, NEW · FIRST ASSESSMENT M27 — the portfolio & artist project are EXTERNAL, uploaded for all candidates',
    verify: 'SL criterion split rests on one secondary source — confirm against the guide on MyIB.',
    groups: [G6],
  },
  {
    key: 'va_hl',
    label: 'Visual Arts HL — selected resolved artworks (/40)',
    component: 'Selected resolved artworks',
    // Total confirmed via the official subject brief; the criterion breakdown of
    // the /40 is not — single total until the guide is checked.
    criteria: [],
    markMax: 40,
    accepts: [...PDF_ONLY, ...IMAGE],
    guide: 'Visual Arts guide, NEW · FIRST ASSESSMENT M27 — artist project (/40) is EXTERNAL, all candidates',
    verify: 'Criterion split of the /40 unconfirmed — check the full guide on MyIB, then add the criteria here.',
    groups: [G6],
  },
  {
    key: 'film',
    label: 'Film — film portfolio (/24)',
    component: 'Film portfolio',
    criteria: [
      { key: 'A', label: 'Portfolio pages (3 roles × 4)', max: 12 },
      { key: 'B', label: 'Film reel (3 roles × 4)', max: 12 },
    ],
    markMax: 24,
    accepts: [...PDF_ONLY, ...VIDEO],
    guide: 'Film guide, 2017 · first assessment M19 · no new guide through M29',
    groups: [G6],
  },
  {
    key: 'generic',
    label: 'Generic — single total (confirm against the guide)',
    component: 'Internal assessment',
    criteria: [],
    markMax: 25,
    accepts: PDF_ONLY,
    guide: 'NO GUIDE CHECKED — the pre-template default',
    verify: 'This course has no confirmed rubric. Check the subject guide and pick or add the right family.',
    groups: [G1, G2, G3, G4, G5, G6],
  },
]

const BY_KEY = new Map(IA_TEMPLATES.map((t) => [t.key, t]))

/**
 * WHICH OTHER COMPONENTS THIS COURSE ACTUALLY TAKES.
 *
 * One function, because the level rule is the whole subtlety and two copies of
 * it would drift: English SL and English HL share the family and share the /40
 * oral, and differ by exactly this — the HL essay. A course with no level takes
 * only components that name no level.
 */
export function componentsFor(
  template: IaTemplate,
  level: 'HL' | 'SL' | null,
): TemplateComponent[] {
  return (template.otherComponents ?? []).filter((c) => c.level == null || c.level === level)
}

export function templateOf(key: string | undefined | null): IaTemplate {
  return (key && BY_KEY.get(key)) || BY_KEY.get('generic')!
}

/** Picker options for a subject group — the group's own families first, generic last. */
export function templatesForGroup(subjectGroup: string): IaTemplate[] {
  const own = IA_TEMPLATES.filter((t) => t.key !== 'generic' && t.groups.includes(subjectGroup))
  const rest = IA_TEMPLATES.filter((t) => t.key !== 'generic' && !t.groups.includes(subjectGroup))
  return [...own, ...rest, BY_KEY.get('generic')!]
}

/**
 * The derived total. NOTHING STORES THIS — invariant #2. A state recorded at
 * criterion grain sums; a state recorded before criteria existed (or for a
 * family whose split is unconfirmed) carries a single `mark`.
 */
export function iaTotal(
  criteria: IaCriterion[] | undefined,
  state: { criterionMarks?: (number | null)[]; mark?: number } | null,
): number | null {
  if (!state) return null
  if (criteria && criteria.length > 0 && state.criterionMarks) {
    if (state.criterionMarks.length !== criteria.length) return null
    if (state.criterionMarks.some((m) => m == null)) return null
    return state.criterionMarks.reduce<number>((a, b) => a + (b ?? 0), 0)
  }
  return state.mark ?? null
}
