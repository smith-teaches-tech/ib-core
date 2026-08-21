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
  AuthorshipConcern, TokBoundaryTable, TokEvidenceRow, TokMarkingRow, TokStudentView,
  TokTitleSet,
} from '../tok/types'
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
  EeAssignableStaff, EeRosterRow, EeSessionNote, EeStudentView, ResolvedSupervisor, SessionStage,
} from '../ee/types'
import type {
  CohortSummary, CourseRow, IdentifierPreview, IdentifierRow, ImportPreview, ImportRow, PersonRow,
} from '../setup/types'
import type { IaMarksView, MarkEventRow, MarkUnlock, SampleRequest } from '../ia/types'
import type { PgStudentView, PgView, ReportingPoint } from '../pg/types'
import type { Deadline, RequirementDef } from '../types'
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
    opts?: {
      includeIdentifiers?: boolean
      /**
       * THE CANDIDATE IS READING THEIR OWN TRACK.
       *
       * A due date on a STAFF-recorded requirement is staff-facing — "English
       * HL IA mark, due 28 Jan" is a date for the teacher and the coordinator,
       * about work the student cannot do. Showing it to the candidate is
       * pressure with nothing behind it, and it can go `late` on them for
       * somebody else's lateness.
       *
       * So on a candidate's own track those dates are dropped. The requirement
       * still shows — they should see that a mark is coming — it simply carries
       * no deadline. Staff keep every date, on /deadlines and in the panel.
       * (Michael, 21 Aug, on the TOK exhibition mark; the same was true of
       * thirty subject IA marks.)
       */
      asCandidate?: boolean
    },
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
  pg: PgRepository
  deadlines: DeadlineRepository

  /** Download for IBIS — the upload board and its one write (exportStatus). */
  export: ExportRepository

  /** EE supervision. The first piece of the EE module — see lib/ee/supervision.ts. */
  ee: EeRepository
  tok: TokRepository
}

/**
 * EE — supervision only, for now.
 *
 * A module namespace rather than a method on Repository, for the reason
 * IB-CAS-Build-Plan.md §10.3 gives: this is the module's own screen data, not
 * something a coordinator view needs. `getBoard` and `getTrack` are untouched.
 */
/**
 * TOK — the module's own screen data, like EE's. `getBoard` and `getTrack` are
 * untouched: the coordinator reads TOK through the board it already has, which
 * is the whole of the "a coordinator view selects, it never asks for anything
 * new" rule (IB-Philosophy-and-Scope.md).
 */
export interface TokRepository {
  /** The student's own screen. Checkpoints come from getTrack, not from here. */
  getStudentView(schoolId: string, studentId: string): Promise<TokStudentView | null>
  /**
   * The six for one session. Returns null for a cohort whose teacher has not
   * posted them — which is EVERY new cohort, because titles never carry over.
   */
  getTitleSet(schoolId: string, cohortId: string): Promise<TokTitleSet | null>
  /** One of the 35, by number. Never free text — the prompt must be used as given. */
  setPrompt(schoolId: string, studentId: string, promptNumber: number): Promise<{ ok: boolean; message?: string }>
  /**
   * A posted title by number, or the student's own typed one when the teacher
   * has not posted yet. `number` is null for a typed title until it is adopted.
   */
  setTitle(
    schoolId: string,
    studentId: string,
    input: { number: number | null; text: string; source: 'teacher' | 'student' },
  ): Promise<{ ok: boolean; message?: string }>
  /** The one draft the IB permits a teacher to comment on. Not a checkpoint. */
  setDraft(schoolId: string, studentId: string, href: string): Promise<void>
  /** Filing is what locks it. There is no separate lock button. */
  submitFile(
    schoolId: string,
    studentId: string,
    kind: 'exh' | 'essay',
    file: { fileName: string; declaredWords: number; storageKey?: string; bytes?: number },
  ): Promise<void>
  /** The student writes up one interaction. Submitting locks it. */
  submitInteraction(
    schoolId: string,
    studentId: string,
    n: 1 | 2 | 3,
    body: string,
  ): Promise<{ ok: boolean; message?: string }>

