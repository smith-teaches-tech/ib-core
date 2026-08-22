// EE SCORING — what may be marked, when, and what release requires.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE RULE THAT SHAPES THIS FILE
//
// Michael, 20 Aug: "Many teachers like to score everything but the reflection
// before the viva voce (so they don't need to read the essay three times) so
// they should not be locked from doing that."
//
// That is a real description of how marking actually happens, and it means the
// gate is PER CRITERION rather than per essay:
//
//   A · B · C · D  need the finished essay, and NOTHING ELSE. Not the viva, not
//                  the RPF. A supervisor reads the essay once, marks four
//                  criteria, and walks into the viva having already done it.
//   E              needs the RPF, because Criterion E is marked FROM the RPF.
//
// A single "can this be marked yet?" flag would have forced the supervisor to
// read the essay again after the viva, which is the thing the rule exists to
// prevent. `criterionMarks` is already `(number | null)[]`, so partial marking
// costs no new storage — only this decision, written down.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReleaseBlock } from '../release'
import { EE_CRITERIA, EE_MARK_MAX, indicativeGrade } from './rubric'

export interface MarkingGates {
  /** A–D: the essay is filed. */
  core: boolean
  /** E: the reflection statement is in. */
  reflection: boolean
  /** Why each is shut, for the screen to say rather than just disable. */
  coreReason: string | null
  reflectionReason: string | null
}

export function markingGates(input: { finalFiled: boolean; rpfIn: boolean }): MarkingGates {
  return {
    core: input.finalFiled,
    coreReason: input.finalFiled ? null : 'The finished essay has not been filed yet.',
    reflection: input.rpfIn,
    reflectionReason: input.rpfIn ? null : 'The student has not submitted their reflection yet.',
  }
}

/** Is this criterion markable right now? */
export function criterionOpen(key: string, gates: MarkingGates): boolean {
  return key === 'E' ? gates.reflection : gates.core
}

export interface ScoreSummary {
  /** Sum of what has been entered. NOT a total until every criterion is in. */
  soFar: number
  complete: boolean
  entered: number
  /** null until complete — a grade off a partial mark would be a lie. */
  total: number | null
  /** Indicative only; the IB publishes no 2027 boundaries yet. */
  band: 'A' | 'B' | 'C' | 'D' | 'E' | null
  max: number
}

export function summariseScore(marks: (number | null)[]): ScoreSummary {
  const entered = marks.filter((m) => m != null).length
  const soFar = marks.reduce<number>((n, m) => n + (m ?? 0), 0)
  const complete = entered === EE_CRITERIA.length
  return {
    soFar,
    entered,
    complete,
    total: complete ? soFar : null,
    band: complete ? indicativeGrade(soFar) : null,
    max: EE_MARK_MAX,
  }
}

// The shape moved to lib/release.ts on 22 Aug 2026 so IA could share it rather
// than become a third variant. The RULES below stay EE's own.
export type { ReleaseBlock } from '../release'

/**
 * WHAT RELEASE REQUIRES, in one place, so the button and the server agree.
 *
 * Release is the supervisor's (Michael, 19 Aug), and it puts a grade in front
 * of a student and into the predicted-grades bonus-point matrix. So it asks for
 * everything: five marks, both halves of the attestation, and the written
 * justification.
 */
export function releaseBlockers(input: {
  marks: (number | null)[]
  attestedSessions: boolean
  attestedAuthentic: boolean
  comment: string
}): ReleaseBlock[] {
  const out: ReleaseBlock[] = []
  const s = summariseScore(input.marks)
  if (!s.complete) {
    out.push({
      key: 'marks',
      message: `${s.entered} of ${EE_CRITERIA.length} criteria marked — Criterion ${
        EE_CRITERIA.find((c, i) => input.marks[i] == null)?.key ?? '?'
      } is still open.`,
    })
  }
  // TWO TICKS, NOT ONE. An acting supervisor covering for a colleague who left
  // can honestly confirm the work is authentic without claiming to have held
  // sessions they were not at (IB-Mobility-and-Transfers.md §3.6). Splitting
  // them lets the record be true rather than convenient.
  if (!input.attestedSessions) {
    out.push({ key: 'sessions', message: 'Confirm the required reflection sessions were held.' })
  }
  if (!input.attestedAuthentic) {
    out.push({ key: 'authentic', message: 'Confirm the work is the candidate’s own.' })
  }
  if (input.comment.trim().length < 40) {
    out.push({
      key: 'comment',
      message: 'Write a few sentences justifying the marks — examiners and moderators read it, and it is what an authenticity query is answered from.',
    })
  }
  return out
}

/** Pasted text carries smart quotes and non-breaking spaces; a count that
 *  disagrees with the student's own is worse than no count at all. */
export function countWords(text: string): number {
  const clean = text
    .replace(/ /g, ' ')
    .replace(/[‘’“”]/g, "'")
    .trim()
  return clean ? clean.split(/\s+/).length : 0
}

// ---------------------------------------------------------------------------
// SUPERVISION HOURS
// ---------------------------------------------------------------------------

/**
 * The IB's guidance is that supervision runs to a handful of hours, and ISG
 * caps it at five. Michael, 20 Aug: "Supervisors are also supposed to log hours
 * they spent with each student (up to 5). The school also needs this for paying
 * teachers."
 *
 * THAT SECOND SENTENCE IS WHY THIS IS A HARD CAP RATHER THAN A NUDGE. A number
 * that a school pays against is not a note to self; six hours entered here is a
 * claim the school would have to either honour or argue with. Refusing at the
 * point of entry is kinder than both.
 */
export const MAX_SUPERVISION_HOURS = 5

export function hoursProblem(hours: number | null): string | null {
  if (hours == null) return null
  if (!Number.isFinite(hours) || hours < 0) return 'Hours cannot be negative.'
  if (hours > MAX_SUPERVISION_HOURS) {
    return `The school logs up to ${MAX_SUPERVISION_HOURS} hours of supervision per candidate.`
  }
  return null
}

export interface SupervisorHours {
  supervisorId: string
  name: string
  students: number
  hours: number
  /** Candidates with no hours recorded yet — payroll needs to know what is missing. */
  missing: number
}

/**
 * Hours per supervisor, for the coordinator. Derived on read from the same
 * rows the roster shows, so it cannot drift from what a supervisor entered.
 */
export function supervisionHours(
  rows: {
    supervisor: { userId: string; name: string } | null
    scoring: { hoursSupervised: number | null } | null
  }[],
): SupervisorHours[] {
  const by = new Map<string, SupervisorHours>()
  for (const r of rows) {
    if (!r.supervisor) continue
    const cur = by.get(r.supervisor.userId) ?? {
      supervisorId: r.supervisor.userId,
      name: r.supervisor.name,
      students: 0,
      hours: 0,
      missing: 0,
    }
    cur.students += 1
    const h = r.scoring?.hoursSupervised
    if (h == null) cur.missing += 1
    else cur.hours += h
    by.set(r.supervisor.userId, cur)
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name))
}
