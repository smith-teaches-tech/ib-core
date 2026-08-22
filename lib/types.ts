// The spine. Nine objects, and everything else in the product is a view over them.
// See claude/IB-Spine-Architecture.md in the project docs.

export type Id = string

/** The scales a predicted grade can be recorded on. See lib/pg/scale.ts. */
export type GradeScaleKey = 'points_1_7' | 'letter_a_e'

// ---------------------------------------------------------------------------
// 1–2. Scope
// ---------------------------------------------------------------------------

/** The outer boundary. Nothing crosses it. */
export interface School {
  id: Id
  name: string
  ibSchoolCode: string
}

export interface Cohort {
  id: Id
  schoolId: Id
  /** "Class of 2027" — what everyone says out loud. */
  label: string
  /** "Cohort 15" — what ISG's own spreadsheets are named after. */
  number: number | null
  gradYear: number
  /**
   * Set by a coordinator, never by the calendar. A cohort stays live long after
   * its exams: results land in July and IB enquiries can follow for months.
   */
  archived: boolean
}

// ---------------------------------------------------------------------------
// 3–6. Structure
// ---------------------------------------------------------------------------

/**
 * CAS, EE and TOK are courses, exactly like Biology. The container is identical;
 * the contents differ by `type`. This is what makes handing TOK to a different
 * teacher a one-row change.
 */
export type CourseType = 'subject' | 'cas' | 'ee' | 'tok'

export interface Course {
  id: Id
  schoolId: Id
  type: CourseType
  name: string
  subjectGroup: string
  /** HL and SL are DIFFERENT courses — which is why they carry different requirements. */
  level: 'HL' | 'SL' | null
  /**
   * Which IA template family this course's internal assessment follows —
   * 'sciences', 'math', 'lang_a_io'… (lib/templates.ts). Set when the course is
   * added; what a NEW course's defs are instantiated from. Absent on Core
   * courses, and on courses created before templates existed ('generic').
   */
  iaTemplateKey?: string
}

/** Optional and invisible when a course has only one. */
export interface Section {
  id: Id
  schoolId: Id
  courseId: Id
  cohortId: Id
  label: string
}

export interface Enrollment {
  studentId: Id
  sectionId: Id
}

export interface TeachingAssignment {
  teacherId: Id
  sectionId: Id
  isDesignatedMarker: boolean
}

// ---------------------------------------------------------------------------
// 7–9. The spine proper
// ---------------------------------------------------------------------------

export type RequirementScope =
  | { kind: 'course'; courseId: Id }
  | { kind: 'programme' }

export type Lane =
  | 'CAS' | 'Extended Essay' | 'TOK' | 'Internal assessment'
  | 'Predicted grades' | 'IB admin'

export type ExportTarget = 'ecoursework' | 'ibis_ia_marks' | 'ibis_predicted'

/**
 * The template. Defined ONCE per course (or for the programme) and versioned per
 * cohort. There is no per-student requirement configuration anywhere in the system:
 * a student's set is derived from what they are enrolled in.
 *
 * Immutable once any RequirementState exists against it — version forward instead.
 */
export interface RequirementDef {
  id: Id
  schoolId: Id
  cohortId: Id
  scope: RequirementScope
  key: string
  label: string
  lane: Lane
  order: number
  recordedBy: 'student' | 'staff' | 'coordinator'
  artifact: 'file' | 'text' | 'link' | 'mark' | 'none'
  /**
   * WHAT THIS COMPONENT ACCEPTS — mime types, copied off the course template at
   * def-creation time exactly as `criteria` is, so the def stays self-contained
   * and immutable.
   *
   * It exists so that nobody maintains a list: a Language B individual oral asks
   * for audio because its template says so, and an IA asks for a PDF because
   * its template says so. A `.docx` in an eCoursework pack is a non-submission
   * rather than a formatting nit, which is why the refusal is at upload rather
   * than a warning in April (IB-Reading-and-Marking-Papers.md §4, state 4).
   *
   * Absent on defs that take no file, and on defs created before this existed —
   * absent means "anything", not "nothing".
   */
  accepts?: string[]
  markMax?: number
  /**
   * For `artifact: 'mark'` recorded at criterion grain (IA marks): the rubric,
   * copied from the course's IA template at def-creation time so the def stays
   * self-contained and immutable. `markMax` is always the sum of these maxima.
   * Absent = the mark is a single total (either the family's split is not yet
   * confirmed against the guide, or the def predates templates).
   */
  criteria?: { key: string; label: string; max: number }[]
  /**
   * PREDICTED GRADES: which scale this requirement is recorded on.
   *
   * A predicted grade is not a mark. It is a LABEL from a fixed, small set —
   * 1..7 for a subject, A..E for TOK — and the two behave identically on
   * screen, which is the whole reason one grid serves every course. Present
   * only on predicted-grade defs; see lib/pg/scale.ts for the scales
   * themselves, which are data rather than a branch in a component.
   */
  gradeScale?: GradeScaleKey
  /** Does this feed an IB upload, and which one? Drives the export builder. */
  exportTarget?: ExportTarget
  /** Not actionable until the named requirement is complete. The RPF needs the viva first. */
  opensAfter?: string
}