  // ---- staff -------------------------------------------------------------

  /**
   * One row per candidate for a marking screen. `kind` chooses the instrument;
   * the shape is identical for both, which is why the essay screen reuses it.
   */
  getMarkingRoster(
    schoolId: string,
    cohortId: string,
    kind: 'exh' | 'essay',
  ): Promise<TokMarkingRow[]>
  /**
   * The mark itself. Goes on the RequirementState like every other mark and
   * appends to the SAME MarkEvent trail as the course's IA marks — the question
   * a reader has is "what happened to this candidate in my course", not "what
   * kind of thing happened". Authorization is `marksWriteGrant`, checked by the
   * caller and re-checked in the action.
   */
  saveMark(
    schoolId: string,
    studentId: string,
    kind: 'exh' | 'essay',
    mark: number | null,
    by: { id: string; name: string; overrideReason: string | null },
  ): Promise<void>
  /** The two texts and the authorship field. Saved independently of the mark. */
  saveProse(
    schoolId: string,
    studentId: string,
    kind: 'exh' | 'essay',
    input: {
      note: string
      comment: string
      authorship: AuthorshipConcern
      authorshipNote?: string
    },
    by: { id: string; name: string },
  ): Promise<void>
  /** Release puts the mark and its comment in front of the student. */
  releaseMark(
    schoolId: string,
    studentId: string,
    kind: 'exh' | 'essay',
    by: { id: string; name: string },
  ): Promise<{ ok: boolean; message?: string }>
  // ---- the essay screen's other half -------------------------------------

  /**
   * Post or replace the six prescribed titles for one session. Replacing is
   * how a typo gets fixed; a student who chose the old wording keeps it until
   * they re-choose, because rewriting their record from here would be a silent
   * change to what they said.
   */
  setTitles(
    schoolId: string,
    cohortId: string,
    titles: { number: number; text: string }[],
    by: { id: string; name: string },
  ): Promise<{ ok: boolean; message?: string }>
  /**
   * Promote a title a STUDENT typed into the posted six — the fallback for the
   * year the teacher has not got to it. One click, and the list fills itself.
   */
  adoptTitle(
    schoolId: string,
    cohortId: string,
    text: string,
    by: { id: string; name: string },
  ): Promise<{ ok: boolean; message?: string }>
  /** Titles a student typed that are not in the posted six. */
  listTypedTitles(
    schoolId: string,
    cohortId: string,
  ): Promise<{ studentId: string; studentName: string; text: string }[]>
  /**
   * The teacher's one line for one interaction, and the day it happened. This
   * is what OPENS the student's write-up box, so it is also the fix for a
   * student stuck behind a meeting nobody recorded.
   */
  logInteraction(
    schoolId: string,
    studentId: string,
    n: 1 | 2 | 3,
    lineKey: string,
    heldOn: string,
    by: { id: string; name: string },
  ): Promise<{ ok: boolean; message?: string }>
  /** The single teacher comment the official form carries. Draft, then sign. */
  saveTeacherComment(
    schoolId: string,
    studentId: string,
    comment: string,
    by: { id: string; name: string },
  ): Promise<void>
  /** The composed starting point, from the year's logged lines. */
  draftTeacherComment(schoolId: string, studentId: string): Promise<string>
  /** "I confirm that my comments above are accurate." Locks the comment. */
  signPpf(
    schoolId: string,
    studentId: string,
    by: { id: string; name: string },
  ): Promise<{ ok: boolean; message?: string }>
  /** Unsign, so a comment can be corrected. `items.unlock`. */
  unsignPpf(schoolId: string, studentId: string, by: { id: string; name: string }): Promise<void>

  // ---- the /30 beside the predicted letter -------------------------------

