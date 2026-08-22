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

// ---------------------------------------------------------------------------
// THE PROCESS — what happens before there is anything to mark
// ---------------------------------------------------------------------------

/**
 * TOK'S OWN PROCESS, the same idea as the EE's and deliberately not the same
 * list — a module says what its steps are, because it is the only thing that
 * knows.
 *
 * Michael, 22 Aug: *"I feel the TOK grading view needs a process as well. Title
 * chosen, draft uploaded (google doc) and then final… And where teacher can see
 * students response to TK/PPF and add their own."*
 *
 * THE ESSAY: six steps, interleaved for the same reason the EE's are — the
 * third interaction is the one where the draft gets read, so the draft has to
 * come before it. The exhibition has two, because that is all it has: choose a
 * prompt, file the exhibition. A module with a short process gets a short one
 * rather than a padded one.
 *
 * ⚠ THE INTERACTIONS ARE THE CANDIDATE'S WRITE-UPS, not the teacher's log. The
 * TK/PPF is what goes to the IB and it is what "done" means here. The teacher's
 * line is shown beside it as corroboration and counts for nothing — see
 * `interactionOpen` for why they were decoupled.
 */
export type TokStepKey = 'title' | 'ppf1' | 'ppf2' | 'draft' | 'ppf3' | 'essay' | 'prompt' | 'exh'

export interface TokStep {
  key: TokStepKey
  label: string
  owner: 'student' | 'staff'
  done: boolean
  at: string | null
}

export function tokProcessSteps(
  row: {
    promptNumber: number | null
    title: { number: number | null; text: string } | null
    file: { submittedAt: string } | null
    draftHref?: string | null
    ppf?: { interactions: { n: number; entry: { submittedAt: string } | null }[] }
  },
  kind: 'exh' | 'essay',
): TokStep[] {
  const step = (
    key: TokStepKey, label: string, owner: 'student' | 'staff', at: string | null, done?: boolean,
  ): TokStep => ({ key, label, owner, done: done ?? at != null, at })

  if (kind === 'exh') {
    return [
      step('prompt', 'IA prompt chosen', 'student', null, row.promptNumber != null),
      step('exh', 'Exhibition filed', 'student', row.file?.submittedAt ?? null),
    ]
  }

  const entry = (n: number) => row.ppf?.interactions.find((x) => x.n === n)?.entry ?? null
  return [
    step('title', 'Title chosen', 'student', null, row.title != null),
    step('ppf1', 'TK/PPF 1', 'student', entry(1)?.submittedAt ?? null),
    step('ppf2', 'TK/PPF 2', 'student', entry(2)?.submittedAt ?? null),
    // THE ONE DRAFT the IB permits a teacher to comment on. A link, never a
    // requirement def — Michael, 21 Aug: "only TOK teacher needs it."
    step('draft', 'Draft link', 'student', null, Boolean(row.draftHref)),
    step('ppf3', 'TK/PPF 3', 'student', entry(3)?.submittedAt ?? null),
    step('essay', 'Essay filed', 'student', row.file?.submittedAt ?? null),
  ]
}

export function tokNextStep(steps: TokStep[]): TokStep | null {
  return steps.find((s) => !s.done) ?? null
}
