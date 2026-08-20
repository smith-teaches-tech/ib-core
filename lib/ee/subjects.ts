// THE EE SUBJECT LIST — and why it is not the school's course catalogue.
//
// The first build offered a student only the subjects they were enrolled in.
// That is wrong twice over. An extended essay is registered in a DP SUBJECT,
// and the list of those is the IB's, not ISG's: a student can register in a
// subject the school does not timetable — Film and Theatre are the obvious
// cases at ISG, and Michael named both. Enrolment is a useful HINT about what
// they will pick, never a constraint on it.
//
// So the registration stores a SUBJECT KEY from this list, not a course id.
// That decoupling is the substantive fix; the dropdown is the visible half.
//
// [VERIFY] against the DP Assessment procedures for the session — the subject
// list moves between guides, and this one is assembled from the current groups.

export interface EeSubject {
  key: string
  name: string
  /** 1–6. Group 6 is the arts; interdisciplinary essays may cross any of them. */
  group: number
}

export const DP_SUBJECTS: EeSubject[] = [
  // Group 1 — studies in language and literature
  { key: 'lang_a_lit', name: 'Language A: literature', group: 1 },
  { key: 'lang_a_langlit', name: 'Language A: language and literature', group: 1 },
  { key: 'lit_perf', name: 'Literature and performance', group: 1 },

  // Group 2 — language acquisition
  { key: 'lang_b', name: 'Language B', group: 2 },
  { key: 'lang_ab', name: 'Language ab initio', group: 2 },
  { key: 'classical', name: 'Classical languages', group: 2 },

  // Group 3 — individuals and societies
  { key: 'business', name: 'Business management', group: 3 },
  { key: 'digital_society', name: 'Digital society', group: 3 },
  { key: 'economics', name: 'Economics', group: 3 },
  { key: 'geography', name: 'Geography', group: 3 },
  { key: 'global_politics', name: 'Global politics', group: 3 },
  { key: 'history', name: 'History', group: 3 },
  { key: 'philosophy', name: 'Philosophy', group: 3 },
  { key: 'psychology', name: 'Psychology', group: 3 },
  { key: 'anthropology', name: 'Social and cultural anthropology', group: 3 },
  { key: 'world_religions', name: 'World religions', group: 3 },

  // Group 4 — sciences
  { key: 'biology', name: 'Biology', group: 4 },
  { key: 'chemistry', name: 'Chemistry', group: 4 },
  { key: 'computer_science', name: 'Computer science', group: 4 },
  { key: 'design_tech', name: 'Design technology', group: 4 },
  { key: 'ess', name: 'Environmental systems and societies', group: 4 },
  { key: 'physics', name: 'Physics', group: 4 },
  { key: 'sehs', name: 'Sports, exercise and health science', group: 4 },

  // Group 5 — mathematics
  { key: 'maths_aa', name: 'Mathematics: analysis and approaches', group: 5 },
  { key: 'maths_ai', name: 'Mathematics: applications and interpretation', group: 5 },

  // Group 6 — the arts
  { key: 'dance', name: 'Dance', group: 6 },
  { key: 'film', name: 'Film', group: 6 },
  { key: 'music', name: 'Music', group: 6 },
  { key: 'theatre', name: 'Theatre', group: 6 },
  { key: 'visual_arts', name: 'Visual arts', group: 6 },
]

export const GROUP_NAMES: Record<number, string> = {
  1: 'Group 1 · Studies in language and literature',
  2: 'Group 2 · Language acquisition',
  3: 'Group 3 · Individuals and societies',
  4: 'Group 4 · Sciences',
  5: 'Group 5 · Mathematics',
  6: 'Group 6 · The arts',
}

export const subjectName = (key: string): string =>
  DP_SUBJECTS.find((s) => s.key === key)?.name ?? key

export const isDpSubject = (key: string): boolean =>
  DP_SUBJECTS.some((s) => s.key === key)

/**
 * A HINT, not a filter: which DP subject a school course belongs to, so the
 * student's own subjects can be offered first. An unmapped course simply does
 * not appear in that shortlist — the full list is always available underneath,
 * so a gap here costs a convenience and never a capability.
 */
const COURSE_TO_SUBJECT: Record<string, string> = {
  eng_sl: 'lang_a_langlit', eng_hl: 'lang_a_langlit', germ_a_sl: 'lang_a_lit',
  fr_ab: 'lang_ab', sp_ab: 'lang_ab', ar_ab: 'lang_ab',
  fr_b_sl: 'lang_b', fr_b_hl: 'lang_b', sp_b_sl: 'lang_b', sp_b_hl: 'lang_b',
  ar_b_sl: 'lang_b', ar_b_hl: 'lang_b',
  econ_hl: 'economics', glopo_sl: 'global_politics', glopo_hl: 'global_politics',
  busman_sl: 'business', busman_hl: 'business',
  psych_sl: 'psychology', psych_hl: 'psychology',
  chem_sl: 'chemistry', chem_hl: 'chemistry',
  phys_sl: 'physics', phys_hl: 'physics',
  bio_sl: 'biology', bio_hl: 'biology',
  maa_sl: 'maths_aa', maa_hl: 'maths_aa', mai_sl: 'maths_ai',
  art_sl: 'visual_arts', art_hl: 'visual_arts',
}

export const subjectForCourse = (courseId: string): string | null =>
  COURSE_TO_SUBJECT[courseId] ?? null
