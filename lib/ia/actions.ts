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

/**
 * RETURN THE PAPER, WITH A NOTE.
 *
 * The marker's gate, not the coordinator's: the person reading the paper is the
 * person who can tell it is the wrong one, and making them find a coordinator
 * to say so is how the wrong file stays up for three weeks. Same `allowWrite`
 * as a mark, because it IS a write on this candidate's record.
 *
 * The refusals (empty note, nothing filed) come back from the repository
 * unchanged — one wording, three modules (lib/returns.ts).
 */
export async function returnWithNote(
  courseId: string,
  cohortId: string,
  studentId: string,
  note: string,
) {
  const session = await need('ia.manage')
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await allowWrite(session, courseId, cohortId, studentId)
  await repo.returns.returnWithNote(
    session.school.id, studentId, `${courseId}.file`, note, session.user.id,
  )
  refresh()
}

/**
 * RELEASE — the marker, or a coordinator riding an unlock. The same gate as
 * entering the mark, and deliberately so: the person who decided the number is
 * the person who decides the candidate may see it. Michael, 22 Aug: "batch
 * release OR per student release. By teacher. Not a requirement."
 *
 * NOT REQUIRED means exactly that — nothing downstream waits on it. IBIS
 * transcription rides `exportStatus`, so marks reach the IB whether or not a
 * candidate ever saw them, and a teacher who hands results back in class can
 * ignore this entirely.
 *
 * The refusal comes back as a LIST rather than a throw, because the batch
 * below has to say which candidates it skipped and why.
 */
export async function releaseMark(courseId: string, cohortId: string, studentId: string) {
  const session = await need('ia.manage')
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await allowWrite(session, courseId, cohortId, studentId)
  const r = await repo.ia.releaseMark(
    session.school.id, courseId, cohortId, studentId, session.user.id,
  )
  if (r.ok) refresh()
  return r
}

/** The whole class. Releases what qualifies and reports what it skipped. */
export async function releaseCourse(courseId: string, cohortId: string) {
  const session = await need('ia.manage')
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  // Course-wide, so it is checked course-wide: the designated marker of this
  // course, or a coordinator's unlock. Not a per-candidate grant.
  const marker = await repo.ia.isMarkerFor(
    session.school.id, courseId, cohortId, session.user.id,
  )
  const unlock = await repo.ia.activeUnlock(session.school.id, courseId, session.user.id)
  if (!marker && !unlock) {
    throw new Error(
      'Only the designated marker releases this course\u2019s marks. ' +
        'A coordinator can unlock editing, with a reason, from the course page.',
    )
  }
  const out = await repo.ia.releaseCourse(
    session.school.id, courseId, cohortId, session.user.id,
  )
  refresh()
  return out
}

/**
 * REVOKE — the oversight capability, not the marker's. Taking a mark back off
 * a candidate who has already read it is a different act from giving it to
 * them, and `scores.revoke` is off in every preset by default. Same rule as
 * TOK and the EE.
 */
export async function revokeMark(courseId: string, cohortId: string, studentId: string) {
  const session = await need('scores.revoke')
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await repo.ia.revokeMark(
    session.school.id, courseId, cohortId, studentId, session.user.id,
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

// ---------------------------------------------------------------------------
// The IBIS moderation sample
// ---------------------------------------------------------------------------

/**
 * Who may touch a course's sample: its DESIGNATED MARKER (they know which
 * candidates IBIS named for their course) or a `sample.import` holder — the
 * coordinator tier. Re-checked here, whatever the screen showed.
 */
async function allowSample(session: Session, courseId: string, cohortId: string) {
  const marker = await repo.ia.isMarkerFor(
    session.school.id, courseId, cohortId, session.user.id,
  )
  if (!marker && !session.can('sample.import')) {
    throw new Error(
      'Only the designated marker or a coordinator with sample.import records the moderation sample.',
    )
  }
}

export async function saveSampleRequest(
  courseId: string,
  cohortId: string,
  studentIds: string[],
) {
  const session = await getSession()
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await allowSample(session, courseId, cohortId)
  await repo.ia.saveSampleRequest(
    session.school.id, courseId, cohortId, studentIds, session.user.id,
  )
  refresh()
}

/** Flip the sample to submitted-in-eCoursework (or reopen it — the "amend"). */
export async function setSampleSubmitted(courseId: string, cohortId: string, on: boolean) {
  const session = await getSession()
  await live(session.school.id, cohortId)
  await courseInCohort(session.school.id, courseId, cohortId)
  await allowSample(session, courseId, cohortId)
  await repo.ia.setSampleSubmitted(
    session.school.id, courseId, cohortId, on, session.user.id,
  )
  refresh()
}
