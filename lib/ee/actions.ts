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
import { EE_CRITERIA, WORD_LIMIT } from './rubric'
import {
  countWords, criterionOpen, hoursProblem, markingGates, releaseBlockers,
} from './scoring'

/** The reflection statement's own limit — not the essay's 4,000. */
const RPF_WORD_LIMIT = 500

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
  declarations: { anonymous: boolean; underLimit: boolean },
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

/**
 * THE STUDENT'S REFLECTION STATEMENT.
 *
 * Written in a Doc and pasted (Michael, 19 Aug), so this is a submission box
 * rather than an editor. Submitting LOCKS it — the supervisor marks Criterion E
 * from it, and a statement that can change after it has been read is not
 * evidence of anything.
 */
export async function submitRpf(studentId: string, body: string) {
  const { session } = await asOwner(studentId)
  const view = await repo.ee.getStudentView(session.school.id, studentId)
  if (!view?.rpfOpen) {
    return { ok: false, message: 'Your viva voce has not been recorded yet.' }
  }
  if (view.rpf) {
    return { ok: false, message: 'Your reflection is submitted and locked. Ask your coordinator to reopen it.' }
  }
  const words = countWords(body)
  if (words === 0) return { ok: false, message: 'Nothing to submit.' }
  if (words > RPF_WORD_LIMIT) {
    return {
      ok: false,
      message: `${words} words — the limit is ${RPF_WORD_LIMIT}. An examiner stops reading at the limit.`,
    }
  }
  await repo.ee.submitRpf(session.school.id, studentId, body)
  refresh()
  return { ok: true, message: null }
}

/**
 * May this person mark this student? The supervisor of record, or `ee.manage`.
 *
 * A coordinator marking is not an override — an EE coordinator may hold
 * supervisees of their own, and may also be covering for a colleague. What is
 * recorded is who entered the mark, which is enough.
 */
async function marker(studentId: string) {
  const session = await getSession()
  const supervisor = await repo.ee.getSupervisor(session.school.id, studentId)
  if (supervisor?.userId !== session.user.id && !session.can('ee.manage')) {
    throw new Error('Only this student’s supervisor or an EE coordinator can mark this essay.')
  }
  assertLiveCohort(await repo.setup.cohortOf(session.school.id, { studentId }))
  return session
}

/**
 * ONE CRITERION, SAVED AS IT IS ENTERED.
 *
 * The gate is per criterion, not per essay: A–D need the finished essay and
 * nothing else, so a supervisor can mark them before the viva and not read the
 * essay a third time. E needs the RPF, because E is marked from it.
 */
export async function saveMark(studentId: string, criterionIndex: number, mark: number | null) {
  const session = await marker(studentId)
  const view = await repo.ee.getStudentView(session.school.id, studentId)
  const gates = markingGates({ finalFiled: view?.final != null, rpfIn: view?.rpf != null })
  const criterion = EE_CRITERIA[criterionIndex]
  if (!criterion) return { ok: false, message: 'No such criterion.' }
  if (!criterionOpen(criterion.key, gates)) {
    return {
      ok: false,
      message: criterion.key === 'E' ? gates.reflectionReason! : gates.coreReason!,
    }
  }
  if (mark != null && (mark < 0 || mark > criterion.max)) {
    return { ok: false, message: `Criterion ${criterion.key} is out of ${criterion.max}.` }
  }
  await repo.ee.saveMark(session.school.id, studentId, criterionIndex, mark, session.user.name)
  refresh()
  return { ok: true, message: null }
}

export async function saveScoring(
  studentId: string,
  input: {
    comment: string
    hoursSupervised: number | null
    attestedSessions: boolean
    attestedAuthentic: boolean
  },
) {
  const session = await marker(studentId)
  const bad = hoursProblem(input.hoursSupervised)
  if (bad) return { ok: false, message: bad }
  await repo.ee.saveScoring(session.school.id, studentId, input, session.user.id, session.user.name)
  refresh()
  return { ok: true, message: null }
}

/**
 * RELEASE — the supervisor's, decided 19 Aug. It puts a grade in front of a
 * student and into the EE×TOK bonus-point matrix, so it asks for everything:
 * five marks, both attestation ticks, and the written justification. The
 * blockers are computed in one place so this and the button cannot disagree.
 */
export async function releaseScore(studentId: string) {
  const session = await marker(studentId)
  const rows = await repo.ee.getRoster(
    session.school.id,
    (await repo.setup.cohortOf(session.school.id, { studentId }))!.id,
    null,
  )
  const row = rows.find((r) => r.studentId === studentId)
  const blockers = releaseBlockers({
    marks: row?.marks ?? [],
    attestedSessions: row?.scoring?.attestedSessions ?? false,
    attestedAuthentic: row?.scoring?.attestedAuthentic ?? false,
    comment: row?.scoring?.comment ?? '',
  })
  if (blockers.length) return { ok: false, message: blockers[0].message }
  await repo.ee.releaseScore(session.school.id, studentId, session.user.id, session.user.name)
  refresh()
  return { ok: true, message: null }
}

/** `scores.revoke` — editing or revoking a released score is the coordinator's. */
export async function revokeScore(studentId: string) {
  const session = await getSession()
  if (!session.can('scores.revoke')) throw new Error('You cannot revoke a released score.')
  assertLiveCohort(await repo.setup.cohortOf(session.school.id, { studentId }))
  await repo.ee.revokeScore(session.school.id, studentId)
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
