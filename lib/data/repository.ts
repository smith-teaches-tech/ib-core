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
  CohortSummary, CourseRow, IdentifierPreview, IdentifierRow, ImportPreview, ImportRow, PersonRow,
} from '../setup/types'
import type { IaMarksView, MarkEventRow, MarkUnlock, SampleRequest } from '../ia/types'
import type { UploadBoardView } from '../export/types'
import type { CapabilityKey, Cohort, PresetKey } from '../types'

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
   * The candidate-panel gate for teachers: does this teacher hold ANY
   * assignment (marker or co-teacher) to a section this student is enrolled
   * in? A teacher opens the whole-student panel only through this.
   */
  teachesStudent(schoolId: string, teacherId: string, studentId: string): Promise<boolean>
  /**
   * "My spaces", GROUPED BY COHORT — because two year groups run at once and a
   * teacher may take both. Same derivation for everyone: a student's spaces come
   * from their enrolments, a teacher's from their assignments, and both resolve
   * through Section, which is what carries the cohort.
   */
  mySpaces(schoolId: string, userId: string): Promise<CohortSpaces[]>

  // The two views over the spine — same data, different zoom
  /**
   * `includeIdentifiers` is the ONLY way a session number or personal code
   * leaves through a track, and it is gated on `identifiers.manage` at the
   * call site (a student's own home page is the one exception — their own
   * record). FAIL CLOSED: omitted means redacted. The results PIN never
   * leaves through a track at all. Redaction happens here rather than in the
   * panel, because a component that forgets is a leak.
   */
  getTrack(
    schoolId: string,
    studentUserId: string,
    opts?: { includeIdentifiers?: boolean },
  ): Promise<StudentTrack | null>
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

  /** IA marks — the module that records criterion marks and comments. */
  ia: IaRepository

  /** Download for IBIS — the upload board and its one write (exportStatus). */
  export: ExportRepository
}

/**
 * Download for IBIS. NOT a coordinator-view exception: the module owns its own
 * screen (the upload board) exactly as CAS and IA marks do, and that screen is
 * a pure projection over defs, states and SampleRequests — see
 * IB-Export-and-Samples.md §4, which found the spine needed nothing new. The
 * single write stamps eCoursework's own status word onto the states a pack was
 * built from; the school record never moves.
 */
export interface ExportRepository {
  /** The whole board for one cohort: cohort packs, samples, hand-typed counts. */
  getUploadBoard(schoolId: string, cohortId: string): Promise<UploadBoardView | null>
  /**
   * Mark a whole-cohort job as uploaded in eCoursework (or take it back).
   * Stamps `exportStatus: 'submitted'` on every COMPLETE contributing state;
   * incomplete or absent slots are never touched. Refused for archived cohorts.
   */
  setJobSubmitted(schoolId: string, cohortId: string, jobKey: string, on: boolean): Promise<void>
}

/**
 * The IA marks module. Same justification as CAS (below): the board still reads
 * everything through getBoard() — these methods exist for the module's OWN
 * screen, the mark-entry grid, which shows the values the board compresses to
 * fractions. Marks are recorded at CRITERION grain (the template's rubric), the
 * total derives on read, and IBIS's two asks — totals for every candidate,
 * criterion breakdown for the moderation sample — are answered by one recording.
 */
export interface IaRepository {
  /** One course, one cohort: the grid. Rows in session-number (IBIS) order. */
  getMarksView(schoolId: string, courseId: string, cohortId: string): Promise<IaMarksView | null>
  /**
   * Record one criterion's mark (index into the def's criteria; for a
   * total-only family the index is ignored and the value is the total).
   * `null` clears it. recordStatus derives from what is entered.
   */
  setCriterionMark(
    schoolId: string, courseId: string, cohortId: string,
    studentId: string, index: number, value: number | null, by: string,
  ): Promise<void>
  setComment(
    schoolId: string, courseId: string, cohortId: string,
    studentId: string, text: string, by: string,
  ): Promise<void>
  /**
   * The transcription tick: this candidate's total has been typed into IBIS.
   * Moves exportStatus only — the school record is untouched.
   */
  setTypedIntoIbis(
    schoolId: string, courseId: string, cohortId: string, studentId: string, on: boolean,
    by: string,
  ): Promise<void>

  // ---- authorization & the audit trail ----
  /**
   * Marker-only writes: is this user the DESIGNATED MARKER of a section of
   * this course, in this cohort — optionally one that contains this student?
   * Co-teachers are read-only. The write authorization the actions apply
   * (lib/ia/authorize.ts) is built on this.
   */
  isMarkerFor(
    schoolId: string, courseId: string, cohortId: string, userId: string, studentId?: string,
  ): Promise<boolean>
  /**
   * The caller's unexpired unlock for this course, or null. Expiry is
   * enforced HERE, on every read — the auto re-lock, not a timer.
   */
  activeUnlock(schoolId: string, courseId: string, userId: string): Promise<MarkUnlock | null>
  /**
   * The coordinator override: reason required and non-empty, expires 30
   * minutes on. Appends an 'unlock' event; every write made while it holds
   * carries the reason on its own event.
   */
  unlockMarks(
    schoolId: string, courseId: string, cohortId: string, userId: string, reason: string,
  ): Promise<MarkUnlock>
  /** End an unlock early. Appends a 'relock' event. */
  relockMarks(schoolId: string, courseId: string, userId: string): Promise<void>
  /** The append-only trail for one course × cohort, newest first, names resolved. */
  listMarkEvents(schoolId: string, courseId: string, cohortId: string): Promise<MarkEventRow[]>

