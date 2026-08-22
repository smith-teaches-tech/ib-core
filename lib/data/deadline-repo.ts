// The fixture implementation of DeadlineRepository.
//
// A deadline is a small record with one interesting property: it SUPERSEDES
// rather than overwrites. Moving a date writes a new row pointing at the old
// one, so "what did we tell them in September" survives being asked in March.
//
// Nothing derived is stored. Which deadline applies to which requirement is
// computed on every read by lib/deadlines.ts, so a new course, a new section or
// a moved date needs no reconciliation pass anywhere.

import type { DeadlineRepository, DueItem, UnsetStage } from './repository'
import type {
  Course, Deadline, Enrollment, RequirementDef, RequirementState, Section, Student,
  TeachingAssignment,
} from '../types'
import {
  deadlineFor, deadlineMatches, daysUntil, stageOf, stagesIn, studentMaySee, tierOfStage,
} from '../deadlines'
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

  /** One cohort's definitions — what the tier rule is decided against. */
  const defsIn = (schoolId: string, cohortId: string) =>
    defs.filter((d) => d.schoolId === schoolId && d.cohortId === cohortId)

  const tierIn = (schoolId: string, cohortId: string, stage: string) =>
    tierOfStage(stage, defsIn(schoolId, cohortId))

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
        const tier = tierIn(schoolId, cohortId, d.requirementKey)
        const isMarker =
          d.courseId != null && markerOf(d.courseId, cohortId, viewer.userId)
        const mayEdit = viewer.hasDeadlinesSet || (tier === 'course' && isMarker)
        return {
          deadline: d,
          label: labelFor(d),
          courseName: courseName(d.courseId),
          courses: hits.length,
          done,
          total,
          daysAway: daysUntil(d.dueAt, today),
          tier,
          mayEdit,
          lockedBecause: mayEdit
            ? ''
            : tier === 'programme'
              ? 'the IB coordinator sets this one'
              : 'you are not the designated marker for this course',
        }
      })
    },

    async maySet(schoolId, cohortId, userId, requirementKey, courseId, hasDeadlinesSet, studentId) {
      const tier = tierIn(schoolId, cohortId, requirementKey)
      // NOBODY DATES SOMEBODY ELSE'S MARKING — not even the coordinator. A mark
      // is staff work; the coordinator's predicted-grade points already say when
      // it is needed. Refusing this here rather than filtering it on the way to
      // a screen is what makes the rule structural: there is no date to leak.
      if (tier === 'none') return false
      // A `deadlines.set` holder sets anything that IS a date.
      if (hasDeadlinesSet) return true
      // Everything below is a teacher, and a teacher's authority is one course.
      if (courseId == null) return false
      if (!markerOf(courseId, cohortId, userId)) return false
      // An EXTENSION moves one candidate, not the programme, so the marker may
      // grant one on any dated stage of their own course — including the final
      // upload, whose cohort date stays exactly where the coordinator put it.
      if (studentId != null) return true
      return tier === 'course'
    },

    async listUnset(schoolId, cohortId, viewer) {
      const cohortDefs = defsIn(schoolId, cohortId)
      const live = scoped(schoolId, cohortId)
      const out: UnsetStage[] = []

      // The courses this teacher marks — the only ones they could be offered.
      const marked = viewer.hasDeadlinesSet
        ? []
        : courses.filter((c) => markerOf(c.id, cohortId, viewer.userId))

      for (const stage of stagesIn(cohortDefs)) {
        if (stage.tier === 'none') continue

        if (viewer.hasDeadlinesSet) {
          // THE SECTION SHOWS WHAT IS YOURS TO FILL. A coordinator sees the
          // programme's dates; a TOK teacher's exhibition prompt is on the TOK
          // teacher's list, not hers. She can still set one from the add form —
          // she may set anything — but her Due Date Centre is not a list of
          // other people's pacing decisions waiting to be made for them.
          if (stage.tier !== 'programme') continue
          // One row per stage that has NO date anywhere. A stage dated on
          // twenty-five of twenty-six courses is not listed as a gap: partial
          // coverage is a judgement, and judging it is how a list becomes a nag.
          if (live.some((d) => d.requirementKey === stage.key)) continue
          out.push({
            key: stage.key, label: stage.label, lane: stage.lane, tier: stage.tier,
            courseId: null,
            courseName: stage.cohortWide ? 'All courses' : '\u2014',
          })
          continue
        }

        // A teacher is offered their own module milestones and nothing else.
        if (stage.tier !== 'course') continue
        for (const c of marked) {
          const def = cohortDefs.find(
            (d) => stageOf(d) === stage.key &&
              d.scope.kind === 'course' && d.scope.courseId === c.id,
          )
          if (!def) continue
          if (live.some((d) => deadlineMatches(d, def))) continue
          out.push({
            key: stage.key, label: stage.label, lane: stage.lane, tier: stage.tier,
            courseId: c.id, courseName: c.name,
          })
        }
      }
      return out
    },

    async set(schoolId, cohortId, input, by) {
      const existing = scoped(schoolId, cohortId).find(
        (d) => d.requirementKey === input.requirementKey &&
          d.courseId === (input.courseId ?? null) &&
          (d.studentId ?? null) === (input.studentId ?? null),
      )
      // A DATE THAT LANDS ON NOTHING IS NOT A DATE. The checkpoint has asserted
      // this about the SEEDED rows since 19 Aug — the first fixtures asked for a
      // def keyed `tok.tok.essay` and nothing complained. The same guarantee has
      // to hold at write time, or a picker that offers "Title chosen" beside the
      // course "CAS" quietly creates a row nobody can ever satisfy.
      const probe = {
        schoolId, cohortId,
        requirementKey: input.requirementKey,
        courseId: input.courseId ?? null,
        studentId: input.studentId ?? null,
      } as Deadline
      if (!defs.some((def) => deadlineMatches(probe, def, input.studentId ?? undefined))) {
        throw new Error('There is nothing on that course with that stage — the date would land on nothing.')
      }
      const row: Deadline = {
        id: 'dl_' + (deadlines.length + 1),
        schoolId,
        cohortId,
        requirementKey: input.requirementKey,
        courseId: input.courseId ?? null,
        studentId: input.studentId ?? null,
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

    async forDef(schoolId, cohortId, def, studentId) {
      return deadlineFor(scoped(schoolId, cohortId), def, studentId)
    },

    async definitionsIn(schoolId, cohortId) {
      return defs.filter((d) => d.schoolId === schoolId && d.cohortId === cohortId)
    },

    async dueFor(schoolId, userId) {
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
          const hits = defsFor(d)
          if (hits.length === 0) continue

          if (student) {
            // Only requirements that reach this candidate, via enrolment.
            // THE ONE RULE for what a candidate sees is `studentMaySee` — the
            // same predicate the track uses, so the two cannot disagree the way
            // three separate filters did before 22 Aug. Enrolment says which
            // requirements reach them; that rule says which dates are theirs.
            const mine = hits.filter((def) => {
              if (!studentMaySee(def)) return false
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
