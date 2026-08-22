'use server'

// Setting and moving due dates. Same contract as every other action file: the
// capability is re-checked on the server, because hiding a field is a courtesy
// and this check is the permission system.
//
// A FLAT FILE, not lib/deadlines/actions.ts, because lib/deadlines.ts already
// holds the pure resolution logic and a file cannot also be a directory. The
// pure module keeps the name it earned (it is the sibling of lib/board.ts and
// lib/spine.ts); the actions take the compound one.

import { revalidatePath } from 'next/cache'
import { repo } from './data'
import { getSession } from './session'
import { assertLiveCohort } from './cohorts'
import { tierOfStage } from './deadlines'

function refresh() {
  revalidatePath('/', 'layout')
}

/** An archived year group is a record, not a workspace. */
async function live(schoolId: string, cohortId: string) {
  assertLiveCohort(await repo.setup.cohortOf(schoolId, { cohortId }))
}

/**
 * WHO MAY DATE WHAT (Michael, 19 Aug):
 *
 *   · a coordinator (`deadlines.set`) sets anything
 *   · a teacher sets dates on courses they are the DESIGNATED MARKER of
 *   · a predicted-grade date is the coordinator's alone — it is a cohort-wide
 *     commitment, and the April one is an IB deadline they sign for
 *
 * One decision, in the repository, so the screen and the action cannot disagree.
 */
async function allow(
  cohortId: string, requirementKey: string, courseId: string | null,
  studentId?: string | null,
) {
  const session = await getSession()
  const schoolId = session.school.id
  const ok = await repo.deadlines.maySet(
    schoolId, cohortId, session.user.id, requirementKey, courseId,
    session.can('deadlines.set'), studentId,
  )
  if (!ok) {
    const defs = await repo.deadlines.definitionsIn(schoolId, cohortId)
    const tier = tierOfStage(requirementKey, defs)
    throw new Error(
      tier === 'none'
        ? 'That is not something a due date belongs on. Marking is staff work, and the predicted-grade dates already say when it is needed.'
        : tier === 'programme'
          ? 'This is a programme-wide date, set by the IB coordinator.'
          : 'You can set dates only for courses you are the designated marker of.',
    )
  }
  return session
}

export async function setDeadline(
  cohortId: string,
  requirementKey: string,
  courseId: string | null,
  dueAt: string,
  isMajor: boolean,
  decidedBy: string,
  /**
   * ONE CANDIDATE'S EXTENSION. Absent for every ordinary date. Granted by the
   * course's designated marker, because they are the one who knows why.
   */
  studentId?: string | null,
) {
  const session = await allow(cohortId, requirementKey, courseId, studentId)
  await live(session.school.id, cohortId)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) throw new Error('That is not a date.')
  await repo.deadlines.set(
    session.school.id, cohortId,
    { requirementKey, courseId, studentId, dueAt, isMajor, decidedBy },
    session.user.id,
  )
  refresh()
}

export async function removeDeadline(cohortId: string, id: string) {
  const session = await getSession()
  const all = await repo.deadlines.list(session.school.id, cohortId)
  const row = all.find((d) => d.id === id)
  if (!row) return
  await allow(cohortId, row.requirementKey, row.courseId, row.studentId)
  await live(session.school.id, cohortId)
  await repo.deadlines.remove(session.school.id, cohortId, id)
  refresh()
}
