// THE ANONYMITY PRE-FLIGHT — a cross-cutting primitive, not an EE feature.
//
// IB-EE-research.md #6: the candidate personal code on the title page, and no
// name / candidate number / school / supervisor anywhere, applies to the EE now
// and to final IAs and the TOK essay later. Building it inside lib/ee/ and
// extracting it afterwards is how three subtly different versions of one rule
// end up in a codebase, so it lives here from the start.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS CAN AND CANNOT DO TODAY
//
// Reading text out of an uploaded PDF needs the bytes, and lib/storage.ts is
// still a stub. So the scan for a name, a school or a supervisor — and a
// MEASURED word count — cannot run yet.
//
// Those checks return 'waiting', and 'waiting' DOES NOT BLOCK. A student cannot
// be held back because the school has not bought cloud storage. A pre-flight
// that implied it had read the file would be worse than one that says plainly
// what it is waiting on — the same rule CAS's upload panel follows.
// ─────────────────────────────────────────────────────────────────────────────

export type CheckStatus = 'pass' | 'fail' | 'waiting'

export interface PreflightCheck {
  key: string
  label: string
  status: CheckStatus
  detail: string
}

export interface PreflightInput {
  personalCode: string | null
  identifiersState: 'missing' | 'unconfirmed' | 'confirmed'
  /** What the STUDENT counted. Michael, 19 Aug: they count before submission. */
  declaredWords: number | null
  wordLimit: number
  /** The three title-page declarations the student ticks. */
  declarations: { code: boolean; anonymous: boolean; underLimit: boolean }
}

export function anonymityPreflight(input: PreflightInput): PreflightCheck[] {
  const checks: PreflightCheck[] = []

  // AN UNCONFIRMED CODE IS INERT — IB-Setup-and-Admin-Spec.md §7. It is never
  // stamped onto a PDF and never written into an export manifest, so for this
  // purpose it counts exactly as missing.
  checks.push({
    key: 'code',
    label: 'Candidate personal code',
    status:
      input.personalCode && input.identifiersState === 'confirmed'
        ? 'pass'
        : 'fail',
    detail:
      input.personalCode == null
        ? 'The IB has not issued your personal code yet — your coordinator adds it when it arrives.'
        : input.identifiersState !== 'confirmed'
          ? 'Your code is entered but not yet confirmed by the coordinator. An unconfirmed code is never stamped onto work.'
          : `Confirmed: ${input.personalCode}. It goes on your title page instead of your name.`,
  })

  const w = input.declaredWords
  checks.push({
    key: 'words',
    label: `Word count under ${input.wordLimit.toLocaleString()}`,
    status: w == null ? 'fail' : w <= input.wordLimit ? 'pass' : 'fail',
    detail:
      w == null
        ? 'Count your essay and enter the number — it has to be on your title page anyway.'
        : w <= input.wordLimit
          ? `You counted ${w.toLocaleString()}.`
          : `You counted ${w.toLocaleString()}, which is over by ${(w - input.wordLimit).toLocaleString()}. An examiner stops reading at ${input.wordLimit.toLocaleString()}, and the criterion that suffers most is D — the conclusion.`,
  })

  const d = input.declarations
  checks.push({
    key: 'declarations',
    label: 'Title page declarations',
    status: d.code && d.anonymous && d.underLimit ? 'pass' : 'fail',
    detail: 'Confirm the code is on the title page, that nothing identifies you or the school, and that you are under the limit.',
  })

  checks.push({
    key: 'scan',
    label: 'Automatic check for names, school or supervisor',
    status: 'waiting',
    detail: 'Needs cloud storage, which the school has not set up. Until then this is your own check, not ours.',
  })

  return checks
}

/** `waiting` never blocks — see the file header. */
export const preflightPasses = (checks: PreflightCheck[]): boolean =>
  checks.every((c) => c.status !== 'fail')
