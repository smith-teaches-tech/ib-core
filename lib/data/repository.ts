// THE SWAP POINT.
//
// Every screen reads through this interface and never touches a database. Today
// it is backed by fixtures (no cloud, no database, runs on a laptop). When IT
// decides between Postgres/Supabase and Firestore, we write ONE new file
// implementing this same interface and change a single line in lib/data/index.ts.
//
// Rule for anything added here: every method takes a schoolId. Scope is a
// boundary, not an afterthought.
//
// Note what is NOT here: no getCommandCentre, no listMyWork, no attention feed.
// The coordinator's views are projections of the same spine the modules write to
// (see claude/IB-Spine-Architecture.md §0). If a coordinator view ever needs a
// new method here, a module underneath is missing something real.

import type {
  Board, Course, LibraryDocument, Membership, School, Student, StudentTrack, User,
} from '../types'
import type { BoardOptions } from '../board'
import type { StoredRef } from '../storage'
import type {
  CasCohortTotals, CasRosterRow, CasStudentView, ExperienceStatus, IndicatorValue,
  InterviewKind, LoKey, Strand, SupervisorRequest, SupervisorView,
} from '../cas/types'
import type {
  CourseRow, IdentifierPreview, IdentifierRow, ImportPreview, ImportRow, PersonRow,
} from '../setup/types'
import type { CapabilityKey, Cohort } from '../types'

export interface CohortSpaces {
  cohort: Cohort
  courses: Course[]
}

export interface Repository {
  // Identity & scope
  getUser(userId: string): Promise<User | null>
  getMemberships(userId: string): Promise<Membership[]>
  getSchool(schoolId: string): Promise<School | null>
  listSchools(): Promise<School[]>
  getStudent(userId: string): Promise<Student | null>

  // Structure
  listCourses(schoolId: string): Promise<Course[]>
  /** Derived from enrolments — never a stored list. */
  coursesOfStudent(studentId: string): Promise<Course[]>
  /** The courses a staff member is actually assigned to teach. */
  myCourses(schoolId: string, userId: string): Promise<Course[]>
  /**
   * "My spaces", GROUPED BY COHORT — because two year groups run at once and a
   * teacher may take both. Same derivation for everyone: a student's spaces come
   * from their enrolments, a teacher's from their assignments, and both resolve
   * through Section, which is what carries the cohort.
   */
  mySpaces(schoolId: string, userId: string): Promise<CohortSpaces[]>

  // The two views over the spine — same data, different zoom
  getTrack(schoolId: string, studentUserId: string): Promise<StudentTrack | null>
  /**
   * The coordinator board. `options` is PRESENTATION ONLY — which lanes are
   * expanded, and whether to filter to export-blocking requirements. It selects
   * among things the modules already record; it never asks for anything new.
   * That is the line this interface exists to hold.
   */
  getBoard(
    schoolId: string,
    cohortId: string,
    options?: BoardOptions,
  ): Promise<Board>

  // Reference content
  listDocuments(schoolId: string, forUserId: string): Promise<LibraryDocument[]>

  /**
   * Module-owned data. See below for why this is not a violation of the rule
   * above — and what would make it one.
   */
  cas: CasRepository

  /** Setup & people — creating the spine objects everything else reads. */
  setup: SetupRepository
}

/**
 * Setup invents NOTHING.
 *
 * Every method here creates or connects an object that already exists in the
 * spine: Course, Section, Enrollment, TeachingAssignment, Membership, Student.
 * That is the test this module has to keep passing — the moment setup needs an
 * entity of its own, either the spine is missing something real or the screen is
 * doing more than setting up.
 */
export interface SetupRepository {
  // ---- reads ----
  listCohorts(schoolId: string): Promise<Cohort[]>
  listCourseRows(schoolId: string, cohortId: string): Promise<CourseRow[]>
  /**
   * `includePins` is the ONLY way a results PIN leaves this repository, and it
   * is gated on `identifiers.manage` at the call site. Redaction happens here
   * rather than in a component, because a component that forgets is a leak.
   */
  listPeople(schoolId: string, includePins?: boolean): Promise<PersonRow[]>
  /** Pure parse + collision check. Nothing is written; the screen previews this. */
  previewImport(schoolId: string, text: string): Promise<ImportPreview>

  // ---- students ----
  /** Commits only the rows the preview marked `new`. Returns how many landed. */
  importStudents(schoolId: string, cohortId: string, rows: ImportRow[]): Promise<number>

  /**
   * The cohort behind whatever you are about to write to — a section, a
   * student, or a cohort named directly.
   *
   * Exists so the actions can refuse writes to an archived year. Hiding the
   * buttons is courtesy; this is the rule.
   */
  cohortOf(
    schoolId: string,
    ref: { cohortId?: string; sectionId?: string; studentId?: string },
  ): Promise<Cohort | null>

  /**
   * Archive or reopen a year group. A coordinator's act, never the calendar's —
   * see lib/cohorts.ts for why automatic archiving was a bad idea.
   */
  setCohortArchived(schoolId: string, cohortId: string, archived: boolean): Promise<void>

