// Setup & people — view shapes only.
//
// Note what is NOT here: no new entities. Unlike CAS, this module invents
// nothing. It is a set of screens for creating and connecting the spine objects
// that already exist — Course, Section, Enrollment, TeachingAssignment,
// Membership, Student. Everything below is a projection assembled on read.

import type {
  CapabilityKey, Course, Membership, RoleKey, Section, User,
} from '../types'

export interface SectionRow {
  section: Section
  students: number
  teachers: { userId: string; name: string; isDesignatedMarker: boolean }[]
}

export interface CourseRow {
  course: Course
  sections: SectionRow[]
  students: number
}

export interface PersonRow {
  user: User
  membership: Membership
  roles: RoleKey[]
  /** preset ∪ added − removed, resolved for display. Never stored. */
  capabilities: CapabilityKey[]
  isStudent: boolean
  studentNumber: string | null
  candidate: { personalCode: string | null; sessionNumber: string | null } | null
  teaches: { sectionId: string; label: string }[]
  /** For students: the sections they are enrolled in, which IS their course list. */
  enrolled: { sectionId: string; label: string }[]
}

// ---------------------------------------------------------------------------
// Roster import
// ---------------------------------------------------------------------------

export type RowVerdict = 'new' | 'duplicate_in_paste' | 'already_here' | 'error'

export interface ImportRow {
  line: number
  lastName: string
  firstName: string
  email: string
  studentNumber: string
  verdict: RowVerdict
  /** Why it will not import, or a caveat worth reading before committing. */
  message?: string
}

export interface ImportPreview {
  rows: ImportRow[]
  headerSkipped: boolean
  columnOrder: string[]
  newCount: number
  skipCount: number
  errorCount: number
}
