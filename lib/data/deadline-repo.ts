// The fixture implementation of DeadlineRepository.
//
// A deadline is a small record with one interesting property: it SUPERSEDES
// rather than overwrites. Moving a date writes a new row pointing at the old
// one, so "what did we tell them in September" survives being asked in March.
//
// Nothing derived is stored. Which deadline applies to which requirement is
// computed on every read by lib/deadlines.ts, so a new course, a new section or
// a moved date needs no reconciliation pass anywhere.

import type { DeadlineRepository, DueItem } from './repository'
import type {
  Course, Deadline, Enrollment, RequirementDef, RequirementState, Section, Student,
  TeachingAssignment,
} from '../types'
import { deadlineFor, deadlineMatches, daysUntil } from '../deadlines'
import { REPORTING_POINTS } from '../pg/types'
import { todayRiyadh } from './dates'

/** Stages a teacher may date: their own course's work. NEVER a predicted grade. */
const isPgKey = (requirementKey: string) => requirementKey.startsWith('pg.')

export function makeDeadlineRepository(deps: {
  courses: Course[]
  sections: Section[]
  enrollments: Enrollment[]
  students: Student[]
  assignments: TeachingAssignment[]
  defs: RequirementDef[]
  states: RequirementState[]
  deadlines: Deadline[]
}): DeadlineRepository {
  const { courses, sections, enrollments, students, assignments, defs, states, deadlines } = deps

  const scoped = (schoolId: string, cohortId: string) =>
    deadlines.filter((d) => d.schoolId === schoolId && d.cohortId === cohortId)

  const stateOf = (schoolId: string, studentId: string, defId: string) =>
    states.find(
      (s) => s.schoolId === schoolId && s.studentId === studentId && s.requirementDefId === defId,
    ) ?? null

  const COMPLETE = new Set(['submitted', 'marked', 'released'])

  const sectionIdsOf = (courseId: string, cohortId: string) =>
    sections.filter((s) => s.courseId === courseId && s.cohortId === cohortId).map((s) => s.id)

  const rosterOf = (courseId: string, cohortId: string) => {
    const ids = sectionIdsOf(courseId, cohortId)
    return students.filter((st) =>
      enrollments.some((e) => e.studentId === st.userId && ids.includes(e.sectionId)),
    )
  }

  const markerOf = (courseId: string, cohortId: string, userId: string) =>
    assignments.some((a) => {
      const sec = sections.find((x) => x.id === a.sectionId)
      return (
        a.isDesignatedMarker && a.teacherId === userId &&
        sec?.courseId === courseId && sec?.cohortId === cohortId
      )
    })

  const courseName = (id: string | null) =>
    id == null ? 'All courses' : (courses.find((c) => c.id === id)?.name ?? id)

  /** The def keys a deadline reaches, in this cohort. */
  const defsFor = (d: Deadline) => defs.filter((def) => deadlineMatches(d, def))

  /** A human label for a stage, built from the defs it lands on. */
  const labelFor = (d: Deadline) => {
    // A cohort-wide predicted-grade row is not "predicted, End Y1" (which is how
    // one course's def reads) — it is the whole cohort's reporting point.
    if (d.requirementKey.startsWith('pg.')) {
      const point = REPORTING_POINTS.find((p) => `pg.${p.key}` === d.requirementKey)
      return `Predicted grades — ${point?.label ?? d.requirementKey}`
    }
    const hit = defsFor(d)[0]
    if (!hit) return d.requirementKey
    // '<Course> — mark' → 'mark'; a cohort-wide row keeps the stage's own words.
    const tail = hit.label.includes(' — ') ? hit.label.split(' — ').slice(1).join(' — ') : hit.label
    return d.courseId != null ? `${courseName(d.courseId)} — ${tail}` : tail
  }

  return {
    async list(schoolId, cohortId) {
      return scoped(schoolId, cohortId)
        .slice()
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.requirementKey.localeCompare(b.requirementKey))
    },

    async listResolved(schoolId, cohortId, viewer) {
      const today = todayRiyadh()
      return (await this.list(schoolId, cohortId)).map((d) => {
        // How many candidates this date actually reaches, and how many are in —
        // counted, never stored, so it cannot drift from the grids.
        const hits = defsFor(d)
        let total = 0
        let done = 0
        for (const def of hits) {
          const roster =
            def.scope.kind === 'course'
              ? rosterOf(def.scope.courseId, cohortId)
              : students.filter((st) => st.schoolId === schoolId && st.cohortId === cohortId)
          for (const st of roster) {
            total += 1
            const s = stateOf(schoolId, st.userId, def.id)
            if (s != null && (COMPLETE.has(s.recordStatus) || s.grade != null)) done += 1
          }
        }
        return {
          deadline: d,
          label: labelFor(d),
          courseName: courseName(d.courseId),
          courses: hits.length,
          done,
          total,
          daysAway: daysUntil(d.dueAt, today),
          canBeSetByTeacher: !isPgKey(d.requirementKey),
          mayEdit:
            viewer.hasDeadlinesSet ||
            (!isPgKey(d.requirementKey) &&
              d.courseId != null &&
              markerOf(d.courseId, cohortId, viewer.userId)),
        }
      })
    },

    async maySet(schoolId, cohortId, userId, requirementKey, courseId, hasDeadlinesSet) {
      // A `deadlines.set` holder sets anything — that is the coordinator tier.
      if (hasDeadlinesSet) return true
      // A predicted-grade date is a cohort-wide commitment and the April one is
      // an IB deadline the coordinator signs for. Never a teacher's to move.
      if (isPgKey(requirementKey)) return false
      // Otherwise: the designated marker of that course, and only that course.
      if (courseId == null) return false
      return markerOf(courseId, cohortId, userId)
    },

    async set(schoolId, cohortId, input, by) {
      const existing = scoped(schoolId, cohortId).find(
        (d) => d.requirementKey === input.requirementKey && d.courseId === (input.courseId ?? null),
      )
      const row: Deadline = {
        id: 'dl_' + (deadlines.length + 1),
        schoolId,
        cohortId,
        requirementKey: input.requirementKey,
        courseId: input.courseId ?? null,
        dueAt: input.dueAt,
        isMajor: input.isMajor,
        decidedBy: input.decidedBy.trim() || 'not recorded',
        setBy: by,
        setAt: new Date().toISOString(),
        supersedes: existing?.id,
      }
      // SUPERSEDE, don't mutate: the old row leaves the live set but the new one
      // names it, so a moved date is a fact with a predecessor rather than an
      // edit with no history.
      if (existing) {
        const i = deadlines.indexOf(existing)
        if (i >= 0) deadlines.splice(i, 1)
      }
      deadlines.push(row)
      return row
    },

    async remove(schoolId, cohortId, id) {
      const i = deadlines.findIndex(
        (d) => d.id === id && d.schoolId === schoolId && d.cohortId === cohortId,
      )
      if (i >= 0) deadlines.splice(i, 1)
    },

    async forDef(schoolId, cohortId, def) {
      return deadlineFor(scoped(schoolId, cohortId), def)
    },

    async definitionsIn(schoolId, cohortId) {
      return defs.filter((d) => d.schoolId === schoolId && d.cohortId === cohortId)
    },

    async dueFor(schoolId, userId, opts) {
      const today = todayRiyadh()
      const out: DueItem[] = []

      // A student sees the dates for work THEY owe. A teacher sees the dates on
      // the courses they mark. Nobody sees a date for somebody else's job.
      const student = students.find((st) => st.userId === userId && st.schoolId === schoolId)

      const cohortIds = student
        ? [student.cohortId]
        : [...new Set(sections.filter((sec) =>
            assignments.some((a) => a.teacherId === userId && a.sectionId === sec.id),
          ).map((sec) => sec.cohortId))]

      for (const cohortId of cohortIds) {
        const rows = scoped(schoolId, cohortId)
        for (const d of rows) {
          if (opts?.excludePg && isPgKey(d.requirementKey)) continue
          const hits = defsFor(d)
          if (hits.length === 0) continue

          if (student) {
            // Only requirements that reach this candidate, via enrolment.
            const mine = hits.filter((def) => {
              if (def.scope.kind === 'programme') return true
              const ids = sectionIdsOf(def.scope.courseId, cohortId)
              return enrollments.some(
                (e) => e.studentId === userId && ids.includes(e.sectionId),
              )
            })
            if (mine.length === 0) continue
            const allIn = mine.every((def) => {
              const s = stateOf(schoolId, userId, def.id)
              return s != null && (COMPLETE.has(s.recordStatus) || s.grade != null)
            })
            out.push({
              deadline: d, label: labelFor(d), courseName: courseName(d.courseId),
              daysAway: daysUntil(d.dueAt, today), done: allIn ? 1 : 0, total: 1,
              toIb: mine.some((def) => def.exportTarget != null),
              mine: mine.some((def) => def.recordedBy === 'student'),
            })
          } else {
            const myCourses = hits.filter(
              (def) => def.scope.kind === 'course' && markerOf(def.scope.courseId, cohortId, userId),
            )
            if (myCourses.length === 0) continue
            let done = 0
            let total = 0
            for (const def of myCourses) {
              if (def.scope.kind !== 'course') continue
              for (const st of rosterOf(def.scope.courseId, cohortId)) {
                total += 1
                const s = stateOf(schoolId, st.userId, def.id)
                if (s != null && (COMPLETE.has(s.recordStatus) || s.grade != null)) done += 1
              }
            }
            out.push({
              deadline: d, label: labelFor(d), courseName: courseName(d.courseId),
              daysAway: daysUntil(d.dueAt, today), done, total,
              toIb: myCourses.some((def) => def.exportTarget != null),
              mine: myCourses.some((def) => def.recordedBy !== 'student'),
            })
          }
        }
      }
      return out.sort((a, b) => a.deadline.dueAt.localeCompare(b.deadline.dueAt))
    },
  }
}
