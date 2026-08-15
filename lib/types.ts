// The spine. Nine objects, and everything else in the product is a view over them.
// See claude/IB-Spine-Architecture.md in the project docs.

export type Id = string

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
  label: string
  gradYear: number
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

export type Lane = 'CAS' | 'Extended Essay' | 'TOK' | 'Internal assessment' | 'IB admin'

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
  markMax?: number
  /** Does this feed an IB upload, and which one? Drives the export builder. */
  exportTarget?: ExportTarget
  /** Not actionable until the named requirement is complete. The RPF needs the viva first. */
  opensAfter?: string
  dueAt?: string
}

/** Has the school got it? Our vocabulary. */
export type RecordStatus =
  | 'not_started' | 'in_progress' | 'submitted' | 'marked' | 'released'

/** Has it gone to the IB? eCoursework's vocabulary, verbatim, so nobody translates. */
export type ExportStatus =
  | 'not_started' | 'in_progress' | 'ready_for_candidate' | 'candidate_submitted'
  | 'ready_for_authentication' | 'ready_for_submission' | 'submitted'
  | 'error' | 'non_submission' | 'academic_misconduct'

export interface Artifact {
  id: Id
  kind: 'file' | 'text' | 'link'
  label: string
  href?: string
  body?: string
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
  mark?: number
  artifacts: Artifact[]
  recordedBy?: string
  recordedAt?: string
  lockedAt?: string
}

// ---------------------------------------------------------------------------
// People, membership, permissions
// ---------------------------------------------------------------------------

export type RoleKey =
  | 'student' | 'teacher' | 'cas_coordinator' | 'ee_coordinator'
  | 'tok_teacher' | 'tok_coordinator' | 'school_coordinator' | 'district_coordinator'

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

export interface BoardRow {
  student: Student
  user: User
  /** One entry per column, in column order. null = requirement doesn't apply. */
  cells: (Checkpoint | null)[]
  done: number
  applicable: number
}

export interface Board {
  columns: RequirementDef[]
  rows: BoardRow[]
}
