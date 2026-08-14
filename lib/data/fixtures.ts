// Fixture data — a small, realistic ISG cohort, entirely in memory.
//
// This exists so the whole application can be built and demonstrated on a
// laptop with no cloud account, no database and no Google project. Replace it
// with a real implementation of Repository when the platform is decided.

import type {
  Announcement, Cohort, CommandCentre, Course, Enrollment, KeyDate,
  LibraryDocument, Membership, ModuleTile, School, Section, Student,
  TeachingAssignment, User, WorkItem,
} from '../types'
import type { Repository } from './repository'

export const SCHOOLS: School[] = [
  { id: 'dhahran', name: 'ISG Dhahran', ibSchoolCode: '001234' },
  { id: 'jubail', name: 'ISG Jubail', ibSchoolCode: '004417' },
]

export const COHORTS: Cohort[] = [
  { id: 'c15', schoolId: 'dhahran', label: 'Cohort 15 — Class of 2027', gradYear: 2027, archived: false },
  { id: 'c16', schoolId: 'dhahran', label: 'Cohort 16 — Class of 2028', gradYear: 2028, archived: false },
  { id: 'j09', schoolId: 'jubail', label: 'Cohort 9 — Class of 2027', gradYear: 2027, archived: false },
]

export const USERS: User[] = [
  { id: 'u_michael', name: 'Michael', email: 'shmikie@isg.edu.sa', status: 'active' },
  { id: 'u_haddad', name: 'S. Haddad', email: 'shaddad@isg.edu.sa', status: 'active' },
  { id: 'u_adeyemi', name: 'H. Adeyemi', email: 'hadeyemi@isg.edu.sa', status: 'active' },
  { id: 'u_farouk', name: 'R. Farouk', email: 'rfarouk@isg.edu.sa', status: 'active' },
  { id: 'u_silva', name: 'M. Silva', email: 'msilva@isg.edu.sa', status: 'active' },
  { id: 'u_layla', name: 'Layla Ahmed', email: 'lahmed27@isg.edu.sa', status: 'active' },
]

export const MEMBERSHIPS: Membership[] = [
  // The district coordinator belongs to BOTH schools — which is exactly why
  // membership is a list rather than a field on the user.
  { userId: 'u_michael', schoolId: 'dhahran', roles: ['district_coordinator'], presetKey: 'district', addedCapabilities: [], removedCapabilities: [] },
  { userId: 'u_michael', schoolId: 'jubail', roles: ['district_coordinator'], presetKey: 'district', addedCapabilities: [], removedCapabilities: [] },
  { userId: 'u_haddad', schoolId: 'jubail', roles: ['school_coordinator'], presetKey: 'school_standard', addedCapabilities: [], removedCapabilities: [] },
  // Four distinct roles held by one person — never merged into a "Core teacher" role.
  {
    userId: 'u_adeyemi', schoolId: 'dhahran',
    roles: ['cas_coordinator', 'ee_coordinator', 'tok_teacher', 'tok_coordinator'],
    presetKey: 'teacher', addedCapabilities: ['items.unlock', 'announcements.post'], removedCapabilities: [],
  },
  { userId: 'u_farouk', schoolId: 'dhahran', roles: ['teacher'], presetKey: 'teacher', addedCapabilities: [], removedCapabilities: [] },
  { userId: 'u_silva', schoolId: 'dhahran', roles: ['teacher'], presetKey: 'teacher', addedCapabilities: [], removedCapabilities: [] },
  { userId: 'u_layla', schoolId: 'dhahran', roles: ['student'], presetKey: 'student', addedCapabilities: [], removedCapabilities: [] },
]

