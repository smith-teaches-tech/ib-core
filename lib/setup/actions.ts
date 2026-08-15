'use server'

// Every setup write, each one re-checking its own capability on the server.
//
// This is where lib/capabilities.ts keeps its promise. The screens hide controls
// people cannot use, but hiding a button is a courtesy — these checks are the
// permission system. When a real database lands, the same rules have to be
// written a third time in RLS / Security Rules.

import { revalidatePath } from 'next/cache'
import { repo } from '../data'
import { getSession } from '../session'
import { canGrant } from '../capabilities'
import type { CapabilityKey } from '../types'
import type { ImportRow } from './types'

function refresh() {
  revalidatePath('/', 'layout')
}

async function need(capability: CapabilityKey) {
  const session = await getSession()
  if (!session.can(capability)) {
    throw new Error(`You do not have permission to do that (${capability}).`)
  }
  return session
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export async function previewImport(text: string) {
  const session = await need('students.add')
  return repo.setup.previewImport(session.school.id, text)
}

export async function importStudents(cohortId: string, rows: ImportRow[]) {
  const session = await need('students.add')
  // Re-check the verdicts server-side. The client sends back what it previewed,
  // and a client is not a source of truth about who is already in the school.
  const fresh = await repo.setup.previewImport(
    session.school.id,
    rows.map((r) => [r.lastName, r.firstName, r.email, r.studentNumber].join('\t')).join('\n'),
  )
  const added = await repo.setup.importStudents(session.school.id, cohortId, fresh.rows)
  refresh()
  return added
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export async function addCourse(
  cohortId: string,
  input: { name: string; subjectGroup: string; level: 'HL' | 'SL' | null },
) {
  const session = await need('catalogue.manage')
  if (!input.name.trim()) throw new Error('A course needs a name.')
  const id = await repo.setup.addCourse(session.school.id, input, cohortId)
  refresh()
  return id
}

export async function addSection(courseId: string, cohortId: string, label: string) {
  const session = await need('sections.manage')
  const id = await repo.setup.addSection(session.school.id, courseId, cohortId, label)
  refresh()
  return id
}

export async function enrolStudent(studentId: string, sectionId: string) {
  const session = await need('enrolment.manage')
  await repo.setup.enrolStudent(session.school.id, studentId, sectionId)
  refresh()
}

export async function unenrolStudent(studentId: string, sectionId: string) {
  const session = await need('enrolment.manage')
  await repo.setup.unenrolStudent(session.school.id, studentId, sectionId)
  refresh()
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function inviteTeacher(name: string, email: string) {
  const session = await need('teachers.invite')
  if (!name.trim()) throw new Error('A teacher needs a name.')
  if (!email.includes('@')) throw new Error('That does not look like an email address.')
  const id = await repo.setup.inviteTeacher(session.school.id, name, email)
  refresh()
  return id
}

export async function assignTeacher(teacherId: string, sectionId: string) {
  const session = await need('sections.manage')
  await repo.setup.assignTeacher(session.school.id, teacherId, sectionId)
  refresh()
}

export async function unassignTeacher(teacherId: string, sectionId: string) {
  const session = await need('sections.manage')
  await repo.setup.unassignTeacher(session.school.id, teacherId, sectionId)
  refresh()
}

export async function setDesignatedMarker(teacherId: string, sectionId: string, on: boolean) {
  const session = await need('sections.manage')
  await repo.setup.setDesignatedMarker(session.school.id, teacherId, sectionId, on)
  refresh()
}

// ---------------------------------------------------------------------------
// Delegation — the district coordinator deciding what a school coordinator may do
// ---------------------------------------------------------------------------

export async function setCapability(
  userId: string,
  capability: CapabilityKey,
  granted: boolean,
) {
  const session = await getSession()

  // TWO checks, and the second is the one that matters.
  //
  // canGrant() is `roles.assign` AND holding the capability yourself: you
  // cannot give away a power you do not have. Without it, anyone who could
  // assign roles could bootstrap themselves to everything — which is the whole
  // reason the district tier exists as a separate thing.
  if (!canGrant(session.memberships, capability, session.school.id)) {
    throw new Error('You cannot grant a capability you do not hold yourself.')
  }
  if (userId === session.user.id) {
    throw new Error('You cannot change your own permissions.')
  }

  await repo.setup.setCapability(session.school.id, userId, capability, granted)
  refresh()
}
