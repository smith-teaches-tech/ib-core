'use server'

// Every EE write goes through here, and every one re-checks its permission on
// the server. The client hides what a user cannot do; that is courtesy. This
// file is where the promise is kept.

import { revalidatePath } from 'next/cache'
import { repo } from '../data'
import { getSession } from '../session'
import { assertLiveCohort } from '../cohorts'

function refresh() {
  revalidatePath('/', 'layout')
}

/**
 * A student writes their OWN registration and their OWN links, and nobody
 * else's — checked against the session rather than against a studentId the
 * form supplied, because a hidden field is not an authorisation.
 *
 * An archived year group is a record, not a workspace (same guard as CAS).
 */
async function asOwner(studentId: string) {
  const session = await getSession()
  if (session.user.id !== studentId && !session.can('ee.manage')) {
    throw new Error('You can only edit your own extended essay.')
  }
  const cohort = await repo.setup.cohortOf(session.school.id, { studentId })
  assertLiveCohort(cohort)
  return { session, cohortId: cohort.id }
}

export async function saveRegistration(
  studentId: string,
  input: { subjects: string[]; framework: string | null; researchQuestion: string; title: string },
) {
  const { session, cohortId } = await asOwner(studentId)
  const result = await repo.ee.saveRegistration(session.school.id, cohortId, studentId, {
    ...input,
    framework: input.framework?.trim() ? input.framework : null,
  })
  if (result.ok) refresh()
  return result
}

export async function setLink(
  studentId: string,
  stage: 'outline' | 'draft',
  href: string,
  label: string,
) {
  const { session } = await asOwner(studentId)
  const trimmed = href.trim()
  // A link the student cannot open is a link the supervisor cannot open. The
  // reachability CHECK belongs to step 4; refusing obvious nonsense is free.
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, message: 'Paste the full link, starting with https://' }
  }
  await repo.ee.setLink(session.school.id, studentId, stage, trimmed, label)
  refresh()
  return { ok: true, message: null }
}

/** Assigning a supervisor is `ee.manage` — the EE coordinator or the IB coordinator. */
export async function assignSupervisor(
  cohortId: string,
  studentId: string,
  supervisorId: string,
) {
  const session = await getSession()
  if (!session.can('ee.manage')) throw new Error('You cannot assign extended essay supervisors.')
  assertLiveCohort(await repo.setup.cohortOf(session.school.id, { studentId }))
  await repo.ee.assignSupervisor(session.school.id, cohortId, studentId, supervisorId, session.user.id)
  refresh()
}
