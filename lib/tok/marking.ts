// PURE MARKING RULES — no repository, no session, so the checkpoint exercises
// the same decisions the screens and the server actions apply.
// (lib/ee/scoring.ts is the pattern.)

import type { Instrument } from './rubric'
import { bandFor } from './rubric'
import type { AuthorshipConcern, TokMarkingRow } from './types'

/**
 * WHY A MARK CANNOT GO OUT YET.
 *
 * The comment is required, and that is not bureaucracy. The exhibition mark is
 * the one the school sends to the IB for moderation, and a moderator who
 * disagrees with it is answered by the justification against the instrument —
 * "an unjustified mark is a number, not a judgement." It is also the thing the
 * student reads, and releasing a bare number invites the argument the comment
 * exists to prevent.
 */
export function releaseBlockers(input: {
  mark: number | null | undefined
  comment: string | null | undefined
  filed: boolean
}): string[] {
  const out: string[] = []
  if (!input.filed) out.push('Nothing has been filed to mark.')
  if (input.mark == null) out.push('No mark entered.')
  if (!input.comment?.trim()) {
    out.push('No comment for the student — the mark goes to the IB, and an unjustified mark is a number rather than a judgement.')
  }
  return out
}

export const canRelease = (input: Parameters<typeof releaseBlockers>[0]): boolean =>
  releaseBlockers(input).length === 0

/** The four tiles above the list. Derived, never stored. */
export function summariseMarking(rows: TokMarkingRow[]): {
  candidates: number
  filed: number
  marked: number
  released: number
  flagged: number
} {
  return {
    candidates: rows.length,
    filed: rows.filter((r) => r.file != null).length,
    marked: rows.filter((r) => r.mark != null).length,
    released: rows.filter((r) => r.releasedAt != null).length,
    // Not a queue and not a threshold — a count of a thing a marker recorded.
    flagged: rows.filter((r) => r.prose?.authorship && r.prose.authorship !== 'none').length,
  }
}

/** How many candidates chose each prompt. Falls out of the data; no extra screen. */
export function promptDistribution(rows: TokMarkingRow[]): { number: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const r of rows) {
    if (r.promptNumber == null) continue
    counts.set(r.promptNumber, (counts.get(r.promptNumber) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count || a.number - b.number)
}

export const bandLevel = (instrument: Instrument, mark: number | null | undefined): string =>
  bandFor(instrument, mark)?.level ?? ''

export const isFlagged = (a: AuthorshipConcern | undefined): boolean => a != null && a !== 'none'
