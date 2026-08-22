// WHAT RELEASE MEANS, in one place.
//
// Release is the act of putting a mark and its justification in front of the
// candidate. Three modules do it — EE, TOK and IA — and until 22 Aug 2026 they
// agreed only on the WORD: two functions called `releaseBlockers` with
// different signatures and different return types, one enforced in the action
// and one in the repository. This file is the contract they share.
//
// What is deliberately NOT here: the rules themselves. A module says what its
// own release requires, because it is the only thing that knows — the EE wants
// two attestation ticks and forty characters of justification, TOK wants a
// filed commentary, an IA wants a paper the moderator could actually be shown.
// One SHAPE, three rule sets.
//
// The one thing genuinely common is on the READ, not the write:
// `unreleased()` in the track read redacts the value of any mark that is not
// released, for every module at once. Nothing here duplicates that.

/**
 * One reason a mark cannot go out yet.
 *
 * Structured rather than a string because a BATCH release has to report which
 * candidates it skipped and why — a joined sentence cannot be listed per
 * candidate, and "18 released, 2 skipped" with no reasons is a dead end.
 */
export interface ReleaseBlock {
  key: string
  message: string
}

/** Convenience the buttons use: is this releasable at all? */
export const canRelease = (blockers: ReleaseBlock[]): boolean => blockers.length === 0
