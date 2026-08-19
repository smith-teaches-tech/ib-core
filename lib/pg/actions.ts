'use server'

// The predicted-grades module's writes. Same contract as lib/ia/actions.ts:
// every one re-checks its capability on the server, because hiding an input is
// a courtesy and these checks are the permission system.

import { revalidatePath } from 'next/cache'
import { repo } from '../data'
import { getSession } from '../session'
import { assertLiveCohort } from '../cohorts'
import { pgWriteGrant } from './authorize'
import type { Session } from '../session'
import type { CapabilityKey } from '../types'
import type { ReportingPoint } from './types'

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

/** An archived year group is a record, not a workspace. */
async function live(schoolId: string, cohortId: string) {
  assertLiveCohort(await repo.setup.cohortOf(schoolId, { cohortId }))
}

/** The cohortId arrives from the client, so it is checked rather than trusted. */
async function courseInCohort(schoolId: string, courseId: string, cohortId: string) {
  const rows = await repo.setup.listCourseRows(schoolId, cohortId)
  const row = rows.find((r) => r.course.id === courseId)
  if (!row || row.sections.length === 0) {
    throw new Error('That course does not run for that year group at this school.')
  }
}

async function allowWrite(
  session: Session, courseId: string, cohortId: string, studentId: string,
) {
  const grant = await pgWriteGrant(
    repo.ia, session.can, session.school.id, courseId, cohortId, studentId, session.user.id,
  )
  if (!grant.allowed) {
    throw new Error(
      'Only this course’s designated marker or an IB coordinator records its predicted grades.',
    )
  }
  return grant
}

/**
 * Write a predicted grade.
 *
 * THE LOCK: a grade locks the moment it is saved, and the repository REFUSES a
 * write to a locked cell. Changing one is therefore always two acts — unlock
 * with a reason, then write — and both land on the trail. That is the whole
 * mechanism; there is no "force" parameter and there is deliberately no way to
 * ask for one.
 */
export async function setPredictedGrade(
  courseId: string,
  cohortId: string,
  studentId: string,
  point: ReportingPoint['key'],
  value: string | null,
) {
  const session = await need('pg.manage')
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await allowWrite(session, courseId, cohortId, studentId)
  await repo.pg.setGrade(
    session.school.id, courseId, cohortId, studentId, point, value, session.user.id,
  )
  refresh()
}

/**
 * Open ONE locked grade for ONE change. The reason is required, is recorded
 * with the author's name, and is stamped onto the change that follows it.
 *
 * Note what this is not: it is not a 30-minute session, it does not unlock a
 * row or a column, and it does not need a coordinator. Whoever may write may
 * unlock — the friction is one sentence, and the point of the friction is that
 * a grade cannot move by accident, not that moving one requires permission.
 */
export async function unlockPredictedGrade(
  courseId: string,
  cohortId: string,
  studentId: string,
  point: ReportingPoint['key'],
  reason: string,
) {
  const session = await need('pg.manage')
  if (!reason.trim()) {
    throw new Error('A reason is required to change a predicted grade — it goes in the trail.')
  }
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await allowWrite(session, courseId, cohortId, studentId)
  await repo.pg.unlockGrade(
    session.school.id, courseId, cohortId, studentId, point, reason, session.user.id,
  )
  refresh()
}
