'use server'

// Every TOK write goes through here, and every one re-checks its permission on
// the server. The client hides what a user cannot do; that is courtesy. This
// file is where the promise is kept. (The EE actions file is the pattern.)

import { revalidatePath } from 'next/cache'
import { repo } from '../data'
import { getSession } from '../session'
import { assertLiveCohort } from '../cohorts'
import { anonymityPreflight, preflightPasses } from '../anonymity'
import { storage } from '../storage'
import { marksWriteGrant } from '../ia/authorize'
import { EXHIBITION_WORD_LIMIT, ESSAY_WORD_LIMIT } from './rubric'
import type { AuthorshipConcern } from './types'

function refresh() {
  revalidatePath('/', 'layout')
}

/**
 * A student writes their OWN TOK record and nobody else's — checked against the
 * session rather than against a studentId the form supplied, because a hidden
 * field is not an authorisation. An archived year group is a record, not a
 * workspace.
 */
async function asOwner(studentId: string) {
  const session = await getSession()
  if (session.user.id !== studentId && !session.can('tok.manage')) {
    throw new Error('You can only edit your own TOK record.')
  }
  const cohort = await repo.setup.cohortOf(session.school.id, { studentId })
  assertLiveCohort(cohort)
  return { session, cohortId: cohort.id }
}

export async function setPrompt(studentId: string, promptNumber: number) {
  const { session } = await asOwner(studentId)
  const r = await repo.tok.setPrompt(session.school.id, studentId, promptNumber)
  if (r.ok) refresh()
  return r
}

export async function setTitle(
  studentId: string,
  input: { number: number | null; text: string; source: 'teacher' | 'student' },
) {
  const { session } = await asOwner(studentId)
  const r = await repo.tok.setTitle(session.school.id, studentId, input)
  if (r.ok) refresh()
  return r
}

export async function setDraft(studentId: string, href: string) {
  const { session } = await asOwner(studentId)
  const url = href.trim()
  if (url && !/^https?:\/\//i.test(url)) {
    return { message: 'That does not look like a link — it should start with https://' }
  }
  await repo.tok.setDraft(session.school.id, studentId, url)
  refresh()
  return { message: null }
}

export async function submitInteraction(studentId: string, n: 1 | 2 | 3, body: string) {
  const { session } = await asOwner(studentId)
  const r = await repo.tok.submitInteraction(session.school.id, studentId, n, body)
  if (r.ok) refresh()
  return r
}

/**
 * THE EXHIBITION AND THE ESSAY — both file, both lock on filing, both behind
 * the shared anonymity pre-flight.
 *
 * ⚠ THE DECLARATIONS DO NOT MENTION THE CANDIDATE PERSONAL CODE, and that is
 * deliberate. Codes do not exist until IBIS registration completes — at ISG in
 * mid-January — and the exhibition is due in November. Asking a student in
 * November to confirm a code they cannot have is the defect that produced last
 * session's rework, where every candidate reopened a finished essay to paste a
 * code in. The code is added at EXPORT instead, from what the coordinator
 * entered once. See IB-Uploads-Stamping-and-Naming.md section 4.
 */
