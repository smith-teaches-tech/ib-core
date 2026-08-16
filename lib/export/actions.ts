'use server'

// Download for IBIS's one write, re-checking its capability on the server —
// the same contract as lib/ia/actions.ts. Hiding a button is a courtesy;
// this check is the permission system.

import { revalidatePath } from 'next/cache'
import { repo } from '../data'
import { getSession } from '../session'
import { assertLiveCohort } from '../cohorts'

/**
 * Mark a whole-cohort upload job as submitted in eCoursework (or take it
 * back). `ecoursework.status` is the capability that owns the export axis.
 */
export async function setJobSubmitted(cohortId: string, jobKey: string, on: boolean) {
  const session = await getSession()
  if (!session.can('ecoursework.status')) {
    throw new Error('You do not have permission to do that (ecoursework.status).')
  }
  assertLiveCohort(await repo.setup.cohortOf(session.school.id, { cohortId }))
  await repo.export.setJobSubmitted(session.school.id, cohortId, jobKey, on)
  revalidatePath('/export')
}
