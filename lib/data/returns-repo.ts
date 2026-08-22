// The fixture implementation of ReturnsRepository — return-with-note, once,
// for IA, EE and TOK.
//
// A factory over the spine, like the IA and deadline ones. It is deliberately
// NOT three module methods: the act is identical in all three places (a marker
// has a paper open, it is the wrong one, it goes back with a sentence), and
// three copies of it would drift the moment one of them learned something the
// others did not.
//
// WHAT IT TOUCHES, and nothing else:
//
//   · the RequirementState — file superseded, status back to not_started,
//     lock cleared so the student can actually refile
//   · the module's filing row, through `detachFiling` — see below
//   · one appended ReturnEvent
//
// WHY `detachFiling` IS A CALLBACK. EE and TOK keep a row beside the state
// (EeFinal, TokFile) carrying facts the spine has no business holding — the
// declared word count, who reopened it and why. Those rows ARE the module's
// answer to "is something filed", so a return has to remove one or the roster
// keeps drawing a filed essay that is not there. This repository does not know
// what those rows are and must not; it says "this record is no longer filed"
// and the module does its own bookkeeping. IA passes a no-op, because the IA
// file has no row — the state is the whole of it.

import type { RequirementDef, RequirementState, Student, User } from '../types'
import type { ReturnEvent, ReturnView } from '../returns'
import { fileOf } from '../files'
import { outstandingReturn, NOTE_REQUIRED, NOTHING_TO_RETURN } from '../returns'

export interface ReturnsRepository {
  /**
   * Send one record back. `defKey` is the requirement's key — `ee.final`,
   * `tok.essay`, `<courseId>.file` — resolved against the student's own cohort
   * here rather than trusted as an id from a screen.
   *
   * Throws on an empty note and on a record with nothing filed. Both are
   * refusals a caller should let reach the user unchanged.
   */
  returnWithNote(
    schoolId: string, studentId: string, defKey: string, note: string, byUserId: string,
  ): Promise<ReturnEvent>
  /** The return still outstanding on one record — null once they have refiled. */
  outstandingFor(
    schoolId: string, studentId: string, defKey: string,
  ): Promise<ReturnView | null>
  /** Every return on one record, newest first. */
  listFor(schoolId: string, studentId: string, defKey: string): Promise<ReturnEvent[]>
  /**
   * One key across a whole year group, for a roster — keyed by student id, and
   * ABSENT rather than null where there is nothing outstanding, so a caller
   * cannot accidentally read "returned" out of a key that merely exists.
   */
  outstandingIn(
    schoolId: string, cohortId: string, defKey: string,
  ): Promise<Record<string, ReturnView>>
}

export function makeReturnsRepository(deps: {
  students: Student[]
  users: User[]
  defs: RequirementDef[]
  states: RequirementState[]
  events: ReturnEvent[]
  detachFiling: (schoolId: string, studentId: string, defKey: string) => void
  today: () => string
}): ReturnsRepository {
  const { students, users, defs, states, events, detachFiling, today } = deps

  const nameOf = (userId: string) => users.find((u) => u.id === userId)?.name ?? userId

  const defFor = (schoolId: string, studentId: string, defKey: string) => {
    const st = students.find((s) => s.userId === studentId && s.schoolId === schoolId)
    if (!st) return null
    return (
      defs.find(
        (d) => d.schoolId === schoolId && d.cohortId === st.cohortId && d.key === defKey,
      ) ?? null
    )
  }

  const stateFor = (schoolId: string, studentId: string, defId: string) =>
    states.find(
      (s) => s.schoolId === schoolId && s.studentId === studentId && s.requirementDefId === defId,
    ) ?? null

  const eventsFor = (schoolId: string, studentId: string, defId: string) =>
    events.filter(
      (e) => e.schoolId === schoolId && e.studentId === studentId && e.requirementDefId === defId,
    )

  return {
    async returnWithNote(schoolId, studentId, defKey, note, byUserId) {
      const body = note.trim()
      // FIRST, before anything is touched. A refusal that has already
      // superseded the file is not a refusal.
      if (!body) throw new Error(NOTE_REQUIRED)

      const def = defFor(schoolId, studentId, defKey)
      if (!def) throw new Error('That requirement does not exist for this candidate.')
      const state = stateFor(schoolId, studentId, def.id)
      const live = fileOf(state)
      if (!state || !live) throw new Error(NOTHING_TO_RETURN)

      const at = today()

      // THE FILE IS KEPT. Superseded, so `fileOf` stops answering and every
      // box that was green goes tan — and `filesOf` still has it, which is how
      // "what did you send back" gets answered in May.
      for (const a of state.artifacts) {
        if (a.kind === 'file' && a.supersededAt == null) a.supersededAt = at
      }

      // BACK TO NOT IN. recordStatus is derived from what is actually there
      // everywhere else in the app, and nothing is there now.
      state.recordStatus = 'not_started'
      // Filing is what locks EE and TOK. A returned paper the student cannot
      // replace is a dead end, so the lock goes with the filing.
      delete state.lockedAt
      // The last recorded act on this record IS the return, and it was staff.
      state.recordedBy = nameOf(byUserId)
      state.recordedAt = at

      detachFiling(schoolId, studentId, defKey)

      const event: ReturnEvent = {
        id: 're_' + (events.length + 1),
        schoolId,
        cohortId: def.cohortId,
        studentId,
        requirementDefId: def.id,
        fileName: live.ref.name,
        note: body,
        byUserId,
        byName: nameOf(byUserId),
        at: new Date().toISOString(),
      }
      events.push(event)
      return event
    },

    async outstandingFor(schoolId, studentId, defKey) {
      const def = defFor(schoolId, studentId, defKey)
      if (!def) return null
      return outstandingReturn(
        eventsFor(schoolId, studentId, def.id),
        stateFor(schoolId, studentId, def.id),
      )
    },

    async listFor(schoolId, studentId, defKey) {
      const def = defFor(schoolId, studentId, defKey)
      if (!def) return []
      return eventsFor(schoolId, studentId, def.id)
    },

    async outstandingIn(schoolId, cohortId, defKey) {
      const def = defs.find(
        (d) => d.schoolId === schoolId && d.cohortId === cohortId && d.key === defKey,
      )
      if (!def) return {}
      const out: Record<string, ReturnView> = {}
      for (const s of students.filter((x) => x.schoolId === schoolId && x.cohortId === cohortId)) {
        const v = outstandingReturn(
          eventsFor(schoolId, s.userId, def.id),
          stateFor(schoolId, s.userId, def.id),
        )
        if (v) out[s.userId] = v
      }
      return out
    },
  }
}