export const COURSES: Course[] = [
  { id: 'eng', schoolId: 'dhahran', name: 'English A: Lang & Lit HL', subjectGroup: 'Group 1', level: 'HL', hasIA: true },
  { id: 'spa', schoolId: 'dhahran', name: 'Spanish B SL', subjectGroup: 'Group 2', level: 'SL', hasIA: true },
  { id: 'his', schoolId: 'dhahran', name: 'History HL', subjectGroup: 'Group 3', level: 'HL', hasIA: true },
  { id: 'bio', schoolId: 'dhahran', name: 'Biology SL', subjectGroup: 'Group 4', level: 'SL', hasIA: true },
  { id: 'maa', schoolId: 'dhahran', name: 'Mathematics AA SL', subjectGroup: 'Group 5', level: 'SL', hasIA: true },
  { id: 'bus', schoolId: 'dhahran', name: 'Business Management SL', subjectGroup: 'Group 3', level: 'SL', hasIA: true },
  { id: 'tok', schoolId: 'dhahran', name: 'Theory of Knowledge', subjectGroup: 'Core', level: null, hasIA: false },
]

export const SECTIONS: Section[] = [
  { id: 'bio_a', schoolId: 'dhahran', courseId: 'bio', cohortId: 'c15', label: 'A' },
  { id: 'bio_b', schoolId: 'dhahran', courseId: 'bio', cohortId: 'c15', label: 'B' },
  { id: 'his_a', schoolId: 'dhahran', courseId: 'his', cohortId: 'c15', label: 'A' },
  { id: 'tok_a', schoolId: 'dhahran', courseId: 'tok', cohortId: 'c15', label: 'A' },
]

/**
 * Teachers attach to SECTIONS, not to courses — and it is many-to-many, so both
 * co-teaching (several teachers on one section) and parallel sections (one
 * teacher on each of several) fall out of the same table.
 *
 * This is also the fix for a bug in the first scaffold: a teacher's modules must
 * come from THIS list, never from "every section in the school".
 */
export const TEACHING_ASSIGNMENTS: TeachingAssignment[] = [
  { teacherId: 'u_farouk', sectionId: 'bio_a', isDesignatedMarker: true },
  { teacherId: 'u_farouk', sectionId: 'bio_b', isDesignatedMarker: true },
  // Section B is co-taught — two teachers, one group of students.
  { teacherId: 'u_silva', sectionId: 'bio_b', isDesignatedMarker: false },
  { teacherId: 'u_silva', sectionId: 'his_a', isDesignatedMarker: true },
  { teacherId: 'u_adeyemi', sectionId: 'tok_a', isDesignatedMarker: true },
]

/** Students attach to sections too. A student's courses are DERIVED from these. */
export const ENROLLMENTS: Enrollment[] = [
  { studentId: 'u_layla', sectionId: 'bio_a' },
  { studentId: 'u_layla', sectionId: 'his_a' },
  { studentId: 'u_layla', sectionId: 'tok_a' },
]

export const STUDENTS: Student[] = [
  {
    userId: 'u_layla', schoolId: 'dhahran', cohortId: 'c15',
    personalCode: 'hjw482', sessionNumber: '0003', identifiersState: 'confirmed',
  },
]

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'a1', schoolId: 'dhahran', title: 'TOK prescribed titles are up for May 2027',
    body: 'All six titles are posted in the TOK area. Choose yours before the October half-term so we can plan supervision time.',
    postedBy: 'H. Adeyemi', postedAt: '2026-08-12', audienceRoles: [], cohortId: 'c15',
  },
  {
    id: 'a2', schoolId: 'dhahran', title: 'EE reflection sessions — book your slot',
    body: 'Session 2 slots are open. You must have held all three, including the viva voce, before the RPF is due.',
    postedBy: 'H. Adeyemi', postedAt: '2026-08-10', audienceRoles: [], cohortId: 'c15',
  },
  {
    id: 'a3', schoolId: 'dhahran', title: 'Staff: IA marks needed by 6 April',
    body: 'Internal deadline is two weeks before the IB’s, so there is room to fix problems. Please do not send marks by email.',
    postedBy: 'Michael', postedAt: '2026-08-08',
    audienceRoles: ['teacher', 'school_coordinator', 'district_coordinator'], cohortId: null,
  },
]

