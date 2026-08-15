// The fixture implementation of IaRepository — the IA marks module's data.
//
// A factory handed the spine arrays, like the CAS and setup ones. Every write
// mutates a PINNED array (./pin.ts), and nothing derived is ever stored: the
// total is summed on read (iaTotal), recordStatus is recomputed from what is
// actually entered, and the board picks all of it up through the same states it
// always read.

import type { IaRepository } from './repository'
import type {
  Course, Enrollment, RequirementDef, RequirementState, Section, Student,
  TeachingAssignment, User,
} from '../types'
import type { IaMarksRow, IaMarksView } from '../ia/types'
import { iaTotal, templateOf } from '../templates'

export function makeIaRepository(deps: {
  courses: Course[]
  sections: Section[]
  enrollments: Enrollment[]
  students: Student[]
  users: User[]
  assignments: TeachingAssignment[]
  defs: RequirementDef[]
  states: RequirementState[]
}): IaRepository {
  const { courses, sections, enrollments, students, users, assignments, defs, states } = deps

  const defFor = (cohortId: string, courseId: string, suffix: string) =>
    defs.find((d) => d.cohortId === cohortId && d.key === courseId + suffix) ?? null

  const stateFor = (studentId: string, defId: string) =>
    states.find((s) => s.studentId === studentId && s.requirementDefId === defId) ?? null

  /** Find-or-create — a state exists only once something is recorded against it. */
  const ensureState = (schoolId: string, studentId: string, defId: string): RequirementState => {
    let s = stateFor(studentId, defId)
    if (!s) {
      s = {
        studentId, requirementDefId: defId, schoolId,
        recordStatus: 'not_started', artifacts: [],
      }
      states.push(s)
    }
    return s
  }

  return {
    async getMarksView(schoolId, courseId, cohortId) {
      const course = courses.find((c) => c.id === courseId && c.schoolId === schoolId)
      if (!course || course.type !== 'subject') return null

      const markDef = defFor(cohortId, courseId, '.mark')
      const fileDef = defFor(cohortId, courseId, '.file')
      const commentDef = defFor(cohortId, courseId, '.comment')
      if (!markDef) return null

      const t = templateOf(course.iaTemplateKey)
      const criteria = markDef.criteria ?? []

      const sectionIds = sections
        .filter((s) => s.courseId === courseId && s.cohortId === cohortId)
        .map((s) => s.id)
      const enrolled = students.filter((st) =>
        enrollments.some((e) => e.studentId === st.userId && sectionIds.includes(e.sectionId)),
      )

      const markerId = assignments.find(
        (a) => sectionIds.includes(a.sectionId) && a.isDesignatedMarker,
      )?.teacherId
      const marker = users.find((u) => u.id === markerId)?.name ?? null

      const rows: IaMarksRow[] = enrolled
        .map<IaMarksRow>((st) => {
          const mark = stateFor(st.userId, markDef.id)
          const file = fileDef ? stateFor(st.userId, fileDef.id) : null
          const comment = commentDef ? stateFor(st.userId, commentDef.id) : null
          const commentBody =
            comment?.artifacts.find((a) => a.kind === 'text')?.body ?? null
          return {
            studentId: st.userId,
            name: users.find((u) => u.id === st.userId)?.name ?? st.userId,
            sessionNumber: st.sessionNumber,
            personalCode: st.personalCode,
            criterionMarks:
              criteria.length > 0
                ? (mark?.criterionMarks ?? criteria.map(() => null))
                : [],
            mark: criteria.length === 0 ? (mark?.mark ?? null) : null,
            total: iaTotal(criteria, mark),
            comment: commentBody,
            fileDisplay:
              file == null || file.recordStatus === 'not_started'
                ? 'not_started'
                : file.recordStatus === 'in_progress'
                  ? 'partial'
                  : 'done',
            typed: mark?.exportStatus === 'submitted',
            locked: mark?.lockedAt != null,
          }
        })
        // IBIS candidate order: session number ascending, unregistered last.
        .sort((a, b) =>
          a.sessionNumber == null && b.sessionNumber == null
            ? a.name.localeCompare(b.name)
            : a.sessionNumber == null
              ? 1
              : b.sessionNumber == null
                ? -1
                : a.sessionNumber.localeCompare(b.sessionNumber),
        )

      return {
        course, cohortId,
        component: t.component,
        criteria,
        markMax: markDef.markMax ?? t.markMax,
        guide: t.guide,
        verify: t.verify ?? null,
        marker,
        rows,
      }
    },

    async setCriterionMark(schoolId, courseId, cohortId, studentId, index, value, by) {
      const markDef = defFor(cohortId, courseId, '.mark')
      if (!markDef) return
      const s = ensureState(schoolId, studentId, markDef.id)
      if (s.lockedAt != null) return

      const criteria = markDef.criteria ?? []
      if (criteria.length === 0) {
        // Total-only family: the single mark IS the recording.
        s.mark =
          value == null ? undefined : Math.max(0, Math.min(markDef.markMax ?? 25, value))
        s.recordStatus = value == null ? 'not_started' : 'marked'
      } else {
        if (index < 0 || index >= criteria.length) return
        const marks = s.criterionMarks ?? criteria.map(() => null)
        marks[index] =
          value == null ? null : Math.max(0, Math.min(criteria[index].max, value))
        s.criterionMarks = marks
        // recordStatus is DERIVED from what is entered — never set independently.
        const entered = marks.filter((m) => m != null).length
        s.recordStatus =
          entered === 0 ? 'not_started' : entered === criteria.length ? 'marked' : 'in_progress'
        s.mark = undefined // the total is never stored — invariant #2
      }
      s.recordedBy = by
      s.recordedAt = new Date().toISOString().slice(0, 10)
    },

    async setComment(schoolId, courseId, cohortId, studentId, text, by) {
      const commentDef = defFor(cohortId, courseId, '.comment')
      if (!commentDef) return
      const s = ensureState(schoolId, studentId, commentDef.id)
      const body = text.trim()
      s.artifacts = body
        ? [{
            id: commentDef.id + ':' + studentId, kind: 'text',
            label: 'Teacher comment', body,
            addedAt: new Date().toISOString().slice(0, 10),
          }]
        : []
      s.recordStatus = body ? 'submitted' : 'not_started'
      s.recordedBy = by
      s.recordedAt = new Date().toISOString().slice(0, 10)
    },

    async setTypedIntoIbis(schoolId, courseId, cohortId, studentId, on) {
      const markDef = defFor(cohortId, courseId, '.mark')
      if (!markDef) return
      const s = stateFor(studentId, markDef.id)
      // Nothing recorded means nothing to type — refuse rather than invent a state.
      if (!s || iaTotal(markDef.criteria, s) == null) return
      // eCoursework's own word, on the export axis; the school record is untouched.
      s.exportStatus = on ? 'submitted' : 'ready_for_submission'
    },
  }
}
