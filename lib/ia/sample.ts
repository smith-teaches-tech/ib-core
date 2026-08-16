// The moderation-sample paste box, as a pure function.
//
// IBIS names the sampled candidates by session number, and coordinators get
// that list in whatever shape IBIS or a colleague's email put it in — commas,
// newlines, "Candidate 0007", leading zeros present or absent. So the matcher
// asks for nothing: it extracts every run of digits, normalises each to the
// stored 4-digit form, and matches against the course's own candidates.
// A number that matches nobody is flagged, never silently dropped — a typo in
// a sample selection is exactly the mistake worth surfacing.

export interface SampleCandidate {
  studentId: string
  sessionNumber: string | null
}

export interface SampleMatch {
  /** Matched candidates, in the order the numbers were pasted, deduplicated. */
  studentIds: string[]
  /** Digit runs that matched no candidate of this course — "no candidate". */
  unknown: string[]
}

export function matchSessionNumbers(
  text: string,
  candidates: SampleCandidate[],
): SampleMatch {
  const bySession = new Map(
    candidates
      .filter((c): c is SampleCandidate & { sessionNumber: string } => c.sessionNumber != null)
      .map((c) => [c.sessionNumber, c.studentId]),
  )
  const studentIds: string[] = []
  const unknown: string[] = []
  for (const run of text.match(/\d+/g) ?? []) {
    // Session numbers are 1–4 digits, stored zero-padded to 4. A longer run is
    // not a session number and is flagged as-is.
    const normalised = /^\d{1,4}$/.test(run) ? run.padStart(4, '0') : null
    const studentId = normalised ? bySession.get(normalised) : undefined
    if (studentId) {
      if (!studentIds.includes(studentId)) studentIds.push(studentId)
    } else if (!unknown.includes(run)) {
      unknown.push(run)
    }
  }
  return { studentIds, unknown }
}