export async function submitWork(
  studentId: string,
  kind: 'exh' | 'essay',
  file: { name: string; mime: string; bytes: number },
  declaredWords: number,
  declarations: { anonymous: boolean; underLimit: boolean },
) {
  const { session } = await asOwner(studentId)
  const limit = kind === 'exh' ? EXHIBITION_WORD_LIMIT : ESSAY_WORD_LIMIT
  const what = kind === 'exh' ? 'exhibition' : 'essay'

  if (!declarations.anonymous || !declarations.underLimit) {
    return { message: 'Tick both boxes before you file — they are what you are declaring.' }
  }
  if (!Number.isFinite(declaredWords) || declaredWords <= 0) {
    return { message: 'Put in your word count. You count it, before you file.' }
  }
  if (declaredWords > limit) {
    return {
      message: `You have declared ${declaredWords.toLocaleString()} words and the limit is `
        + `${limit.toLocaleString()}. Cut it before you file.`,
    }
  }
  if (!/\.pdf$/i.test(file.name) && file.mime !== 'application/pdf') {
    return { message: 'It has to be a PDF.' }
  }

  const track = await repo.getTrack(session.school.id, studentId, { includeIdentifiers: true })
  const preflight = anonymityPreflight({
    personalCode: track?.student.personalCode ?? null,
    identifiersState: track?.student.identifiersState ?? 'missing',
    declaredWords,
    wordLimit: limit,
    declarations,
  })
  // `waiting` never blocks — a student cannot be held back because the school
  // has not bought cloud storage yet.
  if (!preflightPasses(preflight)) {
    return { message: `Your ${what} cannot be filed yet: ${preflight.find((p) => p.status === 'fail')?.detail}` }
  }

  const stored = await storage.put(file, { schoolId: session.school.id, studentId })
  await repo.tok.submitFile(session.school.id, studentId, kind, {
    fileName: file.name,
    declaredWords,
    storageKey: stored?.key,
    bytes: file.bytes,
  })
  refresh()
  return { message: null }
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

/**
 * WHO MAY WRITE A TOK MARK — and it is the IA rule, unchanged.
 *
 * Michael, 21 Aug: "who marks? TOK teacher." So the designated marker of the
 * TOK section writes, co-teachers read, and a `marks.override` holder writes
 * only while holding a live, reasoned 30-minute unlock. Reusing
 * `marksWriteGrant` rather than writing a second rule is the point: with one
 * TOK teacher the two are indistinguishable, and the day a second arrives they
 * are not.
 */
async function asMarker(studentId: string) {
  const session = await getSession()
  const cohort = await repo.setup.cohortOf(session.school.id, { studentId })
  assertLiveCohort(cohort)
  const grant = await marksWriteGrant(
    repo.ia, session.can, session.school.id, 'tok', cohort.id, studentId, session.user.id,
  )
  if (!grant.allowed) {
    throw new Error('Only the designated TOK marker can write these marks.')
  }
  return { session, cohortId: cohort.id, grant }
}

export async function saveTokMark(
  studentId: string,
  kind: 'exh' | 'essay',
  mark: number | null,
) {
  const { session, grant } = await asMarker(studentId)
  await repo.tok.saveMark(session.school.id, studentId, kind, mark, {
    id: session.user.id, name: session.user.name, overrideReason: grant.overrideReason,
  })
  refresh()
}

export async function saveTokProse(
  studentId: string,
  kind: 'exh' | 'essay',
  input: { note: string; comment: string; authorship: AuthorshipConcern; authorshipNote?: string },
) {
  const { session } = await asMarker(studentId)
  await repo.tok.saveProse(session.school.id, studentId, kind, input, {
    id: session.user.id, name: session.user.name,
  })
  refresh()
}

/**
 * RELEASE — the TOK teacher, or the IB coordinator. Michael, 21 Aug:
 * "released by either teacher and/or IB coordinator." Follows the EE decision
 * of 19 Aug rather than routing every mark through one person in March.
 */
export async function releaseTokMark(studentId: string, kind: 'exh' | 'essay') {
  const session = await getSession()
  const cohort = await repo.setup.cohortOf(session.school.id, { studentId })
  assertLiveCohort(cohort)
  const grant = await marksWriteGrant(
    repo.ia, session.can, session.school.id, 'tok', cohort.id, studentId, session.user.id,
  )
  if (!grant.allowed && !session.can('tok.manage')) {
    throw new Error('Only the TOK teacher or a coordinator can release a TOK mark.')
  }
  const r = await repo.tok.releaseMark(session.school.id, studentId, kind, {
    id: session.user.id, name: session.user.name,
  })
  if (r.ok) refresh()
  return r
}

export async function revokeTokMark(studentId: string, kind: 'exh' | 'essay') {
  const session = await getSession()
  if (!session.can('scores.revoke')) throw new Error('You cannot revoke a released mark.')
  const cohort = await repo.setup.cohortOf(session.school.id, { studentId })
  assertLiveCohort(cohort)
  await repo.tok.revokeMark(session.school.id, studentId, kind, {
    id: session.user.id, name: session.user.name,
  })
  refresh()
}

// ---------------------------------------------------------------------------
// The essay screen — titles, the interaction lines, and the form
// ---------------------------------------------------------------------------

/**
 * Posting the six titles and signing a form are the TOK teacher's acts, not a
 * marker-per-candidate act — so they are checked against `tok.manage` OR
 * markership rather than through `marksWriteGrant`, which is per student.
 */
async function asTokTeacher(cohortId?: string) {
  const session = await getSession()
  const cohort = cohortId
    ? (await repo.setup.listCohorts(session.school.id)).find((c) => c.id === cohortId)
    : null
  if (cohort) assertLiveCohort(cohort)
  if (!session.can('tok.manage')) {
    throw new Error('Only the TOK teacher or a coordinator can do that.')
  }
  return session
}

export async function postTitles(
  cohortId: string,
  titles: { number: number; text: string }[],
) {
  const session = await asTokTeacher(cohortId)
  const r = await repo.tok.setTitles(session.school.id, cohortId, titles, {
    id: session.user.id, name: session.user.name,
  })
  if (r.ok) refresh()
  return r
}

export async function adoptStudentTitle(cohortId: string, text: string) {
  const session = await asTokTeacher(cohortId)
  const r = await repo.tok.adoptTitle(session.school.id, cohortId, text, {
    id: session.user.id, name: session.user.name,
  })
  if (r.ok) refresh()
  return r
}

/**
 * LOGGING A MEETING IS WHAT OPENS THE STUDENT'S BOX — so this is also the fix
 * for a student stuck behind a meeting nobody recorded, and the reason there is
 * no override on that gate. Record the meeting.
 */
export async function logInteraction(
  studentId: string,
  n: 1 | 2 | 3,
  lineKey: string,
  heldOn: string,
) {
  const { session } = await asMarker(studentId)
  const r = await repo.tok.logInteraction(session.school.id, studentId, n, lineKey, heldOn, {
    id: session.user.id, name: session.user.name,
  })
  if (r.ok) refresh()
  return r
}

export async function draftTeacherComment(studentId: string) {
  const { session } = await asMarker(studentId)
  return repo.tok.draftTeacherComment(session.school.id, studentId)
}

export async function saveTeacherComment(studentId: string, comment: string) {
  const { session } = await asMarker(studentId)
  await repo.tok.saveTeacherComment(session.school.id, studentId, comment, {
    id: session.user.id, name: session.user.name,
  })
  refresh()
}

/** "I confirm that my comments above are accurate." */
export async function signPpf(studentId: string) {
  const { session } = await asMarker(studentId)
  const r = await repo.tok.signPpf(session.school.id, studentId, {
    id: session.user.id, name: session.user.name,
  })
  if (r.ok) refresh()
  return r
}

export async function unsignPpf(studentId: string) {
  const session = await getSession()
  if (!session.can('items.unlock')) throw new Error('You cannot reopen a signed form.')
  const cohort = await repo.setup.cohortOf(session.school.id, { studentId })
  assertLiveCohort(cohort)
  await repo.tok.unsignPpf(session.school.id, studentId, {
    id: session.user.id, name: session.user.name,
  })
  refresh()
}

// ---------------------------------------------------------------------------
// The boundary table
// ---------------------------------------------------------------------------

/**
 * THE SCHOOL'S OWN A–E TABLE — Michael, 21 Aug: "Let the teacher set the
 * boundaries. They DO change."
 *
 * That decision is what makes the whole /30 path safe. No official table could
 * be found for any session and the sources that publish one disagree about
 * whether it moves, so the app asserts nothing about the IB's: it applies the
 * one the teacher entered, and says so on every letter it derives.
 */
export async function setBoundaries(
  cohortId: string,
  lower: { A: number; B: number; C: number; D: number },
) {
  const session = await asTokTeacher(cohortId)
  const r = await repo.tok.setBoundaries(session.school.id, cohortId, lower, {
    id: session.user.id, name: session.user.name,
  })
  if (r.ok) refresh()
  return r
}

/** Confirming an unchanged carried-forward table. One click — but a click. */
export async function confirmBoundaries(cohortId: string) {
  const session = await asTokTeacher(cohortId)
  await repo.tok.confirmBoundaries(session.school.id, cohortId, {
    id: session.user.id, name: session.user.name,
  })
  refresh()
}
