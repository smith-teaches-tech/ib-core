// Fixture data — a realistic ISG cohort, entirely in memory.
//
// Deliberately uneven: students take different subjects, some take Physics and
// some don't, some do English A HL and some SL. That is the case Michael raised,
// and it is handled by one rule (requirements attach to courses) rather than by
// any per-student configuration.

import type {
  Artifact, Cohort, Course, Deadline, Enrollment, LibraryDocument, Membership,
  RequirementDef, RequirementState, School, Section, StoredRef, Student,
  TeachingAssignment, User,
} from '../types'
import { fileArtifact, fileOf, supersede } from '../files'
import { PDF_ONLY } from '../accepts'
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
import { lateFrom, studentMaySee, withDue } from '../deadlines'
import type { EeSupervision } from '../ee/types'
import { eeCoordinatorId, supervisorFor } from '../ee/supervision'
import { EE_CRITERIA, EE_MARK_MAX, indicativeGrade } from '../ee/rubric'
import { TOK_MARK_MAX } from '../tok/rubric'
import {
  PRESCRIBED_TITLE_COUNT, SEED_BOUNDARIES, boundaryProblems, interactionLine,
  interactionOpen, letterFor,
} from '../tok/types'
import type { AuthorshipConcern, TokFileView, TokMark } from '../tok/types'
import { EXHIBITION_INSTRUMENT, bandFor, tokTotal } from '../tok/rubric'
import { releaseBlockers } from '../tok/marking'
import { composeTeacherComment, signBlockers } from '../tok/ppf'
import { promptText } from '../tok/prompts'
import { subjectName } from '../ee/subjects'
import type {
  InteractionNumber, TokBoundaryTable, TokDraft, TokFile, TokInteractionLog, TokPpf,
  TokPpfView, TokTitleSet,
} from '../tok/types'
import { countWords } from '../ee/scoring'
import { registrationComplete, validateRegistration } from '../ee/registration'
import { subjectForCourse } from '../ee/subjects'
import { deriveEeAttestStates, deriveEeSessionStates } from '../ee/derive'
import type {
  EeFinal, EeRegistration, EeRosterRow, EeScoring, EeSession, EeSessionNote, SessionStage,
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
  // The Core capabilities are HIS, not the teacher preset's — narrowed 22 Aug.
  // Farouk and Silva teach a subject; Adeyemi runs CAS, EE and TOK, and holds
  // the three that go with those jobs.
  { userId: 'u_adeyemi', schoolId: 'dhahran', roles: ['cas_coordinator', 'ee_coordinator', 'tok_teacher'], presetKey: 'teacher', addedCapabilities: ['items.unlock', 'cas.manage', 'ee.manage', 'tok.manage'], removedCapabilities: [] },
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
    def({ scope: { kind: 'course', courseId: 'ee' }, key: 'ee.final', label: 'Final essay', lane: 'Extended Essay', recordedBy: 'student', artifact: 'file', accepts: PDF_ONLY, exportTarget: 'ecoursework' }),
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
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.prompt', label: 'Exhibition prompt chosen', lane: 'TOK', recordedBy: 'student', artifact: 'text' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.exh', label: 'Exhibition', lane: 'TOK', recordedBy: 'student', artifact: 'file', accepts: PDF_ONLY, exportTarget: 'ecoursework' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.exhmark', label: 'Exhibition mark', lane: 'TOK', recordedBy: 'staff', artifact: 'mark', markMax: TOK_MARK_MAX }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.title', label: 'Title chosen', lane: 'TOK', recordedBy: 'student', artifact: 'text' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.ppf1', label: 'TK/PPF 1', lane: 'TOK', recordedBy: 'student', artifact: 'text' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.ppf2', label: 'TK/PPF 2', lane: 'TOK', recordedBy: 'student', artifact: 'text', opensAfter: 'tok.ppf1' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.ppf3', label: 'TK/PPF 3', lane: 'TOK', recordedBy: 'student', artifact: 'text', opensAfter: 'tok.ppf2' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.ppfsign', label: 'TK/PPF signed off', lane: 'TOK', recordedBy: 'staff', artifact: 'none', opensAfter: 'tok.ppf3' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.essay', label: 'Final essay', lane: 'TOK', recordedBy: 'student', artifact: 'file', accepts: PDF_ONLY, exportTarget: 'ecoursework' }),
    def({ scope: { kind: 'course', courseId: 'tok' }, key: 'tok.essaymark', label: 'Predicted essay mark', lane: 'TOK', recordedBy: 'staff', artifact: 'mark', markMax: TOK_MARK_MAX }),
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
      def({ scope: { kind: 'course', courseId: c.id }, key: c.id + '.file', label: `${c.name} — ${t.component}`, lane: 'Internal assessment', recordedBy: 'student', artifact: 'file', accepts: t.accepts, exportTarget: 'ecoursework' }),
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

/**
 * A FIXTURE FILE, as a real record.
 *
 * Until 22 Aug this returned `{ kind: 'file', label }` and nothing in the
 * product read it — the board's green box had a filename behind it and no file.
 * It now mints a real StoredRef, so the reader, the chip and MediaViewer all
 * have something honest to show while storage is stubbed.
 *
 * THE SIZE IS DERIVED FROM THE NAME, not drawn: adding a draw here would shift
 * every lane seeded after it (the standing caution about the shared RNG), and a
 * demo where the same paper is 1.4 MB on one reload and 0.6 MB on the next is a
 * demo nobody trusts.
 */
function fixtureBytes(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  // 0.4 MB – 2.4 MB, which is what a marked-up IA PDF actually weighs.
  return 400_000 + (h % 2_000_000)
}

export function fixtureRef(
  name: string,
  addedAt: string,
  mime = 'application/pdf',
): StoredRef {
  return {
    id: 'sr_' + name.replace(/[^A-Za-z0-9]+/g, '_'),
    name,
    mime,
    bytes: fixtureBytes(name),
    // The key is opaque and stays opaque — a fixture path today, a bucket key
    // the day the adapter is real, and nothing reads it either way.
    key: `dhahran/fixture/${name}`,
    addedAt,
  }
}

/**
 * THE NAME A REAL CANDIDATE GIVES A FILE — deterministic per (student,
 * requirement), and it varies, because that is the truth about a folder of
 * twenty-four uploads. "IA_final_v3.pdf" with no idea whose it is is precisely
 * the problem the reader exists to solve, and a fixture full of tidy machine
 * names would hide it.
 *
 * THE EXTENSION FOLLOWS THE DEF'S `accepts`. A Language B individual oral is an
 * audio recording, so its fixture is an .m4a — a seeded .pdf there would be a
 * fixture lying about a component, which is the one thing fixtures may not do.
 */
function studentFileName(userId: string, def: RequirementDef): string {
  const name = USERS.find((u) => u.id === userId)?.name ?? userId
  const [last, first] = name.split(',').map((x) => x.trim())
  const audio = def.accepts?.some((a) => a.startsWith('audio/')) ?? false
  const ext = audio ? 'm4a' : 'pdf'
  // The subject or component, as a student would say it — never the word
  // "file", which is what the def key's last segment happens to be.
  const stem = def.key.includes('.')
    ? def.key.slice(0, def.key.indexOf('.')).replace(/_/g, '-')
    : def.key
  const forms = audio
    ? [
        `${(first ?? name).toLowerCase()}-oral.${ext}`,
        `${stem}-oral-recording.${ext}`,
        `${(last ?? name).toLowerCase()}_IO.${ext}`,
        `recording-final.${ext}`,
      ]
    : [
        `${(first ?? name).toLowerCase()}-${stem}-final.${ext}`,
        `${stem}_final_v3.${ext}`,
        `${(last ?? name).toLowerCase()}_${stem}.${ext}`,
        `IA_final_v3.${ext}`,
      ]
  let h = 0
  const seed = userId + def.key
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return forms[h % forms.length]
}

const nameOf = (userId: string) => USERS.find((u) => u.id === userId)?.name ?? userId

/** The mime a fixture file claims. Off the def, for the same reason as above. */
function fixtureMime(def: RequirementDef): string {
  const audio = def.accepts?.some((a) => a.startsWith('audio/')) ?? false
  return audio ? 'audio/mp4' : 'application/pdf'
}

const ART = (label: string, addedBy?: string, mime?: string): Artifact[] => [
  fileArtifact(label, fixtureRef(label, '2026-08-01', mime), { addedAt: '2026-08-01', addedBy }),
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
    // A MODULE MILESTONE IS THE TEACHER'S DATE, not the planning meeting's,
    // and `decidedBy` is what tells a reader in March which it was.
    mk('c15', 'title', 'tok', '2026-06-05', false, 'H. Adeyemi · TOK'),
    mk('c15', 'pg.p1', null, '2026-06-20', true),
    mk('c15', 'final', 'ee', '2026-11-13', true),
    mk('c15', 'exh', 'tok', '2026-11-20', false, 'H. Adeyemi · TOK'),
    // Upcoming.
    // THE FINAL PDF IS THE COORDINATOR'S DATE, and it staggers on purpose:
    // sciences, then maths, then everything else. One person spreading the
    // moderation and IBIS load, which is a decision no single teacher can make.
    ...subjects.map((id) => mk('c15', 'file', id, wave(id), true)),
    // `.mark` HAD A DATE HERE ON THIRTY COURSES AND NO LONGER DOES (22 Aug).
    // Marking is staff work; a deadline on it is pressure with nothing behind
    // it, and it was reaching the candidates whose work was being marked. The
    // predicted-grade points below are when marks are actually needed, because
    // a predicted grade is what an IA mark becomes by the time it matters.

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

/**
 * WHAT THE TOK MODULE OWNS, beyond its RequirementStates.
 *
 * Three small tables. Each exists because the spine genuinely cannot hold the
 * thing: a filed PDF's declared word count and unlock trail, a draft link that
 * is deliberately not a checkpoint, and the teacher's record of a meeting.
 */
export const TOK_FILES: TokFile[] = pinned('ibTokFiles', () =>
  // Only the graduated year has filed anything. The Class of 2027's exhibition
  // is due in November and the essay in March — seeding either would be the
  // fabricated-state problem EE lost on 19 Aug.
  STUDENTS.filter((s) => s.cohortId === 'c14').flatMap((s) => {
    const surname = (USERS.find((u) => u.id === s.userId)?.name ?? s.userId).split(' ').pop()
    const jitter = s.userId.charCodeAt(s.userId.length - 1)
    return [
      {
        schoolId: s.schoolId, studentId: s.userId, kind: 'exh' as const,
        fileName: `${surname}_TOK Exhibition_May 26.pdf`,
        declaredWords: 880 + ((jitter * 13) % 70),
        submittedAt: '2026-01-30',
      },
      {
        schoolId: s.schoolId, studentId: s.userId, kind: 'essay' as const,
        fileName: `${surname}_TOK Essay_May 26.pdf`,
        declaredWords: 1420 + ((jitter * 29) % 175),
        submittedAt: '2026-01-30',
      },
    ]
  }),
)

export const TOK_DRAFTS: TokDraft[] = pinned('ibTokDrafts', () => [])

/**
 * The prose beside each mark. Only the graduated year has any — nothing in the
 * Class of 2027 has been marked, and inventing a comment for an unmarked
 * exhibition is the same lie as inventing the mark.
 */
export const TOK_MARKS: TokMark[] = pinned('ibTokMarks', () =>
  STUDENTS.filter((s) => s.cohortId === 'c14').flatMap((s, i) => ([
    {
      schoolId: s.schoolId, studentId: s.userId, kind: 'exh' as const,
      note: 'Three objects, contexts specific in all three. Strongest justification is the second '
        + 'object -- context is exact and the link is argued rather than asserted. Third is thinner '
        + 'and repeats the first object\u2019s argument.',
      comment: 'All three objects sit in specific real-world contexts and each link to the prompt is '
        + 'explained. The second object is the strongest: its context is exact and the link is argued '
        + 'rather than asserted. The third object\u2019s justification is thinner and largely repeats '
        + 'the argument made for the first, which is what keeps this out of the top band. To move up, '
        + 'make each object earn its own place.',
      authorship: 'none' as const,
      markedBy: 'u_adeyemi', markedByName: 'H. Adeyemi',
      markedAt: '2025-12-02', releasedAt: '2025-12-04',
    },
    {
      schoolId: s.schoolId, studentId: s.userId, kind: 'essay' as const,
      note: 'Thesis holds through the first AOK and slips in the second. Examples are specific. '
        + 'Counter is present but illustrates rather than challenges.',
      comment: 'The thesis is workable and holds through the first area of knowledge, though it slips '
        + 'in the second. Examples are specific and well chosen. The counter-argument is present but '
        + 'illustrates the same claim rather than challenging it, so the section has the shape of a '
        + 'counter without the substance. Overall a focused discussion supported by examples, with '
        + 'some evaluation of different points of view.',
      // Exercised rather than merely permitted -- IB-TOK-research.md section 5.
      authorship: (i % 7 === 3 ? 'style_shift' : 'none') as AuthorshipConcern,
      authorshipNote: i % 7 === 3 ? 'The implications paragraph reads differently from the rest.' : undefined,
      markedBy: 'u_adeyemi', markedByName: 'H. Adeyemi',
      markedAt: '2026-02-18', releasedAt: '2026-02-20',
    },
  ])),
)


/**
 * What a finished TK/PPF actually contains. Short, first-person, and about what
 * CHANGED — which is what the form asks for and what the IB's exemplars show.
 */
const PPF_BODIES = [
  'We went through all six titles in class and I shortlisted two. I kept coming back to the one I '
  + 'chose because the key term meant something different in each of my two subjects, and I wanted '
  + 'to find out whether that was a real difference or just how I was reading it.',
  'I brought a plan with my two areas of knowledge and one example for each. My teacher pushed me '
  + 'on whether my second example was actually about the title or about something adjacent to it — '
  + 'it was adjacent, and I have rebuilt that half of the essay around the difference.',
  'He read the whole draft and said the argument gets strong in the second half but the '
  + 'introduction was still explaining the title rather than taking a position on it. We also '
  + 'agreed my counter-example was doing less work than its length suggested, so I cut it back.',
]

/**
 * THE SIX PRESCRIBED TITLES, PER SESSION — and the one rule that matters.
 *
 * ⚠⚠ NOTHING CARRIES OVER. The Class of 2028 (c16) has NO ENTRY AT ALL, and its
 * absence IS the fixture. The IB issues six new titles every session, and an
 * essay on last May's title is "not a response to one of the prescribed titles
 * for the correct examination session" — the zero band. Cohort cloning reuses
 * the same instantiation path, so a title set has to be EXCLUDED from the clone
 * by hand. Asserted in the checkpoint (15e).
 *
 * These are what the TOK teacher typed in for each session — the school's data,
 * not ours. Nothing here is hard-coded from an IB list, which is exactly why it
 * can be right.
 */
export const TOK_TITLE_SETS: TokTitleSet[] = [
  {
    schoolId: 'dhahran', cohortId: 'c14', postedBy: 'u_adeyemi', postedAt: '2025-05-14',
    titles: [
      'Is the quality of knowledge best measured by how much of it we have?',
      'How can we distinguish between a model and the reality it represents?',
      'Does it matter that our knowledge is provisional?',
      'To what extent is the knowledge we produce shaped by the tools we use to produce it?',
      'How far should we trust intuition as a source of knowledge?',
      'Is subjectivity a limitation or a resource in the pursuit of knowledge?',
    ].map((text, i) => ({
      number: i + 1, text, source: 'teacher' as const,
      addedBy: 'u_adeyemi', addedAt: '2025-05-14',
    })),
  },
  {
    schoolId: 'dhahran', cohortId: 'c15', postedBy: 'u_adeyemi', postedAt: '2026-05-11',
    titles: [
      'Is the quality of knowledge best measured by how much of it we have?',
      'How can we distinguish between a model and the reality it represents?',
      'Does it matter that our knowledge is provisional?',
      'To what extent is the knowledge we produce shaped by the tools we use to produce it?',
      'How far should we trust intuition as a source of knowledge?',
      'Is subjectivity a limitation or a resource in the pursuit of knowledge?',
    ].map((text, i) => ({
      number: i + 1, text, source: 'teacher' as const,
      addedBy: 'u_adeyemi', addedAt: '2026-05-11',
    })),
  },
  // c16 — DELIBERATELY ABSENT. Do not add one. See the note above.
]

/**
 * THE SCHOOL'S OWN BOUNDARY TABLE — and deliberately the OPPOSITE rule.
 *
 * This one DOES carry forward, because a teacher who retypes four numbers every
 * August will eventually type one wrong. It carries as `confirmed: false`, so
 * nothing computed from it can pass itself off as settled: until the teacher
 * confirms, every indicative letter says it is on an unconfirmed table.
 *
 * Two adjacent pieces of session data, on one screen, with opposite rules. Both
 * are asserted (15e) — because the day somebody "tidies" them into consistency
 * is the day one of them breaks.
 */
export const TOK_BOUNDARIES: TokBoundaryTable[] = [
  {
    schoolId: 'dhahran', cohortId: 'c14', lower: SEED_BOUNDARIES,
    confirmed: true, confirmedBy: 'u_adeyemi', confirmedAt: '2026-01-15',
  },
  {
    schoolId: 'dhahran', cohortId: 'c15', lower: SEED_BOUNDARIES,
    confirmed: false, carriedFrom: 'c14',
  },
]

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
/**
 * THE EE SUPERVISION CYCLE, hoisted so that three tables can agree about it.
 *
 * EE_SESSIONS, EE_FINALS and EE_SUPERVISION all need to know who supervises
 * whom, and a pinned table that READS another must be declared after it — so
 * the rule lives here, above all three, rather than being repeated and drifting.
 */
const C15_EE_ROSTER = STUDENTS.filter((s) => s.cohortId === 'c15').slice(0, 20)
const EE_SUPERVISOR_CYCLE = ['u_adeyemi', 'u_silva', 'u_farouk'] as const

function eeSupervisorOf(userId: string): string | null {
  const i = C15_EE_ROSTER.findIndex((s) => s.userId === userId)
  return i < 0 ? null : EE_SUPERVISOR_CYCLE[i % EE_SUPERVISOR_CYCLE.length]
}

/**
 * TWO EARLY FINISHERS — and the reason is the same one the deadline fixtures
 * give for putting a few dates in the past: *a demo where nothing is ever late
 * cannot show what late looks like.*
 *
 * It is September of DP2 and the essay is due 13 November, so a COHORT of
 * finished essays would be a fixture lying about the calendar. Two are not:
 * every year a couple of candidates finish early, and without them the marking
 * screen has nothing to mark and cannot be looked at at all — which is exactly
 * what Michael found on 22 Aug ("No students in the dummy system have a full
 * EE.. so I can't see how that works").
 *
 * They are R. FAROUK'S, deliberately, because the screen being demonstrated is
 * the subject teacher's. And they are chosen only from candidates whose
 * REGISTRATION IS COMPLETE — filing a finished essay for a subject nobody
 * registered would be a different kind of lie.
 *
 * THREE STATES, not one, because a screen only ever drawn against a finished
 * candidate hides everything its gates do:
 *
 *   EE_EARLY_FILED    final + viva + RPF  →  all five criteria open, releasable
 *   EE_EARLY_NO_VIVA  final only          →  A–D open, E locked and says why
 *   everyone else     outline at most     →  every criterion locked
 */
const eeEarly = C15_EE_ROSTER.filter(
  (s) =>
    eeSupervisorOf(s.userId) === 'u_farouk' &&
    registrationComplete(EE_REGISTRATIONS.find((r2) => r2.studentId === s.userId)),
).slice(0, 2)

export const EE_EARLY_FILED: string | null = eeEarly[0]?.userId ?? null
export const EE_EARLY_NO_VIVA: string | null = eeEarly[1]?.userId ?? null

/** Their essays, filed ahead of the 13 November deadline. */
const EE_EARLY_FILINGS: { studentId: string; at: string; words: number }[] = [
  ...(EE_EARLY_FILED ? [{ studentId: EE_EARLY_FILED, at: '2026-10-30', words: 3842 }] : []),
  ...(EE_EARLY_NO_VIVA ? [{ studentId: EE_EARLY_NO_VIVA, at: '2026-11-02', words: 3915 }] : []),
]

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
    // THE EARLY FINISHERS have had all three, which is what makes their
    // reflection statement open and their marking screen live. The viva is
    // deliberately withheld from the second one — `ee.rpf` opensAfter
    // `ee.viva`, so no viva means no RPF, which means criterion E stays shut.
    // That is the gate, drawn.
    if (s.userId === EE_EARLY_FILED || s.userId === EE_EARLY_NO_VIVA) {
      const stages: SessionStage[] =
        s.userId === EE_EARLY_FILED ? ['r1', 'r2', 'viva'] : ['r1', 'r2']
      const held: Record<string, string> = {
        r1: '2026-09-08', r2: '2026-10-14', viva: '2026-11-05',
      }
      for (const stage of stages) {
        out.push({
          schoolId: s.schoolId, studentId: s.userId, stage,
          heldOn: held[stage], recordedBy: 'u_farouk', recordedByName: 'R. Farouk',
          recordedAt: held[stage],
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
export const EE_FINALS: EeFinal[] = pinned('ibEeFinals', () => [
  ...STUDENTS.filter((s) => s.cohortId === 'c14').map((s) => ({
    schoolId: s.schoolId,
    studentId: s.userId,
    fileName: `${s.personalCode ?? 'no-code'}_EE.pdf`,
    declaredWords: 3600 + ((s.userId.charCodeAt(s.userId.length - 1) * 37) % 380),
    submittedAt: '2025-11-14',
    ref: fixtureRef(`${s.personalCode ?? 'no-code'}_EE.pdf`, '2025-11-14'),
  })),
  // The two early finishers. NO personal code in the name: codes arrive in
  // January and this is October — which is the whole reason the filename is
  // generated at export rather than typed by a student (lib/export/naming.ts).
  ...EE_EARLY_FILINGS.map((f) => ({
    schoolId: 'dhahran',
    studentId: f.studentId,
    fileName: `${nameOf(f.studentId).split(',')[0].toLowerCase()}-extended-essay.pdf`,
    declaredWords: f.words,
    submittedAt: f.at,
    ref: fixtureRef(
      `${nameOf(f.studentId).split(',')[0].toLowerCase()}-extended-essay.pdf`,
      f.at,
    ),
  })),
])

/** The supervisor's scoring record — everything around the marks. */
export const EE_SCORING: EeScoring[] = pinned('ibEeScoring', () =>
  STUDENTS.filter((s) => s.cohortId === 'c14').map((s) => ({
    schoolId: s.schoolId,
    studentId: s.userId,
    comment:
      'Question narrowed twice and answered. Method justified against the sources available. ' +
      'Evaluation is specific about what the sample size does to the conclusion. Sessions held as ' +
      'recorded; the work is the candidate\u2019s own.',
    hoursSupervised: 4.5,
    attestedSessions: true,
    attestedAuthentic: true,
    attestedBy: 'u_adeyemi',
    attestedByName: 'H. Adeyemi',
    attestedAt: '2026-02-18',
    releasedBy: 'u_adeyemi',
    releasedByName: 'H. Adeyemi',
    releasedAt: '2026-02-20',
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
              artifacts: ART(`${s.personalCode ?? 'no-code'}_EE.pdf`, nameOf(s.userId)).map(
                (a) => ({ ...a, addedAt: '2025-11-14', file: { ...a.file!, addedAt: '2025-11-14' } }),
              ),
            })
          } else if (stage === 'rpf') {
            put('submitted', '2026-01-30', {
              exportStatus: 'submitted', recordedBy: 'student',
              lockedAt: '2026-01-30T09:00:00.000Z',
              artifacts: [{
                id: `art_rpf_${s.userId}`, kind: 'text', label: 'Reflection statement',
                body:
                  'I began believing the answer was already in the literature and my job was to find it. ' +
                  'The turning point was the week my second source contradicted the first on the same data, ' +
                  'and I had to decide which to trust rather than which to quote. I rebuilt the middle section ' +
                  'around that decision and cut two pages I had been protecting because they were hard to write. ' +
                  'What I will carry forward is the habit of asking what would have to be true for a source to be ' +
                  'wrong — it changed how I read every paper after it, and it is why the conclusion is narrower ' +
                  'than the one I set out to defend.',
                addedAt: '2026-01-30',
              }],
            })
          } else if (stage === 'r1' || stage === 'r2' || stage === 'viva') {
            // Derived from EE_SESSIONS, never stored.
          } else if (stage === 'attest') {
            // Derived from EE_SCORING, never stored.
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

        // THE TWO EARLY FINISHERS, and nobody else. For the cohort, draft,
        // final, rpf, attest and score are genuinely still ahead and stay
        // empty — the rule EE established on 19 Aug.
        const early = EE_EARLY_FILINGS.find((f) => f.studentId === s.userId)
        if (early && stage === 'final') {
          // FILING IS WHAT LOCKS IT. Same rule as the live path, so what the
          // fixture produces is what `submitFinal` would have produced.
          put('submitted', early.at, {
            exportStatus: 'ready_for_submission',
            recordedBy: 'student',
            lockedAt: `${early.at}T09:00:00.000Z`,
            artifacts: ART(
              `${nameOf(s.userId).split(',')[0].toLowerCase()}-extended-essay.pdf`,
              nameOf(s.userId),
            ).map((a) => ({
              ...a, addedAt: early.at, file: { ...a.file!, addedAt: early.at },
            })),
          })
          continue
        }
        // The RPF only for the one whose viva has been held — `ee.rpf`
        // opensAfter `ee.viva`, and a reflection statement written before the
        // conversation it reflects on would be a state no screen could produce.
        if (early && stage === 'rpf' && s.userId === EE_EARLY_FILED) {
          put('submitted', '2026-11-08', {
            exportStatus: 'ready_for_submission',
            recordedBy: 'student',
            lockedAt: '2026-11-08T09:00:00.000Z',
            artifacts: [{
              id: `art_rpf_${s.userId}`, kind: 'text', label: 'Reflection statement',
              body:
                'I chose the question because I thought the answer was obvious, and the first three '
                + 'weeks were spent finding out it was not. What changed the essay was reading the '
                + 'method sections rather than the conclusions — two of my sources had measured '
                + 'different things and called them the same name, and once I saw that I had to '
                + 'rewrite the comparison at the centre of the argument. The viva made me say out '
                + 'loud that my conclusion is narrower than my introduction promised, which is true, '
                + 'and I would rather defend the narrow one.',
              addedAt: '2026-11-08',
            }],
          })
          continue
        }
        continue
      }

      /**
       * THEORY OF KNOWLEDGE — the last dice-rolled numbers on the board.
       *
       * The same problem EE had until 19 Aug: the generic roll was inventing
       * exhibition marks and essays for candidates whose essay is not due until
       * March 2027, so a coordinator opening the board saw TOK progress nothing
       * in the product could produce, explain or change. Removing it is the
       * point at which EVERY number on the board comes from a state something
       * actually wrote.
       *
       * What follows is a school in the September of DP2: titles chosen at the
       * end of DP1, the exhibition due in November and mostly not started, the
       * essay a long way off. The TK/PPF chain is deliberately sparse — its
       * opensAfter chain means most students sit at "1 of 3".
       */
      if (d.lane === 'TOK') {
        const stage = d.key.slice(4)
        // Deterministic per student, so nothing here perturbs the shared RNG
        // stream that every other lane draws from.
        const spread = s.userId.charCodeAt(s.userId.length - 1) * 7 + s.userId.length
        const textArtifact = (label: string, body: string, at: string) => ([{
          id: `art_${d.key.replace('.', '_')}_${s.userId}`, kind: 'text' as const,
          label, body, addedAt: at,
        }])
        const put = (
          recordStatus: RequirementState['recordStatus'],
          recordedAt: string,
          extra: Partial<RequirementState> = {},
        ) => out.push({
          studentId: s.userId, requirementDefId: d.id, schoolId: s.schoolId,
          recordStatus, artifacts: [], recordedAt, ...extra,
        })

        if (s.cohortId === 'c16') continue // two weeks into DP1

        if (s.cohortId === 'c14') {
          // A finished year, so everything has a state — INCLUDING the two staff
          // records the module added. A graduated cohort with an unsigned form
          // would be a lie in the other direction from the one EE fixed.
          if (stage === 'exhmark') {
            put('marked', '2025-12-02', { mark: 6 + Math.floor(r() * 4), recordedBy: 'H. Adeyemi' })
          } else if (stage === 'essaymark') {
            put('marked', '2026-02-18', { mark: 3 + Math.floor(r() * 6), recordedBy: 'H. Adeyemi' })
          } else if (stage === 'ppfsign') {
            put('submitted', '2026-02-20', { recordedBy: 'H. Adeyemi' })
          } else if (stage === 'ppf1' || stage === 'ppf2' || stage === 'ppf3') {
            // A finished year has REAL WRITE-UPS, not empty states. The
            // form-fill pipeline puts these three boxes on the official PDF, so
            // a state with nothing in it would export a blank form.
            const n = Number(stage.slice(-1))
            const at = ['2025-09-20', '2025-11-29', '2026-01-17'][n - 1]
            put('submitted', at, {
              recordedBy: 'student',
              lockedAt: new Date(`${at}T00:00:00.000Z`).toISOString(),
              artifacts: [{
                id: `art_tok_ppf${n}_${s.userId}`, kind: 'text',
                label: `TK/PPF ${n}`, body: PPF_BODIES[n - 1], addedAt: at,
              }],
            })
          } else if (stage === 'exh' || stage === 'essay') {
            put('submitted', '2026-01-30', { exportStatus: 'submitted', recordedBy: 'student' })
          } else if (stage === 'prompt') {
            // A CHOSEN PROMPT IS A NUMBER, and a state with no body is a
            // choice nobody made. The marking screen reads this, and so does
            // the prompt distribution.
            put('submitted', '2025-10-20', {
              recordedBy: 'student',
              artifacts: textArtifact('Exhibition prompt chosen', String(1 + (spread % 35)), '2025-10-20'),
            })
          } else if (stage === 'title') {
            const set14 = TOK_TITLE_SETS.find((t) => t.cohortId === 'c14')
            put('submitted', '2025-10-20', {
              recordedBy: 'student',
              artifacts: textArtifact(
                'Title chosen',
                set14?.titles[spread % 6]?.text ?? '',
                '2025-10-20',
              ),
            })
          } else {
            put('submitted', '2025-10-20', { recordedBy: 'student' })
          }
          continue
        }

        // ---- Class of 2027, September of DP2 ----
        if (stage === 'title') {
          // Due 5 June 2026 and passed; a few are still outstanding, which is
          // what a late cell on the board is for.
          const set15 = TOK_TITLE_SETS.find((t) => t.cohortId === 'c15')
          if (r() < 0.88) {
            put('submitted', '2026-06-02', {
              recordedBy: 'student',
              artifacts: textArtifact('Title chosen', set15?.titles[spread % 6]?.text ?? '', '2026-06-02'),
            })
          }
          continue
        }
        if (stage === 'prompt') {
          // NO DUE DATE ON THIS ONE, deliberately: the TOK teacher has not set
          // one, and an unset date is blank rather than invented. A handful
          // have chosen anyway; the exhibition itself is two months out.
          if (r() < 0.3) {
            put('submitted', '2026-09-08', {
              recordedBy: 'student',
              artifacts: textArtifact('Exhibition prompt chosen', String(1 + (spread % 35)), '2026-09-08'),
            })
          }
          continue
        }
        if (stage === 'ppf1') {
          if (r() < 0.42) put('submitted', '2026-09-11', { recordedBy: 'student' })
          continue
        }
        // Exhibition, exhibition mark, TK/PPF 2 and 3, the sign-off, the essay
        // and the essay mark are all genuinely still ahead. NOTHING is seeded
        // for them — the rule EE established on 19 Aug and TOK kept on 20 Aug.
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
            // The name a STUDENT would give it, not the requirement's label —
            // "the file is called IA_final_v3.pdf and I have no idea whose it
            // is" is precisely the problem the reader exists to solve, and a
            // fixture full of tidy machine names would hide it.
            ? ART(studentFileName(s.userId, d), nameOf(s.userId), fixtureMime(d))
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
    ...deriveEeAttestStates(EE_SCORING, REQUIREMENT_DEFS),
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
/**
 * THE TEACHER'S LOG — and the invariant that makes it worth having.
 *
 * A student can only write up a meeting the teacher has recorded, so EVERY
 * TK/PPF state must have a held log behind it. That is asserted (15h), and it
 * is why this table is DERIVED FROM the states rather than rolled independently:
 * two dice would eventually disagree, and the disagreement would look like a
 * student who wrote up a meeting that never happened.
 */
export const TOK_INTERACTION_LOGS: TokInteractionLog[] = pinned('ibTokLogs', () => {
  const out: TokInteractionLog[] = []
  const wrote = (studentId: string, cohortId: string, n: number) => {
    const def = REQUIREMENT_DEFS.find((d) => d.cohortId === cohortId && d.key === `tok.ppf${n}`)
    return def != null && REQUIREMENT_STATES.some(
      (x) => x.studentId === studentId && x.requirementDefId === def.id,
    )
  }
  const log = (
    s: (typeof STUDENTS)[number], n: InteractionNumber, lineKey: string, heldOn: string,
  ) => out.push({
    schoolId: s.schoolId, studentId: s.userId, n, lineKey, heldOn,
    loggedBy: 'u_adeyemi', loggedByName: 'H. Adeyemi', loggedAt: heldOn,
  })

  STUDENTS.forEach((s, i) => {
    if (s.cohortId === 'c14') {
      log(s, 1, 'reviewed_titles', '2025-09-18')
      log(s, 2, 'plan_and_aoks', '2025-11-27')
      // The honest negatives, exercised rather than merely permitted: one
      // student in nine turned up to the third meeting without a draft.
      log(s, 3, i % 9 === 4 ? 'no_draft' : 'full_draft', '2026-01-15')
      return
    }
    if (s.cohortId !== 'c15') return
    // September of DP2: the first round of meetings is under way. Everybody who
    // has written one up necessarily had it logged; a third of the rest have
    // been seen and simply have not written it up yet — which is the state the
    // screen exists to make obvious.
    if (wrote(s.userId, 'c15', 1) || i % 3 === 0) log(s, 1, 'reviewed_titles', '2026-09-09')
  })
  return out
})

/**
 * THE TEACHER'S HALF OF THE TK/PPF. Only the graduated year has one — nothing
 * in the Class of 2027 has three interactions yet, and a signed form for a
 * student who has written up one meeting would be a fabricated state.
 */
export const TOK_PPF: TokPpf[] = pinned('ibTokPpf', () =>
  STUDENTS.filter((s) => s.cohortId === 'c14').map((s) => {
    const name = USERS.find((u) => u.id === s.userId)?.name ?? s.userId
    const logged = TOK_INTERACTION_LOGS
      .filter((l) => l.studentId === s.userId)
      .map((l) => ({ n: l.n, lineKey: l.lineKey, heldOn: l.heldOn }))
    return {
      schoolId: s.schoolId, studentId: s.userId,
      // Composed from the year's logs, exactly as the screen composes it — the
      // fixture and the feature cannot drift apart if they share the function.
      comment: composeTeacherComment({ studentName: name, logged }),
      updatedAt: '2026-02-19',
      signedAt: '2026-02-20', signedBy: 'u_adeyemi', signedByName: 'H. Adeyemi',
    }
  }),
)

export const EE_SUPERVISION: EeSupervision[] = pinned('ibEeSupervision', () => {
  const rows: EeSupervision[] = []
  const c15 = STUDENTS.filter((s) => s.cohortId === 'c15')
  // THREE SUPERVISORS, NOT TWO — and the third is a subject teacher.
  //
  // Michael, 22 Aug: "give Farouk an EE so I can see what that looks like from
  // a teacher's POV." Until now every c15 essay belonged to Adeyemi or Silva,
  // so the screen a plain subject teacher sees had never been looked at.
  //
  // Two of Farouk's three are candidates he does NOT teach Biology — which is
  // the case that matters: supervision is a relationship, not an enrolment, and
  // it is why `teachesStudent` alone is the wrong gate on a student's record.
  c15.slice(0, 20).forEach((st) => {
    rows.push({
      schoolId: 'dhahran',
      cohortId: 'c15',
      studentId: st.userId,
      // The cycle is hoisted (see `eeSupervisorOf`) because EE_SESSIONS and
      // EE_FINALS need the same answer and are declared before this table.
      supervisorId: eeSupervisorOf(st.userId)!,
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
  eeSubjectOf: (schoolId, studentId) => {
    const reg = EE_REGISTRATIONS.find(
      (r) => r.schoolId === schoolId && r.studentId === studentId,
    )
    if (!reg || reg.subjects.length === 0) return null
    // An interdisciplinary essay names both, in registration order.
    return reg.subjects.map((k) => subjectName(k)).join(' and ')
  },
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
/** The state behind an EE requirement for one student, or null. */
function eeState(schoolId: string, studentId: string, key: string) {
  const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
  if (!st) return null
  const def = REQUIREMENT_DEFS.find(
    (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === key,
  )
  if (!def) return null
  return REQUIREMENT_STATES.find(
    (x) => x.studentId === studentId && x.requirementDefId === def.id,
  ) ?? null
}

/**
 * ONE derivation of the TK/PPF, read by the student screen and the teacher's
 * screen alike. Two derivations would disagree about whether a box is open, and
 * the disagreement would land on a student.
 */
function tokPpfView(schoolId: string, studentId: string): TokPpfView {
  const row = TOK_PPF.find((x) => x.schoolId === schoolId && x.studentId === studentId)
  const interactions = ([1, 2, 3] as InteractionNumber[]).map((n) => {
    const log = TOK_INTERACTION_LOGS.find(
      (l) => l.schoolId === schoolId && l.studentId === studentId && l.n === n,
    )
    const line = log ? interactionLine(n, log.lineKey) : null
    const bodyOf = (k: number) => tokState(schoolId, studentId, `tok.ppf${k}`)?.artifacts
      .find((a) => a.kind === 'text')?.body ?? null
    const body = bodyOf(n)
    const gate = interactionOpen(n, line ? { held: line.held } : null, n === 1 || bodyOf(n - 1) != null)
    return {
      n,
      logged: log && line
        ? { lineKey: log.lineKey, label: line.label, held: line.held, heldOn: log.heldOn, byName: log.loggedByName }
        : null,
      entry: body
        ? {
          body,
          words: countWords(body),
          submittedAt: tokState(schoolId, studentId, `tok.ppf${n}`)?.recordedAt ?? log?.heldOn ?? '',
        }
        : null,
      ...gate,
    }
  })
  return {
    interactions,
    comment: row?.comment ?? '',
    signedAt: row?.signedAt ?? null,
    signedByName: row?.signedByName ?? null,
    written: interactions.filter((i) => i.entry != null).length,
  }
}

/** The TOK sibling of eeState. One join, one place. */
function tokState(schoolId: string, studentId: string, key: string) {
  const st = STUDENTS.find((s) => s.userId === studentId && s.schoolId === schoolId)
  if (!st) return null
  const def = REQUIREMENT_DEFS.find(
    (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === key,
  )
  if (!def) return null
  return REQUIREMENT_STATES.find(
    (x) => x.studentId === studentId && x.requirementDefId === def.id,
  ) ?? null
}

/**
 * The prompt, the title and each TK/PPF entry are all TEXT ON A STATE — no
 * module table, because the spine already holds exactly this shape. `lock` is
 * what separates a TK/PPF entry (locks on submit) from a title (changeable).
 */
function writeTokText(
  schoolId: string, studentId: string, key: string, body: string,
  recordedBy: string, lock = false,
) {
  const st = STUDENTS.find((s) => s.userId === studentId && s.schoolId === schoolId)
  if (!st) return
  const def = REQUIREMENT_DEFS.find(
    (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === key,
  )
  if (!def) return
  const at = todayRiyadh()
  const artifacts = [{
    id: `art_${key.replace('.', '_')}_${studentId}`, kind: 'text' as const,
    label: def.label, body, addedAt: at,
  }]
  const existing = REQUIREMENT_STATES.find(
    (x) => x.studentId === studentId && x.requirementDefId === def.id,
  )
  if (existing) {
    if (existing.lockedAt) return // locked is locked; unlocking is a separate act
    existing.recordStatus = 'submitted'
    existing.recordedAt = at
    existing.recordedBy = recordedBy
    existing.artifacts = artifacts
    if (lock) existing.lockedAt = new Date(`${at}T00:00:00.000Z`).toISOString()
  } else {
    REQUIREMENT_STATES.push({
      studentId, requirementDefId: def.id, schoolId,
      recordStatus: 'submitted', recordedAt: at, recordedBy, artifacts,
      ...(lock ? { lockedAt: new Date(`${at}T00:00:00.000Z`).toISOString() } : {}),
    })
  }
}

/** The RPF text lives as a text ARTIFACT on ee.rpf — no module table needed. */
function eeRpfOf(schoolId: string, studentId: string) {
  const state = eeState(schoolId, studentId, 'ee.rpf')
  const a = state?.artifacts.find((x) => x.kind === 'text')
  if (!a?.body) return null
  return { body: a.body, words: countWords(a.body), submittedAt: state!.recordedAt ?? a.addedAt }
}

const eeMarksOf = (schoolId: string, studentId: string): (number | null)[] =>
  eeState(schoolId, studentId, 'ee.score')?.criterionMarks ?? EE_CRITERIA.map(() => null)

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
        checkpoints: lane.checkpoints.map((cp) => {
          const withDate = withDue(cp, mine, today, notBefore, studentUserId)
          // A DATE ON SOMEBODY ELSE'S WORK IS NOT THE CANDIDATE'S BUSINESS.
          // Staff-recorded requirements keep their checkpoint on a candidate's
          // track — they should see a mark is coming — but not the deadline.
          // `studentMaySee` is the SAME predicate the home due-list uses, so
          // the two surfaces cannot drift apart. Since 22 Aug it is also belt
          // and braces: a staff stage can no longer be dated by anyone.
          if (opts?.asCandidate && !studentMaySee(cp.def)) {
            return { ...withDate, due: undefined }
          }
          return withDate
        }),
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

  tok: {
    async getTitleSet(schoolId, cohortId) {
      return TOK_TITLE_SETS.find((t) => t.schoolId === schoolId && t.cohortId === cohortId) ?? null
    },

    async getStudentView(schoolId, studentId) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return null
      const set = TOK_TITLE_SETS.find((t) => t.schoolId === schoolId && t.cohortId === st.cohortId)
      const marker = TEACHING_ASSIGNMENTS.find(
        (t) => t.isDesignatedMarker && t.sectionId.startsWith('tok_' + st.cohortId),
      )

      const textOf = (key: string) => tokState(schoolId, studentId, key)?.artifacts
        .find((a) => a.kind === 'text')?.body ?? null

      const fileView = (kind: 'exh' | 'essay'): TokFileView | null => {
        const row = TOK_FILES.find(
          (f) => f.schoolId === schoolId && f.studentId === studentId && f.kind === kind,
        )
        if (!row) return null
        const state = tokState(schoolId, studentId, kind === 'exh' ? 'tok.exh' : 'tok.essay')
        return {
          fileName: row.fileName,
          declaredWords: row.declaredWords,
          submittedAt: row.submittedAt,
          // From the ARTIFACT where one exists — the state is the record and
          // this row points at it (lib/files.ts). Falling back to the module
          // row keeps a fixture written before the artifact carried a ref.
          ref: fileOf(state)?.ref ?? row.ref,
          // FILING IS WHAT LOCKS IT — the same rule as the EE final.
          locked: state?.lockedAt != null,
          unlockReason: row.unlockReason,
          unlockedByName: row.unlockedByName,
          unlockedAt: row.unlockedAt,
        }
      }

      // The mark reaches the student ONLY once it is released. Before that they
      // see nothing at all — not a greyed-out number, not "pending".
      const exhState = tokState(schoolId, studentId, 'tok.exhmark')
      const exhProse = TOK_MARKS.find(
        (m) => m.schoolId === schoolId && m.studentId === studentId && m.kind === 'exh',
      )
      const released = exhState?.mark != null && exhProse?.releasedAt != null
      const band = released ? bandFor(EXHIBITION_INSTRUMENT, exhState!.mark!) : null

      const titleText = textOf('tok.title')
      const promptText = textOf('tok.prompt')

      const ppf = tokPpfView(schoolId, studentId)

      return {
        studentId,
        studentName: USERS.find((u) => u.id === studentId)?.name ?? studentId,
        teacherName: marker ? USERS.find((u) => u.id === marker.teacherId)?.name ?? null : null,
        promptNumber: promptText ? Number(promptText) || null : null,
        exhibition: fileView('exh'),
        exhibitionMark: released
          ? {
            mark: exhState!.mark!,
            level: band?.level ?? '',
            comment: exhProse!.comment || null,
            releasedAt: exhProse!.releasedAt!,
          }
          : null,
        title: titleText
          ? {
            number: set?.titles.find((t) => t.text === titleText)?.number ?? null,
            text: titleText,
            source: set?.titles.some((t) => t.text === titleText) ? 'teacher' : 'student',
          }
          : null,
        titlesPosted: set?.titles.filter((t) => t.source === 'teacher') ?? [],
        draftHref: TOK_DRAFTS.find(
          (d) => d.schoolId === schoolId && d.studentId === studentId,
        )?.href ?? null,
        essay: fileView('essay'),
        interactions: ppf.interactions,
        signedOffAt: ppf.signedAt,
      }
    },

    async setPrompt(schoolId, studentId, promptNumber) {
      if (!promptText(promptNumber)) {
        return { ok: false, message: 'That is not one of the 35 IA prompts.' }
      }
      // The prompt is CHOSEN, never typed — the guide says it must be used
      // exactly as given, so we store the number and render from the list.
      writeTokText(schoolId, studentId, 'tok.prompt', String(promptNumber), 'student')
      return { ok: true }
    },

    async setTitle(schoolId, studentId, input) {
      const text = input.text.trim()
      if (!text) return { ok: false, message: 'Give your title.' }
      writeTokText(schoolId, studentId, 'tok.title', text, 'student')
      return { ok: true }
    },

    async setDraft(schoolId, studentId, href) {
      const existing = TOK_DRAFTS.find(
        (d) => d.schoolId === schoolId && d.studentId === studentId,
      )
      if (existing) Object.assign(existing, { href, addedAt: todayRiyadh() })
      else TOK_DRAFTS.push({ schoolId, studentId, href, addedAt: todayRiyadh() })
    },

    async submitFile(schoolId, studentId, kind, file) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return
      const key = kind === 'exh' ? 'tok.exh' : 'tok.essay'
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === key,
      )
      if (!def) return
      const at = todayRiyadh()

      const existing = TOK_FILES.find(
        (f) => f.schoolId === schoolId && f.studentId === studentId && f.kind === kind,
      )
      const row: TokFile = { schoolId, studentId, kind, submittedAt: at, ...file }
      if (existing) {
        // A replacement after an unlock keeps the unlock on the record.
        Object.assign(existing, row, {
          unlockedBy: existing.unlockedBy, unlockedByName: existing.unlockedByName,
          unlockReason: existing.unlockReason, unlockedAt: existing.unlockedAt,
        })
      } else TOK_FILES.push(row)

      const lockedAt = new Date(`${at}T00:00:00.000Z`).toISOString()
      const state = REQUIREMENT_STATES.find(
        (x) => x.studentId === studentId && x.requirementDefId === def.id,
      )
      // THE ARTIFACT IS THE FILE RECORD. A replacement after an unlock does
      // not overwrite it — the old paper is superseded and kept, because the
      // question "which version did the marker read" is asked months later
      // (IB-Reading-and-Marking-Papers.md §4, state 3).
      const tokRef = file.ref ?? fixtureRef(file.fileName, at)
      // The id carries the REF's id, not the date: refiling twice in one day
      // is exactly what "wrong file, try again" looks like, and two artifacts
      // sharing an id is a record that cannot tell them apart.
      const artifact = fileArtifact(
        `art_tok_${kind}_${studentId}_${tokRef.id}`,
        tokRef,
        { addedAt: at, addedBy: 'student' },
      )
      if (state) {
        state.recordStatus = 'submitted'
        state.recordedAt = at
        state.lockedAt = lockedAt
        supersede(state, at, artifact)
      } else {
        REQUIREMENT_STATES.push({
          studentId, requirementDefId: def.id, schoolId,
          recordStatus: 'submitted', recordedAt: at, recordedBy: 'student',
          lockedAt, artifacts: [artifact],
        })
      }
    },

    // ---- staff -----------------------------------------------------------

    async getMarkingRoster(schoolId, cohortId, kind) {
      const key = kind === 'exh' ? 'tok.exhmark' : 'tok.essaymark'
      const set = TOK_TITLE_SETS.find((t) => t.schoolId === schoolId && t.cohortId === cohortId)
      return STUDENTS
        .filter((s) => s.schoolId === schoolId && s.cohortId === cohortId)
        .map((s) => {
          const view = tokState(schoolId, s.userId, key)
          const prose = TOK_MARKS.find(
            (m) => m.schoolId === schoolId && m.studentId === s.userId && m.kind === kind,
          )
          const file = TOK_FILES.find(
            (f) => f.schoolId === schoolId && f.studentId === s.userId && f.kind === kind,
          )
          const fileState = tokState(schoolId, s.userId, kind === 'exh' ? 'tok.exh' : 'tok.essay')
          const promptBody = tokState(schoolId, s.userId, 'tok.prompt')?.artifacts
            .find((a) => a.kind === 'text')?.body
          const titleBody = tokState(schoolId, s.userId, 'tok.title')?.artifacts
            .find((a) => a.kind === 'text')?.body
          return {
            studentId: s.userId,
            studentName: USERS.find((u) => u.id === s.userId)?.name ?? s.userId,
            sessionNumber: s.sessionNumber,
            promptNumber: kind === 'exh' && promptBody ? Number(promptBody) || null : null,
            title: kind === 'essay' && titleBody
              ? { number: set?.titles.find((t) => t.text === titleBody)?.number ?? null, text: titleBody }
              : null,
            file: file
              ? {
                fileName: file.fileName,
                declaredWords: file.declaredWords,
                submittedAt: file.submittedAt,
                locked: fileState?.lockedAt != null,
                unlockReason: file.unlockReason,
                unlockedByName: file.unlockedByName,
                unlockedAt: file.unlockedAt,
              }
              : null,
            mark: view?.mark ?? null,
            prose: prose
              ? {
                note: prose.note,
                comment: prose.comment,
                authorship: prose.authorship,
                authorshipNote: prose.authorshipNote,
              }
              : null,
            releasedAt: prose?.releasedAt ?? null,
            markedByName: prose?.markedByName ?? null,
            ...(kind === 'essay'
              ? {
                ppf: tokPpfView(schoolId, s.userId),
                draftHref: TOK_DRAFTS.find(
                  (dr) => dr.schoolId === schoolId && dr.studentId === s.userId,
                )?.href ?? null,
              }
              : {}),
          }
        })
    },

    async saveMark(schoolId, studentId, kind, mark, by) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return
      const key = kind === 'exh' ? 'tok.exhmark' : 'tok.essaymark'
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === key,
      )
      if (!def) return
      const max = def.markMax ?? TOK_MARK_MAX
      const next = mark == null ? null : Math.max(0, Math.min(max, Math.round(mark)))

      let state = REQUIREMENT_STATES.find(
        (x) => x.studentId === studentId && x.requirementDefId === def.id,
      )
      if (!state) {
        state = {
          studentId, requirementDefId: def.id, schoolId,
          recordStatus: 'not_started', artifacts: [],
        }
        REQUIREMENT_STATES.push(state)
      }
      // A RELEASED mark is not editable in place. Revoking is the way back,
      // and it is a recorded act — same rule as EE.
      if (state.recordStatus === 'released') return
      const prev = state.mark ?? null
      state.mark = next == null ? undefined : next
      // recordStatus is DERIVED from what is entered, never set independently.
      state.recordStatus = next == null ? 'not_started' : 'marked'
      state.recordedBy = by.name
      state.recordedAt = todayRiyadh()

      // ONE TRAIL PER COURSE. A TOK exhibition mark and a predicted grade land
      // on the same history, because the question a reader has is "what
      // happened to this candidate in my course".
      MARK_EVENTS.push({
        id: `mev_tok_${kind}_${studentId}_${MARK_EVENTS.length}`,
        schoolId, cohortId: st.cohortId, courseId: 'tok', studentId,
        kind: 'mark', criterion: kind === 'exh' ? 'exhibition' : 'essay',
        prev, next, byUserId: by.id, at: new Date(0).toISOString(),
        ...(by.overrideReason ? { overrideReason: by.overrideReason } : {}),
      })
    },

    async saveProse(schoolId, studentId, kind, input, by) {
      const existing = TOK_MARKS.find(
        (m) => m.schoolId === schoolId && m.studentId === studentId && m.kind === kind,
      )
      const row: TokMark = {
        schoolId, studentId, kind,
        note: input.note, comment: input.comment,
        authorship: input.authorship, authorshipNote: input.authorshipNote,
        markedBy: by.id, markedByName: by.name, markedAt: todayRiyadh(),
        releasedAt: existing?.releasedAt,
      }
      if (existing) Object.assign(existing, row)
      else TOK_MARKS.push(row)
    },

    async releaseMark(schoolId, studentId, kind, by) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return { ok: false, message: 'No such candidate.' }
      const key = kind === 'exh' ? 'tok.exhmark' : 'tok.essaymark'
      const state = tokState(schoolId, studentId, key)
      const prose = TOK_MARKS.find(
        (m) => m.schoolId === schoolId && m.studentId === studentId && m.kind === kind,
      )
      const filed = TOK_FILES.some(
        (f) => f.schoolId === schoolId && f.studentId === studentId && f.kind === kind,
      )
      const blockers = releaseBlockers({
        mark: state?.mark ?? null, comment: prose?.comment ?? null, filed,
      })
      if (blockers.length) return { ok: false, message: blockers[0] }

      state!.recordStatus = 'released'
      prose!.releasedAt = todayRiyadh()
      MARK_EVENTS.push({
        id: `mev_tokrel_${kind}_${studentId}_${MARK_EVENTS.length}`,
        schoolId, cohortId: st.cohortId, courseId: 'tok', studentId,
        kind: 'mark', criterion: kind === 'exh' ? 'exhibition released' : 'essay released',
        prev: null, next: state!.mark ?? null, byUserId: by.id, at: new Date(0).toISOString(),
      })
      return { ok: true }
    },

    async setTitles(schoolId, cohortId, titles, by) {
      const cleaned = titles
        .map((t) => ({ number: t.number, text: t.text.trim() }))
        .filter((t) => t.text.length > 0)
      if (cleaned.some((t) => t.number < 1 || t.number > PRESCRIBED_TITLE_COUNT)) {
        return { ok: false, message: `Titles are numbered 1 to ${PRESCRIBED_TITLE_COUNT}.` }
      }
      if (new Set(cleaned.map((t) => t.number)).size !== cleaned.length) {
        return { ok: false, message: 'Two titles share a number.' }
      }
      const at = todayRiyadh()
      const rows = cleaned.map((t) => ({
        number: t.number, text: t.text, source: 'teacher' as const,
        addedBy: by.id, addedAt: at,
      })).sort((a, b) => a.number - b.number)

      const existing = TOK_TITLE_SETS.find(
        (x) => x.schoolId === schoolId && x.cohortId === cohortId,
      )
      if (existing) {
        existing.titles = rows
        existing.postedBy = by.id
        existing.postedAt = at
      } else {
        TOK_TITLE_SETS.push({
          schoolId, cohortId, titles: rows, postedBy: by.id, postedAt: at,
        })
      }
      return { ok: true }
    },

    async adoptTitle(schoolId, cohortId, text, by) {
      const body = text.trim()
      if (!body) return { ok: false, message: 'Nothing to adopt.' }
      const set = TOK_TITLE_SETS.find(
        (x) => x.schoolId === schoolId && x.cohortId === cohortId,
      )
      const current = set?.titles ?? []
      if (current.some((t) => t.text === body)) {
        return { ok: false, message: 'That title is already posted.' }
      }
      const used = new Set(current.map((t) => t.number))
      const next = [1, 2, 3, 4, 5, 6].find((n) => !used.has(n))
      if (next == null) {
        return { ok: false, message: `All ${PRESCRIBED_TITLE_COUNT} titles are already posted.` }
      }
      const row = {
        number: next, text: body, source: 'teacher' as const,
        addedBy: by.id, addedAt: todayRiyadh(),
      }
      if (set) set.titles = [...current, row].sort((a, b) => a.number - b.number)
      else TOK_TITLE_SETS.push({ schoolId, cohortId, titles: [row] })
      return { ok: true }
    },

    async listTypedTitles(schoolId, cohortId) {
      const set = TOK_TITLE_SETS.find(
        (x) => x.schoolId === schoolId && x.cohortId === cohortId,
      )
      const posted = new Set((set?.titles ?? []).map((t) => t.text))
      const out: { studentId: string; studentName: string; text: string }[] = []
      for (const st of STUDENTS.filter((x) => x.schoolId === schoolId && x.cohortId === cohortId)) {
        const body = tokState(schoolId, st.userId, 'tok.title')?.artifacts
          .find((a) => a.kind === 'text')?.body
        if (body && !posted.has(body)) {
          out.push({
            studentId: st.userId,
            studentName: USERS.find((u) => u.id === st.userId)?.name ?? st.userId,
            text: body,
          })
        }
      }
      return out
    },

    async logInteraction(schoolId, studentId, n, lineKey, heldOn, by) {
      if (!interactionLine(n, lineKey)) {
        return { ok: false, message: 'That is not a line for this interaction.' }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) {
        return { ok: false, message: 'Give the day the meeting actually happened.' }
      }
      const existing = TOK_INTERACTION_LOGS.find(
        (l) => l.schoolId === schoolId && l.studentId === studentId && l.n === n,
      )
      const row: TokInteractionLog = {
        schoolId, studentId, n, lineKey, heldOn,
        loggedBy: by.id, loggedByName: by.name, loggedAt: todayRiyadh(),
      }
      if (existing) Object.assign(existing, row)
      else TOK_INTERACTION_LOGS.push(row)
      return { ok: true }
    },

    async draftTeacherComment(schoolId, studentId) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return ''
      return composeTeacherComment({
        studentName: USERS.find((u) => u.id === studentId)?.name ?? studentId,
        logged: TOK_INTERACTION_LOGS
          .filter((l) => l.schoolId === schoolId && l.studentId === studentId)
          .map((l) => ({ n: l.n, lineKey: l.lineKey, heldOn: l.heldOn })),
      })
    },

    async saveTeacherComment(schoolId, studentId, comment, by) {
      const existing = TOK_PPF.find(
        (x) => x.schoolId === schoolId && x.studentId === studentId,
      )
      // A SIGNED comment is not editable in place — the declaration is "I
      // confirm that my comments above are accurate", and it stops being true
      // the moment the comment changes underneath it.
      if (existing?.signedAt) return
      if (existing) Object.assign(existing, { comment, updatedAt: todayRiyadh() })
      else TOK_PPF.push({ schoolId, studentId, comment, updatedAt: todayRiyadh() })
    },

    async signPpf(schoolId, studentId, by) {
      const row = TOK_PPF.find((x) => x.schoolId === schoolId && x.studentId === studentId)
      const blockers = signBlockers({ comment: row?.comment, signedAt: row?.signedAt })
      if (blockers.length) return { ok: false, message: blockers[0] }
      const at = todayRiyadh()
      row!.signedAt = at
      row!.signedBy = by.id
      row!.signedByName = by.name
      writeTokText(schoolId, studentId, 'tok.ppfsign', row!.comment, by.name, true)
      return { ok: true }
    },

    async unsignPpf(schoolId, studentId) {
      const row = TOK_PPF.find((x) => x.schoolId === schoolId && x.studentId === studentId)
      if (!row?.signedAt) return
      row.signedAt = undefined
      row.signedBy = undefined
      row.signedByName = undefined
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st?.cohortId && d.schoolId === schoolId && d.key === 'tok.ppfsign',
      )
      const i = REQUIREMENT_STATES.findIndex(
        (x) => x.studentId === studentId && x.requirementDefId === def?.id,
      )
      // Unsigning REMOVES the state rather than blanking it — a sign-off that
      // did not happen has no record, exactly as it had none before signing.
      if (i >= 0) REQUIREMENT_STATES.splice(i, 1)
    },

    async getBoundaries(schoolId, cohortId) {
      const own = TOK_BOUNDARIES.find(
        (b) => b.schoolId === schoolId && b.cohortId === cohortId,
      )
      if (own) return own
      // CARRIED FORWARD, UNCONFIRMED. A teacher who retypes four numbers every
      // August will eventually type one wrong; a table nobody has looked at is
      // a starting point and must say so. The opposite rule to the prescribed
      // titles, deliberately, and both are asserted.
      const cohort = COHORTS.find((c) => c.id === cohortId && c.schoolId === schoolId)
      const previous = cohort
        ? TOK_BOUNDARIES
          .filter((b) => b.schoolId === schoolId)
          .map((b) => ({ b, c: COHORTS.find((x) => x.id === b.cohortId) }))
          .filter((x) => x.c != null && x.c.gradYear < cohort.gradYear)
          .sort((a, b2) => b2.c!.gradYear - a.c!.gradYear)[0]?.b
        : undefined
      const row: TokBoundaryTable = {
        schoolId, cohortId,
        lower: previous?.lower ?? SEED_BOUNDARIES,
        confirmed: false,
        carriedFrom: previous?.cohortId,
      }
      TOK_BOUNDARIES.push(row)
      return row
    },

    async setBoundaries(schoolId, cohortId, lower, by) {
      const problems = boundaryProblems(lower)
      if (problems.length) return { ok: false, message: problems[0] }
      const row = await fixtureRepository.tok.getBoundaries(schoolId, cohortId)
      Object.assign(row!, {
        lower, confirmed: true, confirmedBy: by.id, confirmedAt: todayRiyadh(),
      })
      return { ok: true }
    },

    async confirmBoundaries(schoolId, cohortId, by) {
      const row = await fixtureRepository.tok.getBoundaries(schoolId, cohortId)
      if (!row) return
      row.confirmed = true
      row.confirmedBy = by.id
      row.confirmedAt = todayRiyadh()
    },

    async getEvidence(schoolId, cohortId) {
      const table = await fixtureRepository.tok.getBoundaries(schoolId, cohortId)
      return STUDENTS
        .filter((s) => s.schoolId === schoolId && s.cohortId === cohortId)
        .map((s) => {
          // READ from the marks, never typed here — so this screen can never
          // disagree with the screen the marks were entered on.
          const exhibition = tokState(schoolId, s.userId, 'tok.exhmark')?.mark ?? null
          const essay = tokState(schoolId, s.userId, 'tok.essaymark')?.mark ?? null
          const total = tokTotal(exhibition, essay)
          return {
            studentId: s.userId,
            studentName: USERS.find((u) => u.id === s.userId)?.name ?? s.userId,
            exhibition, essay, total,
            indicative: letterFor(total, table),
            tableConfirmed: table?.confirmed ?? false,
          }
        })
    },

    async revokeMark(schoolId, studentId, kind, by) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return
      const key = kind === 'exh' ? 'tok.exhmark' : 'tok.essaymark'
      const state = tokState(schoolId, studentId, key)
      const prose = TOK_MARKS.find(
        (m) => m.schoolId === schoolId && m.studentId === studentId && m.kind === kind,
      )
      if (!state || state.recordStatus !== 'released') return
      state.recordStatus = 'marked'
      if (prose) prose.releasedAt = undefined
      MARK_EVENTS.push({
        id: `mev_tokrev_${kind}_${studentId}_${MARK_EVENTS.length}`,
        schoolId, cohortId: st.cohortId, courseId: 'tok', studentId,
        kind: 'mark', criterion: kind === 'exh' ? 'exhibition revoked' : 'essay revoked',
        prev: state.mark ?? null, next: state.mark ?? null,
        byUserId: by.id, at: new Date(0).toISOString(),
      })
    },

    async submitInteraction(schoolId, studentId, n, body) {
      const text = body.trim()
      if (!text) return { ok: false, message: 'Write something before you submit.' }
      // THE GATE IS RE-CHECKED HERE, not trusted from the screen. A teacher who
      // has not recorded the meeting is the reason this is shut, and the way
      // through it is to record the meeting.
      const view = await fixtureRepository.tok.getStudentView(schoolId, studentId)
      const slot = view?.interactions.find((x) => x.n === n)
      if (!slot) return { ok: false, message: 'No such interaction.' }
      if (slot.entry) return { ok: false, message: 'That one is already submitted and locked.' }
      if (!slot.open) return { ok: false, message: slot.closedReason ?? 'Not open yet.' }
      writeTokText(schoolId, studentId, `tok.ppf${n}`, text, 'student', true)
      return { ok: true }
    },
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
        rpf: eeRpfOf(schoolId, studentId),
        // A STUDENT SEES NOTHING BEFORE RELEASE. Not a partial total, not a
        // band — a mark in progress is a supervisor's working, not a result.
        releasedScore: (() => {
          const st2 = eeState(schoolId, studentId, 'ee.score')
          if (st2?.recordStatus !== 'released') return null
          const marks = st2.criterionMarks ?? []
          const total = marks.reduce<number>((n, m) => n + (m ?? 0), 0)
          return { marks, total, band: indicativeGrade(total) }
        })(),
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
          finalLocked: finalIsLocked(schoolId, st.userId),
          // Pulled off the SAME checkpoints the student's own screen shows, so
          // the supervisor is never looking at a different set of documents.
          rpf: eeRpfOf(schoolId, st.userId),
          marks: eeMarksOf(schoolId, st.userId),
          scoring: EE_SCORING.find(
            (x) => x.studentId === st.userId && x.schoolId === schoolId,
          ) ?? null,
          links: (['outline', 'draft'] as const).flatMap((stage) => {
            const cp = lane?.checkpoints.find((c) => c.def.key === `ee.${stage}`)
            const a = cp?.state?.artifacts.find((x) => x.kind === 'link' && x.href)
            return a?.href
              ? [{ stage, label: a.label, href: a.href, addedAt: a.addedAt }]
              : []
          }),
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

    async submitRpf(schoolId, studentId, body) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === 'ee.rpf',
      )
      if (!def) return
      const at = todayRiyadh()
      const artifact = {
        id: `art_rpf_${studentId}`, kind: 'text' as const,
        label: 'Reflection statement', body: body.trim(), addedAt: at,
      }
      const lockedAt = new Date(`${at}T00:00:00.000Z`).toISOString()
      const state = REQUIREMENT_STATES.find(
        (x) => x.studentId === studentId && x.requirementDefId === def.id,
      )
      if (state) {
        state.recordStatus = 'submitted'
        state.artifacts = [artifact]
        state.recordedAt = at
        state.lockedAt = lockedAt
      } else {
        REQUIREMENT_STATES.push({
          studentId, requirementDefId: def.id, schoolId,
          recordStatus: 'submitted', artifacts: [artifact],
          recordedAt: at, recordedBy: studentId, lockedAt,
        })
      }
    },

    async saveMark(schoolId, studentId, criterionIndex, mark, byName) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === 'ee.score',
      )
      if (!def) return
      let state = REQUIREMENT_STATES.find(
        (x) => x.studentId === studentId && x.requirementDefId === def.id,
      )
      if (!state) {
        state = {
          studentId, requirementDefId: def.id, schoolId,
          recordStatus: 'in_progress', artifacts: [],
          criterionMarks: EE_CRITERIA.map(() => null),
        }
        REQUIREMENT_STATES.push(state)
      }
      const marks = state.criterionMarks ?? EE_CRITERIA.map(() => null)
      marks[criterionIndex] = mark
      state.criterionMarks = marks
      state.recordedBy = byName
      state.recordedAt = todayRiyadh()
      // THE TOTAL IS NEVER STORED — iaTotal() sums criterionMarks on read
      // (invariant #2). Partially marked reads in_progress, which is exactly
      // what a supervisor who has done A–D before the viva looks like.
      const all = marks.every((m) => m != null)
      if (state.recordStatus !== 'released') {
        state.recordStatus = all ? 'marked' : 'in_progress'
      }
    },

    async saveScoring(schoolId, studentId, input, byId, byName) {
      const existing = EE_SCORING.find(
        (x) => x.studentId === studentId && x.schoolId === schoolId,
      )
      const attested = input.attestedSessions && input.attestedAuthentic
      const at = todayRiyadh()
      if (existing) {
        Object.assign(existing, input)
        // The attestation is DATED when it becomes complete, and the date is
        // not moved by later edits to the comment.
        if (attested && !existing.attestedAt) {
          existing.attestedBy = byId
          existing.attestedByName = byName
          existing.attestedAt = at
        }
        if (!attested) {
          delete existing.attestedBy
          delete existing.attestedByName
          delete existing.attestedAt
        }
        return
      }
      EE_SCORING.push({
        schoolId, studentId, ...input,
        ...(attested ? { attestedBy: byId, attestedByName: byName, attestedAt: at } : {}),
      })
    },

    async releaseScore(schoolId, studentId, byId, byName) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === 'ee.score',
      )
      const state = def && REQUIREMENT_STATES.find(
        (x) => x.studentId === studentId && x.requirementDefId === def.id,
      )
      if (state) {
        state.recordStatus = 'released'
        state.lockedAt = new Date(`${todayRiyadh()}T00:00:00.000Z`).toISOString()
      }
      const sc = EE_SCORING.find((x) => x.studentId === studentId && x.schoolId === schoolId)
      if (sc) {
        sc.releasedBy = byId
        sc.releasedByName = byName
        sc.releasedAt = todayRiyadh()
      }
    },

    async revokeScore(schoolId, studentId) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === 'ee.score',
      )
      const state = def && REQUIREMENT_STATES.find(
        (x) => x.studentId === studentId && x.requirementDefId === def.id,
      )
      if (state) {
        state.recordStatus = (state.criterionMarks ?? []).every((m) => m != null)
          ? 'marked' : 'in_progress'
        delete state.lockedAt
      }
      const sc = EE_SCORING.find((x) => x.studentId === studentId && x.schoolId === schoolId)
      if (sc) {
        delete sc.releasedBy
        delete sc.releasedByName
        delete sc.releasedAt
      }
    },

    async listAssignableStaff(schoolId, cohortId) {
      const live = EE_SUPERVISION.filter(
        (x) => x.schoolId === schoolId && x.cohortId === cohortId && x.endedAt == null,
      )
      return MEMBERSHIPS.filter(
        (m) => m.schoolId === schoolId && !m.roles.includes('student'),
      ).map((m) => ({
        userId: m.userId,
        name: USERS.find((u) => u.id === m.userId)?.name ?? m.userId,
        // Shown so a coordinator can spread the load rather than discovering in
        // February that one person took eleven of them.
        load: live.filter((x) => x.supervisorId === m.userId).length,
      })).sort((a, b) => a.name.localeCompare(b.name))
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

    async submitFinal(schoolId, studentId, fileName, declaredWords, ref) {
      const st = STUDENTS.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!st) return
      const def = REQUIREMENT_DEFS.find(
        (d) => d.cohortId === st.cohortId && d.schoolId === schoolId && d.key === 'ee.final',
      )
      if (!def) return
      const at = todayRiyadh()

      const existing = EE_FINALS.find((x) => x.studentId === studentId && x.schoolId === schoolId)
      const row: EeFinal = { schoolId, studentId, fileName, declaredWords, submittedAt: at, ref }
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
      const eeRef = ref ?? fixtureRef(fileName, at)
      const artifact = fileArtifact(
        `art_final_${studentId}_${eeRef.id}`,
        eeRef,
        { addedAt: at, addedBy: 'student' },
      )
      if (state) {
        state.recordStatus = 'submitted'
        state.recordedAt = at
        state.lockedAt = lockedAt
        supersede(state, at, artifact)
      } else {
        REQUIREMENT_STATES.push({
          studentId, requirementDefId: def.id, schoolId,
          recordStatus: 'submitted', recordedAt: at, recordedBy: studentId, lockedAt,
          artifacts: [artifact],
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
