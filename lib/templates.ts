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

export interface IaCriterion {
  key: string
  label: string
  max: number
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
  /** Which guide these numbers came from — display it, so nobody trusts a stale rubric silently. */
  guide: string
  /** Unresolved [VERIFY] — shown as a flag wherever the rubric is shown. */
  verify?: string
  /** Subject groups this family is offered under; drives the picker default. */
  groups: string[]
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
    guide: 'Language A guide, 2019 · first assessment M21 · same criteria HL & SL',
    groups: [G1],
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
    guide: 'Film guide, 2017 · first assessment M19 · no new guide through M29',
    groups: [G6],
  },
  {
    key: 'generic',
    label: 'Generic — single total (confirm against the guide)',
    component: 'Internal assessment',
    criteria: [],
    markMax: 25,
    guide: 'NO GUIDE CHECKED — the pre-template default',
    verify: 'This course has no confirmed rubric. Check the subject guide and pick or add the right family.',
    groups: [G1, G2, G3, G4, G5, G6],
  },
]

const BY_KEY = new Map(IA_TEMPLATES.map((t) => [t.key, t]))

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