/**
 * A DEADLINE — its own record, deliberately not `dueAt` on RequirementDef.
 *
 * A def is immutable once any state exists against it, and dates move. Putting
 * the date on the def would force a choice between rewriting history and never
 * moving a deadline. So the date is a separate, superseding record: pushing one
 * writes a new row that points at the old, and "what did we tell them in
 * September" stays answerable.
 *
 * KEYED BY (requirement stage × course), because the real calendar demands it:
 * Biology and Physics IAs are due 14 Jan, Maths 21 Jan, Chemistry 28 Jan. A
 * single date per stage would have marked every IA in the cohort late on the
 * 14th. `courseId: null` means every course that has this stage — which is what
 * a predicted-grade point actually is.
 */
export interface Deadline {
  id: Id
  schoolId: Id
  cohortId: Id
  /**
   * The requirement's STAGE, not its full key: 'file', 'mark', 'pg.p2',
   * 'tok.essay', 'cas.complete'. Matched against def keys by
   * `deadlineMatches()` in lib/deadlines.ts — the one place this join happens.
   */
  requirementKey: string
  /** null = every course that has this stage. A course-specific row wins over it. */
  courseId: Id | null
  /**
   * ONE CANDIDATE'S DATE — an extension, and the most specific row there is.
   *
   * A medical note or an inclusive-access arrangement moves one student's
   * deadline, not the programme's. It is granted by the DESIGNATED MARKER of
   * that course (or the coordinator), because the teacher is the one who knows
   * the student broke their arm — and it is a row like any other, so it
   * supersedes, records who decided it, and resolves through the same
   * most-specific-wins rule as everything else.
   *
   * Absent on every ordinary date.
   */
  studentId?: Id | null
  /** Date only, school timezone. Late means: this day has passed and it is not in. */
  dueAt: string
  /** The school's own flag, straight off the planning spreadsheet. */
  isMajor: boolean
  /** Whose deadline it is, for the calendar. Not an authorization field. */
  ownerUserId?: Id
  /** "IB planning meeting · 4 Sep 26" — a decision made by people, recorded as one. */
  decidedBy: string
  setBy: string
  setAt: string
  /** The row this one replaced. A moved date leaves its predecessor behind. */
  supersedes?: Id
}

/** Has the school got it? Our vocabulary. */
export type RecordStatus =
  | 'not_started' | 'in_progress' | 'submitted' | 'marked' | 'released'

/** Has it gone to the IB? eCoursework's vocabulary, verbatim, so nobody translates. */
export type ExportStatus =
  | 'not_started' | 'in_progress' | 'ready_for_candidate' | 'candidate_submitted'
  | 'ready_for_authentication' | 'ready_for_submission' | 'submitted'
  | 'error' | 'non_submission' | 'academic_misconduct'

/**
 * THE RECORD OF A FILE — moved into the spine on 22 Aug.
 *
 * It lived in lib/storage.ts, next to the adapter that mints it, for as long as
 * CAS evidence was the only thing in the product with a file attached. It is
 * spine data now, because `Artifact` carries one: what a candidate uploaded, of
 * what type and what size, under what opaque key, is part of the record and
 * survives every adapter. lib/storage.ts re-exports it, so nothing that already
 * imports it from there had to change.
 */
