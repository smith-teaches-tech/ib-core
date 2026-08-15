// The ISG Dhahran DP course catalogue.
//
// PROVENANCE, because it matters when someone asks where these came from:
// reverse-engineered from the "Cohort 14 — Achievement and Predicted Grades"
// Google Sheet Michael linked. That sheet is not a catalogue — it is a
// gradebook in which COURSES ARE COLUMNS, so the list below is the union of the
// course names across all six of its tabs, verbatim as the school writes them.
//
// Consequences of that provenance, worth knowing before trusting this file:
//
//  - Level is part of the NAME, not an attribute. "Chem SL" and "Chem HL" are
//    separate columns in the sheet and separate courses here, which is exactly
//    what the philosophy doc (§3.1) already decided independently.
//  - Subject groups are NOT in the sheet. The groups below are standard IB,
//    assigned by subject identity. Column order is no guide — Germ. A SL sits
//    in the middle of the Group 2 block.
//  - "Germ. A SL" appears in only one tab of six and may be retired.
//  - "Econ HL" has no semester-mark columns anywhere and is tagged Pamoja, so
//    it is taught online. It has no in-house teacher to assign.
//
// Courses change year to year, so this is a SEED, not a fixed list. The setup
// screen adds new ones, and everything downstream — requirements, the board,
// enrolment — follows from the catalogue rather than from anything hardcoded.

import type { Course } from '../types'

type Seed = { id: string; name: string; group: string; level: 'HL' | 'SL' | null; tpl: string }

/** Group labels as the IB writes them, used for the dropdown's option groups. */
export const SUBJECT_GROUPS = [
  'Core',
  'Group 1 — Studies in Language and Literature',
  'Group 2 — Language Acquisition',
  'Group 3 — Individuals and Societies',
  'Group 4 — Sciences',
  'Group 5 — Mathematics',
  'Group 6 — The Arts',
] as const

const G1 = SUBJECT_GROUPS[1]
const G2 = SUBJECT_GROUPS[2]
const G3 = SUBJECT_GROUPS[3]
const G4 = SUBJECT_GROUPS[4]
const G5 = SUBJECT_GROUPS[5]
const G6 = SUBJECT_GROUPS[6]

