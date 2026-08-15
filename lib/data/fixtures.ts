// Fixture data — a realistic ISG cohort, entirely in memory.
//
// Deliberately uneven: students take different subjects, some take Physics and
// some don't, some do English A HL and some SL. That is the case Michael raised,
// and it is handled by one rule (requirements attach to courses) rather than by
// any per-student configuration.

import type {
  Artifact, Cohort, Course, Enrollment, LibraryDocument, Membership,
  RequirementDef, RequirementState, School, Section, Student,
  TeachingAssignment, User,
} from '../types'
import type { Repository } from './repository'
import { buildTrack, coursesOf, requirementsFor } from '../spine'
import { buildBoard } from '../board'
import { LEARNING_OUTCOMES } from '../cas/types'
import { deriveCasStates } from '../cas/derive'
import { CAS_DATA, casCounters } from './cas-fixtures'
import { makeCasRepository } from './cas-repo'
import { makeSetupRepository } from './setup-repo'
import { GROUP_CHOICES, GROUP_KEYS, SIXTH_SUBJECT, catalogueFor } from './catalogue'
import { pinned } from './pin'
import { sortCohorts } from '../cohorts'

export const SCHOOLS: School[] = [
  { id: 'dhahran', name: 'ISG Dhahran', ibSchoolCode: '001234' },
  { id: 'jubail', name: 'ISG Jubail', ibSchoolCode: '004417' },
]

/**
 * THREE cohorts at Dhahran: two running and one a coordinator has archived.
 *
 * Cohort number and class year track each other — Cohort 15 is the Class of
 * 2027 — which is exactly how ISG's own gradebooks are named. No third label is
 * invented on top: the class year is unambiguous and the school already uses it.
 *
 * Note `archived` on the Class of 2026: it is stored, because somebody set it.
 * Nothing archives itself.
 */
export const COHORTS: Cohort[] = pinned('ibCohorts', () => [
  { id: 'c14', schoolId: 'dhahran', label: 'Class of 2026', number: 14, gradYear: 2026, archived: true },
  { id: 'c15', schoolId: 'dhahran', label: 'Class of 2027', number: 15, gradYear: 2027, archived: false },
  { id: 'c16', schoolId: 'dhahran', label: 'Class of 2028', number: 16, gradYear: 2028, archived: false },
  { id: 'j09', schoolId: 'jubail', label: 'Class of 2027', number: 15, gradYear: 2027, archived: false },
])

/** The cohorts at Dhahran, oldest first — used to build sections and defs. */
const DHAHRAN_COHORTS = ['c14', 'c15', 'c16'] as const

// ---------------------------------------------------------------------------
// Courses — CAS, EE and TOK sit here alongside Biology. Same container.
// ---------------------------------------------------------------------------

export const COURSES: Course[] = pinned('ibCourses', () => catalogueFor('dhahran'))

/**
 * Courses in the catalogue that this cohort does NOT run.
 *
 * The catalogue belongs to the school and outlives cohorts; a Section is what
 * says "we are teaching this, this year". Without a few courses sitting
 * dormant the distinction is invisible on screen and the setup flow has
 * nothing to add — so the fixture keeps the three the source sheet itself
 * suggests are marginal: Germ. A SL appeared in one tab of six, French B HL
 * ran thin, and Econ HL is taught online through Pamoja with no in-house
 * teacher at all.
 */
const NOT_RUNNING = new Set(['germ_a_sl', 'fr_b_hl', 'econ_hl'])

/**
 * One section per running course, plus a second for the two biggest — which is
 * the only reason Section exists as its own object. A course with a single
 * section shows its label nowhere in the UI.
 */
/**
 * A section belongs to ONE cohort. Two live cohorts therefore mean two sets of
 * sections over the same catalogue — which is what makes Biology SL for the
 * Class of 2027 and Biology SL for the Class of 2028 different groups, with
 * different students and, potentially, different teachers.
 */
