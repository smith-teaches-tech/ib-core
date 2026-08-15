'use server'

// Every CAS write goes through here, and every one of them re-checks the
// permission on the server.
//
// The client hides buttons the user can't press. That is courtesy, not
// security — lib/capabilities.ts says so in its own comment, and this file is
// where that promise is kept. When a real database arrives, the same rule has to
// be written a third time in RLS / Security Rules.

import { revalidatePath } from 'next/cache'
import { repo } from '../data'
import { getSession } from '../session'
import { storage } from '../storage'
import type { ExperienceStatus, IndicatorValue, InterviewKind, LoKey, Strand } from './types'
import { isArchived } from '../cohorts'

function refresh() {
  revalidatePath('/', 'layout')
}

/** Staff actions: one capability, checked here rather than trusted from the UI. */
async function asStaff() {
  const session = await getSession()
  if (!session.can('cas.manage')) throw new Error('You do not have permission to manage CAS.')
  return session
}

/** An archived year group is a record, not a workspace. See lib/setup/actions.ts. */
async function live(schoolId: string, studentId: string) {
  const cohort = await repo.setup.cohortOf(schoolId, { studentId })
  if (cohort && isArchived(cohort)) {
    throw new Error(`${cohort.label} is archived — it is a record and cannot be changed.`)
  }
}

/** Student actions: you may only ever write to your own record. */
async function asOwner(experienceId: string) {
  const session = await getSession()
  const view = await repo.cas.getStudentView(session.school.id, session.user.id)
  const mine = view?.experiences.some((v) => v.experience.id === experienceId)
  if (!mine) throw new Error('That is not your experience.')
  return session
}

// ---------------------------------------------------------------------------
// The student's own record
// ---------------------------------------------------------------------------

export async function createExperience(input: {
  title: string
  description: string
  strands: Strand[]
  isProject: boolean
  claimedOutcomes: LoKey[]
  submit: boolean
}) {
  const session = await getSession()
  if (!input.title.trim() || input.strands.length === 0) {
    throw new Error('An experience needs a title and at least one strand.')
  }
  await repo.cas.createExperience(
    session.school.id,
    session.user.id,
    { ...input, title: input.title.trim(), description: input.description.trim() },
    session.user.name,
  )
  refresh()
}

export async function addReflection(experienceId: string, body: string) {
  const session = await asOwner(experienceId)
  if (!body.trim()) return
  await repo.cas.addReflection(session.school.id, experienceId, body.trim(), session.user.name)
  refresh()
}

export async function editReflection(entryId: string, experienceId: string, body: string) {
  const session = await asOwner(experienceId)
  if (!body.trim()) return
  await repo.cas.editReflection(session.school.id, entryId, body.trim(), session.user.name)
  refresh()
}

/**
 * Evidence. The bytes never leave the browser today — the StorageAdapter is a
 * stub — so the client sends the file's identity and the server records it.
 *
 * When cloud storage arrives this becomes a FormData upload and lib/storage.ts
 * changes; this signature and every screen above it stay as they are.
 *
 * FILES ARE OPTIONAL. A note on its own is a valid evidence entry, because a
 * link to a video, a news article or a shared album is evidence — and a link
 * pasted in the note is the same thing as a link in a field of its own, with
 * one fewer place to look for it.
 */
export async function addEvidence(
  experienceId: string,
  files: { name: string; mime: string; bytes: number }[],
  note: string,
) {
  const session = await asOwner(experienceId)
  if (files.length === 0 && !note.trim()) return
  const refs = []
  for (const f of files) {
    refs.push(await storage.put(f, { schoolId: session.school.id, studentId: session.user.id }))
  }
  await repo.cas.addEvidence(session.school.id, experienceId, refs, note.trim(), session.user.name)
  refresh()
}

export async function submitForApproval(experienceId: string) {
  const session = await asOwner(experienceId)
  await repo.cas.setExperienceStatus(session.school.id, experienceId, 'submitted', {
    by: session.user.name,
  })
  refresh()
}

