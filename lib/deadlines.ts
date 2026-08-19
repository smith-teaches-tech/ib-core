// WHICH DEADLINE APPLIES TO WHICH REQUIREMENT — the one place that join happens.
//
// A Deadline is keyed by (stage × course) and a RequirementDef is keyed by
// `<courseId>.<stage>`, so something has to reconcile the two. It is here, it is
// pure, and it is tested by the checkpoint harness.

import type { Checkpoint, CheckpointDue, Deadline, RequirementDef } from './types'

/**
 * Does this deadline reach this requirement?
 *
 *   courseId set   → exactly `<courseId>.<requirementKey>`
 *   courseId null  → every def whose key is, or ends with, the stage. This is
 *                    how one row sets a predicted-grade date across all 31
 *                    courses, and it is the same suffix match the board's
 *                    rollups already use.
 */
export function deadlineMatches(d: Deadline, def: RequirementDef): boolean {
  if (d.cohortId !== def.cohortId || d.schoolId !== def.schoolId) return false
  if (d.courseId != null) return def.key === `${d.courseId}.${d.requirementKey}`
  return def.key === d.requirementKey || def.key.endsWith(`.${d.requirementKey}`)
}

/**
 * THE MOST SPECIFIC DEADLINE WINS.
 *
 * A cohort-wide row sets the default; a course-specific row overrides it for
 * that course. Without this rule a school could not say "everyone by 14 Jan,
 * except Chemistry, which is the 28th" — which is exactly what the real
 * calendar says.
 *
 * Ties are broken by the later `setAt`: if two rows are equally specific, the
 * one decided most recently is the live one.
 */
export function deadlineFor(deadlines: Deadline[], def: RequirementDef): Deadline | null {
  let best: Deadline | null = null
  for (const d of deadlines) {
    if (!deadlineMatches(d, def)) continue
    if (best == null) { best = d; continue }
    const moreSpecific = d.courseId != null && best.courseId == null
    const lessSpecific = d.courseId == null && best.courseId != null
    if (moreSpecific) best = d
    else if (!lessSpecific && d.setAt > best.setAt) best = d
  }
  return best
}

const DAY = 86_400_000

/** Date-only comparison in the school's day, not UTC midnight. */
export function daysUntil(dueAt: string, today: string): number {
  const a = Date.parse(dueAt + 'T00:00:00Z')
  const b = Date.parse(today + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((a - b) / DAY)
}

/**
 * Attach the applicable deadline to a checkpoint.
 *
 * `late` is FALSE for anything already done and for anything 'future' — a
 * requirement whose opener is not complete is nobody's turn yet, so it cannot
 * be overdue. That rule is from the settled doc and it matters: without it, the
 * RPF is late the moment the viva date passes, whether or not the viva happened.
 */
export function withDue(cp: Checkpoint, deadlines: Deadline[], today: string): Checkpoint {
  const d = deadlineFor(deadlines, cp.def)
  if (!d) return cp
  const daysAway = daysUntil(d.dueAt, today)
  const due: CheckpointDue = {
    dueAt: d.dueAt,
    isMajor: d.isMajor,
    late: cp.display !== 'done' && cp.display !== 'future' && daysAway < 0,
    daysAway,
  }
  return { ...cp, due }
}

/**
 * THE STUDENT'S NON-DISMISSIBLE WARNING, derived.
 *
 * Michael, 19 Aug: a warning that does not go away until the work is in —
 * especially for anything the IB receives. This is not the alert engine the
 * standing cautions forbid: it ranks nothing, pushes nothing, and cannot be
 * dismissed, because it is not a message. It is the state of the record, and it
 * ends when the record changes.
 *
 * Qualifies when: the IB receives it (`exportTarget`), it is the STUDENT's to
 * record, and it is not in. One aggregated warning, never one per item — nine
 * banners on a DP1 student's home would teach them to scroll past.
 */
export function studentOwedToIb(checkpoints: Checkpoint[]): Checkpoint[] {
  return checkpoints.filter(
    (c) =>
      c.def.exportTarget != null &&
      c.def.recordedBy === 'student' &&
      c.display !== 'done' &&
      c.display !== 'future',
  )
}

/** How loud the warning is. Presence never changes; weight does. */
export function warningLevel(owed: Checkpoint[]): 'none' | 'quiet' | 'soon' | 'late' {
  if (owed.length === 0) return 'none'
  if (owed.some((c) => c.due?.late)) return 'late'
  if (owed.some((c) => c.due != null && c.due.daysAway <= 14)) return 'soon'
  return 'quiet'
}

/**
 * THE STAGE a def belongs to — the half of its key that a deadline is keyed by.
 *
 *   'bio_sl.file'    → 'file'        (course-scoped: everything after the course id)
 *   'bio_sl.pg.p2'   → 'pg.p2'
 *   'tok.essay'      → 'essay'
 *   'ib.auth'        → 'ib.auth'     (programme-scoped: the whole key IS the stage)
 *
 * Course ids never contain a dot, which is what makes the first dot the seam.
 */
export function stageOf(def: RequirementDef): string {
  if (def.scope.kind === 'programme') return def.key
  const i = def.key.indexOf('.')
  return i < 0 ? def.key : def.key.slice(i + 1)
}

/**
 * The stages that exist in a cohort, each with a human label and whether it is
 * naturally cohort-wide (every course has it, so one date covers them all).
 * Derived from the defs, so a new module's stages appear in the picker the day
 * its definitions do.
 */
export function stagesIn(defs: RequirementDef[]): {
  key: string
  label: string
  cohortWide: boolean
  lane: string
}[] {
  const seen = new Map<string, { key: string; label: string; cohortWide: boolean; lane: string; n: number }>()
  for (const def of defs) {
    const key = stageOf(def)
    const tail = def.label.includes(' — ') ? def.label.split(' — ').slice(1).join(' — ') : def.label
    const prev = seen.get(key)
    if (prev) prev.n += 1
    else seen.set(key, { key, label: tail, cohortWide: false, lane: def.lane, n: 1 })
  }
  // A stage on many courses is one a cohort-wide date makes sense for; a stage
  // on one course (the core modules) is named by that course and is not.
  return [...seen.values()]
    .map((s) => ({ key: s.key, label: s.label, cohortWide: s.n > 1, lane: s.lane }))
    .sort((a, b) => a.lane.localeCompare(b.lane) || a.label.localeCompare(b.label))
}
