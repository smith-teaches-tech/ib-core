// Fixture data — a realistic ISG cohort, entirely in memory.
//
// Deliberately uneven: students take different subjects, some take Physics and
// some don't, some do English A HL and some SL. That is the case Michael raised,
// and it is handled by one rule (requirements attach to courses) rather than by
// any per-student configuration.

import type {
  Artifact, Cohort, Course, Deadline, Enrollment, LibraryDocument, Membership,
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
import { templateOf } from '../templates'
import { makeIaRepository } from './ia-repo'
import { makePgRepository } from './pg-repo'
import { REPORTING_POINTS, pgKey } from '../pg/types'
import { makeExportRepository } from './export-repo'
import type { MarkEvent, MarkUnlock, SampleRequest } from '../ia/types'
import { makeDeadlineRepository } from './deadline-repo'
import { pinned } from './pin'
import { lateFrom, withDue } from '../deadlines'
import type { EeSupervision } from '../ee/types'
import { eeCoordinatorId, supervisorFor } from '../ee/supervision'
import { EE_CRITERIA, EE_MARK_MAX } from '../ee/rubric'
import { registrationComplete, validateRegistration } from '../ee/registration'
import { subjectForCourse } from '../ee/subjects'
import { deriveEeSessionStates } from '../ee/derive'
import type {
  EeFinal, EeRegistration, EeRosterRow, EeSession, EeSessionNote, SessionStage,
} from '../ee/types'
import { todayRiyadh } from './dates'
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

/**
 * When a cohort's DP began: 1 August, two years before it graduates.
 *
 * The DEFAULT for `Student.joinedAt`, and the reason the backfill is honest
 * rather than a placeholder — for everyone who started with their year group,
 * the day they joined really is the day the programme did.
 */
export function cohortStart(cohortId: string): string {
  const c = COHORTS.find((x) => x.id === cohortId)
  return `${(c?.gradYear ?? new Date().getFullYear() + 2) - 2}-08-01`
}

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
 * EXACTLY ONE section per running course per cohort — the invisible
 * implementation detail. Skyward and Google Classroom own class groupings;
 * this system tracks IB requirements, which are per COURSE. Section survives
 * internally only because it is what carries the cohort, and nothing
 * user-facing ever shows a section label again (product decision, 2026-08).
 *
 * A section still belongs to ONE cohort: two live cohorts mean two sets of
 * sections over the same catalogue — which is what makes Biology SL for the
 * Class of 2027 and Biology SL for the Class of 2028 different groups, with
 * different students and, potentially, different teachers.
 */
export const SECTIONS: Section[] = pinned('ibSections', () =>
  DHAHRAN_COHORTS.flatMap((cohortId) =>
    COURSES.filter((c) => !NOT_RUNNING.has(c.id)).map((c) => ({
      id: `${c.id}_${cohortId}_a`,
      schoolId: 'dhahran',
      courseId: c.id,
      cohortId,
      label: 'A',
    })),
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
  { id: 'u_michael', name: 'D. Whitfield', email: 'dwhitfield@isg.edu.sa', status: 'active' },
  { id: 'u_msmith', name: 'Michael Smith', email: 'msmith@isg.edu.sa', status: 'active' },
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

      // ONE STUDENT WHO DID NOT START HERE. Deniz Yildiz arrived in the January
      // of DP1 from another IB school. Without her every mobility rule in the
      // system is untested against real data, and the failure mode is silent:
      // the code all runs, it is simply never exercised. She is deliberately an
      // EXISTING name rather than a 25th student, so no roster count moves and
      // no assertion about "all 24" has to be weakened to accommodate her.
      const transferred = cohortId === 'c15' && i === 23

      return {
        userId: studentIds(cohortId)[i],
        schoolId: 'dhahran',
        cohortId,
        joinedAt: transferred ? '2026-01-12' : cohortStart(cohortId),
        leftAt: null,
        priorSchool: transferred ? 'Dubai College' : null,
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
  // TECH SUPPORT WHO ALSO TEACHES — the case the role model has to survive.
  //
  // One person, four unrelated jobs: he keeps the system running, and he
  // separately runs CAS, runs EE and teaches TOK. None of those imply each
  // other and none of them is "Core teacher". The preset is what he can DO
  // (everything, because support cannot fix what it cannot see); the roles are
  // what he IS, and they are what the modules read. Adeyemi holds three of the
  // same role keys — a role is a job description, not a seat, and two people
  // can hold one. Markership is the thing that is exactly-one, and it stays
  // with her; he is assigned to the Core sections without it.
  { userId: 'u_msmith', schoolId: 'dhahran', roles: ['tech_admin', 'cas_coordinator', 'ee_coordinator', 'tok_teacher'], presetKey: 'tech_admin', addedCapabilities: [], removedCapabilities: [] },
  { userId: 'u_msmith', schoolId: 'jubail', roles: ['tech_admin'], presetKey: 'tech_admin', addedCapabilities: [], removedCapabilities: [] },
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
  // Class of 2027 — graduating next. Biology SL is co-taught: Farouk is the
  // one designated marker, Silva reads. (The old two-section split merged into
  // the single implicit section; exactly one marker survived the merge.)
  { teacherId: 'u_farouk', sectionId: 'bio_sl_c15_a', isDesignatedMarker: true },
  { teacherId: 'u_silva', sectionId: 'bio_sl_c15_a', isDesignatedMarker: false }, // co-taught
  { teacherId: 'u_silva', sectionId: 'busman_sl_c15_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'tok_c15_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'cas_c15_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'ee_c15_a', isDesignatedMarker: true },
  // Michael Smith runs CAS and EE and teaches TOK alongside her. Not the
  // designated marker on any of them — exactly-one holds, and markership is a
  // separate fact from doing the job.
  { teacherId: 'u_msmith', sectionId: 'tok_c15_a', isDesignatedMarker: false },
  { teacherId: 'u_msmith', sectionId: 'cas_c15_a', isDesignatedMarker: false },
  { teacherId: 'u_msmith', sectionId: 'ee_c15_a', isDesignatedMarker: false },

  // Class of 2028 — same people, the year behind
  { teacherId: 'u_farouk', sectionId: 'bio_sl_c16_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'tok_c16_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'cas_c16_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'ee_c16_a', isDesignatedMarker: true },
  { teacherId: 'u_msmith', sectionId: 'tok_c16_a', isDesignatedMarker: false },
  { teacherId: 'u_msmith', sectionId: 'cas_c16_a', isDesignatedMarker: false },
  { teacherId: 'u_msmith', sectionId: 'ee_c16_a', isDesignatedMarker: false },

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
    // The outline and the draft are DEFS, not module-owned milestones, for one
    // reason: the school tracks them for every candidate against a date, and a
    // date can only attach to a def (Deadline.requirementKey is matched against
    // def keys). Neither carries an exportTarget, because the IB never sees
    // them — which is what that field is for. See IB-EE-Build-Plan.md §5.3.
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.outline', label: 'Outline', lane: 'Extended Essay', recordedBy: 'student', artifact: 'link' }),
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.r1', label: 'Reflection session 1', lane: 'Extended Essay', recordedBy: 'staff', artifact: 'text' }),
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.draft', label: 'Full draft', lane: 'Extended Essay', recordedBy: 'student', artifact: 'link' }),
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.r2', label: 'Reflection session 2', lane: 'Extended Essay', recordedBy: 'staff', artifact: 'text' }),
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.final', label: 'Final essay', lane: 'Extended Essay', recordedBy: 'student', artifact: 'file', exportTarget: 'ecoursework' }),
    // THE VIVA CANNOT PRECEDE THE FINISHED ESSAY. Michael, 20 Aug: the final
    // PDF goes in BEFORE the viva so the supervisor can prepare for it, and the
    // PDF is what stops the paper changing on either side of that conversation.
    // `opensAfter` makes the sequence part of the record rather than a
    // convention people remember — and it renders as locked, never as overdue.
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.viva', label: 'Viva voce (reflection session 3)', lane: 'Extended Essay', recordedBy: 'staff', artifact: 'text', opensAfter: 'ee.final' }),
    // The fix for the endless student list: the RPF cannot be actionable before the viva.
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.rpf', label: 'RPF — reflection statement', lane: 'Extended Essay', recordedBy: 'student', artifact: 'text', exportTarget: 'ecoursework', opensAfter: 'ee.viva' }),
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.attest', label: 'Supervisor attestation', lane: 'Extended Essay', recordedBy: 'staff', artifact: 'none' }),
    // Scoring is the IA marks module, not a second marking engine: criterion
    // grain, total never stored (iaTotal sums on read), MarkEvent audit,
    // marksWriteGrant, unlock. The rubric CONTENT — bands, strands, guidance —
    // is EE reference data in lib/ee/rubric.ts, because it is paraphrase that
    // must be replaceable when the IB's verbatim markbands are available.
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.score', label: 'EE score', lane: 'Extended Essay', recordedBy: 'staff', artifact: 'mark', markMax: EE_MARK_MAX, criteria: EE_CRITERIA.map((c) => ({ key: c.key, label: c.label, max: c.max })) }),
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

  /**
   * Every subject course's IA set comes from its TEMPLATE FAMILY
   * (lib/templates.ts) — the rubric and mark maximum the current guide gives
   * that family for this session. The generic single-total set survives only as
   * the fallback for a course whose family is unset.
   *
   * Three defs per course now, not two: `ia.teacher_comment` was named in the
   * spine's MVP set and the coordinator spec from the start, and the marks
   * screen finally gives it somewhere to be recorded. The board's IA rollup
   * gains its third part for free (lib/board.ts matches by suffix).
   */
  const subjectDefs: RequirementDef[] = COURSES.filter((c) => c.type === 'subject').flatMap((c) => {
    const t = templateOf(c.iaTemplateKey)
    return [
      def({ scope: { kind: 'course', courseId: c.id }, key: c.id + '.file', label: `${c.name} — ${t.component}`, lane: 'Internal assessment', recordedBy: 'student', artifact: 'file', exportTarget: 'ecoursework' }),
      def({
        scope: { kind: 'course', courseId: c.id }, key: c.id + '.mark', label: c.name + ' — mark',
        lane: 'Internal assessment', recordedBy: 'staff', artifact: 'mark',
        markMax: t.markMax,
        criteria: t.criteria.length > 0 ? t.criteria : undefined,
        exportTarget: 'ibis_ia_marks',
      }),
      def({ scope: { kind: 'course', courseId: c.id }, key: c.id + '.comment', label: c.name + ' — teacher comment', lane: 'Internal assessment', recordedBy: 'staff', artifact: 'text' }),
    ]
  })

  const programmeDefs: RequirementDef[] = [
    def({ scope: { kind: 'programme' }, key: 'ib.reg', label: 'Registered with the IB', lane: 'IB admin', recordedBy: 'coordinator', artifact: 'none' }),
    def({ scope: { kind: 'programme' }, key: 'ib.code', label: 'Candidate code', lane: 'IB admin', recordedBy: 'coordinator', artifact: 'text' }),
    def({ scope: { kind: 'programme' }, key: 'ib.auth', label: 'Coursework authenticated', lane: 'IB admin', recordedBy: 'student', artifact: 'none', opensAfter: 'ib.code' }),
  ]

  /**
   * PREDICTED GRADES — three per course, per reporting point.
   *
   * This REPLACES the single programme-scoped `ib.pg` def, which was wrong in
   * three ways at once: not one value, not programme-scoped, and with no
   * reporting point. Course-scoped defs mean `requirementsFor()` already
   * answers "which predictions does this candidate owe" from their enrolments —
   * six subjects plus TOK, with no per-student configuration anywhere.
   *
   * The scale is the ONLY difference between a subject's predicted grade and
   * TOK's: 1–7 against A–E. It rides on the def, so one screen serves both and
   * a third scale later is data rather than a branch.
   *
   * The EXTENDED ESSAY is deliberately absent. It is graded once, near the end,
   * not three times — its own module, later (18 Aug decision). Nothing here
   * needs changing when it arrives: it is more defs.
   *
   * `exportTarget` is on the APRIL def alone, which is what makes the April
   * column the IB's without any component knowing that April is special.
   */
  const pgCourses = COURSES.filter((c) => c.type === 'subject' || c.type === 'tok')
  const pgDefs: RequirementDef[] = pgCourses.flatMap((c) =>
    REPORTING_POINTS.map((p) =>
      def({
        scope: { kind: 'course', courseId: c.id },
        key: pgKey(c.id, p.key),
        label: `${c.name} — predicted, ${p.label}`,
        lane: 'Predicted grades',
        recordedBy: 'staff',
        artifact: 'none',
        gradeScale: c.type === 'tok' ? 'letter_a_e' : 'points_1_7',
        exportTarget: p.toIb ? 'ibis_predicted' : undefined,
      }),
    ),
  )

  return [...casDefs, ...eeDefs, ...tokDefs, ...subjectDefs, ...pgDefs, ...programmeDefs]
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

/**
 * DEADLINES — the dates the year actually runs on.
 *
 * Shaped after the school's own assessment calendar (see
 * IB-Deadlines-and-Release.md, which reads 41 rows off it): the science IAs land
 * a fortnight before Maths, Chemistry a week after that. That staggering is the
 * whole reason a deadline is keyed by course and not just by stage.
 *
 * A few Class-of-2027 dates are in the PAST, deliberately: a demo where nothing
 * is ever late cannot show what late looks like, and late is the state the
 * screens exist to surface.
 */
export const DEADLINES: Deadline[] = pinned('ibDeadlines', () => {
  const mk = (
    cohortId: string,
    requirementKey: string,
    courseId: string | null,
    dueAt: string,
    isMajor: boolean,
    decidedBy = 'IB planning meeting · 4 Sep 26',
  ): Deadline => ({
    id: `dl_${cohortId}_${courseId ?? 'all'}_${requirementKey}`.replace(/\./g, '_'),
    schoolId: 'dhahran',
    cohortId,
    requirementKey,
    courseId,
    dueAt,
    isMajor,
    decidedBy,
    setBy: 'u_michael',
    setAt: '2026-09-04T08:00:00.000Z',
  })

  // Only courses that actually RUN for this cohort. A date on a course with no
  // candidates is a row the coordinator has to read and can never act on.
  const runs = (courseId: string, cohortId: string) => {
    const ids = SECTIONS.filter((x) => x.courseId === courseId && x.cohortId === cohortId).map((x) => x.id)
    return ENROLLMENTS.some((e) => ids.includes(e.sectionId))
  }
  const subjects = COURSES.filter((c) => c.type === 'subject' && runs(c.id, 'c15')).map((c) => c.id)
  // Sciences first, then maths, then everything else — the real stagger.
  const wave = (id: string) =>
    /bio|chem|phys|ess|sport|comp|design/i.test(id) ? '2027-01-14'
      : /math/i.test(id) ? '2027-01-21'
        : /psych|econ|bus|hist|geo|glo/i.test(id) ? '2027-02-04'
          : '2027-01-28'

  return [
    // ---- Class of 2027, mid-DP2 ----
    // Past, and unfinished for some — this is what a late cell is for.
    mk('c15', 'rq', 'ee', '2026-05-15', false),
    mk('c15', 'outline', 'ee', '2026-09-25', false),
    mk('c15', 'draft', 'ee', '2026-10-23', true),
    mk('c15', 'title', 'tok', '2026-06-05', false),
    mk('c15', 'pg.p1', null, '2026-06-20', true),
    mk('c15', 'final', 'ee', '2026-11-13', true),
    mk('c15', 'exh', 'tok', '2026-11-20', false),
    mk('c15', 'exhmark', 'tok', '2026-12-04', false),
    // Upcoming.
    ...subjects.map((id) => mk('c15', 'file', id, wave(id), true)),
    ...subjects.map((id) => mk('c15', 'mark', id, wave(id), true)),
    mk('c15', 'pg.p2', null, '2027-01-16', true),
    mk('c15', 'essay', 'tok', '2027-03-05', true),
    mk('c15', 'complete', 'cas', '2027-04-01', true),
    mk('c15', 'pg.p3', null, '2027-04-20', true),
    mk('c15', 'ib.auth', null, '2027-04-24', true),

    // ---- Class of 2028, two weeks into DP1 ----
    mk('c16', 'rq', 'ee', '2027-05-14', false, 'IB planning meeting · 2 Sep 27'),
    mk('c16', 'pg.p1', null, '2027-06-18', true, 'IB planning meeting · 2 Sep 27'),
  ]
})


/**
 * EE REGISTRATIONS — subject(s), research question, title.
 *
 * Built BEFORE the states, because `ee.rq` is seeded from
 * `registrationComplete()` rather than from a dice roll. That ordering is the
 * point: a fixture where the requirement says "done" and the registration
 * behind it is empty would reproduce, in the fixtures, exactly the lie this
 * module is being built to remove from the board.
 *
 * The Class of 2027 registered at the end of DP1 (deadline 15 May 2026), so
 * nearly all of them have one. The Class of 2028 is two weeks into DP1 and has
 * none, which is correct rather than incomplete.
 */
const RQ_POOL: Record<string, { rq: string; title: string }[]> = {
  'Group 1': [
    { rq: 'To what extent does the unreliable narrator in Ishiguro\u2019s The Remains of the Day shape the reader\u2019s judgement of Stevens?', title: 'Silence and self-deception in The Remains of the Day' },
    { rq: 'How does Woolf use free indirect discourse to represent interiority in Mrs Dalloway?', title: 'The inside of a sentence: consciousness in Mrs Dalloway' },
  ],
  'Group 2': [
    { rq: 'Dans quelle mesure le langage publicitaire fran\u00e7ais recourt-il \u00e0 l\u2019imp\u00e9ratif pour cr\u00e9er une relation de proximit\u00e9\u202f?', title: 'L\u2019imp\u00e9ratif dans la publicit\u00e9 fran\u00e7aise contemporaine' },
  ],
  'Group 3': [
    { rq: 'To what extent did minimum wage increases in Saudi Arabia between 2019 and 2024 affect youth employment in the retail sector?', title: 'Minimum wage and youth employment in Saudi retail' },
    { rq: 'How effectively did Patagonia\u2019s 2022 ownership restructure serve its stated environmental objectives?', title: 'Ownership as strategy: the Patagonia restructure' },
    { rq: 'To what extent does the framing of a survey question alter reported attitudes to risk among adolescents?', title: 'Framing effects in adolescent risk reporting' },
  ],
  'Group 4': [
    { rq: 'How does salinity affect the rate of photosynthesis in Halophila stipulacea from the Arabian Gulf?', title: 'Salinity tolerance in Gulf seagrass' },
    { rq: 'To what extent does the concentration of a copper(II) sulfate catalyst affect the rate of hydrogen peroxide decomposition?', title: 'Catalysis and concentration in peroxide decomposition' },
    { rq: 'How does the length of a bifilar pendulum\u2019s suspension affect its period of oscillation?', title: 'Geometry and period in the bifilar pendulum' },
  ],
  'Group 5': [
    { rq: 'To what extent can the spread of a rumour in a closed population be modelled by the logistic differential equation?', title: 'Modelling rumour spread with the logistic equation' },
  ],
  'Group 6': [
    { rq: 'How do contemporary Saudi artists use calligraphic abstraction to negotiate tradition and modernity?', title: 'The letter as form: calligraphic abstraction in Saudi art' },
  ],
}

export const EE_REGISTRATIONS: EeRegistration[] = pinned('ibEeRegistrations', () => {
  const out: EeRegistration[] = []
  const r = rng(4027)
  for (const s of STUDENTS) {
    // Registered at the end of DP1. c16 has not reached that point; c14 has passed it.
    if (s.cohortId === 'c16') continue
    if (s.cohortId === 'c15' && r() > 0.92) continue

    // The essay is registered in a DP SUBJECT, not in a school course — so the
    // enrolments are only a hint about what a student is likely to pick.
    const subjectCourses = coursesOf(s.userId, ENROLLMENTS, SECTIONS, COURSES)
      .filter((c) => c.type === 'subject')
    if (!subjectCourses.length) continue
    const chosen = subjectCourses[Math.floor(r() * subjectCourses.length)]
    const chosenKey = subjectForCourse(chosen.id)
    if (!chosenKey) continue
    const group = chosen.subjectGroup.slice(0, 7)
    const pool = RQ_POOL[group] ?? RQ_POOL['Group 3']
    const pick = pool[Math.floor(r() * pool.length)]

    // ONE interdisciplinary registration, so the two-subject pathway and its
    // framework requirement are exercised rather than merely permitted.
    const secondKey = subjectCourses
      .map((c) => subjectForCourse(c.id))
      .find((k) => k != null && k !== chosenKey)
    const interdisciplinary = s.userId === 'st04' && secondKey != null

    // ONE STUDENT REGISTERED IN A SUBJECT NOBODY HERE TEACHES. Michael, 20 Aug:
    // no theatre teacher means no theatre EE — a warning, not a blocker. Without
    // this fixture the warning path is written but never walked, and a warning
    // nobody has seen is a warning nobody knows is broken.
    if (s.userId === 'st07') {
      out.push({
        schoolId: s.schoolId, cohortId: s.cohortId, studentId: s.userId,
        subjects: ['film'], framework: null,
        researchQuestion: 'How does Denis Villeneuve use sound design to convey scale in Dune (2021)?',
        title: 'Sound as scale in Villeneuve\u2019s Dune',
        updatedAt: '2026-05-11', updatedBy: s.userId,
      })
      continue
    }

    out.push({
      schoolId: s.schoolId,
      cohortId: s.cohortId,
      studentId: s.userId,
      subjects: interdisciplinary ? [chosenKey, secondKey!] : [chosenKey],
      framework: interdisciplinary ? 'evidence and measurement' : null,
      researchQuestion: pick.rq,
      title: pick.title,
      updatedAt: s.cohortId === 'c14' ? '2024-05-10' : '2026-05-11',
      updatedBy: s.userId,
    })
  }
  return out
})

/**
 * REFLECTION SESSIONS — the three required supervisor meetings.
 *
 * Seeded before the states because ee.r1 / ee.r2 / ee.viva DERIVE from these
 * (lib/ee/derive.ts). The Class of 2027 has had session 1 with most of its
 * supervisors; the graduated cohort has all three.
 */
export const EE_SESSIONS: EeSession[] = pinned('ibEeSessions', () => {
  const out: EeSession[] = []
  const r = rng(5027)
  for (const s of STUDENTS) {
    if (s.cohortId === 'c16') continue
    if (s.cohortId === 'c14') {
      const dates: Record<SessionStage, string> = {
        r1: '2024-10-09', r2: '2025-01-28', viva: '2025-11-20',
      }
      for (const stage of ['r1', 'r2', 'viva'] as SessionStage[]) {
        out.push({
          schoolId: s.schoolId, studentId: s.userId, stage,
          heldOn: dates[stage], recordedBy: 'u_adeyemi', recordedByName: 'H. Adeyemi',
          recordedAt: dates[stage],
        })
      }
      continue
    }
    // c15 — session 1 held in the first weeks of DP2 for most.
    if (r() < 0.78) {
      const day = 4 + Math.floor(r() * 10)
      out.push({
        schoolId: s.schoolId, studentId: s.userId, stage: 'r1',
        heldOn: `2026-09-${String(day).padStart(2, '0')}`,
        recordedBy: 'u_adeyemi', recordedByName: 'H. Adeyemi',
        // Typed up a week or so after the meeting, which is the normal case
        // and the reason heldOn and recordedAt are separate fields.
        recordedAt: `2026-09-${String(Math.min(28, day + 6)).padStart(2, '0')}`,
      })
    }
  }
  return out
})

/**
 * FINISHED ESSAYS. The graduated cohort filed theirs; the Class of 2027's is
 * due 13 November and not one of them has, which is why their upload pack
 * correctly reads zero ready.
 */
export const EE_FINALS: EeFinal[] = pinned('ibEeFinals', () =>
  STUDENTS.filter((s) => s.cohortId === 'c14').map((s) => ({
    schoolId: s.schoolId,
    studentId: s.userId,
    fileName: `${s.personalCode ?? 'no-code'}_EE.pdf`,
    declaredWords: 3600 + ((s.userId.charCodeAt(s.userId.length - 1) * 37) % 380),
    submittedAt: '2025-11-14',
  })),
)

export const EE_SESSION_NOTES: EeSessionNote[] = pinned('ibEeSessionNotes', () => [
  {
    id: 'een1', schoolId: 'dhahran', studentId: 'st01', stage: 'r1',
    authorType: 'staff', authorId: 'u_adeyemi', authorName: 'H. Adeyemi',
    body: 'Scope is still too wide. Agreed to cut the comparison and keep one site.',
    createdAt: '2026-09-14',
  },
  {
    id: 'een2', schoolId: 'dhahran', studentId: 'st01', stage: 'r1',
    authorType: 'student', authorId: 'st01', authorName: 'Layla Ahmed',
    body: 'I had wanted to compare two sites but I can see that is two essays. Narrowing to the one I can actually sample.',
    createdAt: '2026-09-09',
  },
])

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

      /**
       * PREDICTED GRADES are seeded by hand rather than by the generic roll,
       * because a predicted grade is a VALUE, not a completion. A generic state
       * would say recordStatus:'marked' with no grade behind it — the board
       * would report predictions done that do not exist, which is the exact
       * class of lie this codebase spends its time avoiding.
       *
       * The shape seeded is a school in January of DP2: End Y1 in for nearly
       * everyone, January mostly in, April untouched. Recorded grades are
       * LOCKED, because that is what saving one does.
       */
      /**
       * EXTENDED ESSAY is seeded by hand for the same reason predicted grades
       * are, and it is the reason this module is being built: the generic roll
       * was producing a Supervision fraction, an essay in or not in, and an RPF
       * pending for every candidate — none of which any screen could create,
       * explain or change. The board was reporting EE progress that did not
       * exist. What follows is a school in the September of DP2: registered in
       * May, first reflection session held, outline due in a fortnight, and the
       * essay itself still ahead of them.
       */
      if (d.lane === 'Extended Essay') {
        const stage = d.key.slice(3)
        const reg = EE_REGISTRATIONS.find((x) => x.studentId === s.userId)
        const put = (
          recordStatus: RequirementState['recordStatus'],
          recordedAt: string,
          extra: Partial<RequirementState> = {},
        ) => out.push({
          studentId: s.userId, requirementDefId: d.id, schoolId: s.schoolId,
          recordStatus, artifacts: [], recordedAt, ...extra,
        })

        if (s.cohortId === 'c14') {
          // Graduated. Everything in, scored and released.
          if (stage === 'score') {
            const marks = EE_CRITERIA.map((c) => Math.max(1, Math.round(r() * c.max)))
            put('released', '2026-02-20', {
              criterionMarks: marks,
              recordedBy: 'H. Adeyemi',
              lockedAt: '2026-02-20T09:00:00.000Z',
            })
          } else if (stage === 'final') {
            // Filed, and LOCKED by the filing — see EeFinal's file note.
            put('submitted', '2025-11-14', {
              exportStatus: 'submitted', recordedBy: 'student',
              lockedAt: '2025-11-14T09:00:00.000Z',
              artifacts: [{
                id: `art_final_${s.userId}`, kind: 'file',
                label: `${s.personalCode ?? 'no-code'}_EE.pdf`, addedAt: '2025-11-14',
              }],
            })
          } else if (stage === 'rpf') {
            put('submitted', '2026-01-30', { exportStatus: 'submitted', recordedBy: 'student' })
          } else if (stage === 'r1' || stage === 'r2' || stage === 'viva') {
            // Derived from EE_SESSIONS, never stored.
          } else {
            put('submitted', '2025-11-14', { recordedBy: 'H. Adeyemi' })
          }
          continue
        }

        if (s.cohortId === 'c16') continue // two weeks into DP1; nothing yet, correctly

        // ---- Class of 2027, September of DP2 ----
        if (stage === 'rq') {
          // NOT a dice roll: the requirement is complete exactly when the
          // registration behind it would survive contact with IBIS.
          if (registrationComplete(reg)) put('submitted', reg!.updatedAt, { recordedBy: 'student' })
          continue
        }
        if (stage === 'outline') {
          // Due 25 Sep; a third are early, a few have started.
          const roll = r()
          if (roll < 0.34) {
            put('submitted', '2026-09-14', {
              recordedBy: 'student',
              artifacts: [{
                id: `art_out_${s.userId}`, kind: 'link',
                label: 'Outline',
                href: 'https://docs.google.com/document/d/outline-' + s.userId,
                addedAt: '2026-09-14',
              }],
            })
          } else if (roll < 0.47) {
            put('in_progress', '2026-09-12', { recordedBy: 'student' })
          }
          continue
        }
        // r1, r2 and viva are DERIVED from EE_SESSIONS — see lib/ee/derive.ts.
        // Seeding them here as well would store a derived value, which is the
        // one thing spine invariant #2 forbids.
        // draft, final, rpf, attest, score: genuinely still ahead.
        continue
      }

      if (d.lane === 'Predicted grades') {
        const point = d.key.slice(d.key.lastIndexOf('.') + 1)
        // The new cohort has predicted nothing; the archived one is complete.
        const chance =
          s.cohortId === 'c16' ? 0
            : s.cohortId === 'c14' ? 1
              : point === 'p1' ? 0.92 : point === 'p2' ? 0.78 : 0
        if (r() >= chance) continue
        const values = d.gradeScale === 'letter_a_e'
          ? ['A', 'B', 'B', 'C', 'C', 'D']
          : ['3', '4', '4', '5', '5', '5', '6', '6', '7']
        out.push({
          studentId: s.userId,
          requirementDefId: d.id,
          schoolId: s.schoolId,
          recordStatus: 'marked',
          grade: values[Math.floor(r() * values.length)],
          artifacts: [],
          recordedBy: 'R. Farouk',
          recordedAt: point === 'p1' ? '2026-06-18' : '2027-01-12',
          lockedAt: point === 'p1' ? '2026-06-18T09:00:00.000Z' : '2027-01-12T09:00:00.000Z',
        })
        continue
      }

      const roll = r()
      // Late-stage requirements are legitimately less complete than early ones.
      const bias = d.lane === 'IB admin' ? 0.4 : d.exportTarget ? 0.18 : 0.08
      if (roll < 0.1 + bias) continue // nothing recorded yet
      const status =
        roll > 0.55 + bias ? 'marked' : roll > 0.3 + bias ? 'submitted' : 'in_progress'
      // A mark def with CRITERIA is recorded at criterion grain — the total is
      // never stored (invariant #2; iaTotal() sums on read). in_progress means
      // some criteria are still null, exactly as a half-marked IA looks.
      const criterionMarks =
        d.artifact === 'mark' && d.criteria
          ? d.criteria.map((c, i) =>
              status !== 'in_progress' || i < d.criteria!.length / 2
                ? Math.round(r() * c.max)
                : null,
            )
          : undefined
      out.push({
        studentId: s.userId,
        requirementDefId: d.id,
        schoolId: 'dhahran',
        recordStatus: status,
        exportStatus: d.exportTarget && status === 'marked' ? 'ready_for_submission' : undefined,
        mark:
          d.artifact === 'mark' && !d.criteria && status !== 'in_progress'
            ? Math.round(r() * (d.markMax ?? 25))
            : undefined,
        criterionMarks,
        artifacts:
          d.artifact === 'file' && status !== 'in_progress'
            ? ART(d.label + '.pdf')
            : d.key.endsWith('.comment') && status !== 'in_progress'
              ? [{ id: d.id + ':c', kind: 'text', label: 'Teacher comment', body: 'Marks justified per criterion; see rubric notes.', addedAt: '2026-08-02' }]
              : [],
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
  return [
    ...REQUIREMENT_STATES,
    ...deriveCasStates(STUDENTS, REQUIREMENT_DEFS, CAS_DATA),
    ...deriveEeSessionStates(EE_SESSIONS, REQUIREMENT_DEFS),
  ]
}

/**
 * The IA audit trail and unlock records — runtime-written, so pinned. Both
 * start empty: fixtures fake a mid-year school, but a fabricated audit trail
 * would be a lie about who changed what, which is the one thing it exists to
 * never be. Sample requests (the IBIS moderation sample) are runtime-written
 * too, so they are pinned for the same reason.
 */
export const MARK_EVENTS: MarkEvent[] = pinned('ibMarkEvents', () => [])
const MARK_UNLOCKS: MarkUnlock[] = pinned('ibMarkUnlocks', () => [])
export const SAMPLE_REQUESTS: SampleRequest[] = pinned('ibSampleRequests', () => [])

/**
 * EE SUPERVISION — who has been assigned, and who has deliberately not been.
 *
 * The Class of 2027 is most of the way through allocation: twenty students are
 * with a named supervisor and FOUR ARE NOT, which is the state the fallback
 * exists for and the reason the fixture leaves them alone rather than tidying
 * them up. The Class of 2028 is two weeks into DP1 and has none at all — every
 * one of them resolves to the EE coordinator, which is correct in September and
 * is exactly what the coordinator's allocation list should look like.
 *
 * Nobody is ever "unassigned" on screen. They are assigned to the coordinator.
 */
export const EE_SUPERVISION: EeSupervision[] = pinned('ibEeSupervision', () => {
  const rows: EeSupervision[] = []
  const c15 = STUDENTS.filter((s) => s.cohortId === 'c15')
  c15.slice(0, 20).forEach((st, i) => {
    rows.push({
      schoolId: 'dhahran',
      cohortId: 'c15',
      studentId: st.userId,
      supervisorId: i % 2 === 0 ? 'u_adeyemi' : 'u_silva',
      assignedBy: 'u_msmith',
      assignedAt: '2025-10-06',
      endedAt: null,
    })
  })
  return rows
})

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
  // Remove-course refuses whenever recorded work exists — it needs to SEE the
  // recorded work to refuse honestly.
  states: REQUIREMENT_STATES,
  events: MARK_EVENTS,
})

const iaRepository = makeIaRepository({
  courses: COURSES,
  sections: SECTIONS,
  enrollments: ENROLLMENTS,
  students: STUDENTS,
  users: USERS,
  assignments: TEACHING_ASSIGNMENTS,
  defs: REQUIREMENT_DEFS,
  states: REQUIREMENT_STATES,
  events: MARK_EVENTS,
  unlocks: MARK_UNLOCKS,
  samples: SAMPLE_REQUESTS,
})

const deadlineRepository = makeDeadlineRepository({
  courses: COURSES,
  sections: SECTIONS,
  enrollments: ENROLLMENTS,
  students: STUDENTS,
  assignments: TEACHING_ASSIGNMENTS,
  defs: REQUIREMENT_DEFS,
  states: REQUIREMENT_STATES,
  deadlines: DEADLINES,
})

const pgRepository = makePgRepository({
  courses: COURSES,
  sections: SECTIONS,
  enrollments: ENROLLMENTS,
  students: STUDENTS,
  users: USERS,
  assignments: TEACHING_ASSIGNMENTS,
  defs: REQUIREMENT_DEFS,
  states: REQUIREMENT_STATES,
  // The SAME trail as the IA module. One course, one history.
  events: MARK_EVENTS,
  deadlines: DEADLINES,
})

const exportRepository = makeExportRepository({
  cohorts: COHORTS,
  courses: COURSES,
  sections: SECTIONS,
  enrollments: ENROLLMENTS,
  students: STUDENTS,
  users: USERS,
  defs: REQUIREMENT_DEFS,
  states: REQUIREMENT_STATES,
  samples: SAMPLE_REQUESTS,
})

const casRepository = makeCasRepository({
  data: CAS_DATA,
  nextExperienceId: casCounters.nextExperienceId,
  nextEntryId: casCounters.nextEntryId,
  studentsIn: (schoolId, cohortId) =>
    STUDENTS.filter((s) => s.schoolId === schoolId && s.cohortId === cohortId),
  nameOf: (userId) => USERS.find((u) => u.id === userId)?.name ?? '',
  cohortOf: (userId) => STUDENTS.find((s) => s.userId === userId)?.cohortId ?? 'c15',
  joinedAtOf: (userId) => {
    const st = STUDENTS.find((s) => s.userId === userId)
    return st?.joinedAt ?? cohortStart(st?.cohortId ?? 'c15')
  },
})

// ---------------------------------------------------------------------------

/**
 * WHICH DP SUBJECTS THE SCHOOL CAN PLAUSIBLY SUPERVISE — derived, never configured.
 *
 * Michael, 20 Aug: no theatre teacher means no theatre EE — as a WARNING, not a
 * blocker. Deriving it means a subject the school picks up next year clears its
 * own warning, and one it drops raises one. A stored list would have to be
 * maintained by somebody who will not remember to.
 *
 * IT READS "DOES THE SCHOOL RUN THIS COURSE?", NOT "IS A TEACHER ASSIGNED?"
 * The sharper signal would be a named teaching assignment, and that is the one
 * this originally used — but the assignment table is deliberately sparse in the
 * fixtures (it exists to exercise marker permissions, not to staff a school),
 * so it reported that nobody at ISG teaches mathematics. A warning that fires on
 * seventeen of twenty-four candidates is not a warning, it is furniture, and the
 * failure mode of the coarser signal is a warning that does not fire when a
 * teacher leaves — which the coordinator would notice anyway, because they are
 * the one finding the supervisor.
 *
 * Move to teaching assignments when the assignment table describes a real
 * staffing picture. Nothing above this line changes when it does.
 */
/**
 * A filed essay is LOCKED unless somebody with `items.unlock` has reopened it.
 * The lock lives on the RequirementState (`lockedAt`, already in the spine and
 * already used by IA marks) rather than on EeFinal, so every module that asks
 * "may this be changed?" asks it of the same field.
 */
function finalIsLocked(schoolId: string, studentId: string): boolean {
  const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
  if (!st) return false
  const def = REQUIREMENT_DEFS.find(
    (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === 'ee.final',
  )
  if (!def) return false
  const state = REQUIREMENT_STATES.find(
    (x) => x.studentId === studentId && x.requirementDefId === def.id,
  )
  return state?.lockedAt != null
}

function supportedSubjectKeys(schoolId: string): string[] {
  const out = new Set<string>()
  for (const section of SECTIONS) {
    if (section.schoolId !== schoolId) continue
    const key = subjectForCourse(section.courseId)
    if (key) out.add(key)
  }
  return [...out]
}

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

  async teachesStudent(schoolId, teacherId, studentId) {
    // ANY assignment, marker or not — a co-teacher sees the whole student too.
    // The relationship is teacher ↔ section ↔ enrolment, never teacher ↔ student.
    const mySections = new Set(
      TEACHING_ASSIGNMENTS.filter((t) => t.teacherId === teacherId).map((t) => t.sectionId),
    )
    return ENROLLMENTS.some(
      (e) =>
        e.studentId === studentId &&
        mySections.has(e.sectionId) &&
        SECTIONS.some((s) => s.id === e.sectionId && s.schoolId === schoolId),
    )
  },

  async mySpaces(schoolId, userId) {
    // Sections reached either way — enrolled in, or assigned to teach.
    const sectionIds = new Set([
      ...ENROLLMENTS.filter((e) => e.studentId === userId).map((e) => e.sectionId),
      ...TEACHING_ASSIGNMENTS.filter((t) => t.teacherId === userId).map((t) => t.sectionId),
    ])
    const mine = SECTIONS.filter((s) => sectionIds.has(s.id) && s.schoolId === schoolId)
    const reach = new Set(mine.map((s) => `${s.cohortId}:${s.courseId}`))

    /**
     * THE THIRD SOURCE OF REACH — supervision (IB-EE-Build-Plan.md §3).
     *
     * Michael's question was whether Extended Essay should sit in every
     * teacher's list by default, appearing when they have a supervisee. The
     * better half of that is the second half: a space you hold because of a
     * relationship, exactly as a class is. An always-present, usually-empty EE
     * tile teaches every teacher in the school to skip an item in their own
     * navigation, and a nav item people have learned to ignore is worse than
     * none — one day it will matter.
     *
     * So the EE space is granted to whoever is the RESPONSIBLE ADULT for at
     * least one student, which is `supervisorFor` — invariant #12 read from the
     * other end. That covers an assigned supervisor and the EE coordinator
     * standing in for the unassigned, in one rule, with no capability check and
     * nothing stored. Assign someone their first supervisee and EE appears;
     * reassign their last and it goes.
     */
    const fallback = eeCoordinatorId(schoolId, MEMBERSHIPS)
    const supervisions = EE_SUPERVISION.filter((s) => s.schoolId === schoolId)
    for (const cohort of COHORTS.filter((c) => c.schoolId === schoolId)) {
      if (reach.has(`${cohort.id}:ee`)) continue
      const supervisesSomeone = STUDENTS.some(
        (st) =>
          st.schoolId === schoolId && st.cohortId === cohort.id &&
          supervisorFor(st.userId, supervisions, fallback, USERS)?.userId === userId,
      )
      if (supervisesSomeone) reach.add(`${cohort.id}:ee`)
    }

    return sortCohorts(COHORTS.filter((c) => [...reach].some((k) => k.startsWith(c.id + ':'))))
      .map((cohort) => ({
        cohort,
        courses: COURSES.filter((c) => reach.has(`${cohort.id}:${c.id}`)),
      }))
      .filter((g) => g.courses.length > 0)
  },

  async getTrack(schoolId, studentUserId, opts) {
    const student = STUDENTS.find((s) => s.userId === studentUserId)
    if (!student || student.schoolId !== schoolId) return null
    const user = USERS.find((u) => u.id === studentUserId)
    if (!user) return null
    // FAIL CLOSED: session number and personal code leave only when the caller
    // said `includeIdentifiers` — gated on `identifiers.manage` at the call
    // site. The PIN never leaves a track at all (redact()).
    const visible = opts?.includeIdentifiers
      ? redact(student)
      : { ...redact(student), sessionNumber: null, personalCode: null }
    const track = buildTrack(
      visible,
      user,
      REQUIREMENT_DEFS,
      coursesOf(studentUserId, ENROLLMENTS, SECTIONS, COURSES),
      allStates(),
    )
    // Attach the applicable deadline to every checkpoint. Done HERE rather than
    // inside buildTrack so the spine's derivation stays a pure function of defs
    // and states — dates are a separate record, and the track is where the two
    // meet. `late` is derived on read; nothing about it is stored.
    const mine = DEADLINES.filter(
      (d) => d.schoolId === schoolId && d.cohortId === student.cohortId,
    )
    const today = todayRiyadh()
    // Invariant #8: nothing is overdue before this student could have started
    // it. Computed once per track, not per checkpoint, and passed in — the
    // deadline rule stays a pure function that takes a date rather than a
    // function that knows what a Student is.
    const notBefore = lateFrom(student)
    return {
      ...track,
      lanes: track.lanes.map((lane) => ({
        ...lane,
        checkpoints: lane.checkpoints.map((cp) => withDue(cp, mine, today, notBefore)),
      })),
    }
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

  ee: {
    async getSupervisor(schoolId, studentId) {
      return supervisorFor(
        studentId,
        EE_SUPERVISION.filter((s) => s.schoolId === schoolId),
        eeCoordinatorId(schoolId, MEMBERSHIPS),
        USERS,
      )
    },

    async listSupervision(schoolId, cohortId) {
      const fallback = eeCoordinatorId(schoolId, MEMBERSHIPS)
      const mine = EE_SUPERVISION.filter((s) => s.schoolId === schoolId)
      return STUDENTS.filter((s) => s.schoolId === schoolId && s.cohortId === cohortId).map(
        (st) => ({
          studentId: st.userId,
          name: USERS.find((u) => u.id === st.userId)?.name ?? st.userId,
          supervisor: supervisorFor(st.userId, mine, fallback, USERS),
        }),
      )
    },

    async getStudentView(schoolId, studentId) {
      const st = STUDENTS.find((s) => s.userId === studentId && s.schoolId === schoolId)
      if (!st) return null
      const reg = EE_REGISTRATIONS.find((r2) => r2.studentId === studentId) ?? null
      return {
        studentId,
        studentName: USERS.find((u) => u.id === studentId)?.name ?? studentId,
        registration: reg,
        // Validated on READ rather than trusted from a flag written at save
        // time — a registration can stop being valid if the catalogue changes
        // under it, and the student should hear that from the screen.
        problems: reg ? validateRegistration(reg) : [],
        supervisor: supervisorFor(
          studentId,
          EE_SUPERVISION.filter((s) => s.schoolId === schoolId),
          eeCoordinatorId(schoolId, MEMBERSHIPS),
          USERS,
        ),
        // A SHORTLIST, never a restriction — the full DP list sits under it.
        likelySubjects: [
          ...new Set(
            coursesOf(studentId, ENROLLMENTS, SECTIONS, COURSES)
              .filter((c) => c.type === 'subject')
              .map((c) => subjectForCourse(c.id))
              .filter((k): k is string => k != null),
          ),
        ],
        sessions: EE_SESSIONS.filter(
          (x) => x.studentId === studentId && x.schoolId === schoolId,
        ),
        notes: EE_SESSION_NOTES.filter(
          (x) => x.studentId === studentId && x.schoolId === schoolId,
        ).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        supportedSubjects: supportedSubjectKeys(schoolId),
        final: EE_FINALS.find((x) => x.studentId === studentId && x.schoolId === schoolId) ?? null,
        finalLocked: finalIsLocked(schoolId, studentId),
        // The RPF PANEL is always shown; the WRITING is what the viva gates.
        rpfOpen: EE_SESSIONS.some(
          (x) => x.studentId === studentId && x.schoolId === schoolId && x.stage === 'viva',
        ),
      }
    },

    async getRoster(schoolId, cohortId, forUserId) {
      const supported = new Set(supportedSubjectKeys(schoolId))
      const fallback = eeCoordinatorId(schoolId, MEMBERSHIPS)
      const sup = EE_SUPERVISION.filter((s) => s.schoolId === schoolId)
      const rows: EeRosterRow[] = []
      for (const st of STUDENTS.filter((s) => s.schoolId === schoolId && s.cohortId === cohortId)) {
        const supervisor = supervisorFor(st.userId, sup, fallback, USERS)
        // SCOPE IS DECIDED HERE, not in the component. A supervisor sees the
        // students they are responsible for and nobody else's essay; a
        // component that forgets that is a leak.
        if (forUserId != null && supervisor?.userId !== forUserId) continue
        const track = await fixtureRepository.getTrack(schoolId, st.userId)
        const lane = track?.lanes.find((l) => l.lane === 'Extended Essay')
        rows.push({
          studentId: st.userId,
          studentName: USERS.find((u) => u.id === st.userId)?.name ?? st.userId,
          sessionNumber: st.sessionNumber,
          supervisor,
          registration: EE_REGISTRATIONS.find((r2) => r2.studentId === st.userId) ?? null,
          done: lane?.done ?? 0,
          total: lane?.total ?? 0,
          late: lane?.checkpoints.filter((cp) => cp.due?.late).length ?? 0,
          sessions: EE_SESSIONS.filter((x) => x.studentId === st.userId && x.schoolId === schoolId),
          notes: EE_SESSION_NOTES.filter(
            (x) => x.studentId === st.userId && x.schoolId === schoolId,
          ).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
          unsupportedSubjects: (
            EE_REGISTRATIONS.find((r2) => r2.studentId === st.userId)?.subjects ?? []
          ).filter((k) => !supported.has(k)),
          final: EE_FINALS.find((x) => x.studentId === st.userId && x.schoolId === schoolId) ?? null,
        })
      }
      return rows.sort((a, b) => a.studentName.localeCompare(b.studentName))
    },

    async recordSession(schoolId, studentId, stage, heldOn, recordedBy, recordedByName, onBehalf) {
      const at = todayRiyadh()
      const existing = EE_SESSIONS.find(
        (x) => x.studentId === studentId && x.schoolId === schoolId && x.stage === stage,
      )
      if (existing) {
        // Correcting a date is not a second meeting.
        existing.heldOn = heldOn
        existing.recordedBy = recordedBy
        existing.recordedByName = recordedByName
        existing.recordedAt = at
        existing.onBehalf = onBehalf
        return
      }
      EE_SESSIONS.push({
        schoolId, studentId, stage, heldOn, recordedBy, recordedByName,
        recordedAt: at, onBehalf,
      })
    },

    async addSessionNote(schoolId, studentId, stage, authorType, authorId, authorName, body) {
      EE_SESSION_NOTES.push({
        id: `een_${EE_SESSION_NOTES.length + 1}_${studentId}_${stage}`,
        schoolId, studentId, stage, authorType, authorId, authorName,
        body: body.trim(),
        createdAt: todayRiyadh(),
      })
    },

    async listNotes(schoolId, studentId) {
      return EE_SESSION_NOTES.filter(
        (x) => x.studentId === studentId && x.schoolId === schoolId,
      ).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },

    async saveRegistration(schoolId, cohortId, studentId, input) {
      const candidate = { schoolId, cohortId, studentId, ...input }
      const problems = validateRegistration(candidate)
      // REFUSE rather than save-and-flag. `ee.rq` means "this registration
      // would survive contact with IBIS"; storing an invalid one and marking
      // the requirement incomplete would put one judgement in two places.
      if (problems.length) return { ok: false, problems }
      const at = todayRiyadh()
      const existing = EE_REGISTRATIONS.find((r2) => r2.studentId === studentId)
      if (existing) Object.assign(existing, input, { updatedAt: at, updatedBy: studentId })
      else EE_REGISTRATIONS.push({ ...candidate, updatedAt: at, updatedBy: studentId })
      // The state FOLLOWS the record and is never written independently of it.
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === cohortId && d.schoolId === schoolId && d.key === 'ee.rq',
      )
      if (def) {
        const state = REQUIREMENT_STATES.find(
          (s) => s.studentId === studentId && s.requirementDefId === def.id,
        )
        if (state) state.recordStatus = 'submitted'
        else REQUIREMENT_STATES.push({
          studentId, requirementDefId: def.id, schoolId,
          recordStatus: 'submitted', artifacts: [], recordedAt: at, recordedBy: studentId,
        })
      }
      return { ok: true, problems: [] }
    },

    async submitFinal(schoolId, studentId, fileName, declaredWords) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === 'ee.final',
      )
      if (!def) return
      const at = todayRiyadh()

      const existing = EE_FINALS.find((x) => x.studentId === studentId && x.schoolId === schoolId)
      const row: EeFinal = { schoolId, studentId, fileName, declaredWords, submittedAt: at }
      if (existing) Object.assign(existing, row, {
        // A replacement after an unlock keeps the unlock on the record.
        unlockedBy: existing.unlockedBy, unlockedByName: existing.unlockedByName,
        unlockReason: existing.unlockReason, unlockedAt: existing.unlockedAt,
      })
      else EE_FINALS.push(row)

      const state = REQUIREMENT_STATES.find(
        (x) => x.studentId === studentId && x.requirementDefId === def.id,
      )
      // FILING IS WHAT LOCKS IT. There is no separate "lock" button, because a
      // paper the student can still change is not the fixed artefact the viva
      // needs to be about.
      const lockedAt = new Date(`${at}T00:00:00.000Z`).toISOString()
      if (state) {
        state.recordStatus = 'submitted'
        state.recordedAt = at
        state.lockedAt = lockedAt
        state.artifacts = [{ id: `art_final_${studentId}`, kind: 'file', label: fileName, addedAt: at }]
      } else {
        REQUIREMENT_STATES.push({
          studentId, requirementDefId: def.id, schoolId,
          recordStatus: 'submitted', recordedAt: at, recordedBy: studentId, lockedAt,
          artifacts: [{ id: `art_final_${studentId}`, kind: 'file', label: fileName, addedAt: at }],
        })
      }
    },

    async unlockFinal(schoolId, studentId, byId, byName, reason) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === 'ee.final',
      )
      if (!def) return
      const state = REQUIREMENT_STATES.find(
        (x) => x.studentId === studentId && x.requirementDefId === def.id,
      )
      if (state) delete state.lockedAt
      const row = EE_FINALS.find((x) => x.studentId === studentId && x.schoolId === schoolId)
      if (row) {
        // The unlock is kept, not erased by the next upload. Who reopened a
        // finished paper, and why, is exactly what an authenticity question asks.
        row.unlockedBy = byId
        row.unlockedByName = byName
        row.unlockReason = reason
        row.unlockedAt = todayRiyadh()
      }
    },

    async setLink(schoolId, studentId, stage, href, label) {
      const st = STUDENTS.find((s) => s.userId === studentId && s.schoolId === schoolId)
      if (!st) return
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === `ee.${stage}`,
      )
      if (!def) return
      const at = todayRiyadh()
      const artifact = {
        id: `art_${stage}_${studentId}`, kind: 'link' as const, label,
        href: href.trim(), addedAt: at,
      }
      const state = REQUIREMENT_STATES.find(
        (s) => s.studentId === studentId && s.requirementDefId === def.id,
      )
      if (state) {
        state.artifacts = [artifact]
        state.recordStatus = 'submitted'
        state.recordedAt = at
      } else {
        REQUIREMENT_STATES.push({
          studentId, requirementDefId: def.id, schoolId,
          recordStatus: 'submitted', artifacts: [artifact], recordedAt: at, recordedBy: studentId,
        })
      }
    },

    async assignSupervisor(schoolId, cohortId, studentId, supervisorId, assignedBy) {
      const at = todayRiyadh()
      // End rather than edit: the previous supervisor stays named on the
      // reflection sessions they actually held.
      for (const row of EE_SUPERVISION) {
        if (row.schoolId === schoolId && row.studentId === studentId && row.endedAt == null) {
          row.endedAt = at
        }
      }
      EE_SUPERVISION.push({
        schoolId, cohortId, studentId, supervisorId, assignedBy, assignedAt: at, endedAt: null,
      })
    },
  },

  cas: casRepository,
  setup: setupRepository,
  ia: iaRepository,
  pg: pgRepository,
  deadlines: deadlineRepository,
  export: exportRepository,

  async listDocuments(schoolId, forUserId) {
    const isStudent = roleOf(forUserId, schoolId).includes('student')
    const cohortId = STUDENTS.find((s) => s.userId === forUserId)?.cohortId ?? null
    return DOCUMENTS.filter((d) => d.schoolId === schoolId)
      .filter((d) => (isStudent ? d.audience !== 'staff' : true))
      .filter((d) => (isStudent && d.cohortId ? d.cohortId === cohortId : true))
  },
}
