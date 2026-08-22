// PURE IA MARKING RULES — no repository, no session, so the checkpoint
// exercises the same decisions the grid and the server actions apply.
// (lib/tok/marking.ts and lib/ee/scoring.ts are the pattern.)

import type { ReleaseBlock } from '../release'

/**
 * WHY AN IA MARK CANNOT GO OUT YET.
 *
 * The same three questions TOK asks, for the same reasons, and one of them is a
 * standing rule of this product: A MARK CANNOT BE RELEASED WITHOUT A COMMENT.
 * The IA mark is the one the school sends to IBIS for moderation, so the
 * justification is what answers a moderator who marks it differently — and it
 * is what the candidate reads. A bare number invites exactly the argument the
 * comment exists to settle.
 *
 * The paper matters too, and for an IA it matters more than anywhere else: a
 * mark with no file is the dangerous state the grid already flags, because
 * there is nothing for the moderator to be shown. Releasing one tells a
 * candidate a number that nobody could defend.
 *
 * NOTE ON `filed` FOR THE ORAL FAMILIES: the individual oral's recording is
 * made and filed by the TEACHER (RequirementDef.producedBy), so this blocker
 * asks whether the recording exists — not whether the candidate did anything.
 * It is the same question either way, which is why there is no second rule.
 */
export function releaseBlockers(input: {
  total: number | null | undefined
  comment: string | null | undefined
  filed: boolean
}): ReleaseBlock[] {
  const out: ReleaseBlock[] = []
  if (input.total == null) {
    out.push({ key: 'mark', message: 'No mark entered — every criterion has to be in.' })
  }
  if (!input.comment?.trim()) {
    out.push({
      key: 'comment',
      message:
        'No comment for the candidate — the mark goes to IBIS for moderation, and an unjustified mark is a number rather than a judgement.',
    })
  }
  if (!input.filed) {
    out.push({
      key: 'file',
      message: 'Nothing is filed — a mark with no paper under it is one nobody can defend.',
    })
  }
  return out
}

/**
 * What a batch release did. Skips rather than fails, the same shape as
 * `setJobSubmitted`: a class of twenty where two are unjustified releases the
 * eighteen and SAYS SO about the two. Refusing all twenty because of two
 * teaches people to stop using the button.
 */
export interface BatchRelease {
  released: number
  skipped: { studentId: string; name: string; blockers: ReleaseBlock[] }[]
}
