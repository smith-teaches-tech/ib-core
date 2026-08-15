// Cohorts: what they are called, and when they stop being live.
//
// TWO DECISIONS, both Michael's, both narrowing what this file does:
//
// 1. NO "YEAR 1 / YEAR 2" ANYWHERE. The school already has an unambiguous name
//    for a year group — "Class of 2027", and internally "Cohort 15". Deriving a
//    Year 1/Year 2 label on top of that added a second vocabulary for the same
//    thing, and a second thing to be wrong about in the fortnight either side of
//    a rollover. Deleted.
//
// 2. ARCHIVING IS AN ACT, NOT A DATE. An earlier version archived a cohort
//    automatically once its exam session passed. That was wrong:
//
//      "Don't archive it automatically in June... IB sometimes requests other
//       info... That's not a good idea."
//
//    Results arrive in July. Enquiries upon results, appeals and misconduct
//    questions arrive later still, and the last of those has no time limit at
//    all. A cohort that locked itself the moment exams ended would lock the
//    coordinator out exactly when the IB started asking questions.
//
//    So `archived` is a stored flag and nothing else sets it. A cohort stays
//    live until a coordinator says otherwise.

import type { Cohort } from './types'

/** "Class of 2027 · Cohort 15" — both names the school actually uses. */
export function cohortTitle(cohort: Cohort): string {
  return cohort.number != null ? `${cohort.label} · Cohort ${cohort.number}` : cohort.label
}

/** The only meaning of archived: somebody archived it. */
export function isArchived(cohort: Cohort): boolean {
  return cohort.archived
}

/**
 * Live year groups first, the one graduating soonest at the front — that is the
 * one with an exam session bearing down on it. Archived years after, newest
 * first, because a recently finished cohort is the one still being asked about.
 */
export function sortCohorts(cohorts: Cohort[]): Cohort[] {
  return [...cohorts].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1
    return a.archived ? b.gradYear - a.gradYear : a.gradYear - b.gradYear
  })
}

/**
 * Who may open an archived cohort.
 *
 * Coordinators, always — they answer questions about past sessions for years.
 * Teachers, read-only, for what they taught: references and moderation queries
 * outlive the session. Students, never: at ISG they lose their school email by
 * 31 July, so the account is gone before the archive would matter.
 *
 * Enforced in the actions, not only in the navigation — see lib/setup/actions.ts.
 */
export function archiveAccess(roles: string[]): 'full' | 'read_only' | 'none' {
  if (roles.includes('school_coordinator') || roles.includes('district_coordinator')) return 'full'
  if (roles.includes('student')) return 'none'
  return 'read_only'
}