export const SECTIONS: Section[] = pinned('ibSections', () =>
  DHAHRAN_COHORTS.flatMap((cohortId) =>
    COURSES.filter((c) => !NOT_RUNNING.has(c.id)).flatMap((c) =>
      c.id === 'eng_hl' || c.id === 'bio_sl'
        ? [
            { id: `${c.id}_${cohortId}_a`, schoolId: 'dhahran', courseId: c.id, cohortId, label: 'A' },
            { id: `${c.id}_${cohortId}_b`, schoolId: 'dhahran', courseId: c.id, cohortId, label: 'B' },
          ]
        : [{ id: `${c.id}_${cohortId}_a`, schoolId: 'dhahran', courseId: c.id, cohortId, label: 'A' }],
    ),
  ),
)

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** Class of 2027 — graduating next, and the cohort with real CAS data. */
const NAMES_C15 = [
  'Ahmed, Layla', 'Al-Rashid, Noor', 'Baptiste, Elie', 'Chen, Marcus', 'Diallo, Aminata',
  'Erdem, Kaan', 'Fernandes, Sofia', 'Gupta, Ishaan', 'Haddad, Rami', 'Ibrahim, Yasmin',
  'Jansen, Pieter', 'Kimura, Sora', 'Lopez, Mateo', 'Mensah, Kofi', 'Novak, Petra',
  'Okoro, Sara', 'Petrov, Dmitri', 'Quintero, Ana', 'Rahman, Yusuf', 'Silva, Bruno',
  'Tan, Wei Ling', 'Uddin, Zara', 'Vasquez, Diego', 'Yildiz, Deniz',
]

/** Class of 2028 — two weeks into the programme. Almost nothing recorded, correctly. */
const NAMES_C16 = [
  'Abadi, Sami', 'Bergman, Elsa', 'Cardoso, Tiago', 'Devi, Anaya', 'Eriksen, Mads',
  'Farah, Idil', 'Ghosh, Rian', 'Hassan, Mariam', 'Iqbal, Bilal', 'Jung, Minseo',
  'Kowalski, Ola', 'Lim, Jia Hui', 'Moreau, Colette', 'Nasser, Dana', "O'Brien, Cian",
  'Park, Sunwoo', 'Rossi, Giulia', 'Sattar, Hana', 'Thabet, Karim', 'Weber, Jonas',
]

/** Class of 2026 — finished. Sits in the archive to prove the archive works. */
const NAMES_C14 = [
  'Adeyinka, Tolu', 'Bianchi, Marco', 'Choudhury, Nadia', 'Dumont, Luc', 'Eze, Chidi',
  'Fischer, Lena', 'Gomez, Paula', 'Hakim, Omar', 'Ivanov, Sergei', 'Joshi, Meera',
]

/** Which cohort a student id belongs to, encoded in the prefix. */
const COHORT_NAMES: Record<string, string[]> = {
  c14: NAMES_C14,
  c15: NAMES_C15,
  c16: NAMES_C16,
}
const ID_PREFIX: Record<string, string> = { c14: 'ar', c15: 'st', c16: 'y1' }

const studentIds = (cohortId: string) =>
  COHORT_NAMES[cohortId].map((_, i) => ID_PREFIX[cohortId] + String(i + 1).padStart(2, '0'))


const STAFF: User[] = [
  { id: 'u_michael', name: 'Michael', email: 'shmikie@isg.edu.sa', status: 'active' },
  { id: 'u_haddad', name: 'S. Haddad', email: 'shaddad@isg.edu.sa', status: 'active' },
  { id: 'u_adeyemi', name: 'H. Adeyemi', email: 'hadeyemi@isg.edu.sa', status: 'active' },
  { id: 'u_farouk', name: 'R. Farouk', email: 'rfarouk@isg.edu.sa', status: 'active' },
  { id: 'u_silva', name: 'M. Silva', email: 'msilva@isg.edu.sa', status: 'active' },
  { id: 'u_okonjo', name: 'C. Okonjo', email: 'cokonjo@isg.edu.sa', status: 'active' },
]

