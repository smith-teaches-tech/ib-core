// THE SWAP POINT.
//
// Every screen in the app reads through this interface and never touches a
// database directly. Today it is backed by fixtures (no cloud, no database,
// runs on a laptop). When IT decides between Postgres/Supabase and Firestore,
// we write ONE new file implementing this same interface and change a single
// line in lib/data/index.ts. No screen changes.
//
// Rule for anything added here: every method takes a schoolId. Scope is a
// boundary, not an afterthought.

import type {
  Announcement, Cohort, Course, KeyDate, LibraryDocument, Membership,
  ModuleTile, School, Section, Student, User,
} from '../types'

export interface Repository {
  // Identity & scope
  getUser(userId: string): Promise<User | null>
  getMemberships(userId: string): Promise<Membership[]>
  getSchool(schoolId: string): Promise<School | null>
  listSchools(): Promise<School[]>

  // Structure
  listCohorts(schoolId: string): Promise<Cohort[]>
  listCourses(schoolId: string): Promise<Course[]>
  listSections(schoolId: string): Promise<Section[]>
  getStudent(userId: string): Promise<Student | null>

  // Home page
  listAnnouncements(schoolId: string, forUserId: string): Promise<Announcement[]>
  listKeyDates(schoolId: string, cohortId: string | null): Promise<KeyDate[]>
  listDocuments(schoolId: string, forUserId: string): Promise<LibraryDocument[]>
  listModuleTiles(schoolId: string, forUserId: string): Promise<ModuleTile[]>
}