// `tpl` is the IA template family (lib/templates.ts) — which rubric and mark
// maximum this course's internal assessment carries. Assigned here for the seed;
// a course added through Setup picks its family in the add-course form.
const SEED: Seed[] = [
  { id: 'eng_sl', name: 'English SL', group: G1, level: 'SL', tpl: 'lang_a_io' },
  { id: 'eng_hl', name: 'English HL', group: G1, level: 'HL', tpl: 'lang_a_io' },
  { id: 'germ_a_sl', name: 'Germ. A SL', group: G1, level: 'SL', tpl: 'lang_a_io' },

  { id: 'fr_ab', name: 'French ab initio', group: G2, level: 'SL', tpl: 'lang_b_io' },
  { id: 'fr_b_sl', name: 'French B SL', group: G2, level: 'SL', tpl: 'lang_b_io' },
  { id: 'fr_b_hl', name: 'French B HL', group: G2, level: 'HL', tpl: 'lang_b_io' },
  { id: 'sp_ab', name: 'Span. ab initio', group: G2, level: 'SL', tpl: 'lang_b_io' },
  { id: 'sp_b_sl', name: 'Span. B SL', group: G2, level: 'SL', tpl: 'lang_b_io' },
  { id: 'sp_b_hl', name: 'Span. B HL', group: G2, level: 'HL', tpl: 'lang_b_io' },
  { id: 'ar_ab', name: 'Arabic ab initio', group: G2, level: 'SL', tpl: 'lang_b_io' },
  { id: 'ar_b_sl', name: 'Arabic B SL', group: G2, level: 'SL', tpl: 'lang_b_io' },
  { id: 'ar_b_hl', name: 'Arabic B HL', group: G2, level: 'HL', tpl: 'lang_b_io' },

  { id: 'econ_hl', name: 'Econ HL', group: G3, level: 'HL', tpl: 'econ' },
  { id: 'glopo_sl', name: 'GloPo SL', group: G3, level: 'SL', tpl: 'glopo_sl' },
  { id: 'glopo_hl', name: 'GloPo HL', group: G3, level: 'HL', tpl: 'glopo_hl' },
  { id: 'busman_sl', name: 'Bus Man SL', group: G3, level: 'SL', tpl: 'busman' },
  { id: 'busman_hl', name: 'Bus Man HL', group: G3, level: 'HL', tpl: 'busman' },
  { id: 'psych_sl', name: 'Psych SL', group: G3, level: 'SL', tpl: 'psych' },
  { id: 'psych_hl', name: 'Psych HL', group: G3, level: 'HL', tpl: 'psych' },

  { id: 'chem_sl', name: 'Chem SL', group: G4, level: 'SL', tpl: 'sciences' },
  { id: 'chem_hl', name: 'Chem HL', group: G4, level: 'HL', tpl: 'sciences' },
  { id: 'phys_sl', name: 'Physics SL', group: G4, level: 'SL', tpl: 'sciences' },
  { id: 'phys_hl', name: 'Physics HL', group: G4, level: 'HL', tpl: 'sciences' },
  { id: 'bio_sl', name: 'Biology SL', group: G4, level: 'SL', tpl: 'sciences' },
  { id: 'bio_hl', name: 'Biology HL', group: G4, level: 'HL', tpl: 'sciences' },

  { id: 'maa_sl', name: 'Math AA SL', group: G5, level: 'SL', tpl: 'math' },
  { id: 'maa_hl', name: 'Math AA HL', group: G5, level: 'HL', tpl: 'math' },
  { id: 'mai_sl', name: 'Math AI SL', group: G5, level: 'SL', tpl: 'math' },

  { id: 'art_sl', name: 'Art SL', group: G6, level: 'SL', tpl: 'va_sl' },
  { id: 'art_hl', name: 'Art HL', group: G6, level: 'HL', tpl: 'va_hl' },
]

/** The three Core courses. Same container as Biology — philosophy doc §5. */
const CORE: Course[] = [
  { id: 'cas', schoolId: 'dhahran', type: 'cas', name: 'CAS', subjectGroup: 'Core', level: null },
  { id: 'ee', schoolId: 'dhahran', type: 'ee', name: 'Extended Essay', subjectGroup: 'Core', level: null },
  { id: 'tok', schoolId: 'dhahran', type: 'tok', name: 'Theory of Knowledge', subjectGroup: 'Core', level: null },
]

export function catalogueFor(schoolId: string): Course[] {
  return [
    ...CORE.map((c) => ({ ...c, schoolId })),
    ...SEED.map<Course>((s) => ({
      id: s.id,
      schoolId,
      type: 'subject',
      name: s.name,
      subjectGroup: s.group,
      level: s.level,
      iaTemplateKey: s.tpl,
    })),
  ]
}

/**
 * A realistic diploma: one course from each of groups 1–5, then either a Group 6
 * or a second subject from 3 or 4 — which is the actual rule and the reason the
 * board has hatched cells.
 */
export const GROUP_CHOICES: Record<string, string[]> = {
  [G1]: ['eng_hl', 'eng_sl', 'germ_a_sl'],
  [G2]: ['sp_b_sl', 'ar_b_hl', 'fr_b_sl', 'ar_b_sl', 'sp_ab', 'fr_ab', 'ar_ab', 'sp_b_hl', 'fr_b_hl'],
  [G3]: ['busman_sl', 'psych_hl', 'glopo_sl', 'busman_hl', 'psych_sl', 'glopo_hl', 'econ_hl'],
  [G4]: ['bio_sl', 'chem_hl', 'phys_hl', 'bio_hl', 'chem_sl', 'phys_sl'],
  [G5]: ['maa_sl', 'mai_sl', 'maa_hl'],
  [G6]: ['art_sl', 'art_hl'],
}

export const SIXTH_SUBJECT = [...GROUP_CHOICES[G6], ...GROUP_CHOICES[G3], ...GROUP_CHOICES[G4]]
export const GROUP_KEYS = [G1, G2, G3, G4, G5] as const