const KEY_DATES: KeyDate[] = [
  { id: 'k1', schoolId: 'dhahran', cohortId: 'c15', label: 'EE full draft due', date: '2026-09-18', module: 'ee', kind: 'internal' },
  { id: 'k2', schoolId: 'dhahran', cohortId: 'c15', label: 'CAS interim interview window opens', date: '2026-09-28', module: 'cas', kind: 'internal' },
  { id: 'k3', schoolId: 'dhahran', cohortId: 'c15', label: 'TOK exhibition submission', date: '2026-10-09', module: 'tok', kind: 'internal' },
  { id: 'k4', schoolId: 'dhahran', cohortId: 'c15', label: 'IB candidate registration closes', date: '2026-11-15', module: 'ib', kind: 'ib' },
  { id: 'k5', schoolId: 'dhahran', cohortId: 'c15', label: 'IA marks + predicted grades to the IB', date: '2027-04-20', module: 'ib', kind: 'ib' },
]

const DOCUMENTS: LibraryDocument[] = [
  { id: 'd1', schoolId: 'dhahran', title: 'Extended Essay guide (2027 assessment)', description: 'The official IB guide for the cohort assessed in 2027. Note the 30-mark rubric and the single post-viva reflection.', module: 'ee', audience: 'everyone', cohortId: 'c15', version: '2027', updatedAt: '2026-06-01', href: '#' },
  { id: 'd2', schoolId: 'dhahran', title: 'EE assessment criteria A–E, one page', description: 'The rubric on a single side, for supervisors and students.', module: 'ee', audience: 'everyone', cohortId: 'c15', version: '1.2', updatedAt: '2026-07-14', href: '#' },
  { id: 'd3', schoolId: 'dhahran', title: 'TOK prescribed titles — May 2027', description: 'The six titles released for this session.', module: 'tok', audience: 'everyone', cohortId: 'c15', version: 'M27', updatedAt: '2026-08-12', href: '#' },
  { id: 'd4', schoolId: 'dhahran', title: 'TOK exhibition — the 35 IA prompts', description: 'Choose one. Fixed list, unchanged for 2027.', module: 'tok', audience: 'everyone', cohortId: null, version: '2022', updatedAt: '2025-09-02', href: '#' },
  { id: 'd5', schoolId: 'dhahran', title: 'CAS handbook', description: 'Strands, the seven learning outcomes, what counts as a CAS project, and how sign-off works.', module: 'cas', audience: 'everyone', cohortId: null, version: '3.0', updatedAt: '2026-05-20', href: '#' },
  { id: 'd6', schoolId: 'dhahran', title: 'ISG academic honesty policy', description: 'What authenticity means in practice, and what happens if work is not your own.', module: 'general', audience: 'everyone', cohortId: null, version: '2026', updatedAt: '2026-04-11', href: '#' },
  { id: 'd7', schoolId: 'dhahran', title: 'Supervisor sign-off form (printable)', description: 'For CAS experiences where the supervisor will not sign digitally. Photograph and upload it.', module: 'cas', audience: 'everyone', cohortId: null, version: '2.1', updatedAt: '2026-03-30', href: '#' },
  { id: 'd8', schoolId: 'dhahran', title: 'Internal deadlines — Class of 2027', description: 'Every school deadline for the year on one page. IB deadlines shown for context.', module: 'core', audience: 'everyone', cohortId: 'c15', version: '1.0', updatedAt: '2026-08-01', href: '#' },
  { id: 'd9', schoolId: 'dhahran', title: 'Teacher comment template for IA moderation', description: 'Justify marks per criterion. Moderators say this materially helps — use it.', module: 'ia', audience: 'staff', cohortId: null, version: '1.1', updatedAt: '2026-07-02', href: '#' },
  { id: 'd10', schoolId: 'dhahran', title: 'eCoursework upload checklist', description: 'What each component needs before it can be submitted.', module: 'core', audience: 'staff', cohortId: null, version: '2027', updatedAt: '2026-07-28', href: '#' },
]

