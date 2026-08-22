// RETURN WITH A NOTE — one verb, over the spine, for every module that reads a
// paper.
//
// Michael, 22 Aug: *"Return with note is an event, not a log (too much
// noise)."* That sentence is the whole design. CAS has a thread per experience
// because a CAS experience IS a conversation; an IA, an EE and a TOK essay are
// not. What a marker does when the wrong file turns up is a single act with a
// single sentence attached, and the record of it should be one row.
//
// THREE MOVES, and they are the three IB-Student-Work-Files.md §5 asked for:
//
//   1. The record goes back to NOT IN. The box on the board goes tan again and
//      the candidate reappears on every outstanding list — because they are
//      outstanding. A returned paper that still reads as filed is the bug this
//      exists to prevent.
//   2. THE NOTE IS REQUIRED, and it is written where the student will read it.
//      A return with no note is "do it again" with no way to know what to do,
//      so the write refuses one.
//   3. The transition is on the record, with who and when.
//
// AND ONE THING IT DOES NOT DO: it does not delete the file. The paper that was
// returned is superseded and kept (lib/files.ts), because "what exactly did you
// send back, and when" is asked months later — usually by the person who sent
// it.
//
// NOTHING IS SENT. There is no email, no push, no message. Saying "the student
// has been notified" when no notification exists would be a lie the screen
// tells on the school's behalf, so the screens say the opposite in as many
// words: the note appears on the student's own page, and it is the student's
// page they have to open.

import type { Id, RequirementState } from './types'
import { fileOf } from './files'

/**
 * ONE RETURN. Append-only: nothing edits one and nothing deletes one, on the
 * same terms as MarkEvent (lib/ia/types.ts).
 *
 * `at` is a full ISO instant rather than the spine's date-only stamp, because
 * "returned twice on the same day" is a real sequence and a date cannot order
 * it.
 */
export interface ReturnEvent {
  id: Id
  schoolId: Id
  cohortId: Id
  studentId: Id
  /** WHICH RECORD came back. The def, not the module — this is spine-level. */
  requirementDefId: Id
  /**
   * What the returned file was called. A copy of the artifact's name on
   * purpose, and the ONLY thing copied: the file itself stays on the state,
   * superseded. Without the name the trail reads "something was returned".
   */
  fileName: string
  /** Required, non-empty. The one thing the student can act on. */
  note: string
  byUserId: Id
  byName: string
  at: string
}

/** What a screen shows about a return, and nothing else. */
export interface ReturnView {
  at: string
  byName: string
  note: string
  fileName: string
}

const newestFirst = (a: ReturnEvent, b: ReturnEvent) => b.at.localeCompare(a.at)

/**
 * THE RETURN THAT IS STILL OUTSTANDING — derived, never stored.
 *
 * A return is outstanding while nothing has been filed since. There is no
 * "resolved" flag to set and therefore none to forget to set: the student
 * uploading again is what closes it, because the upload puts a live file back
 * on the state and `fileOf` starts answering. Invariant #2, applied to a
 * workflow rather than to a number.
 *
 * Returns older than the live file stay in `history` — they are what happened,
 * and the third time a paper comes back is a fact somebody wants.
 */
export function outstandingReturn(
  events: ReturnEvent[],
  state: RequirementState | null | undefined,
): ReturnView | null {
  if (fileOf(state) != null) return null
  const e = [...events].sort(newestFirst)[0]
  return e ? { at: e.at, byName: e.byName, note: e.note, fileName: e.fileName } : null
}

/** Every return on a record, newest first. */
export function returnHistory(events: ReturnEvent[]): ReturnView[] {
  return [...events]
    .sort(newestFirst)
    .map((e) => ({ at: e.at, byName: e.byName, note: e.note, fileName: e.fileName }))
}

/** The refusal, in one place, so all three modules refuse in the same words. */
export const NOTE_REQUIRED =
  'A return needs a note — it is the only thing the student can act on.'

export const NOTHING_TO_RETURN =
  'There is nothing filed to return.'

/** Shown wherever the button is. No message is sent, and the screen says so. */
export const NO_MESSAGE_SENT =
  'Nothing is sent — the note appears on the student’s own page, where they will see the ' +
  'component is outstanding again.'