export const USERS: User[] = pinned('ibUsers', () => [
  ...STAFF,
  ...DHAHRAN_COHORTS.flatMap((cohortId) =>
    COHORT_NAMES[cohortId].map((n, i) => ({
      id: studentIds(cohortId)[i],
      name: n,
      email:
        n.split(',')[0].toLowerCase().replace(/[^a-z]/g, '') +
        COHORTS.find((c) => c.id === cohortId)!.gradYear +
        (i + 1) +
        '@isg.edu.sa',
      status: 'active' as const,
    })),
  ),
])


export const STUDENTS: Student[] = pinned('ibStudents', () =>
  DHAHRAN_COHORTS.flatMap((cohortId) =>
    COHORT_NAMES[cohortId].map((_, i) => {
      // The graduating cohort is registered and mostly confirmed. The new one
      // has no IB
      // identifiers at all — they are not issued until exams are ordered, and
      // that is the honest state for a cohort two weeks into DP1.
      const registered = cohortId !== 'c16' && i < 21
      const confirmed = cohortId !== 'c16' && i < 18
      return {
        userId: studentIds(cohortId)[i],
        schoolId: 'dhahran',
        cohortId,
        studentNumber: String(204_100 + i * 3 + DHAHRAN_COHORTS.indexOf(cohortId as never) * 1_000),
        sessionNumber: registered ? String(i + 1).padStart(4, '0') : null,
        personalCode: registered ? 'p' + (100 + i * 7) : null,
        resultsPin: confirmed ? String(48_120_000 + i * 977) : null,
        identifiersState: confirmed ? 'confirmed' : registered ? 'unconfirmed' : 'missing',
      }
    }),
  ),
)


export const MEMBERSHIPS: Membership[] = pinned('ibMemberships', () => [
  { userId: 'u_michael', schoolId: 'dhahran', roles: ['district_coordinator'], presetKey: 'district', addedCapabilities: [], removedCapabilities: [] },
  { userId: 'u_michael', schoolId: 'jubail', roles: ['district_coordinator'], presetKey: 'district', addedCapabilities: [], removedCapabilities: [] },
  // Deliberately a school coordinator who CANNOT import students or invite
  // teachers until the district coordinator grants it — the delegation this
  // module exists to control.
  { userId: 'u_haddad', schoolId: 'jubail', roles: ['school_coordinator'], presetKey: 'school_standard', addedCapabilities: [], removedCapabilities: ['students.add', 'teachers.invite'] },
  { userId: 'u_okonjo', schoolId: 'dhahran', roles: ['school_coordinator'], presetKey: 'school_standard', addedCapabilities: [], removedCapabilities: ['students.add', 'teachers.invite'] },
  // Four distinct roles held by one person — never merged into a "Core teacher" role.
  { userId: 'u_adeyemi', schoolId: 'dhahran', roles: ['cas_coordinator', 'ee_coordinator', 'tok_teacher', 'tok_coordinator'], presetKey: 'teacher', addedCapabilities: ['items.unlock'], removedCapabilities: [] },
  { userId: 'u_farouk', schoolId: 'dhahran', roles: ['teacher'], presetKey: 'teacher', addedCapabilities: [], removedCapabilities: [] },
  { userId: 'u_silva', schoolId: 'dhahran', roles: ['teacher'], presetKey: 'teacher', addedCapabilities: [], removedCapabilities: [] },
  ...STUDENTS.map<Membership>((s) => ({
    userId: s.userId, schoolId: 'dhahran', roles: ['student'],
    presetKey: 'student', addedCapabilities: [], removedCapabilities: [],
  })),
])


/**
 * Note who teaches ACROSS cohorts — Adeyemi runs Core for both live years and
 * Farouk takes Biology in both. That is the case Michael raised: a teacher who
 * needs to move between two year groups without switching anything.
 *
 * And note what an assignment is: teacher ↔ SECTION. Never teacher ↔ student.
 * Which is why reassigning a teacher moves no student records at all.
 */