  /**
   * The school's own A–E table for one session. Carried forward from the
   * previous cohort as UNCONFIRMED — the IB moves these, so a carried table is
   * a starting point and never an answer.
   */
  getBoundaries(schoolId: string, cohortId: string): Promise<TokBoundaryTable | null>
  setBoundaries(
    schoolId: string,
    cohortId: string,
    lower: TokBoundaryTable['lower'],
    by: { id: string; name: string },
  ): Promise<{ ok: boolean; message?: string }>
  /** One click, but it has to be a click. Until then the letter says so. */
  confirmBoundaries(
    schoolId: string,
    cohortId: string,
    by: { id: string; name: string },
  ): Promise<void>
  /**
   * The four READ-ONLY evidence columns beside each predicted letter. Read from
   * the marks on the other two screens, never typed here — so this screen can
   * never disagree with that one.
   */
  getEvidence(schoolId: string, cohortId: string): Promise<TokEvidenceRow[]>

  /** Undo a release. `scores.revoke`, as EE. */
  revokeMark(
    schoolId: string,
    studentId: string,
    kind: 'exh' | 'essay',
    by: { id: string; name: string },
  ): Promise<void>
}

export interface EeRepository {
  /**
   * Never resolves to nobody while the school has an EE coordinator — invariant
   * #12. `acting: true` means the coordinator is standing in.
   */
  getSupervisor(schoolId: string, studentId: string): Promise<ResolvedSupervisor | null>
  /** Every student in the cohort with whoever is currently responsible for them. */
  listSupervision(
    schoolId: string,
    cohortId: string,
  ): Promise<{ studentId: string; name: string; supervisor: ResolvedSupervisor | null }[]>
  /**
   * Reassignment ENDS the previous row rather than editing it. A supervisor who
   * held two reflection sessions before leaving must still be named on them.
   */
  assignSupervisor(
    schoolId: string,
    cohortId: string,
    studentId: string,
    supervisorId: string,
    assignedBy: string,
  ): Promise<void>

