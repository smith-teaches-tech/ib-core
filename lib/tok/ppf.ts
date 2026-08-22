// THE TK/PPF's TEACHER HALF — composing the one comment, and signing it.
//
// The official form (read from the blank PDF in Michael's own Drive) has three
// CANDIDATE comment boxes and exactly ONE `Teacher's comments:` box, above two
// declarations. So the teacher writes one thing, once, per candidate — and in a
// cohort of 24 that is 24 blank boxes in March unless something helps.
//
// What helps is the record the teacher has already been keeping: one picked
// line per interaction, across the year. Those three lines compose a draft of
// the comment. THE YEAR'S SMALL ACTS BECOME THE FORM.
//
// The draft is a starting point and says so. Nobody signs a machine's sentence
// without reading it, and the form's own declaration is "I confirm that my
// comments above are accurate" — which is a claim only a person can make.

import { INTERACTION_LINES, interactionLine } from './types'
import type { InteractionNumber, TokPpfView } from './types'

export interface ComposeInput {
  studentName: string
  /** What the teacher logged, in order. A missing entry means never logged. */
  logged: { n: InteractionNumber; lineKey?: string; note?: string; heldOn: string }[]
}

const firstNameOf = (name: string): string => {
  const raw = name.trim()
  if (raw.includes(',')) return raw.split(',').slice(1).join(',').trim().split(/\s+/)[0] ?? raw
  return raw.split(/\s+/)[0] ?? raw
}

/**
 * A DRAFT, in the teacher's register rather than a template's. Dates included,
 * because the form asks for them and because "on 14 October" is the detail that
 * makes a comment read as a record rather than a formula.
 */
export function composeTeacherComment(input: ComposeInput): string {
  const first = firstNameOf(input.studentName)
  const ordered = [...input.logged].sort((a, b) => a.n - b.n)
  if (ordered.length === 0) return ''

  // A FREE-TEXT NOTE WINS OVER THE OLD DROPDOWN CLAUSE, and the fallback
  // survives because the graduated cohort's logs were written with the list.
  const sentences = ordered.map((l) => {
    const typed = l.note?.trim()
    if (typed) return `On ${l.heldOn}, ${typed.replace(/\.$/, '')}.`
    const line = l.lineKey ? interactionLine(l.n, l.lineKey) : null
    return `On ${l.heldOn}, ${line?.clause ?? 'we met'}.`
  })

  // A LOGGED MEETING COUNTS AS HELD unless the old list says otherwise. Free
  // text cannot carry a boolean, and inventing one by reading the words would
  // be a machine guessing at a teacher's meaning.
  const held = ordered.filter(
    (l) => (l.note?.trim() ? true : (l.lineKey ? interactionLine(l.n, l.lineKey)?.held : false) ?? false),
  ).length
  const opening = held === 3
    ? `${first} engaged with the essay process across three recorded interactions.`
    : held === 0
      ? `No interactions with ${first} were recorded.`
      : `${first} took part in ${held} of the three recorded interactions.`

  return [opening, ...sentences].join(' ')
}

/**
 * WHY THE FORM CANNOT BE SIGNED YET. Only two things are hard blockers, and
 * both are the teacher's own doing.
 */
export function signBlockers(view: {
  comment: string | null | undefined
  signedAt: string | null | undefined
}): string[] {
  const out: string[] = []
  if (view.signedAt) out.push('Already signed.')
  if (!view.comment?.trim()) out.push('Write your comment on the form before signing it.')
  return out
}

/**
 * WHAT IS INCOMPLETE, BUT DOES NOT BLOCK.
 *
 * A student who never wrote up an interaction leaves the form short — and the
 * IB publishes no guidance on that, with sources disagreeing on whether an
 * incomplete form even blocks submission. So it is a WARNING to the teacher,
 * never a refusal: a coordinator in May must be able to send a short form
 * rather than no form.
 *
 * Honesty is preserved elsewhere: the export's TK/PPF job counts all three
 * interactions AND the sign-off, so a signed-but-short form still reads
 * not-ready. Signing never makes the pack lie. Asserted.
 */
export function signWarnings(view: TokPpfView): string[] {
  const out: string[] = []
  const missing = view.interactions.filter((i) => i.entry == null)
  if (missing.length > 0) {
    out.push(
      `${missing.length} of 3 interactions ${missing.length === 1 ? 'has' : 'have'} not been `
      + `written up by the student (${missing.map((i) => i.n).join(', ')}). You can still sign — `
      + 'the export will report the form as short until they are in.',
    )
  }
  const notHeld = view.interactions.filter(
    (i) => i.logged && !i.logged.held,
  )
  if (notHeld.length > 0) {
    out.push(
      `${notHeld.length} interaction${notHeld.length === 1 ? '' : 's'} recorded as not held. `
      + 'The IB gives no guidance on a missed interaction; this is a school record, not a penalty.',
    )
  }
  return out
}

export const canSign = (view: TokPpfView): boolean =>
  signBlockers({ comment: view.comment, signedAt: view.signedAt }).length === 0

/** Every line, for the dropdown. Re-exported so screens import one module. */
export { INTERACTION_LINES }