export const TEACHING_ASSIGNMENTS: TeachingAssignment[] = pinned('ibAssignments', () => [
  // Class of 2027 — graduating next
  { teacherId: 'u_farouk', sectionId: 'bio_sl_c15_a', isDesignatedMarker: true },
  { teacherId: 'u_farouk', sectionId: 'bio_sl_c15_b', isDesignatedMarker: true },
  { teacherId: 'u_silva', sectionId: 'bio_sl_c15_b', isDesignatedMarker: false }, // co-taught
  { teacherId: 'u_silva', sectionId: 'busman_sl_c15_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'tok_c15_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'cas_c15_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'ee_c15_a', isDesignatedMarker: true },

  // Class of 2028 — same people, the year behind
  { teacherId: 'u_farouk', sectionId: 'bio_sl_c16_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'tok_c16_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'cas_c16_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'ee_c16_a', isDesignatedMarker: true },

  // Class of 2026 — archived, but the record of who taught it survives
  { teacherId: 'u_farouk', sectionId: 'bio_sl_c14_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'cas_c14_a', isDesignatedMarker: true },
])


/** Deterministic pseudo-randomness — no Math.random, so the data never shifts. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/**
 * Uneven on purpose. Every student gets the three Core courses; their subjects
 * vary — English HL or SL, Biology or Physics, and so on.
 */
export const ENROLLMENTS: Enrollment[] = pinned('ibEnrollments', () => {
  const out: Enrollment[] = []
  const r = rng(42)

  const enrol = (studentId: string, cohortId: string, courseId: string, i: number) => {
    const options = SECTIONS.filter((x) => x.courseId === courseId && x.cohortId === cohortId)
    if (options.length === 0) return
    const section = options[i % options.length]
    if (!out.some((e) => e.studentId === studentId && e.sectionId === section.id)) {
      out.push({ studentId, sectionId: section.id })
    }
  }

  // Weighted toward the front of each list, so the catalogue ends up with
  // popular courses and thin ones rather than an unrealistically even spread.
  const running = (cohortId: string, ids: string[]) =>
    ids.filter((id) => SECTIONS.some((x) => x.courseId === id && x.cohortId === cohortId))
  const weighted = (cohortId: string, list: string[]) => {
    const options = running(cohortId, list)
    return options[Math.floor(options.length * r() * r())]
  }

  for (const student of STUDENTS) {
    const i = STUDENTS.indexOf(student)
    const cohortId = student.cohortId
    for (const core of ['cas', 'ee', 'tok']) enrol(student.userId, cohortId, core, i)
    for (const group of GROUP_KEYS) {
      enrol(student.userId, cohortId, weighted(cohortId, GROUP_CHOICES[group]), i)
    }
    // The sixth: a Group 6 arts course, or a second from Individuals & Societies
    // or Sciences. That is the actual IB rule, and it is the reason the
    // completeness board has hatched cells rather than gaps.
    enrol(student.userId, cohortId, weighted(cohortId, SIXTH_SUBJECT), i)
  }
  return out
})


// ---------------------------------------------------------------------------
// Requirement definitions — defined ONCE per course, never per student
// ---------------------------------------------------------------------------

/**
 * Requirement definitions are VERSIONED PER COHORT (spine architecture §2), so
 * this is a factory rather than a list: the EE model changed for 2027, and a
 * cohort's definitions must not shift under work already filed.
 *
 * Ids carry the cohort — `c15:cas.lo1` — because two live cohorts otherwise
 * produce two definitions sharing a key, and anything mapping key → def would
 * silently keep only one of them.
 */
function buildDefs(cohortId: string): RequirementDef[] {
  let order = 0
  const def = (
    d: Omit<RequirementDef, 'id' | 'schoolId' | 'cohortId' | 'order'>,
  ): RequirementDef => ({
    ...d,
    id: `${cohortId}:${d.key}`,
    schoolId: 'dhahran',
    cohortId,
    order: order++,
  })


  /**
   * CAS — twelve definitions, and NOT ONE OF THE FIRST EIGHT IS EVER WRITTEN TO.
   *
   * The seven outcomes and the project are derived from the student's experiences
   * (lib/cas/derive.ts); the three interviews from Interview records. Only
   * `cas.complete` is recorded directly, by the coordinator.
   *
   * `recordedBy` on a derived def names who does the underlying work, since the
   * spine has no third answer — the honest one is in the comment above.
   *
   * Note the absent field: no `exportTarget` anywhere in CAS. CAS is not assessed
   * and nothing goes to eCoursework; completion is confirmed by the coordinator.
   * [VERIFY] exactly how that reaches IBIS — question for the coordinator.
   */
  const CAS_COURSE = { kind: 'course', courseId: 'cas' } as const

  const casDefs: RequirementDef[] = [
    ...LEARNING_OUTCOMES.map((lo, i) =>
      def({
        scope: CAS_COURSE,
        key: 'cas.' + lo.key,
        label: `LO${i + 1} ${lo.short}`,
        lane: 'CAS',
        recordedBy: 'student',
        artifact: 'none',
      }),
    ),
    def({ scope: CAS_COURSE, key: 'cas.project', label: 'CAS project', lane: 'CAS', recordedBy: 'student', artifact: 'none' }),
    def({ scope: CAS_COURSE, key: 'cas.interview1', label: 'Initial interview', lane: 'CAS', recordedBy: 'staff', artifact: 'text' }),
    def({ scope: CAS_COURSE, key: 'cas.interview2', label: 'Interim interview', lane: 'CAS', recordedBy: 'staff', artifact: 'text' }),
    def({ scope: CAS_COURSE, key: 'cas.interview3', label: 'Final interview', lane: 'CAS', recordedBy: 'staff', artifact: 'text' }),
    def({ scope: CAS_COURSE, key: 'cas.complete', label: 'CAS complete', lane: 'CAS', recordedBy: 'coordinator', artifact: 'none' }),
  ]

  const eeDefs: RequirementDef[] = [
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.rq', label: 'Subject & research question', lane: 'Extended Essay', recordedBy: 'student', artifact: 'text' }),
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.r1', label: 'Reflection 1', lane: 'Extended Essay', recordedBy: 'student', artifact: 'text' }),
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.r2', label: 'Reflection 2', lane: 'Extended Essay', recordedBy: 'student', artifact: 'text' }),
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.final', label: 'Final essay', lane: 'Extended Essay', recordedBy: 'student', artifact: 'file', exportTarget: 'ecoursework' }),
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.viva', label: 'Viva voce', lane: 'Extended Essay', recordedBy: 'staff', artifact: 'text' }),
    // The fix for the endless student list: the RPF cannot be actionable before the viva.
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.rpf', label: 'RPF', lane: 'Extended Essay', recordedBy: 'student', artifact: 'text', exportTarget: 'ecoursework', opensAfter: 'ee.viva' }),
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.attest', label: 'Supervisor attestation', lane: 'Extended Essay', recordedBy: 'staff', artifact: 'none' }),
  ]

  const tokDefs: RequirementDef[] = [
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.exh', label: 'Exhibition', lane: 'TOK', recordedBy: 'student', artifact: 'file', exportTarget: 'ecoursework' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.exhmark', label: 'Exhibition mark', lane: 'TOK', recordedBy: 'staff', artifact: 'mark', markMax: 10 }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.title', label: 'Title chosen', lane: 'TOK', recordedBy: 'student', artifact: 'text' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.ppf1', label: 'TK/PPF 1', lane: 'TOK', recordedBy: 'student', artifact: 'text' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.ppf2', label: 'TK/PPF 2', lane: 'TOK', recordedBy: 'student', artifact: 'text', opensAfter: 'tok.ppf1' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.ppf3', label: 'TK/PPF 3', lane: 'TOK', recordedBy: 'student', artifact: 'text', opensAfter: 'tok.ppf2' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.essay', label: 'Final essay', lane: 'TOK', recordedBy: 'student', artifact: 'file', exportTarget: 'ecoursework' }),
  ]

  /** The MVP shortcut: every subject gets the SAME generic IA set. */
  const subjectDefs: RequirementDef[] = COURSES.filter((c) => c.type === 'subject').flatMap((c) => [
    def({ scope: { kind: 'course', courseId: c.id }, key: c.id + '.file', label: c.name + ' — IA', lane: 'Internal assessment', recordedBy: 'student', artifact: 'file', exportTarget: 'ecoursework' }),
    def({ scope: { kind: 'course', courseId: c.id }, key: c.id + '.mark', label: c.name + ' — mark', lane: 'Internal assessment', recordedBy: 'staff', artifact: 'mark', markMax: 25, exportTarget: 'ibis_ia_marks' }),
  ])

  const programmeDefs: RequirementDef[] = [
    def({ scope: { kind: 'programme' }, key: 'ib.reg', label: 'Registered with the IB', lane: 'IB admin', recordedBy: 'coordinator', artifact: 'none' }),
    def({ scope: { kind: 'programme' }, key: 'ib.code', label: 'Candidate code', lane: 'IB admin', recordedBy: 'coordinator', artifact: 'text' }),
    def({ scope: { kind: 'programme' }, key: 'ib.auth', label: 'Coursework authenticated', lane: 'IB admin', recordedBy: 'student', artifact: 'none', opensAfter: 'ib.code' }),
    def({ scope: { kind: 'programme' }, key: 'ib.pg', label: 'Predicted grades', lane: 'IB admin', recordedBy: 'coordinator', artifact: 'mark', exportTarget: 'ibis_predicted' }),
  ]

  return [...casDefs, ...eeDefs, ...tokDefs, ...subjectDefs, ...programmeDefs]
}

export const REQUIREMENT_DEFS: RequirementDef[] = pinned('ibRequirementDefs', () =>
  DHAHRAN_COHORTS.flatMap((cohortId) => buildDefs(cohortId)),
)

// ---------------------------------------------------------------------------
// Recorded states — deliberately partial, like a real cohort mid-year
// ---------------------------------------------------------------------------

const ART = (label: string): Artifact[] => [
  { id: label, kind: 'file', label, addedAt: '2026-08-01' },
]

export const REQUIREMENT_STATES: RequirementState[] = pinned('ibRequirementStates', () => {
  const out: RequirementState[] = []
  const r = rng(2027)
  for (const s of STUDENTS) {
    const mine = requirementsFor(
      s,
      REQUIREMENT_DEFS,
      coursesOf(s.userId, ENROLLMENTS, SECTIONS, COURSES),
    )
    for (const d of mine) {
      // CAS states are DERIVED from experiences and interviews on every read.
      // Generating them here would put a stored copy of a derived value in the
      // fixtures, which is exactly what spine invariant #2 forbids.
      if (d.lane === 'CAS') continue
      const roll = r()
      // Late-stage requirements are legitimately less complete than early ones.
      const bias = d.lane === 'IB admin' ? 0.4 : d.exportTarget ? 0.18 : 0.08
      if (roll < 0.1 + bias) continue // nothing recorded yet
      const status =
        roll > 0.55 + bias ? 'marked' : roll > 0.3 + bias ? 'submitted' : 'in_progress'
      out.push({
        studentId: s.userId,
        requirementDefId: d.id,
        schoolId: 'dhahran',
        recordStatus: status,
        exportStatus: d.exportTarget && status === 'marked' ? 'ready_for_submission' : undefined,
        mark: d.artifact === 'mark' && status !== 'in_progress' ? Math.round(r() * (d.markMax ?? 25)) : undefined,
        artifacts: d.artifact === 'file' && status !== 'in_progress' ? ART(d.label + '.pdf') : [],
        recordedAt: '2026-08-0' + (1 + Math.floor(r() * 8)),
      })
    }
  }
  return out
})

// ---------------------------------------------------------------------------
// Reference documents
// ---------------------------------------------------------------------------

const DOCUMENTS: LibraryDocument[] = [
  { id: 'd1', schoolId: 'dhahran', title: 'Extended Essay guide (2027 assessment)', description: 'The 30-mark rubric and the single post-viva reflection.', lane: 'Extended Essay', audience: 'everyone', cohortId: 'c15', version: '2027', updatedAt: '2026-06-01', href: '#' },
  { id: 'd2', schoolId: 'dhahran', title: 'EE assessment criteria A–E', description: 'The rubric on a single side, for supervisors and students.', lane: 'Extended Essay', audience: 'everyone', cohortId: 'c15', version: '1.2', updatedAt: '2026-07-14', href: '#' },
  { id: 'd3', schoolId: 'dhahran', title: 'TOK prescribed titles — May 2027', description: 'The six titles released for this session.', lane: 'TOK', audience: 'everyone', cohortId: 'c15', version: 'M27', updatedAt: '2026-08-12', href: '#' },
  { id: 'd4', schoolId: 'dhahran', title: 'TOK exhibition — the 35 IA prompts', description: 'Choose one. Fixed list, unchanged for 2027.', lane: 'TOK', audience: 'everyone', cohortId: null, version: '2022', updatedAt: '2025-09-02', href: '#' },
  { id: 'd5', schoolId: 'dhahran', title: 'CAS handbook', description: 'Strands, the seven outcomes, and how sign-off works.', lane: 'CAS', audience: 'everyone', cohortId: null, version: '3.0', updatedAt: '2026-05-20', href: '#' },
  { id: 'd6', schoolId: 'dhahran', title: 'ISG academic honesty policy', description: 'What authenticity means in practice.', lane: 'General', audience: 'everyone', cohortId: null, version: '2026', updatedAt: '2026-04-11', href: '#' },
  { id: 'd7', schoolId: 'dhahran', title: 'Teacher comment template for IA moderation', description: 'Justify marks per criterion — moderators say it materially helps.', lane: 'Internal assessment', audience: 'staff', cohortId: null, version: '1.1', updatedAt: '2026-07-02', href: '#' },
  { id: 'd8', schoolId: 'dhahran', title: 'eCoursework upload checklist', description: 'What each component needs before it can be submitted.', lane: 'IB admin', audience: 'staff', cohortId: null, version: '2027', updatedAt: '2026-07-28', href: '#' },
]

// ---------------------------------------------------------------------------
// Every state the spine can see — stored, plus whatever CAS derives right now
// ---------------------------------------------------------------------------

/**
 * Called on every read, deliberately never cached.
 *
 * An experience completed a second ago has to show on the board a second later.
 * A cached copy is precisely the desynchronisation invariant #2 exists to
 * prevent, and it would cost more to invalidate than it saves to keep.
 */
/**
 * A Student with the results PIN removed.
 *
 * Everything except the coordinator's own identifier screen goes through this.
 * The PIN is a login credential, not an identifier, and the one place it is
 * allowed out is `setup.listPeople(schoolId, true)` — gated on
 * `identifiers.manage`. Doing it here means a future client component cannot
 * leak it by forgetting, which is the only kind of protection worth having.
 */
const redact = (s: Student): Student => ({ ...s, resultsPin: null })

function allStates(): RequirementState[] {
  return [...REQUIREMENT_STATES, ...deriveCasStates(STUDENTS, REQUIREMENT_DEFS, CAS_DATA)]
}

const setupRepository = makeSetupRepository({
  courses: COURSES,
  sections: SECTIONS,
  enrollments: ENROLLMENTS,
  users: USERS,
  students: STUDENTS,
  memberships: MEMBERSHIPS,
  assignments: TEACHING_ASSIGNMENTS,
  defs: REQUIREMENT_DEFS,
  cohorts: COHORTS,
})

const casRepository = makeCasRepository({
  data: CAS_DATA,
  nextExperienceId: casCounters.nextExperienceId,
  nextEntryId: casCounters.nextEntryId,
  studentsIn: (schoolId, cohortId) =>
    STUDENTS.filter((s) => s.schoolId === schoolId && s.cohortId === cohortId),
  nameOf: (userId) => USERS.find((u) => u.id === userId)?.name ?? '',
  cohortOf: (userId) => STUDENTS.find((s) => s.userId === userId)?.cohortId ?? 'c15',
})

// ---------------------------------------------------------------------------

const roleOf = (userId: string, schoolId: string) =>
  MEMBERSHIPS.find((m) => m.userId === userId && m.schoolId === schoolId)?.roles ?? []

export const fixtureRepository: Repository = {
  async getUser(userId) {
    return USERS.find((u) => u.id === userId) ?? null
  },
  async getMemberships(userId) {
    return MEMBERSHIPS.filter((m) => m.userId === userId)
  },
  async getSchool(schoolId) {
    return SCHOOLS.find((s) => s.id === schoolId) ?? null
  },
  async listSchools() {
    return SCHOOLS
  },
  async getStudent(userId) {
    const student = STUDENTS.find((s) => s.userId === userId)
    return student ? redact(student) : null
  },
  async listCourses(schoolId) {
    return COURSES.filter((c) => c.schoolId === schoolId)
  },
  async coursesOfStudent(studentId) {
    return coursesOf(studentId, ENROLLMENTS, SECTIONS, COURSES)
  },
  async myCourses(schoolId, userId) {
    const sectionIds = TEACHING_ASSIGNMENTS.filter((t) => t.teacherId === userId).map((t) => t.sectionId)
    const courseIds = new Set(SECTIONS.filter((s) => sectionIds.includes(s.id)).map((s) => s.courseId))
    return COURSES.filter((c) => c.schoolId === schoolId && courseIds.has(c.id))
  },

  async mySpaces(schoolId, userId) {
    // Sections reached either way — enrolled in, or assigned to teach.
    const sectionIds = new Set([
      ...ENROLLMENTS.filter((e) => e.studentId === userId).map((e) => e.sectionId),
      ...TEACHING_ASSIGNMENTS.filter((t) => t.teacherId === userId).map((t) => t.sectionId),
    ])
    const mine = SECTIONS.filter((s) => sectionIds.has(s.id) && s.schoolId === schoolId)

    return sortCohorts(COHORTS.filter((c) => mine.some((s) => s.cohortId === c.id)))
      .map((cohort) => ({
        cohort,
        courses: COURSES.filter((c) =>
          mine.some((s) => s.cohortId === cohort.id && s.courseId === c.id),
        ),
      }))
      .filter((g) => g.courses.length > 0)
  },

  async getTrack(schoolId, studentUserId) {
    const student = STUDENTS.find((s) => s.userId === studentUserId)
    if (!student || student.schoolId !== schoolId) return null
    const user = USERS.find((u) => u.id === studentUserId)!
    return buildTrack(
      redact(student),
      user,
      REQUIREMENT_DEFS,
      coursesOf(studentUserId, ENROLLMENTS, SECTIONS, COURSES),
      allStates(),
    )
  },

  async getBoard(schoolId, cohortId, options) {
    const students = STUDENTS.filter((s) => s.schoolId === schoolId && s.cohortId === cohortId)
    const map = new Map(
      students.map((s) => [s.userId, coursesOf(s.userId, ENROLLMENTS, SECTIONS, COURSES)]),
    )
    return buildBoard(
      students.map(redact),
      USERS,
      REQUIREMENT_DEFS.filter((d) => d.schoolId === schoolId && d.cohortId === cohortId),
      map,
      allStates(),
      options,
    )
  },

  cas: casRepository,
  setup: setupRepository,

  async listDocuments(schoolId, forUserId) {
    const isStudent = roleOf(forUserId, schoolId).includes('student')
    const cohortId = STUDENTS.find((s) => s.userId === forUserId)?.cohortId ?? null
    return DOCUMENTS.filter((d) => d.schoolId === schoolId)
      .filter((d) => (isStudent ? d.audience !== 'staff' : true))
      .filter((d) => (isStudent && d.cohortId ? d.cohortId === cohortId : true))
  },
}
