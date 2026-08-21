// THE ANONYMITY PRE-FLIGHT — a cross-cutting primitive, not an EE feature.
//
// IB-EE-research.md #6: no name / candidate number / school / supervisor
// anywhere in submitted work. Applies to the EE, the TOK essay and exhibition,
// and final IAs. Building it inside lib/ee/ and extracting it afterwards is how
// three subtly different versions of one rule end up in a codebase, so it lives
// here from the start.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚑ CORRECTED 21 Aug 2026 — THE CODE IS NOT THE STUDENT'S JOB.
//
// This pre-flight used to FAIL when a candidate had no personal code, and asked
// the student to tick "my code is on the title page". Both were wrong, and the
// combination was expensive.
//
// Personal codes do not exist until IBIS registration completes — at ISG that
// was 14 January — and the EE is filed in November. So the check was
// unsatisfiable at the moment it was shown, and the school's answer was to make
// every candidate reopen a finished essay in January, paste a code in,
// re-export and re-upload. Michael, 21 Aug, on that exercise: "this is the
// stupid inefficient."
//
// What the IB actually asks (Handbook of Procedures, formatting guidance):
// candidates "avoid using their name, session number or the name or number of
// their school in their work", and separately "schools MAY use the candidate's
// personal code (abc123) as a means of identifying candidates' work". The code
// is PERMITTED, never required — and the identity-bearing documents are the
// forms (TK/PPF, RPPF), which the export fills.
//
// So the code became an INFORMATIONAL check that never blocks, and it is
// applied at export. See IB-Uploads-Stamping-and-Naming.md.
// ─────────────────────────────────────────────────────────────────────────────
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
  /**
   * What the student declares. TWO things, both of which they can actually
   * verify on the day they file — deliberately NOT the personal code.
   */
  declarations: { anonymous: boolean; underLimit: boolean }
}

export function anonymityPreflight(input: PreflightInput): PreflightCheck[] {
  const checks: PreflightCheck[] = []

  // NEVER 'fail'. An unconfirmed code is still inert — it is never stamped and
  // never written into a manifest (IB-Setup-and-Admin-Spec.md §7) — but that is
  // the COORDINATOR's problem to finish, not a reason to stop a student filing
  // work in November for a code the IB issues in January.
  checks.push({
    key: 'code',
    label: 'Candidate personal code',
    status: input.personalCode && input.identifiersState === 'confirmed' ? 'pass' : 'waiting',
    detail:
      input.personalCode == null
        ? 'The IB has not issued yours yet. You do not need it — it is added automatically when your coordinator exports for the IB.'
        : input.identifiersState !== 'confirmed'
          ? 'Entered, and waiting for your coordinator to confirm it against IBIS. Nothing for you to do.'
          : `Confirmed: ${input.personalCode}. It is added at export — you never put it on the work yourself.`,
  })

  const w = input.declaredWords
  checks.push({
    key: 'words',
    label: `Word count under ${input.wordLimit.toLocaleString()}`,
    status: w == null ? 'fail' : w <= input.wordLimit ? 'pass' : 'fail',
    detail:
      w == null
        ? 'Count it and enter the number — the IB asks you to declare it when you upload.'
        : w <= input.wordLimit
          ? `You counted ${w.toLocaleString()}.`
          : `You counted ${w.toLocaleString()}, which is over by ${(w - input.wordLimit).toLocaleString()}. An examiner stops reading at ${input.wordLimit.toLocaleString()}, and the criterion that suffers most is D — the conclusion.`,
  })

  const d = input.declarations
  checks.push({
    key: 'declarations',
    label: 'Your declarations',
    status: d.anonymous && d.underLimit ? 'pass' : 'fail',
    detail: 'Confirm that nothing in the document identifies you or the school, and that you are under the word limit. Those are the two things only you can check.',
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