  /** The student's own screen. Checkpoints come from getTrack, not from here. */
  getStudentView(schoolId: string, studentId: string): Promise<EeStudentView | null>
  /**
   * Staff. `forUserId` scopes it: an `ee.manage` holder passes `null` and sees
   * the cohort; a supervisor passes their own id and sees their supervisees.
   * Scope is decided here rather than in the component, because a component
   * that forgets is a leak.
   */
  getRoster(
    schoolId: string,
    cohortId: string,
    forUserId: string | null,
  ): Promise<EeRosterRow[]>
  /** The student pastes their reflection statement. Submitting locks it. */
  submitRpf(schoolId: string, studentId: string, body: string): Promise<void>
  /**
   * One criterion's mark. Saved as it is entered, because a supervisor marking
   * A–D before the viva must not lose them waiting for Criterion E.
   */
  saveMark(
    schoolId: string,
    studentId: string,
    criterionIndex: number,
    mark: number | null,
    byName: string,
  ): Promise<void>
  /** The justification, hours, and the two attestation ticks. */
  saveScoring(
    schoolId: string,
    studentId: string,
    input: {
      comment: string
      hoursSupervised: number | null
      attestedSessions: boolean
      attestedAuthentic: boolean
    },
    byId: string,
    byName: string,
  ): Promise<void>
  /** Release puts the grade in front of the student and into the bonus-point matrix. */
  releaseScore(schoolId: string, studentId: string, byId: string, byName: string): Promise<void>
  /** `scores.revoke` — the coordinator's undo. */
  revokeScore(schoolId: string, studentId: string): Promise<void>
  /** Who can be given a supervisee, with their current load so it can be spread. */
  listAssignableStaff(schoolId: string, cohortId: string): Promise<EeAssignableStaff[]>
  /** Student writes their own registration. `ee.rq` follows from validity. */
  saveRegistration(
    schoolId: string,
    cohortId: string,
    studentId: string,
    input: { subjects: string[]; framework: string | null; researchQuestion: string; title: string },
  ): Promise<{ ok: boolean; problems: { field: string; message: string }[] }>
  /**
   * Record that a reflection session HAPPENED, on the day it happened.
   *
   * `onBehalf` is the coordinator filing a session the supervisor held but
   * never entered — Michael, 20 Aug: "sometimes teachers don't do their work."
   * That route is preferred to an RPF unlock override, because it keeps
   * `opensAfter` meaning one thing and never claims a viva that did not happen.
   */
  recordSession(
    schoolId: string,
    studentId: string,
    stage: SessionStage,
    heldOn: string,
    recordedBy: string,
    recordedByName: string,
    onBehalf?: boolean,
  ): Promise<void>
  /** A note about a session, from either side. Optional, always. */
  addSessionNote(
    schoolId: string,
    studentId: string,
    stage: SessionStage,
    authorType: 'student' | 'staff',
    authorId: string,
    authorName: string,
    body: string,
  ): Promise<void>
  listNotes(schoolId: string, studentId: string): Promise<EeSessionNote[]>
  /**
   * File the finished PDF. FILING IS WHAT LOCKS IT — there is no separate lock
   * button, because a paper the student can still edit is not the fixed
   * artefact the viva has to be about (Michael, 20 Aug).
   */
  submitFinal(
    schoolId: string,
    studentId: string,
    fileName: string,
    declaredWords: number,
    /** The StorageAdapter ref. Present even while the bytes go nowhere. */
    storageKey?: string,
    bytes?: number,
  ): Promise<void>
  /** Reopen a filed essay. `items.unlock`, a typed reason, and it stays on the record. */
  unlockFinal(
    schoolId: string,
    studentId: string,
    byId: string,
    byName: string,
    reason: string,
  ): Promise<void>
  /** Attach or replace a Google Doc link on ee.outline / ee.draft. */
  setLink(
    schoolId: string,
    studentId: string,
    stage: 'outline' | 'draft',
    href: string,
    label: string,
  ): Promise<void>
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
  /**
   * A reflection. `audio` makes it a SPOKEN one — still `kind: 'reflection'`,
   * never evidence, because the timeline and the consistency strip count the
   * two differently and a student who speaks must not read as a student who
   * only uploaded files (IB-CAS-Phone-Build-Plan.md §3.3).
   */
  addReflection(
    schoolId: string, experienceId: string, body: string, authorName: string,
    opts?: { audio?: StoredRef; transcript?: string; inReplyTo?: string },
  ): Promise<void>
  /** Versioned: the prior entry is kept and superseded, never overwritten. */
  editReflection(
    schoolId: string, entryId: string, experienceId: string, body: string, authorName: string,
  ): Promise<void>
  addEvidence(
    schoolId: string, experienceId: string, media: StoredRef[], note: string, authorName: string,
    opts?: { inReplyTo?: string },
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
  /**
   * Is this student's CAS confirmed complete? Read by every student write —
   * a confirmed portfolio is frozen (lib/cas/actions.ts, `open`).
   */
  isCasComplete(schoolId: string, studentId: string): Promise<boolean>
  /** cas.complete — the one CAS requirement recorded rather than derived. */
  setCasComplete(schoolId: string, studentId: string, complete: boolean, by: string): Promise<void>

  // ---- writes: the supervisor, through the token ----
  signOff(
    token: string,
    input: { confirmedOutcomes: LoKey[]; comment: string; signature: string },
  ): Promise<boolean>
}


// ---------------------------------------------------------------------------
// Predicted grades
// ---------------------------------------------------------------------------

/**
 * The predicted-grades module. Small on purpose: a predicted grade is one
 * value per (student × course × reporting point), and the only thing that is
 * not a plain read or write is the lock.
 */
export interface PgRepository {
  /** One course, one cohort: the grid. Rows in session-number (IBIS) order. */
  getView(schoolId: string, courseId: string, cohortId: string): Promise<PgView | null>
  /**
   * Record a predicted grade. `null` clears it.
   *
   * THROWS if the cell is locked — the lock is enforced here rather than in the
   * action, so no future caller can route around it by forgetting. Recording a
   * grade locks it; clearing one does not, because an empty cell is not a
   * judgement worth protecting.
   */
  setGrade(
    schoolId: string, courseId: string, cohortId: string, studentId: string,
    point: ReportingPoint['key'], value: string | null, by: string,
  ): Promise<void>
  /**
   * Open ONE locked grade for ONE change. Reason required; it lands on the
   * append-only trail and is stamped onto the change that follows.
   */
  unlockGrade(
    schoolId: string, courseId: string, cohortId: string, studentId: string,
    point: ReportingPoint['key'], reason: string, by: string,
  ): Promise<void>
  /**
   * One student, every course they take, every reporting point — what the
   * candidate panel renders. Gated by `grades.cross_course` at the caller:
   * this returns the whole picture and the caller decides who may see it.
   */
  getStudentView(schoolId: string, studentId: string): Promise<PgStudentView | null>
}


// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------

/** One deadline, resolved against the cohort it applies to. Counted on read. */
export interface ResolvedDeadline {
  deadline: Deadline
  /** "Biology SL — mark", or "predicted, Jan Y2" for a cohort-wide row. */
  label: string
  courseName: string
  /** How many requirement definitions this row reaches. */
  courses: number
  done: number
  total: number
  /** Negative = the day has passed. */
  daysAway: number
  /** False for predicted-grade dates — those are the coordinator's alone. */
  canBeSetByTeacher: boolean
  /** May the CURRENT viewer change this one? Rows are editable individually. */
  mayEdit: boolean
}

/** A deadline as it appears on somebody's home page. */
export interface DueItem {
  deadline: Deadline
  label: string
  courseName: string
  daysAway: number
  done: number
  total: number
  /** The IB receives this. Drives the student's non-dismissible warning. */
  toIb: boolean
  /** Is the reader the one who owes it? */
  mine: boolean
}

export interface DeadlineRepository {
  list(schoolId: string, cohortId: string): Promise<Deadline[]>
  /**
   * The due-dates screen: every date, with how many candidates are in, and
   * whether this viewer may change each one. Reading a date is not sensitive —
   * students see them — so the list is the same for everyone and the EDITING is
   * what differs, row by row.
   */
  listResolved(
    schoolId: string, cohortId: string,
    viewer: { userId: string; hasDeadlinesSet: boolean },
  ): Promise<ResolvedDeadline[]>
  /**
   * MAY THIS PERSON SET THIS DATE?
   *
   * `deadlines.set` sets anything. Otherwise: the DESIGNATED MARKER of that
   * course, and never a predicted-grade date — a PG point is a cohort-wide
   * commitment and the April one is an IB deadline the coordinator signs for.
   */
  maySet(
    schoolId: string, cohortId: string, userId: string,
    requirementKey: string, courseId: string | null, hasDeadlinesSet: boolean,
  ): Promise<boolean>
  /** Create or MOVE a date. Moving supersedes rather than overwrites. */
  set(
    schoolId: string, cohortId: string,
    input: { requirementKey: string; courseId?: string | null; dueAt: string; isMajor: boolean; decidedBy: string },
    by: string,
  ): Promise<Deadline>
  remove(schoolId: string, cohortId: string, id: string): Promise<void>
  /** The one date that applies to one requirement — most specific wins. */
  forDef(schoolId: string, cohortId: string, def: RequirementDef): Promise<Deadline | null>
  /**
   * Every requirement definition in a cohort. Read by the due-dates picker to
   * offer the STAGES that actually exist — so a new module's stages appear the
   * day its definitions do, rather than when somebody remembers to add them to
   * a list in a component.
   */
  definitionsIn(schoolId: string, cohortId: string): Promise<RequirementDef[]>
  /**
   * Somebody's own due dates, in order. A student gets the work they owe; a
   * teacher gets the courses they mark. `excludePg` keeps staff-facing
   * predicted-grade dates off a student's screen.
   */
  dueFor(
    schoolId: string, userId: string, opts?: { excludePg?: boolean },
  ): Promise<DueItem[]>
}
