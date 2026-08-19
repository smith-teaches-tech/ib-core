// The fixture implementation of PgRepository — predicted grades.
//
// A factory handed the spine arrays, like the IA one. Nothing derived is
// stored: a cell's "locked" is `lockedAt != null`, the fraction at the foot of
// each column is counted on read, and the unlock reason that a change carries
// is READ BACK OFF THE TRAIL rather than parked in a second place where it
// could disagree with it.
//
// It shares the IA module's MarkEvent array deliberately. One course, one
// trail: a teacher asking "what happened to this candidate in my course" should
// not have to know whether the thing that happened was a mark or a prediction.

import type { PgRepository } from './repository'
import type {
  Course, Enrollment, RequirementDef, RequirementState, Section, Student,
  TeachingAssignment, User,
} from '../types'
import type { MarkEvent } from '../ia/types'
import type { PgCell, PgRow, PgStudentView, PgView, ReportingPoint } from '../pg/types'
import { REPORTING_POINTS, pgKey } from '../pg/types'
import { normaliseGrade } from '../pg/scale'
import { iaTotal } from '../templates'
import { todayRiyadh } from './dates'

export function makePgRepository(deps: {
  courses: Course[]
  sections: Section[]
  enrollments: Enrollment[]
  students: Student[]
  users: User[]
  assignments: TeachingAssignment[]
  defs: RequirementDef[]
  states: RequirementState[]
  events: MarkEvent[]
}): PgRepository {
  const {
    courses, sections, enrollments, students, users, assignments, defs, states, events,
  } = deps

  const defByKey = (schoolId: string, cohortId: string, key: string) => {
    const d = defs.find((x) => x.cohortId === cohortId && x.key === key) ?? null
    if (d && d.schoolId !== schoolId) {
      throw new Error('That requirement definition is not at this school.')
    }
    return d
  }

  const pgDef = (schoolId: string, cohortId: string, courseId: string, p: ReportingPoint['key']) =>
    defByKey(schoolId, cohortId, pgKey(courseId, p))

  const stateFor = (schoolId: string, studentId: string, defId: string) =>
    states.find(
      (s) => s.schoolId === schoolId && s.studentId === studentId && s.requirementDefId === defId,
    ) ?? null

  const ensureState = (schoolId: string, studentId: string, defId: string): RequirementState => {
    let s = stateFor(schoolId, studentId, defId)
    if (!s) {
      s = { studentId, requirementDefId: defId, schoolId, recordStatus: 'not_started', artifacts: [] }
      states.push(s)
    }
    return s
  }

  const nameOf = (userId: string) => users.find((u) => u.id === userId)?.name ?? userId

  const sectionIdsOf = (courseId: string, cohortId: string) =>
    sections.filter((s) => s.courseId === courseId && s.cohortId === cohortId).map((s) => s.id)

  const logEvent = (e: Omit<MarkEvent, 'id' | 'at'>) => {
    events.push({ ...e, id: 'me_' + (events.length + 1), at: new Date().toISOString() })
  }

  /**
   * THE LIVE UNLOCK REASON for one cell, read back off the append-only trail.
   *
   * An unlock is answered by the next write, so the reason is live exactly when
   * the most recent event for this cell is a `pg_unlock`. Storing it separately
   * would create a second copy of a fact the trail already holds — and a second
   * copy is a thing that can be wrong.
   */
  const liveUnlockReason = (
    schoolId: string, courseId: string, cohortId: string, studentId: string,
    point: ReportingPoint['key'],
  ): string | null => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (
        e.schoolId !== schoolId || e.courseId !== courseId || e.cohortId !== cohortId ||
        e.studentId !== studentId || e.criterion !== point
      ) continue
      if (e.kind === 'pg_unlock') return e.overrideReason ?? null
      if (e.kind === 'pg') return null
    }
    return null
  }

  const cellOf = (
    schoolId: string, courseId: string, cohortId: string, studentId: string, p: ReportingPoint,
  ): PgCell => {
    const d = pgDef(schoolId, cohortId, courseId, p.key)
    const s = d ? stateFor(schoolId, studentId, d.id) : null
    return {
      grade: s?.grade ?? null,
      locked: s?.lockedAt != null,
      by: s?.recordedBy ?? null,
      at: s?.recordedAt ?? null,
      openReason:
        s != null && s.grade != null && s.lockedAt == null
          ? liveUnlockReason(schoolId, courseId, cohortId, studentId, p.key)
          : null,
    }
  }

  /** The IA total, purely as EVIDENCE beside the prediction. Never editable here. */
  const evidenceOf = (schoolId: string, cohortId: string, courseId: string, studentId: string) => {
    const markDef = defByKey(schoolId, cohortId, courseId + '.mark')
    if (!markDef) return { iaTotal: null, iaMax: null }
    const st = stateFor(schoolId, studentId, markDef.id)
    return {
      iaTotal: iaTotal(markDef.criteria, st),
      iaMax: markDef.markMax ?? null,
    }
  }

  const sessionOrder = (a: { sessionNumber: string | null }, b: { sessionNumber: string | null }) =>
    a.sessionNumber == null && b.sessionNumber == null ? 0
      : a.sessionNumber == null ? 1
        : b.sessionNumber == null ? -1
          : a.sessionNumber.localeCompare(b.sessionNumber)

  return {
    async getView(schoolId, courseId, cohortId) {
      const course = courses.find((c) => c.id === courseId && c.schoolId === schoolId)
      if (!course) return null

      // A course has predicted grades exactly when its defs exist. No course
      // type is special-cased here — TOK differs only by its scale, which the
      // def carries.
      const first = pgDef(schoolId, cohortId, courseId, 'p1')
      if (!first) return null

      const sectionIds = sectionIdsOf(courseId, cohortId)
      const enrolled = students.filter((st) =>
        enrollments.some((e) => e.studentId === st.userId && sectionIds.includes(e.sectionId)),
      )
      const markerId = assignments.find(
        (a) => sectionIds.includes(a.sectionId) && a.isDesignatedMarker,
      )?.teacherId

      const rows: PgRow[] = enrolled
        .map<PgRow>((st) => ({
          studentId: st.userId,
          name: users.find((u) => u.id === st.userId)?.name ?? st.userId,
          sessionNumber: st.sessionNumber,
          ...evidenceOf(schoolId, cohortId, courseId, st.userId),
          cells: REPORTING_POINTS.map((p) => cellOf(schoolId, courseId, cohortId, st.userId, p)),
        }))
        .sort((a, b) => (sessionOrder(a, b) !== 0 ? sessionOrder(a, b) : a.name.localeCompare(b.name)))

      const view: PgView = {
        course,
        cohortId,
        scale: first.gradeScale ?? 'points_1_7',
        points: REPORTING_POINTS,
        marker: users.find((u) => u.id === markerId)?.name ?? null,
        rows,
      }
      return view
    },

    async setGrade(schoolId, courseId, cohortId, studentId, point, value, by) {
      const d = pgDef(schoolId, cohortId, courseId, point)
      if (!d) return
      const s = ensureState(schoolId, studentId, d.id)

      // THE LOCK, enforced where it cannot be skipped by a caller that forgot.
      // A locked cell refuses the write outright; unlockGrade is the only door.
      if (s.lockedAt != null) {
        throw new Error(
          'That predicted grade is locked. Unlock it — with a reason — before changing it.',
        )
      }

      const prev = s.grade ?? null
      const next = normaliseGrade(value, d.gradeScale)
      if (value != null && value.trim() !== '' && next == null) {
        throw new Error(`“${value}” is not a valid grade for this course.`)
      }
      if (prev === next) return

      const reason = liveUnlockReason(schoolId, courseId, cohortId, studentId, point)
      s.grade = next ?? undefined
      s.recordStatus = next == null ? 'not_started' : 'marked'
      s.recordedBy = nameOf(by)
      s.recordedAt = todayRiyadh()
      // Recording it locks it. Clearing it does not — an empty cell is not a
      // judgement, so there is nothing to protect.
      s.lockedAt = next == null ? undefined : new Date().toISOString()

      logEvent({
        schoolId, cohortId, courseId, studentId, kind: 'pg',
        criterion: point, prev, next, byUserId: by,
        overrideReason: reason ?? undefined,
      })
    },

    async unlockGrade(schoolId, courseId, cohortId, studentId, point, reason, by) {
      const text = reason.trim()
      if (!text) throw new Error('A reason is required to change a predicted grade.')
      const d = pgDef(schoolId, cohortId, courseId, point)
      if (!d) return
      const s = stateFor(schoolId, studentId, d.id)
      if (!s || s.grade == null) return
      if (s.lockedAt == null) return // already open; unlocking twice is not an event

      s.lockedAt = undefined
      logEvent({
        schoolId, cohortId, courseId, studentId, kind: 'pg_unlock',
        criterion: point, prev: s.grade, next: null, byUserId: by,
        overrideReason: text,
      })
    },

    async getStudentView(schoolId, studentId) {
      const student = students.find((st) => st.userId === studentId && st.schoolId === schoolId)
      if (!student) return null

      const mySectionIds = new Set(
        enrollments.filter((e) => e.studentId === studentId).map((e) => e.sectionId),
      )
      const myCourseIds = new Set(
        sections.filter((s) => mySectionIds.has(s.id)).map((s) => s.courseId),
      )

      const myCourses = courses
        .filter((c) => c.schoolId === schoolId && myCourseIds.has(c.id))
        .filter((c) => pgDef(schoolId, student.cohortId, c.id, 'p1') != null)
        // Subjects first, then the core courses that predict — reads like a
        // transcript rather than like a database.
        .sort((a, b) =>
          a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'subject' ? -1 : 1,
        )

      const rows = myCourses.map((c) => {
        const first = pgDef(schoolId, student.cohortId, c.id, 'p1')!
        return {
          courseId: c.id,
          courseName: c.name,
          scale: first.gradeScale ?? ('points_1_7' as const),
          grades: REPORTING_POINTS.map((p) => {
            const d = pgDef(schoolId, student.cohortId, c.id, p.key)
            const s = d ? stateFor(schoolId, studentId, d.id) : null
            return s?.grade ?? null
          }),
        }
      })

      const view: PgStudentView = {
        points: REPORTING_POINTS,
        courses: rows,
        filled: REPORTING_POINTS.map((_, i) => ({
          done: rows.filter((r) => r.grades[i] != null).length,
          total: rows.length,
        })),
      }
      return view
    },
  }
}
