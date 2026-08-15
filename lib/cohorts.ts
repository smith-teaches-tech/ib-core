// Which year a cohort is in, and whether it is over.
//
// DERIVED, NEVER STORED — Michael's call, and the right one. A stored "Year 1 /
// Year 2" field has to be advanced for every cohort every August, and a missed
// bump mislabels a whole year group silently. The graduation year is the single
// fact that never changes; everything else follows from it and today's date.
//
// So "Class of 2029" is created once and moves Year 1 → Year 2 → archived on its
// own. There is nothing to remember and nothing to get wrong.

import type { Cohort } from './types'

export type CohortStage = 'not_started' | 'year_1' | 'year_2' | 'archived'

/**
 * The academic year a date falls in, named for the year it ENDS.
 * August onward belongs to the next academic year: Aug 2026 → AY 2027.
 */
export function academicYearOf(date: Date): number {
  return date.getUTCMonth() >= 7 ? date.getUTCFullYear() + 1 : date.getUTCFullYear()
}

/**
 * The DP runs two academic years and is named for the second:
 *
 *   Class of 2027  ·  Year 1 = AY 2026  ·  Year 2 = AY 2027  ·  archived after
 *
 * A stored `archived` flag wins where it is set, so a coordinator can close a
 * cohort early — but nobody has to set it for the normal case.
 */
export function stageOf(cohort: Cohort, now: Date = new Date()): CohortStage {
  if (cohort.archived) return 'archived'
  const ay = academicYearOf(now)
  if (ay > cohort.gradYear) return 'archived'
  if (ay === cohort.gradYear) return 'year_2'
  if (ay === cohort.gradYear - 1) return 'year_1'
  return 'not_started'
}

export const STAGE_LABEL: Record<CohortStage, string> = {
  not_started: 'Not started',
  year_1: 'Year 1',
  year_2: 'Year 2',
  archived: 'Archived',
}

/** "Year 2 · Class of 2027" — the label that goes above a group of courses. */
export function cohortTitle(cohort: Cohort, now: Date = new Date()): string {
  const stage = stageOf(cohort, now)
  return stage === 'archived' || stage === 'not_started'
    ? cohort.label
    : `${STAGE_LABEL[stage]} · ${cohort.label}`
}

export function isArchived(cohort: Cohort, now: Date = new Date()): boolean {
  return stageOf(cohort, now) === 'archived'
}

/** Live cohorts first, Year 2 before Year 1, then the archive newest-first. */
const RANK: Record<CohortStage, number> = { year_2: 0, year_1: 1, not_started: 2, archived: 3 }

export function sortCohorts(cohorts: Cohort[], now: Date = new Date()): Cohort[] {
  return [...cohorts].sort((a, b) => {
    const r = RANK[stageOf(a, now)] - RANK[stageOf(b, now)]
    return r !== 0 ? r : b.gradYear - a.gradYear
  })
}

/**
 * Who may open an archived cohort.
 *
 * Coordinators, always — they answer questions about past sessions for years.
 * Teachers, read-only, for the sections they actually taught: references and
 * moderation queries outlive the session. Students, never: at ISG they lose
 * their school email by 31 July, so the account is gone before the archive
 * matters, and keeping their record reachable would cut against deleting it.
 *
 * Enforced in the actions, not only in the navigation — see lib/setup/actions.ts.
 */
export function archiveAccess(roles: string[]): 'full' | 'read_only' | 'none' {
  if (roles.includes('school_coordinator') || roles.includes('district_coordinator')) return 'full'
  if (roles.includes('student')) return 'none'
  return 'read_only'
}