export interface StoredRef {
  id: string
  name: string
  /**
   * WHAT THE STUDENT CALLED IT — required on audio and video, optional on a
   * photo. Nobody should have to name eleven pictures of a bake sale, but a
   * coordinator scanning a portfolio of `IMG_4821.mov` is looking at a folder
   * rather than a record. See IB-CAS-Phone-Build-Plan.md §3A.1.
   */
  title?: string
  mime: string
  bytes: number
  /** Opaque to the app. A local path today is a bucket key tomorrow. */
  key: string
  addedAt: string
}

export interface Artifact {
  id: Id
  kind: 'file' | 'text' | 'link'
  label: string
  href?: string
  body?: string
  /**
   * THE FILE ITSELF, on a `kind: 'file'` artifact.
   *
   * Until 22 Aug a file artifact was a bare filename in `label` and nothing in
   * the product read it — the box on the board went green and the essay behind
   * it could not be opened, which is the hole IB-Reading-and-Marking-Papers.md
   * was written to close. A real ref means one component (MediaViewer) can show
   * any of them, and the day storage is connected the same records start
   * playing with no screen change.
   *
   * Optional rather than required so that a state written before this existed
   * still type-checks and still renders — as a file whose bytes were never
   * recorded, which is the truth about it.
   */
  file?: StoredRef
  /** Who put it there, by name — the header of every file says so. */
  addedBy?: string
  /**
   * Set when a later upload replaced this one. THE OLD FILE IS KEPT: a returned
   * or replaced paper is superseded, never deleted (IB-Student-Work-Files.md
   * §8), because "which version did the supervisor read" is a question that
   * gets asked a year later.
   */
  supersededAt?: string
  addedAt: string
}

/**
 * What has been recorded for one student × one requirement.
 *
 * INVARIANT: a state exists only where the requirement applies. "Not applicable"
 * is represented by ABSENCE, never stored — which is how the board handles
 * students taking different courses at no cost.
 */
export interface RequirementState {
  studentId: Id
  requirementDefId: Id
  schoolId: Id
  recordStatus: RecordStatus
  exportStatus?: ExportStatus
  /** A single-total mark. NOT stored when `criterionMarks` is — the total derives. */
  mark?: number
  /**
   * Marks per criterion, aligned to the def's `criteria`. `null` = not yet
   * entered. The TOTAL IS NEVER STORED — `iaTotal()` (lib/templates.ts) sums it
   * on every read, which is why IBIS's two asks (totals for everyone, criterion
   * breakdown for the sample) are one recording rather than two.
   */
  criterionMarks?: (number | null)[]
  /**
   * A PREDICTED GRADE, stored exactly as it is written: '5' or 'B'.
   *
   * Deliberately a string and deliberately not `mark`. A predicted grade of B
   * is not the number 2, and encoding it as one would mean every reader has to
   * know the decoding — the kind of quiet lie that survives until somebody
   * averages it. Validity is membership of the def's `gradeScale`, checked in
   * one place (lib/pg/scale.ts).
   */
  grade?: string
  artifacts: Artifact[]
  recordedBy?: string
  recordedAt?: string
  lockedAt?: string

  // -------------------------------------------------------------------------
  // DETACHED. See claude/IB-Mobility-and-Transfers.md §2.3.
  // -------------------------------------------------------------------------

  /**
   * Set when the enrolment this state hung off closed — a course move, a drop,
   * a retired course.
   *
   * INVARIANT #9: an enrolment change never DESTROYS a state, it detaches it.
   * Before this field existed, dropping Biology left the uploaded IA, its mark
   * and its teacher comment in the array with nothing able to return them:
   * `requirementsFor` no longer matched the def, so the work vanished from the
   * track, the board, every count and every export. Not deleted — invisible,
   * which is worse, because nobody knows to look.
   *
   * A detached state is filtered out in exactly ONE place (`stateOf`, so board
   * and track inherit it) and is visible in exactly one place — the student's
   * record history. Re-enrolling clears it and the work comes back.
   */
  detachedAt?: string
  detachedReason?: 'enrolment_closed' | 'moved' | 'course_retired'
  /** Which course it belonged to when it was live — the history needs the label. */
  detachedFrom?: Id
}

