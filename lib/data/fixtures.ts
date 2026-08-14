// Fixture data — a small, realistic ISG cohort, entirely in memory.
//
// This exists so the whole application can be built and demonstrated on a
// laptop with no cloud account, no database and no Google project. Replace it
// with a real implementation of Repository when the platform is decided.

import type {
  Announcement, Cohort, Course, KeyDate, LibraryDocument, Membership,
  ModuleTile, School, Section, Student, User,
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
  { userId: 'u_layla', schoolId: 'dhahran', roles: ['student'], presetKey: 'student', addedCapabilities: [], removedCapabilities: [] },
]

export const COURSES: Course[] = [
  { id: 'eng', schoolId: 'dhahran', name: 'English A: Lang & Lit HL', subjectGroup: 'Group 1', level: 'HL', hasIA: true },
  { id: 'spa', schoolId: 'dhahran', name: 'Spanish B SL', subjectGroup: 'Group 2', level: 'SL', hasIA: true },
  { id: 'his', schoolId: 'dhahran', name: 'History HL', subjectGroup: 'Group 3', level: 'HL', hasIA: true },
  { id: 'bio', schoolId: 'dhahran', name: 'Biology SL', subjectGroup: 'Group 4', level: 'SL', hasIA: true },
  { id: 'maa', schoolId: 'dhahran', name: 'Mathematics AA SL', subjectGroup: 'Group 5', level: 'SL', hasIA: true },
  { id: 'bus', schoolId: 'dhahran', name: 'Business Management SL', subjectGroup: 'Group 3', level: 'SL', hasIA: true },
]

export const SECTIONS: Section[] = [
  { id: 'bio_a', schoolId: 'dhahran', courseId: 'bio', cohortId: 'c15', label: 'A' },
  { id: 'bio_b', schoolId: 'dhahran', courseId: 'bio', cohortId: 'c15', label: 'B' },
  { id: 'his_a', schoolId: 'dhahran', courseId: 'his', cohortId: 'c15', label: 'A' },
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

    if (roles.includes('student')) {
      return [
        { key: 'cas', label: 'CAS', sublabel: '7 outcomes · project · 3 interviews', href: '/cas', outstanding: 0, status: 'ok' },
        { key: 'ee', label: 'Extended Essay', sublabel: 'History · draft due 18 Sep', href: '/ee', outstanding: 1, status: 'attention' },
        { key: 'tok', label: 'TOK', sublabel: 'Exhibition + essay', href: '/tok', outstanding: 2, status: 'attention' },
        ...COURSES.filter((c) => c.schoolId === schoolId).map<ModuleTile>((c) => ({
          key: c.id, label: c.name, sublabel: c.hasIA ? 'Internal assessment' : 'No IA',
          href: `/courses/${c.id}`, outstanding: c.id === 'bio' ? 1 : 0,
          status: c.id === 'bio' ? 'attention' : 'ok',
        })),
      ]
    }

    if (roles.includes('teacher') || roles.includes('tok_teacher')) {
      const tiles: ModuleTile[] = SECTIONS.filter((s) => s.schoolId === schoolId).map((s) => {
        const course = COURSES.find((c) => c.id === s.courseId)!
        return {
          key: s.id, label: `${course.name} — ${s.label}`, sublabel: 'My section',
          href: `/sections/${s.id}`, outstanding: s.id === 'bio_b' ? 4 : 0,
          status: s.id === 'bio_b' ? 'attention' : 'ok',
        }
      })
      if (roles.includes('cas_coordinator')) {
        tiles.unshift({ key: 'cas', label: 'CAS', sublabel: 'Whole cohort', href: '/cas', outstanding: 6, status: 'attention' })
      }
      if (roles.includes('ee_coordinator')) {
        tiles.unshift({ key: 'ee', label: 'Extended Essay', sublabel: 'My supervisees', href: '/ee', outstanding: 2, status: 'attention' })
      }
      if (roles.includes('tok_teacher')) {
        tiles.unshift({ key: 'tok', label: 'TOK', sublabel: 'Exhibition + essay', href: '/tok', outstanding: 4, status: 'attention' })
      }
      return tiles
    }

    // Coordinators land on the whole programme.
    return [
      { key: 'cas', label: 'CAS', sublabel: 'Whole cohort', href: '/cas', outstanding: 3, status: 'attention' },
      { key: 'ee', label: 'Extended Essay', sublabel: '22 of 24 finals in', href: '/ee', outstanding: 7, status: 'attention' },
      { key: 'tok', label: 'TOK', sublabel: '23 of 24 essays in', href: '/tok', outstanding: 5, status: 'attention' },
      { key: 'ia', label: 'Internal Assessments', sublabel: '4 of 9 subjects returned', href: '/ia', outstanding: 5, status: 'attention' },
      { key: 'pg', label: 'Predicted grades', sublabel: '2 of 9 subjects in', href: '/predicted', outstanding: 7, status: 'attention' },
      { key: 'ib', label: 'IB submission', sublabel: 'May 2027 · 41 days to 20 Apr', href: '/submission', outstanding: 0, status: 'ok' },
    ]
  },
}
