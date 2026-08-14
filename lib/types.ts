// Domain types for IB Core.
// These mirror the data model in the project specs. Keep this file as the single
// source of truth — the data layer, the UI and any future database all agree here.

export type Id = string

/** A school within the district. Everything below is scoped to one of these. */
export interface School {
  id: Id
  name: string
  ibSchoolCode: string
}

export type RoleKey =
  | 'student'
  | 'teacher'
  | 'cas_coordinator'
  | 'ee_coordinator'
  | 'tok_teacher'
  | 'tok_coordinator'
  | 'school_coordinator'
  | 'district_coordinator'

export type UserStatus = 'invited' | 'active' | 'suspended'

export interface User {
  id: Id
  name: string
  email: string
  status: UserStatus
}

/**
 * A user's relationship to ONE school. A user may hold several.
 * Capabilities resolve from the preset plus/minus the deviations —
 * we store the deviations, never the resolved set, so preset
 * improvements reach people who already have them.
 */
export interface Membership {
  userId: Id
  schoolId: Id
  roles: RoleKey[]
  presetKey: PresetKey
  addedCapabilities: CapabilityKey[]
  removedCapabilities: CapabilityKey[]
}

export interface Cohort {
  id: Id
  schoolId: Id
  label: string
  gradYear: number
  archived: boolean
}

export interface Course {
  id: Id
  schoolId: Id
  name: string
  subjectGroup: string
  level: 'HL' | 'SL' | null
  hasIA: boolean
}

/** Sections are optional and invisible when a course has only one. */
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

export interface Student {
  userId: Id
  schoolId: Id
  cohortId: Id
  /** Permanent, issued by the IB. Globally unique. */
  personalCode: string | null
  /** Restarts at 0001 in EACH school — unique only within (school, session). */
  sessionNumber: string | null
  identifiersState: 'missing' | 'unconfirmed' | 'confirmed'
}

export type ModuleKey = 'cas' | 'ee' | 'tok' | 'ia'

export interface Announcement {
  id: Id
  schoolId: Id
  title: string
  body: string
  postedBy: string
  postedAt: string
  /** Empty means everyone at the school. */
  audienceRoles: RoleKey[]
  cohortId: Id | null
}

export interface KeyDate {
  id: Id
  schoolId: Id
  cohortId: Id
  label: string
  date: string
  module: ModuleKey | 'core' | 'ib'
  /** IB deadlines are immovable; internal ones are set by the coordinator. */
  kind: 'internal' | 'ib'
}

export type DocumentAudience = 'everyone' | 'students' | 'staff'

export interface LibraryDocument {
  id: Id
  schoolId: Id
  title: string
  description: string
  module: ModuleKey | 'core' | 'general'
  audience: DocumentAudience
  /** Which cohort this version applies to — 2027 students see the 2027 guide. */
  cohortId: Id | null
  version: string
  updatedAt: string
  href: string
}

/** A tile on the home page: one module or one course, with its outstanding count. */
export interface ModuleTile {
  key: string
  label: string
  sublabel: string
  href: string
  outstanding: number
  status: 'ok' | 'attention' | 'none'
}

// ---------------------------------------------------------------------------
// Capabilities — see lib/capabilities.ts for the list, presets and resolution.
// ---------------------------------------------------------------------------

export type CapabilityKey = string
export type PresetKey =
  | 'district'
  | 'school_full'
  | 'school_standard'
  | 'setup_only'
  | 'observer'
  | 'teacher'
  | 'student'