// ---------------------------------------------------------------------------
// People, membership, permissions
// ---------------------------------------------------------------------------

export type RoleKey =
  | 'student' | 'teacher' | 'cas_coordinator' | 'ee_coordinator'
  | 'tok_teacher' | 'school_coordinator' | 'district_coordinator'
  // Not an IB job. Whoever keeps the system running — see PRESETS.tech_admin.
  | 'tech_admin'

export type UserStatus = 'invited' | 'active' | 'suspended'

export interface User {
  id: Id
  name: string
  email: string
  status: UserStatus
}

export type CapabilityKey = string
export type PresetKey =
  | 'district' | 'school_full' | 'school_standard'
  | 'setup_only' | 'observer' | 'teacher' | 'student'
  | 'tech_admin'

/** A user's relationship to ONE school. A user may hold several. */
export interface Membership {
  userId: Id
  schoolId: Id
  roles: RoleKey[]
  presetKey: PresetKey
  addedCapabilities: CapabilityKey[]
  removedCapabilities: CapabilityKey[]
}

export interface Student {
  userId: Id
  schoolId: Id
  cohortId: Id

  /**
   * The school's own student number, from Skyward. Known at import, stable for
   * the student's whole time at the school, and — unlike a name — actually
   * unique. It is the join key back to the SIS.
   */
  studentNumber: string | null

  // -------------------------------------------------------------------------
  // IB identifiers. All three arrive AFTER exams are ordered, so every student
  // is imported without them. RESOLVED against the IB's own documentation and
  // ManageBac's IBIS notes — see IB-Candidate-Identifiers.md.
  // -------------------------------------------------------------------------

  /**
   * The 4-digit candidate session number. Assigned in registration order,
   * restarts at 0001 in EACH school, so it is unique only within
   * (school, session) — never use it as a key.
   *
   * Comes down from IBIS automatically once registration succeeds.
   */
  sessionNumber: string | null

  /** The alphanumeric personal code. Follows the candidate, not the session. */
  personalCode: string | null

  /**
   * The results PIN — A CREDENTIAL, NOT AN IDENTIFIER.
   *
   * With the personal code it is what the candidate logs into the IB results
   * site with. The IB does not auto-populate it, deliberately: ManageBac's own
   * documentation says "for security reasons, pins are not automatically
   * updated". Three failed logins lock a candidate out for 30 minutes.
   *
   * CONSEQUENCE, and it is enforced rather than merely intended: this value is
   * never sent to a student's browser. It is stripped in the repository, not
   * hidden in a component — see `getStudent()` and `CasStudentView`. Michael's
   * instruction: "Do not publish pin... sent to students via email."
   */
  resultsPin: string | null

  /**
   * missing → nothing recorded · unconfirmed → typed in · confirmed → checked
   * against the IBIS download. A transposed digit invalidates a whole upload,
   * so the check is a recorded act rather than an assumption.
   */
  identifiersState: 'missing' | 'unconfirmed' | 'confirmed'

  // -------------------------------------------------------------------------
  // MOBILITY. See claude/IB-Mobility-and-Transfers.md §3.5.
  // -------------------------------------------------------------------------

  /**
   * When this student joined THIS school's cohort — not when the cohort began.
   *
   * For everyone who started with their year group the two are the same, and
   * that is what the backfill sets. They diverge for a transfer student, and
   * when they diverge two things must change or the system lies about them:
   * nothing can be overdue before they could have started it (invariant #8,
   * `withDue`), and their CAS timeline must not open twelve months before they
   * arrived (`casWindow`).
   *
   * A DATE, NOT A FLAG. "Is a transfer student" would be a label to maintain;
   * a join date is a fact that answers every question derived from it.
   */
  joinedAt: string

  /** Set when a student transfers out. The record stays; they leave the roster. */
  leftAt?: string | null

  /** Where they came from, for the provenance on anything accepted from there. */
  priorSchool?: string | null
}

// ---------------------------------------------------------------------------
// Reference content (not part of the spine)
// ---------------------------------------------------------------------------

export type DocumentAudience = 'everyone' | 'students' | 'staff'