function rolesFor(userId: string, schoolId: string) {
  return MEMBERSHIPS.find((m) => m.userId === userId && m.schoolId === schoolId)?.roles ?? []
}

function isStudent(userId: string, schoolId: string) {
  return rolesFor(userId, schoolId).includes('student')
}

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
  async listCohorts(schoolId) {
    return COHORTS.filter((c) => c.schoolId === schoolId)
  },
  async listCourses(schoolId) {
    return COURSES.filter((c) => c.schoolId === schoolId)
  },
  async listSections(schoolId) {
    return SECTIONS.filter((s) => s.schoolId === schoolId)
  },
  async getStudent(userId) {
    return STUDENTS.find((s) => s.userId === userId) ?? null
  },

  async listAnnouncements(schoolId, forUserId) {
    const roles = rolesFor(forUserId, schoolId)
    return ANNOUNCEMENTS.filter((a) => a.schoolId === schoolId)
      .filter((a) => a.audienceRoles.length === 0 || a.audienceRoles.some((r) => roles.includes(r)))
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
  },

  async listKeyDates(schoolId, cohortId) {
    return KEY_DATES.filter((k) => k.schoolId === schoolId)
      .filter((k) => !cohortId || k.cohortId === cohortId)
      .sort((a, b) => a.date.localeCompare(b.date))
  },

  async listDocuments(schoolId, forUserId) {
    const student = isStudent(forUserId, schoolId)
    const cohortId = STUDENTS.find((s) => s.userId === forUserId)?.cohortId ?? null
    return DOCUMENTS.filter((d) => d.schoolId === schoolId)
      .filter((d) => (student ? d.audience !== 'staff' : true))
      // Cohort-specific documents are versioned: 2027 students see the 2027 guide.
      .filter((d) => (student && d.cohortId ? d.cohortId === cohortId : true))
  },

  async listModuleTiles(schoolId, forUserId) {
    const roles = rolesFor(forUserId, schoolId)
    const courseOf = (sectionId: string) => {
      const sec = SECTIONS.find((x) => x.id === sectionId)!
      return { section: sec, course: COURSES.find((c) => c.id === sec.courseId)! }
    }

    if (roles.includes('student')) {
      const core: ModuleTile[] = [
        { key: 'cas', label: 'CAS', sublabel: 'Core', href: '/cas', outstanding: 0, status: 'ok' },
        { key: 'ee', label: 'Extended Essay', sublabel: 'Core · History', href: '/ee', outstanding: 1, status: 'attention' },
        { key: 'tok', label: 'TOK', sublabel: 'Core', href: '/tok', outstanding: 2, status: 'attention' },
      ]
      // Courses are DERIVED from the student's enrolments, never hardcoded.
      const mine = ENROLLMENTS.filter((e) => e.studentId === forUserId)
        .map((e) => courseOf(e.sectionId))
        .filter(({ course }) => course.id !== 'tok')
        .map<ModuleTile>(({ course }) => ({
          key: course.id, label: course.name, sublabel: 'Internal assessment',
          href: `/courses/${course.id}`, outstanding: course.id === 'bio' ? 1 : 0,
          status: course.id === 'bio' ? 'attention' : 'ok',
        }))
      return [...core, ...mine]
    }

    if (roles.includes('school_coordinator') || roles.includes('district_coordinator')) {
      return [
        { key: 'cas', label: 'CAS', sublabel: 'Whole cohort', href: '/cas', outstanding: 3, status: 'attention' },
        { key: 'ee', label: 'Extended Essay', sublabel: 'Whole cohort', href: '/ee', outstanding: 7, status: 'attention' },
        { key: 'tok', label: 'TOK', sublabel: 'Whole cohort', href: '/tok', outstanding: 5, status: 'attention' },
        { key: 'ia', label: 'Internal Assessments', sublabel: 'All subjects', href: '/ia', outstanding: 5, status: 'attention' },
        { key: 'pg', label: 'Predicted grades', sublabel: 'All subjects', href: '/predicted', outstanding: 7, status: 'attention' },
        { key: 'sub', label: 'IB submission', sublabel: 'May 2027', href: '/submission', outstanding: 0, status: 'ok' },
        { key: 'setup', label: 'Setup & people', sublabel: 'Cohorts, courses, staff', href: '/setup', outstanding: 0, status: 'none' },
      ]
    }

    // Staff: only the sections they are actually assigned to, plus any Core
    // role they hold. A subject teacher never sees another subject's sections.
    const tiles: ModuleTile[] = []
    if (roles.includes('cas_coordinator')) tiles.push({ key: 'cas', label: 'CAS', sublabel: 'CAS coordinator', href: '/cas', outstanding: 6, status: 'attention' })
    if (roles.includes('ee_coordinator')) tiles.push({ key: 'ee', label: 'Extended Essay', sublabel: 'EE coordinator', href: '/ee', outstanding: 2, status: 'attention' })
    for (const ta of TEACHING_ASSIGNMENTS.filter((t) => t.teacherId === forUserId)) {
      const { section, course } = courseOf(ta.sectionId)
      if (course.schoolId !== schoolId) continue
      const multi = SECTIONS.filter((x) => x.courseId === course.id).length > 1
      tiles.push({
        key: section.id,
        label: multi ? `${course.name} — ${section.label}` : course.name,
        sublabel: ta.isDesignatedMarker ? 'My class' : 'Co-teaching',
        href: `/sections/${section.id}`,
        outstanding: section.id === 'bio_b' ? 4 : section.id === 'tok_a' ? 9 : 0,
        status: section.id === 'bio_b' || section.id === 'tok_a' ? 'attention' : 'ok',
      })
    }
    return tiles
  },

  async getCommandCentre(schoolId): Promise<CommandCentre> {
    if (schoolId !== 'dhahran') {
      // A school with no data yet — the second school before it is set up.
      return {
        banner: { sessionLabel: 'May 2027 session', cohortLabel: 'Cohort 9 — Class of 2027', candidates: 11, ibSchoolCode: '004417', deadlines: [] },
        readiness: [], attention: [], staff: [],
      }
    }
    return {
      banner: {
        sessionLabel: 'May 2027 session',
        cohortLabel: 'Cohort 15 — Class of 2027',
        candidates: 24,
        ibSchoolCode: '001234',
        deadlines: [
          { label: 'IA marks + predicted grades', date: '2027-04-20', urgent: true },
          { label: 'Group 6 uploads', date: '2027-04-30', urgent: false },
          { label: 'IB registration closes', date: '2026-11-15', urgent: false },
        ],
      },
      readiness: [
        { label: 'EE finals in', done: 22, total: 24, unit: '', state: 'ok' },
        { label: 'RPFs in', done: 17, total: 24, unit: '', state: 'warn' },
        { label: 'TOK essays in', done: 23, total: 24, unit: '', state: 'ok' },
        { label: 'TK/PPF complete', done: 19, total: 24, unit: '', state: 'warn' },
        { label: 'IA marks received', done: 4, total: 9, unit: 'subjects', state: 'bad' },
        { label: 'Predicted grades in', done: 2, total: 9, unit: 'subjects', state: 'bad' },
        { label: 'CAS complete', done: 21, total: 24, unit: '', state: 'ok' },
        { label: 'Candidate authentications', done: 15, total: 24, unit: '', state: 'warn' },
      ],
      attention: [
        { id: 'n1', tag: 'IB · 41d', tone: 'ib', title: 'IA marks not received — 5 subjects', detail: 'Blocks mark entry, which blocks sample selection, which blocks uploads', action: 'Nudge all 5' },
        { id: 'n2', tag: 'IB · 41d', tone: 'ib', title: 'Predicted grades outstanding — 7 subjects', detail: 'Entered in IBIS · IAPG → Predicted grades', action: 'Open grid' },
        { id: 'n3', tag: 'EE', tone: 'ee', title: '2 supervisor attestations missing', detail: 'Chen · Okoro — attestation gates EE score submission', action: 'Nudge' },
        { id: 'n4', tag: 'EE', tone: 'ee', title: '7 RPFs not submitted', detail: 'Viva voce held for 5 of them — reflection overdue', action: 'Print notices' },
        { id: 'n5', tag: 'Anonymity', tone: 'ib', title: '3 uploads failed the anonymity check', detail: 'Supervisor name in 2 EEs; school name in 1 TOK essay', action: 'Review' },
        { id: 'n6', tag: 'IA', tone: 'ia', title: 'Moderation sample not yet imported', detail: 'Available in IBIS ~1 day after mark entry completes', action: 'Import' },
        { id: 'n7', tag: 'CAS', tone: 'cas', title: '3 students not CAS complete', detail: 'Marcus (outcome 5, project), Layla (final interview), Sara (2 sign-offs)', action: 'Open' },
      ],
      staff: [
        { name: 'H. Adeyemi', role: 'Core teacher', detail: '4 exhibitions unmarked · 2 EE attestations', count: 6 },
        { name: 'R. Farouk', role: 'Biology', detail: 'IA marks not returned · predicted grades not entered', count: 2 },
        { name: 'M. Silva', role: 'History', detail: 'IA marks not returned · nudged 4 days ago', count: 1 },
      ],
    }
  },

  async listMyWork(schoolId, forUserId): Promise<WorkItem[]> {
    const roles = rolesFor(forUserId, schoolId)

    if (roles.includes('student')) {
      return [
        { id: 'w1', title: 'RPF — reflection after your viva voce', detail: '≤500 words. Without it, 4 of your 30 EE marks cannot be awarded.', due: '2026-08-09', overdueDays: 5, href: '/ee', tone: 'overdue' },
        { id: 'w2', title: 'TK/PPF interaction 3', detail: 'Write it in the TOK area. It locks when you submit.', due: '2026-08-15', overdueDays: null, href: '/tok', tone: 'attention' },
        { id: 'w3', title: 'Authenticate your coursework', detail: 'Sign in to IBIS with your own PIN and confirm the work is yours.', due: null, overdueDays: null, href: '/tok', tone: 'attention' },
      ]
    }

    if (roles.includes('tok_teacher')) {
      return [
        { id: 'w4', title: '4 TOK exhibitions to mark', detail: 'Submitted between 2 and 9 August. Marks are not released until you release them.', due: null, overdueDays: null, href: '/tok', tone: 'attention' },
        { id: 'w5', title: '2 EE supervisor attestations to sign', detail: 'Chen · Okoro — the attestation gates the EE score going anywhere.', due: null, overdueDays: null, href: '/ee', tone: 'attention' },
        { id: 'w6', title: '6 CAS experiences awaiting approval', detail: 'Oldest has been waiting 9 days.', due: null, overdueDays: null, href: '/cas', tone: 'attention' },
      ]
    }

    if (roles.includes('teacher')) {
      return [
        { id: 'w7', title: 'IA marks not returned — Biology SL', detail: '12 students. The coordinator cannot complete mark entry until these are in.', due: '2027-04-06', overdueDays: null, href: '/sections/bio_a', tone: 'attention' },
        { id: 'w8', title: 'Predicted grades not entered', detail: 'Due with the IA marks.', due: '2027-04-06', overdueDays: null, href: '/predicted', tone: 'attention' },
      ]
    }
    return []
  },
}
