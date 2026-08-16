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
import { PRESETS, canGrant } from '../capabilities'
import type { CapabilityKey, PresetKey } from '../types'
import { assertLiveCohort } from '../cohorts'
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

/**
 * An archived year group is a record, not a workspace.
 *
 * The screens already withdraw every write capability for an archived cohort,
 * but a screen is a suggestion. This is where it is true: any write that
 * resolves to a finished year is refused, whoever asks and however they got here.
 */
async function live(
  schoolId: string,
  ref: { cohortId?: string; sectionId?: string; studentId?: string },
) {
  assertLiveCohort(await repo.setup.cohortOf(schoolId, ref))
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
  await live(session.school.id, { cohortId })
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
  input: {
    name: string
    subjectGroup: string
    level: 'HL' | 'SL' | null
    iaTemplateKey: string
  },
) {
  const session = await need('catalogue.manage')
  if (!input.name.trim()) throw new Error('A course needs a name.')
  if (!input.iaTemplateKey) throw new Error('Pick the IA template family — it sets the rubric and mark maximum.')
  await live(session.school.id, { cohortId })
  const id = await repo.setup.addCourse(session.school.id, input, cohortId)
  refresh()
  return id
}

export async function addSection(courseId: string, cohortId: string, label: string) {
  const session = await need('sections.manage')
  await live(session.school.id, { cohortId })
  const id = await repo.setup.addSection(session.school.id, courseId, cohortId, label)
  refresh()
  return id
}

/**
 * Remove a course from a cohort — its requirements, enrolments and teacher
 * assignments with it. The repository refuses whenever recorded work exists
 * (marks, files, comments, or anything on the audit trail): that history is
 * archived with its cohort, never deleted.
 */
export async function removeCourse(courseId: string, cohortId: string) {
  const session = await need('catalogue.manage')
  await live(session.school.id, { cohortId })
  await repo.setup.removeCourse(session.school.id, courseId, cohortId)
  refresh()
}

export async function enrolStudent(studentId: string, sectionId: string) {
  const session = await need('enrolment.manage')
  await live(session.school.id, { sectionId })
  await repo.setup.enrolStudent(session.school.id, studentId, sectionId)
  refresh()
}

export async function unenrolStudent(studentId: string, sectionId: string) {
  const session = await need('enrolment.manage')
  await live(session.school.id, { sectionId })
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
  await live(session.school.id, { sectionId })
  await repo.setup.assignTeacher(session.school.id, teacherId, sectionId)
  refresh()
}

export async function unassignTeacher(teacherId: string, sectionId: string) {
  const session = await need('sections.manage')
  await live(session.school.id, { sectionId })
  await repo.setup.unassignTeacher(session.school.id, teacherId, sectionId)
  refresh()
}

export async function setDesignatedMarker(teacherId: string, sectionId: string, on: boolean) {
  const session = await need('sections.manage')
  await live(session.school.id, { sectionId })
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

/**
 * Change a person's preset — the role layer the Permissions tab now manages.
 *
 * THE SAME NO-ESCALATION RULE AS setCapability, applied to the whole preset:
 * every capability the preset contains must be one the granter could grant
 * individually. So the district preset is assignable only by a district-tier
 * user (it contains capabilities nobody else holds), and a school coordinator
 * cannot hand out more than they have. The repository adds two guards of its
 * own: student/staff kinds cannot cross, and there is exactly ONE district
 * coordinator.
 */
export async function setPreset(userId: string, presetKey: PresetKey) {
  const session = await getSession()

  if (!session.can('roles.assign')) {
    throw new Error('You do not have permission to assign roles (roles.assign).')
  }
  if (userId === session.user.id) {
    throw new Error('You cannot change your own permissions.')
  }

  const districtTier = session.memberships.some((m) => m.presetKey === 'district')
  if (presetKey === 'district' && !districtTier) {
    throw new Error('Only the district coordinator can assign the district tier.')
  }
  for (const capability of PRESETS[presetKey].capabilities) {
    if (!canGrant(session.memberships, capability, session.school.id)) {
      throw new Error(
        `That preset includes a capability you do not hold yourself (${capability}).`,
      )
    }
  }

  await repo.setup.setPreset(session.school.id, userId, presetKey)
  refresh()
}

// ---------------------------------------------------------------------------
// IB identifiers
// ---------------------------------------------------------------------------

export async function setIdentifiers(
  studentId: string,
  input: { sessionNumber?: string; personalCode?: string; resultsPin?: string; confirmed?: boolean },
) {
  const session = await need('identifiers.manage')
  await live(session.school.id, { studentId })
  await repo.setup.setIdentifiers(session.school.id, studentId, input)
  refresh()
}

export async function previewIdentifiers(text: string) {
  const session = await need('identifiers.manage')
  return repo.setup.previewIdentifiers(session.school.id, text)
}

export async function importIdentifiers(text: string) {
  const session = await need('identifiers.manage')
  // Re-parse server-side rather than trusting the rows the client previewed:
  // the match from a row to a student is exactly the decision worth re-making.
  const fresh = await repo.setup.previewIdentifiers(session.school.id, text)
  const applied = await repo.setup.importIdentifiers(session.school.id, fresh.rows)
  refresh()
  return applied
}

// ---------------------------------------------------------------------------
// Cohort lifecycle — the /cohorts screen
// ---------------------------------------------------------------------------

/**
 * A new year group — empty, or with the STRUCTURE of an existing one cloned in
 * (courses, sections, teacher assignments, fresh defs from the current IA
 * templates). Never students, enrolments, marks or states.
 */
export async function createCohort(
  label: string,
  gradYear: number,
  cloneFromCohortId: string | null,
) {
  const session = await need('cohorts.manage')
  const id = await repo.setup.createCohort(session.school.id, label, gradYear)
  if (cloneFromCohortId) {
    await repo.setup.cloneCohortStructure(session.school.id, cloneFromCohortId, id)
  }
  refresh()
  return id
}

// ---------------------------------------------------------------------------
// Archiving — a decision, not a date
// ---------------------------------------------------------------------------

export async function setCohortArchived(cohortId: string, archived: boolean) {
  // `cohort.archive` sits in the Oversight & risk group and is off in every
  // preset, so only the district coordinator holds it out of the box. A school
  // coordinator can be granted it under Permissions.
  const session = await need('cohort.archive')
  await repo.setup.setCohortArchived(session.school.id, cohortId, archived)
  refresh()
}