export interface LibraryDocument {
  id: Id
  schoolId: Id
  title: string
  description: string
  lane: Lane | 'General'
  audience: DocumentAudience
  cohortId: Id | null
  version: string
  updatedAt: string
  href: string
}

// ---------------------------------------------------------------------------
// Derived shapes — computed, never stored
// ---------------------------------------------------------------------------

/** A requirement plus its state for one student, ready to render as a checkpoint. */
export interface Checkpoint {
  def: RequirementDef
  state: RequirementState | null
  /** 'future' = its opensAfter isn't complete yet. Never counted as outstanding. */
  display: 'done' | 'partial' | 'not_started' | 'future'
  /**
   * The deadline that applies, if one is set. ADDITIVE on purpose.
   *
   * IB-Deadlines-and-Release.md §4 proposed adding 'late' to `display`. That
   * union is switched on in the board, the track, the candidate panel and the
   * marks grid, so a fifth value means touching every consumer to say something
   * none of them needed to change. A separate field says the same thing, breaks
   * nothing, and lets a reader ask "is this late" without first handling four
   * cases it does not care about.
   */
  due?: CheckpointDue
}

export interface CheckpointDue {
  dueAt: string
  isMajor: boolean
  /** Incomplete, has a deadline, and the day has passed. Never true for 'future'. */
  late: boolean
  /** Negative = overdue by that many days. */
  daysAway: number
  /**
   * Set only when a student joined too late for this deadline to be fair:
   * lateness is measured from here instead of from `dueAt`. ADDITIVE, for the
   * same reason `due` itself is — `dueAt` stays the real cohort date, because
   * that IS the record. This says why it is not yet counted late.
   */
  deferredTo?: string
}

export interface TrackLane {
  lane: Lane
  checkpoints: Checkpoint[]
  done: number
  total: number
}

export interface StudentTrack {
  student: Student
  user: User
  lanes: TrackLane[]
  done: number
  total: number
}

/**
 * Outstanding work bucketed by who owes it. Derived from `recordedBy`, which is
 * already on every RequirementDef — nothing is stored to make this possible.
 * `future` requirements never count: they are nobody's turn yet.
 */
export interface WaitingOn {
  student: number
  staff: number
  coordinator: number
}

/**
 * One column of the coordinator board. A lane COLLAPSES to a few of these and
 * EXPANDS to one per requirement — see lib/board.ts.
 *
 *   check     a single requirement
 *   fraction  several named requirements as done/total
 *   rollup    the same stage across many course-scoped requirements — what turns
 *             60 internal-assessment columns into one cell
 */
export interface BoardColumn {
  key: string
  label: string
  lane: Lane
  kind: 'check' | 'fraction' | 'rollup'
  /** RequirementDef keys this column reads. */
  defKeys: string[]
  /** Only for `rollup`: the stages it summarises, in order. */
  parts?: { label: string; keys: string[] }[]
}

/** A lane's header, spanning its columns. */
export interface BoardGroup {
  lane: Lane
  span: number
  expanded: boolean
}

/**
 * INVARIANT: `na` means the requirement does not reach this student — they are
 * not enrolled in the course. It is the ABSENCE of a def match, never a stored
 * state, which is the whole answer to "students take different subjects".
 */
export type BoardCell =
  | { kind: 'check'; display: Checkpoint['display']; title: string }
  | { kind: 'fraction'; done: number; total: number; title: string }
  | { kind: 'rollup'; parts: { label: string; done: number; total: number }[]; title: string }
  | { kind: 'na' }

export interface BoardRow {
  student: Student
  user: User
  /** One entry per column, in column order. */
  cells: BoardCell[]
  waiting: WaitingOn
  done: number
  applicable: number
  /**
   * The same tally as `done`/`applicable` but scoped to the columns THIS view
   * actually shows — what the v9 board's "in / due" column reads. On the legacy
   * (viewless) board it equals done/applicable.
   */
  visible: { done: number; total: number }
}

export interface Board {
  groups: BoardGroup[]
  columns: BoardColumn[]
  rows: BoardRow[]
  /** Per column, across the rows shown: how many are complete. null = not applicable to anyone. */
  totals: ({ done: number; total: number } | null)[]
}