  // ---- the IBIS moderation sample ----
  /** The one live SampleRequest for this course × cohort, or null. */
  getSampleRequest(schoolId: string, courseId: string, cohortId: string): Promise<SampleRequest | null>
  /**
   * Record which candidates IBIS sampled. AT MOST ONE lives per course +
   * cohort: saving replaces the existing selection and always lands as a
   * draft. Ids that are not candidates of this course are dropped.
   */
  saveSampleRequest(
    schoolId: string, courseId: string, cohortId: string, studentIds: string[], by: string,
  ): Promise<SampleRequest>
  /**
   * Mark the sample as submitted in eCoursework (timestamped), or reopen a
   * submitted one as a draft — the "amend" action.
   */
  setSampleSubmitted(
    schoolId: string, courseId: string, cohortId: string, on: boolean, by: string,
  ): Promise<void>
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
  /** The cohorts screen's list — each year group with what it contains. */
  listCohortSummaries(schoolId: string): Promise<CohortSummary[]>
  listCourseRows(schoolId: string, cohortId: string): Promise<CourseRow[]>
  /**
   * `includePins` is the ONLY way a results PIN leaves this repository, and it
   * is gated on `identifiers.distribute` at the call site. Redaction happens
   * here rather than in a component, because a component that forgets is a leak.
   */
  /** cohortId scopes the teaches/enrolled chips to one year group — archived
   *  cohorts' assignments stay in the data as history but are never listed. */
  listPeople(schoolId: string, includePins?: boolean, cohortId?: string): Promise<PersonRow[]>
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

  /** A new year group, live from birth. Structure and people come later. */
  createCohort(schoolId: string, label: string, gradYear: number): Promise<string>

  /**
   * Copy a cohort's STRUCTURE into another: the courses it runs (each with
   * its one implicit section), teacher
   * assignments (markership included), and fresh RequirementDefs instantiated
   * from the CURRENT IA templates — the same path addCourse uses. NEVER
   * students, enrolments, marks or states: recorded work belongs to the year
   * it happened in.
   */
  cloneCohortStructure(schoolId: string, fromCohortId: string, toCohortId: string): Promise<void>

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
    input: {
      name: string
      subjectGroup: string
      level: 'HL' | 'SL' | null
      /** IA template family (lib/templates.ts) — what the course's IA defs are instantiated from. */
      iaTemplateKey: string
    },
    cohortId: string,
  ): Promise<string>
  /**
   * Make a course run for a cohort. SECTIONS ARE AN INVISIBLE IMPLEMENTATION
   * DETAIL now (product decision, 2026-08): exactly one exists per course per
   * cohort, so this is idempotent — asking again returns the existing one.
   * The label is kept for the type's sake and shown nowhere.
   */
  addSection(schoolId: string, courseId: string, cohortId: string, label: string): Promise<string>
  /**
   * Remove a course from a cohort: its requirement defs, its implicit
   * section, enrolments and teacher assignments. REFUSES if any recorded
   * work exists (a RequirementState against its defs, or a MarkEvent) —
   * recorded work is archived with its cohort, never deleted. The catalogue
   * entry itself is deleted only when no other cohort still runs it.
   */
  removeCourse(schoolId: string, courseId: string, cohortId: string): Promise<void>
  enrolStudent(schoolId: string, studentId: string, sectionId: string): Promise<void>
  unenrolStudent(schoolId: string, studentId: string, sectionId: string): Promise<void>
  // Course-level operations — the section resolves internally. These are what
  // new UI should call; the section-level methods above stay for anything that
  // already holds a section id (the two are equivalent now).
  enrolInCourse(schoolId: string, cohortId: string, courseId: string, studentId: string): Promise<void>
  unenrolFromCourse(schoolId: string, cohortId: string, courseId: string, studentId: string): Promise<void>

  // ---- staff ----
  inviteTeacher(schoolId: string, name: string, email: string): Promise<string>
  assignTeacher(schoolId: string, teacherId: string, sectionId: string): Promise<void>
  unassignTeacher(schoolId: string, teacherId: string, sectionId: string): Promise<void>
  /**
   * Exactly-one-marker semantics: turning a marker ON clears every other
   * marker of the course; turning the LAST marker OFF is refused — writes are
   * marker-only, so a markerless course would be unmarkable.
   */
  setDesignatedMarker(schoolId: string, teacherId: string, sectionId: string, on: boolean): Promise<void>
  // Course-level twins of the three above.
  assignTeacherToCourse(schoolId: string, cohortId: string, courseId: string, teacherId: string): Promise<void>
  unassignTeacherFromCourse(schoolId: string, cohortId: string, courseId: string, teacherId: string): Promise<void>
  /** Make this teacher THE marker of the course (assigning them if needed). */
  setCourseMarker(schoolId: string, cohortId: string, courseId: string, teacherId: string): Promise<void>

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

  /**
   * Change a membership's preset — the role layer above the per-capability
   * deviations. Deviations are CLEARED on a preset change: they were recorded
   * relative to the old preset and would mean something different under the
   * new one.
   *
   * TWO GUARDS live here, not only in the action:
   *   - a student membership takes only the student preset, and vice versa;
   *   - there is exactly ONE district coordinator. Assigning the district
   *     preset while another live district-tier membership exists throws —
   *     "transfer instead" (a transfer flow is future work).
   */
  setPreset(schoolId: string, userId: string, presetKey: PresetKey): Promise<void>
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
  /** Who an experience belongs to — exists so the actions can check its cohort. */
  ownerOf(schoolId: string, experienceId: string): Promise<string | null>

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
    schoolId: string, entryId: string, experienceId: string, body: string, authorName: string,
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