/** Route 1 to completion: generate the secure link. Sending it needs email. */
export async function emailSupervisor(experienceId: string, email: string) {
  const session = await asOwner(experienceId)
  if (!email.includes('@')) throw new Error('That does not look like an email address.')
  const request = await repo.cas.requestSupervisor(
    session.school.id, experienceId, email.trim(), session.user.name,
  )
  refresh()
  return request.token
}

/** Route 2: the paper form, photographed and uploaded, for the coordinator. */
export async function paperFormUploaded(experienceId: string) {
  const session = await asOwner(experienceId)
  await repo.cas.markPaperFormUploaded(session.school.id, experienceId, session.user.name)
  refresh()
}

// ---------------------------------------------------------------------------
// The coordinator
// ---------------------------------------------------------------------------

export async function setExperienceStatus(
  experienceId: string,
  status: ExperienceStatus,
  opts: { note?: string; reason?: string } = {},
) {
  const session = await asStaff()
  if (status === 'returned' && !opts.note?.trim()) {
    throw new Error('Returning an experience needs a note the student can act on.')
  }
  if (opts.reason !== undefined && !opts.reason.trim()) {
    throw new Error('Reopening needs a typed reason — it goes on the record and to the student.')
  }
  await repo.cas.setExperienceStatus(session.school.id, experienceId, status, {
    ...opts,
    by: session.user.name,
  })
  refresh()
}

export async function completeOnBehalf(
  experienceId: string,
  confirmedOutcomes: LoKey[],
  comment: string,
) {
  const session = await asStaff()
  if (confirmedOutcomes.length === 0) {
    throw new Error('Confirm at least one outcome — completing with none records nothing.')
  }
  await repo.cas.completeOnBehalf(
    session.school.id, experienceId, confirmedOutcomes, comment.trim(), session.user.name,
  )
  refresh()
}

export async function saveInterview(
  studentId: string,
  kind: InterviewKind,
  notes: string,
  conductedOn: string,
) {
  const session = await asStaff()
  await live(session.school.id, studentId)
  if (!notes.trim()) throw new Error('An interview record needs notes.')
  await repo.cas.saveInterview(
    session.school.id, studentId, kind, notes.trim(), conductedOn, session.user.name,
  )
  refresh()
}

export async function unlockInterview(interviewId: string, reason: string) {
  const session = await getSession()
  // A second, narrower capability: managing CAS is not the same as being able
  // to reopen a locked record.
  if (!session.can('items.unlock')) throw new Error('You cannot unlock locked items.')
  if (!reason.trim()) throw new Error('Unlocking needs a reason.')
  await repo.cas.unlockInterview(session.school.id, interviewId, reason.trim(), session.user.name)
  refresh()
}

export async function setIndicator(studentId: string, value: IndicatorValue | null) {
  const session = await asStaff()
  await live(session.school.id, studentId)
  await repo.cas.setIndicator(session.school.id, studentId, value, session.user.name)
  refresh()
}

export async function addNote(studentId: string, body: string) {
  const session = await asStaff()
  await live(session.school.id, studentId)
  await repo.cas.addNote(session.school.id, studentId, body.trim(), session.user.name)
  refresh()
}

export async function setCasComplete(studentId: string, complete: boolean) {
  const session = await asStaff()
  await live(session.school.id, studentId)
  await repo.cas.setCasComplete(session.school.id, studentId, complete, session.user.name)
  refresh()
}

// ---------------------------------------------------------------------------
// The supervisor — no session, no account. The token is the scope.
// ---------------------------------------------------------------------------

export async function supervisorSignOff(
  token: string,
  input: { confirmedOutcomes: LoKey[]; comment: string; signature: string },
) {
  if (input.confirmedOutcomes.length === 0) {
    throw new Error('Please confirm at least one outcome, or close this page without signing.')
  }
  if (!input.signature.trim()) throw new Error('Please type your name as a signature.')
  const ok = await repo.cas.signOff(token, input)
  if (!ok) throw new Error('This link has expired or has already been used.')
  refresh()
  return true
}
