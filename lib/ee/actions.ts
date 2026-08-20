'use server'

// Every EE write goes through here, and every one re-checks its permission on
// the server. The client hides what a user cannot do; that is courtesy. This
// file is where the promise is kept.

import { revalidatePath } from 'next/cache'
import { repo } from '../data'
import { getSession } from '../session'
import { assertLiveCohort } from '../cohorts'
import { anonymityPreflight, preflightPasses } from '../anonymity'
import { storage } from '../storage'
import { WORD_LIMIT } from './rubric'

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

/**
 * FILE THE FINISHED ESSAY.
 *
 * The pre-flight runs on the SERVER as well as on the screen. The screen's copy
 * is courtesy — it tells a student what is wrong before they press the button —
 * and this one is the guarantee. `waiting` checks never block: a student cannot
 * be held back because the school has not bought cloud storage.
 */
export async function submitFinal(
  studentId: string,
  /**
   * The file's IDENTITY, not its bytes — the CAS pattern (lib/cas/actions.ts's
   * addEvidence). The picker is real, the selection is real, and what is
   * recorded — which file, of what type, how big, filed when — is real and
   * permanent. Only the bytes go nowhere, because lib/storage.ts is a stub.
   *
   * When cloud storage arrives this becomes a FormData upload and storage.ts
   * changes. THIS SIGNATURE AND THE SCREEN ABOVE IT DO NOT.
   */
  file: { name: string; mime: string; bytes: number },
  declaredWords: number,
  declarations: { code: boolean; anonymous: boolean; underLimit: boolean },
) {
  const { session } = await asOwner(studentId)

  const view = await repo.ee.getStudentView(session.school.id, studentId)
  if (view?.finalLocked) {
    return {
      ok: false,
      message: 'Your essay is filed and locked. Ask your EE coordinator to reopen it.',
    }
  }

  const track = await repo.getTrack(session.school.id, studentId, { includeIdentifiers: true })
  const checks = anonymityPreflight({
    personalCode: track?.student.personalCode ?? null,
    identifiersState: track?.student.identifiersState ?? 'missing',
    declaredWords: Number.isFinite(declaredWords) ? declaredWords : null,
    wordLimit: WORD_LIMIT,
    declarations,
  })
  if (!preflightPasses(checks)) {
    return { ok: false, message: checks.find((c) => c.status === 'fail')!.detail }
  }
  if (!file?.name) return { ok: false, message: 'Choose the PDF to file.' }
  // The IB takes a PDF, and a .docx filed here would be found in April by a
  // coordinator building the upload pack, which is the worst time to find it.
  const isPdf = file.mime === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf) return { ok: false, message: 'The finished essay has to be a PDF.' }

  const ref = await storage.put(file, { schoolId: session.school.id, studentId })
  await repo.ee.submitFinal(session.school.id, studentId, ref.name, declaredWords, ref.key, ref.bytes)
  refresh()
  return { ok: true, message: null }
}

/**
 * Reopen a filed essay — `items.unlock`, the same capability CAS and IA marks
 * use, with a typed reason that is kept rather than erased by the next upload.
 * Who reopened a finished paper, and why, is exactly what an authenticity
 * question asks six months later.
 */
export async function unlockFinal(studentId: string, reason: string) {
  const session = await getSession()
  if (!session.can('items.unlock')) throw new Error('You cannot reopen a filed essay.')
  if (!reason.trim()) return { ok: false, message: 'A reason is required to reopen a filed essay.' }
  assertLiveCohort(await repo.setup.cohortOf(session.school.id, { studentId }))
  await repo.ee.unlockFinal(
    session.school.id, studentId, session.user.id, session.user.name, reason.trim(),
  )
  refresh()
  return { ok: true, message: null }
}

/**
 * May this person record a session for this student?
 *
 * The supervisor of record, or an `ee.manage` holder — the EE coordinator and
 * the IB coordinator both hold it. Returns whether the write is ON BEHALF of
 * the supervisor, which is stored, because a coordinator filing a meeting they
 * did not attend is a different fact from the supervisor filing their own.
 */
async function sessionWriter(studentId: string) {
  const session = await getSession()
  const supervisor = await repo.ee.getSupervisor(session.school.id, studentId)
  const isSupervisor = supervisor?.userId === session.user.id && !supervisor.acting
  if (!isSupervisor && !session.can('ee.manage')) {
    throw new Error('Only this student’s supervisor or an EE coordinator can record a session.')
  }
  assertLiveCohort(await repo.setup.cohortOf(session.school.id, { studentId }))
  return { session, onBehalf: !isSupervisor }
}

export async function recordSession(
  studentId: string,
  stage: 'r1' | 'r2' | 'viva',
  heldOn: string,
) {
  const { session, onBehalf } = await sessionWriter(studentId)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) {
    return { ok: false, message: 'Give the date the meeting actually happened.' }
  }
  await repo.ee.recordSession(
    session.school.id, studentId, stage, heldOn,
    session.user.id, session.user.name, onBehalf,
  )
  refresh()
  return { ok: true, message: null }
}

/**
 * A note about a session. The STUDENT may write one about their own sessions,
 * and staff may write one about a student they are responsible for — both are
 * optional, and the supervisor sees both. The student's own account, dated at
 * the time, is authenticity evidence a supervisor's note alone cannot be.
 */
export async function addSessionNote(
  studentId: string,
  stage: 'r1' | 'r2' | 'viva',
  body: string,
) {
  const session = await getSession()
  if (!body.trim()) return { ok: false, message: 'Nothing to add.' }

  const own = session.user.id === studentId
  if (!own) {
    const supervisor = await repo.ee.getSupervisor(session.school.id, studentId)
    const isSupervisor = supervisor?.userId === session.user.id
    if (!isSupervisor && !session.can('ee.manage')) {
      throw new Error('You cannot write on this student’s extended essay.')
    }
  }
  assertLiveCohort(await repo.setup.cohortOf(session.school.id, { studentId }))
  await repo.ee.addSessionNote(
    session.school.id, studentId, stage,
    own ? 'student' : 'staff', session.user.id, session.user.name, body,
  )
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
