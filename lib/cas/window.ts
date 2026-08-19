// The CAS programme window — a pure function, kept out of the component so the
// checkpoint can assert it. CasProgress re-exports it, so nothing that already
// imported it from there has to change.

/**
 * The programme window: August of DP1 to the end of the April in which CAS must
 * be finished. Derived from the cohort's graduation year — never hardcoded, and
 * never inferred from the student's own posts (a late starter would get a
 * compressed line and look busy).
 *
 * `joinedAt` MOVES THE START for a student who did not begin with the cohort.
 * The window measures OPPORTUNITY, and a student who arrived in the January of
 * DP1 did not have the previous five months — drawing them as empty months on
 * her line reports an absence that never happened. A DP2 joiner gets the worst
 * of it: twelve blank months and a strip that says, wrongly, that she has done
 * nothing all year.
 *
 * This is the same principle as refusing to infer the window from posts, not an
 * exception to it. Both refuse to let the drawing imply something the record
 * does not say. `joinedAt` is a fact about the student; posts are a judgement
 * about them.
 */
export function casWindow(gradYear: number, joinedAt?: string | null) {
  const programme = `${gradYear - 2}-08-01`
  const start = joinedAt && joinedAt > programme ? joinedAt.slice(0, 10) : programme
  return { start, end: `${gradYear}-04-30`, joinedLate: start !== programme }
}