  // ---- IB identifiers ----
  /**
   * Coordinator-entered, deliberately. A transposed candidate code invalidates
   * an entire eCoursework upload, and the identifiers are also stamped onto the
   * title pages of uploaded coursework — so this is not a field to leave to
   * whoever happens to type it first.
   */
  setIdentifiers(
    schoolId: string,
    studentId: string,
    input: {
      sessionNumber?: string
      personalCode?: string
      resultsPin?: string
      confirmed?: boolean
    },
  ): Promise<void>
  previewIdentifiers(schoolId: string, text: string): Promise<IdentifierPreview>
  importIdentifiers(schoolId: string, rows: IdentifierRow[]): Promise<number>

  // ---- catalogue ----
  addCourse(
    schoolId: string,
    input: { name: string; subjectGroup: string; level: 'HL' | 'SL' | null },
    cohortId: string,
  ): Promise<string>
  addSection(schoolId: string, courseId: string, cohortId: string, label: string): Promise<string>
  enrolStudent(schoolId: string, studentId: string, sectionId: string): Promise<void>
  unenrolStudent(schoolId: string, studentId: string, sectionId: string): Promise<void>

  // ---- staff ----
  inviteTeacher(schoolId: string, name: string, email: string): Promise<string>
  assignTeacher(schoolId: string, teacherId: string, sectionId: string): Promise<void>
  unassignTeacher(schoolId: string, teacherId: string, sectionId: string): Promise<void>
  setDesignatedMarker(schoolId: string, teacherId: string, sectionId: string, on: boolean): Promise<void>

  // ---- delegation ----
  /**
   * The district coordinator deciding what a school coordinator may do.
   *
   * Stored as a DEVIATION from the preset (added / removed), never as a
   * resolved set — so changing a preset later still reaches everyone who has
   * not been explicitly overridden. See lib/capabilities.ts.
   */
  setCapability(
    schoolId: string, userId: string, capability: CapabilityKey, granted: boolean,
  ): Promise<void>
}

/**
 * CAS reads and writes its OWN entities.
 *
 * This is not the coordinator-view exception creeping back in. The test in
 * IB-Spine-Architecture.md §0 is whether a COORDINATOR VIEW needs a new method:
 * the completeness board and the student track still get everything they need
 * from getBoard/getTrack, because CAS derives its RequirementStates from what is
 * here (lib/cas/derive.ts). Nothing on this interface exists to feed a dashboard.
 *
 * The CAS roster below is the module's own screen, not a projection of one — it
 * shows experiences, threads and interviews, which are exactly the things the
 * spine deliberately does not know about.
 */
export interface CasRepository {
  // ---- reads ----
  getStudentView(schoolId: string, studentUserId: string): Promise<CasStudentView | null>
  getRoster(schoolId: string, cohortId: string): Promise<CasRosterRow[]>
  getTotals(schoolId: string, cohortId: string): Promise<CasCohortTotals>
  /**
   * The one method with no schoolId, and the only one: a supervisor has no
   * account and no membership. The token IS the scope — single experience,
   * 28-day expiry, single use. Nothing else is reachable through it.
   */
  getSupervisorView(token: string): Promise<SupervisorView | null>

  // ---- writes: the student's own record ----
  createExperience(
    schoolId: string,
    studentId: string,
    input: {
      title: string
      description: string
      strands: Strand[]
      isProject: boolean
      claimedOutcomes: LoKey[]
      submit: boolean
    },
    authorName: string,
  ): Promise<string>
  addReflection(
    schoolId: string, experienceId: string, body: string, authorName: string,
  ): Promise<void>
  /** Versioned: the prior entry is kept and superseded, never overwritten. */
  editReflection(
    schoolId: string, entryId: string, body: string, authorName: string,
  ): Promise<void>
  addEvidence(
    schoolId: string, experienceId: string, media: StoredRef[], note: string, authorName: string,
  ): Promise<void>
  requestSupervisor(
    schoolId: string, experienceId: string, email: string, authorName: string,
  ): Promise<SupervisorRequest>
  /** The paper route: mark it ready for the coordinator to verify. */
  markPaperFormUploaded(schoolId: string, experienceId: string, authorName: string): Promise<void>

  // ---- writes: the coordinator ----
  setExperienceStatus(
    schoolId: string,
    experienceId: string,
    status: ExperienceStatus,
    opts: { note?: string; reason?: string; by: string },
  ): Promise<void>
  /** Verify a paper form, or complete on behalf when a supervisor won't sign. */
  completeOnBehalf(
    schoolId: string,
    experienceId: string,
    confirmedOutcomes: LoKey[],
    comment: string,
    by: string,
  ): Promise<void>
  saveInterview(
    schoolId: string,
    studentId: string,
    kind: InterviewKind,
    notes: string,
    conductedOn: string,
    by: string,
  ): Promise<void>
  /** Capability-gated (items.unlock) and always leaves a reason in the trail. */
  unlockInterview(schoolId: string, interviewId: string, reason: string, by: string): Promise<void>
  setIndicator(
    schoolId: string, studentId: string, value: IndicatorValue | null, by: string,
  ): Promise<void>
  addNote(schoolId: string, studentId: string, body: string, by: string): Promise<void>
  /** cas.complete — the one CAS requirement recorded rather than derived. */
  setCasComplete(schoolId: string, studentId: string, complete: boolean, by: string): Promise<void>

  // ---- writes: the supervisor, through the token ----
  signOff(
    token: string,
    input: { confirmedOutcomes: LoKey[]; comment: string; signature: string },
  ): Promise<boolean>
}
