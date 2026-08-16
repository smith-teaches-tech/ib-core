'use server'

// The IA marks module's writes, each re-checking its capability on the server —
// the same contract as lib/setup/actions.ts. Hiding an input is a courtesy;
// these checks are the permission system.

import { revalidatePath } from 'next/cache'
import { repo } from '../data'
import { getSession } from '../session'
import { assertLiveCohort } from '../cohorts'
import { marksWriteGrant } from './authorize'
import type { Session } from '../session'
import type { CapabilityKey } from '../types'

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

/** An archived year group is a record, not a workspace — same rule as setup. */
async function live(schoolId: string, cohortId: string) {
  assertLiveCohort(await repo.setup.cohortOf(schoolId, { cohortId }))
}

/**
 * The cohortId arrives from the client, so it is checked rather than trusted:
 * the course must actually run for that cohort at the session's school.
 */
async function courseInCohort(schoolId: string, courseId: string, cohortId: string) {
  const rows = await repo.setup.listCourseRows(schoolId, cohortId)
  const row = rows.find((r) => r.course.id === courseId)
  if (!row || row.sections.length === 0) {
    throw new Error('That course does not run for that year group at this school.')
  }
}

/**
 * Marker-only writes. Holding `ia.manage` is necessary but no longer
 * sufficient: the write must come from the DESIGNATED MARKER of a section of
 * this course containing this student, or ride a coordinator's unexpired
 * unlock (lib/ia/authorize.ts). Co-teachers read.
 */
async function allowWrite(
  session: Session, courseId: string, cohortId: string, studentId: string,
) {
  const grant = await marksWriteGrant(
    repo.ia, session.can, session.school.id, courseId, cohortId, studentId, session.user.id,
  )
  if (!grant.allowed) {
    throw new Error(
      'Only the designated marker enters this course’s marks. ' +
        'A coordinator can unlock editing, with a reason, from the course page.',
    )
  }
}

export async function setCriterionMark(
  courseId: string,
  cohortId: string,
  studentId: string,
  index: number,
  value: number | null,
) {
  const session = await need('ia.manage')
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await allowWrite(session, courseId, cohortId, studentId)
  await repo.ia.setCriterionMark(
    session.school.id, courseId, cohortId, studentId, index, value, session.user.id,
  )
  refresh()
}

export async function setComment(
  courseId: string,
  cohortId: string,
  studentId: string,
  text: string,
) {
  const session = await need('ia.manage')
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await allowWrite(session, courseId, cohortId, studentId)
  await repo.ia.setComment(
    session.school.id, courseId, cohortId, studentId, text, session.user.id,
  )
  refresh()
}

export async function setTypedIntoIbis(
  courseId: string,
  cohortId: string,
  studentId: string,
  on: boolean,
) {
  // The transcription tick is the coordinator's own act — a different
  // capability from marking, because it records an export-side fact.
  const session = await need('marks.transcribe')
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await repo.ia.setTypedIntoIbis(
    session.school.id, courseId, cohortId, studentId, on, session.user.id,
  )
  refresh()
}

/**
 * The coordinator override — NOT a direct write. Unlocking records who, why
 * and until when; the writes it permits each carry the reason on their own
 * audit event; and expiry re-locks with nobody watching.
 */
export async function unlockMarks(courseId: string, cohortId: string, reason: string) {
  const session = await need('marks.override')
  if (!reason.trim()) {
    throw new Error('A reason is required to unlock marks — it goes in the audit trail.')
  }
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await repo.ia.unlockMarks(
    session.school.id, courseId, cohortId, session.user.id, reason,
  )
  refresh()
}

/** End an unlock early. No cohort gate: giving a privilege back is always allowed. */
export async function relockMarks(courseId: string) {
  const session = await need('marks.override')
  await repo.ia.relockMarks(session.school.id, courseId, session.user.id)
  refresh()
}
