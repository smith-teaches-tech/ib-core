'use server'

// The IA marks module's writes, each re-checking its capability on the server —
// the same contract as lib/setup/actions.ts. Hiding an input is a courtesy;
// these checks are the permission system.

import { revalidatePath } from 'next/cache'
import { repo } from '../data'
import { getSession } from '../session'
import { isArchived } from '../cohorts'
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
  const cohort = await repo.setup.cohortOf(schoolId, { cohortId })
  if (cohort && isArchived(cohort)) {
    throw new Error(`${cohort.label} is archived — it is a record and cannot be changed.`)
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
  await repo.ia.setCriterionMark(
    session.school.id, courseId, cohortId, studentId, index, value, session.user.name,
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
  await repo.ia.setComment(
    session.school.id, courseId, cohortId, studentId, text, session.user.name,
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
  await repo.ia.setTypedIntoIbis(session.school.id, courseId, cohortId, studentId, on)
  refresh()
}
