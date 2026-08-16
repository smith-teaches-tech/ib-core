// The fixture implementation of IaRepository — the IA marks module's data.
//
// A factory handed the spine arrays, like the CAS and setup ones. Every write
// mutates a PINNED array (./pin.ts), and nothing derived is ever stored: the
// total is summed on read (iaTotal), recordStatus is recomputed from what is
// actually entered, and the board picks all of it up through the same states it
// always read.
//
// Two module-owned arrays live here beyond the spine: MarkEvent (the
// APPEND-ONLY audit trail — every write lands one, nothing edits or deletes
// one) and MarkUnlock (a coordinator's temporary, reasoned permission to edit
// a course they do not mark — expiry enforced on read, the auto re-lock).

import type { IaRepository } from './repository'
import type {
  Course, Enrollment, RequirementDef, RequirementState, Section, Student,
  TeachingAssignment, User,
} from '../types'
import type {
  IaMarksRow, IaMarksView, MarkEvent, MarkEventRow, MarkUnlock, SampleRequest,
} from '../ia/types'
import { iaTotal, templateOf } from '../templates'
import { todayRiyadh } from './dates'

/** How long a coordinator unlock lasts before it re-locks itself. */
const UNLOCK_MINUTES = 30

export function makeIaRepository(deps: {
  courses: Course[]
  sections: Section[]
  enrollments: Enrollment[]
  students: Student[]
  users: User[]
  assignments: TeachingAssignment[]
  defs: RequirementDef[]
  states: RequirementState[]
  events: MarkEvent[]
  unlocks: MarkUnlock[]
  samples: SampleRequest[]
}): IaRepository {
  const {
    courses, sections, enrollments, students, users, assignments, defs, states,
    events, unlocks, samples,
  } = deps

  // Both scoped by school: a def or state reached with another school's id is a
  // boundary violation, not a lookup miss.
  const defFor = (schoolId: string, cohortId: string, courseId: string, suffix: string) => {
    const d = defs.find((x) => x.cohortId === cohortId && x.key === courseId + suffix) ?? null
    if (d && d.schoolId !== schoolId) {
      throw new Error('That requirement definition is not at this school.')
    }
    return d
  }

  const stateFor = (schoolId: string, studentId: string, defId: string) =>
    states.find(
      (s) => s.schoolId === schoolId && s.studentId === studentId && s.requirementDefId === defId,
    ) ?? null

  /** Find-or-create — a state exists only once something is recorded against it. */
  const ensureState = (schoolId: string, studentId: string, defId: string): RequirementState => {
    let s = stateFor(schoolId, studentId, defId)
    if (!s) {
      s = {
        studentId, requirementDefId: defId, schoolId,
        recordStatus: 'not_started', artifacts: [],
      }
      states.push(s)
    }
    return s
  }

  const nameOf = (userId: string) => users.find((u) => u.id === userId)?.name ?? userId

  const sectionIdsOf = (courseId: string, cohortId: string) =>
    sections.filter((s) => s.courseId === courseId && s.cohortId === cohortId).map((s) => s.id)

  /**
   * The designated marker of a section of this course, in this cohort —
   * optionally one that contains this student. Co-teachers deliberately fail
   * this: the model keeps room for them, but only the marker writes.
   */
  const markerFor = (courseId: string, cohortId: string, userId: string, studentId?: string) => {
    const mine = sectionIdsOf(courseId, cohortId)
    return assignments.some(
      (a) =>
        a.isDesignatedMarker && a.teacherId === userId && mine.includes(a.sectionId) &&
        (studentId == null ||
          enrollments.some((e) => e.studentId === studentId && e.sectionId === a.sectionId)),
    )
  }

  const unexpired = (u: MarkUnlock) => new Date(u.expiresAt).getTime() > Date.now()

  const liveUnlockOf = (schoolId: string, courseId: string, userId: string) =>
    unlocks.find(
      (u) =>
        u.schoolId === schoolId && u.courseId === courseId && u.userId === userId && unexpired(u),
    ) ?? null

  /** APPEND-ONLY. The trail's whole value is that nothing ever rewrites it. */
  const logEvent = (e: Omit<MarkEvent, 'id' | 'at'>) => {
    events.push({ ...e, id: 'me_' + (events.length + 1), at: new Date().toISOString() })
  }

  /**
   * What a write should stamp on its event: nothing for the marker's own
   * entry, the unlock's reason when the writer is riding an override.
   */
  const overrideReasonFor = (
    schoolId: string, courseId: string, cohortId: string, studentId: string, by: string,
  ) =>
    markerFor(courseId, cohortId, by, studentId)
      ? undefined
      : liveUnlockOf(schoolId, courseId, by)?.reason

  return {
    async getMarksView(schoolId, courseId, cohortId) {
      const course = courses.find((c) => c.id === courseId && c.schoolId === schoolId)
      if (!course || course.type !== 'subject') return null

      const markDef = defFor(schoolId, cohortId, courseId, '.mark')
      const fileDef = defFor(schoolId, cohortId, courseId, '.file')
      const commentDef = defFor(schoolId, cohortId, courseId, '.comment')
      if (!markDef) return null

      const t = templateOf(course.iaTemplateKey)
      const criteria = markDef.criteria ?? []

      const sectionIds = sectionIdsOf(courseId, cohortId)
      const enrolled = students.filter((st) =>
        enrollments.some((e) => e.studentId === st.userId && sectionIds.includes(e.sectionId)),
      )

      const markerId = assignments.find(
        (a) => sectionIds.includes(a.sectionId) && a.isDesignatedMarker,
      )?.teacherId
      const marker = users.find((u) => u.id === markerId)?.name ?? null

      const rows: IaMarksRow[] = enrolled
        .map<IaMarksRow>((st) => {
          const mark = stateFor(schoolId, st.userId, markDef.id)
          const file = fileDef ? stateFor(schoolId, st.userId, fileDef.id) : null
          const comment = commentDef ? stateFor(schoolId, st.userId, commentDef.id) : null
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
      const markDef = defFor(schoolId, cohortId, courseId, '.mark')
      if (!markDef) return
      const s = ensureState(schoolId, studentId, markDef.id)
      if (s.lockedAt != null) return

      const criteria = markDef.criteria ?? []
      let prev: number | null
      let next: number | null
      let criterion: string
      if (criteria.length === 0) {
        // Total-only family: the single mark IS the recording.
        prev = s.mark ?? null
        next = value == null ? null : Math.max(0, Math.min(markDef.markMax ?? 25, value))
        criterion = 'total'
        s.mark = next == null ? undefined : next
        s.recordStatus = value == null ? 'not_started' : 'marked'
      } else {
        if (index < 0 || index >= criteria.length) return
        const marks = s.criterionMarks ?? criteria.map(() => null)
        prev = marks[index]
        next = value == null ? null : Math.max(0, Math.min(criteria[index].max, value))
        criterion = criteria[index].key
        marks[index] = next
        s.criterionMarks = marks
        // recordStatus is DERIVED from what is entered — never set independently.
        const entered = marks.filter((m) => m != null).length
        s.recordStatus =
          entered === 0 ? 'not_started' : entered === criteria.length ? 'marked' : 'in_progress'
        s.mark = undefined // the total is never stored — invariant #2
      }
      s.recordedBy = nameOf(by)
      s.recordedAt = todayRiyadh()
      logEvent({
        schoolId, cohortId, courseId, studentId, kind: 'mark',
        criterion, prev, next, byUserId: by,
        overrideReason: overrideReasonFor(schoolId, courseId, cohortId, studentId, by),
      })
    },

    async setComment(schoolId, courseId, cohortId, studentId, text, by) {
      const commentDef = defFor(schoolId, cohortId, courseId, '.comment')
      if (!commentDef) return
      const s = ensureState(schoolId, studentId, commentDef.id)
      const body = text.trim()
      const prev = s.artifacts.find((a) => a.kind === 'text')?.body ?? null
      s.artifacts = body
        ? [{
            id: commentDef.id + ':' + studentId, kind: 'text',
            label: 'Teacher comment', body,
            addedAt: todayRiyadh(),
          }]
        : []
      s.recordStatus = body ? 'submitted' : 'not_started'
      s.recordedBy = nameOf(by)
      s.recordedAt = todayRiyadh()
      logEvent({
        schoolId, cohortId, courseId, studentId, kind: 'comment',
        prev, next: body || null, byUserId: by,
        overrideReason: overrideReasonFor(schoolId, courseId, cohortId, studentId, by),
      })
    },

    async setTypedIntoIbis(schoolId, courseId, cohortId, studentId, on, by) {
      const markDef = defFor(schoolId, cohortId, courseId, '.mark')
      if (!markDef) return
      const s = stateFor(schoolId, studentId, markDef.id)
      // Nothing recorded means nothing to type — refuse rather than invent a state.
      if (!s || iaTotal(markDef.criteria, s) == null) return
      const wasTyped = s.exportStatus === 'submitted'
      // eCoursework's own word, on the export axis; the school record is untouched.
      // Unticking stores NOTHING — "ready" is derivable, and a stored copy of a
      // derivable fact is exactly what invariant #2 forbids.
      s.exportStatus = on ? 'submitted' : undefined
      logEvent({
        schoolId, cohortId, courseId, studentId, kind: 'transcribe',
        prev: wasTyped ? 'typed' : null, next: on ? 'typed' : null, byUserId: by,
      })
    },

    // ------------------------------------------- authorization & the trail

    async isMarkerFor(schoolId, courseId, cohortId, userId, studentId) {
      const course = courses.find((c) => c.id === courseId && c.schoolId === schoolId)
      if (!course) return false
      return markerFor(courseId, cohortId, userId, studentId)
    },

    async activeUnlock(schoolId, courseId, userId) {
      // Lazy pruning is the fixture's version of the 30-minute timer: an
      // expired unlock stops working the moment anything asks about it.
      for (let i = unlocks.length - 1; i >= 0; i--) {
        if (!unexpired(unlocks[i])) unlocks.splice(i, 1)
      }
      return liveUnlockOf(schoolId, courseId, userId)
    },

    async unlockMarks(schoolId, courseId, cohortId, userId, reason) {
      const trimmed = reason.trim()
      if (!trimmed) throw new Error('An unlock needs a reason — it goes in the audit trail.')
      const course = courses.find((c) => c.id === courseId && c.schoolId === schoolId)
      if (!course) throw new Error('That course is not at this school.')
      // One unlock per (user, course): a fresh one replaces, never stacks.
      for (let i = unlocks.length - 1; i >= 0; i--) {
        const u = unlocks[i]
        if (u.schoolId === schoolId && u.courseId === courseId && u.userId === userId) {
          unlocks.splice(i, 1)
        }
      }
      const now = Date.now()
      const unlock: MarkUnlock = {
        id: `ul_${courseId}_${userId}_${now}`,
        schoolId, cohortId, courseId, userId,
        reason: trimmed,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + UNLOCK_MINUTES * 60_000).toISOString(),
      }
      unlocks.push(unlock)
      logEvent({
        schoolId, cohortId, courseId, studentId: null, kind: 'unlock',
        prev: null, next: null, byUserId: userId, overrideReason: trimmed,
      })
      return unlock
    },

    async relockMarks(schoolId, courseId, userId) {
      let ended: MarkUnlock | null = null
      for (let i = unlocks.length - 1; i >= 0; i--) {
        const u = unlocks[i]
        if (u.schoolId === schoolId && u.courseId === courseId && u.userId === userId) {
          if (unexpired(u)) ended = u
          unlocks.splice(i, 1)
        }
      }
      // Relocking what was already locked records nothing — only the act.
      if (ended) {
        logEvent({
          schoolId, cohortId: ended.cohortId, courseId, studentId: null, kind: 'relock',
          prev: null, next: null, byUserId: userId, overrideReason: ended.reason,
        })
      }
    },

    // --------------------------------------------- the moderation sample

    async getSampleRequest(schoolId, courseId, cohortId) {
      return (
        samples.find(
          (s) =>
            s.schoolId === schoolId && s.courseId === courseId && s.cohortId === cohortId,
        ) ?? null
      )
    },

    async saveSampleRequest(schoolId, courseId, cohortId, studentIds, by) {
      const course = courses.find((c) => c.id === courseId && c.schoolId === schoolId)
      if (!course) throw new Error('That course is not at this school.')
      // Only candidates of THIS course × cohort can be sampled — anything else
      // in the list is a client mistake and is dropped rather than stored.
      const sectionIds = sectionIdsOf(courseId, cohortId)
      const valid = [...new Set(studentIds)].filter((id) =>
        enrollments.some((e) => e.studentId === id && sectionIds.includes(e.sectionId)),
      )
      // AT MOST ONE live per course + cohort: a new selection replaces the
      // draft (and always lands as a draft — submission is its own act).
      const existing = samples.find(
        (s) => s.schoolId === schoolId && s.courseId === courseId && s.cohortId === cohortId,
      )
      if (existing) {
        existing.studentIds = valid
        existing.status = 'draft'
        existing.submittedAt = undefined
        existing.recordedBy = nameOf(by)
        existing.recordedAt = new Date().toISOString()
        return existing
      }
      const sample: SampleRequest = {
        id: `sr_${courseId}_${cohortId}`,
        schoolId, cohortId, courseId,
        studentIds: valid,
        recordedBy: nameOf(by),
        recordedAt: new Date().toISOString(),
        status: 'draft',
      }
      samples.push(sample)
      return sample
    },

    async setSampleSubmitted(schoolId, courseId, cohortId, on, by) {
      const sample = samples.find(
        (s) => s.schoolId === schoolId && s.courseId === courseId && s.cohortId === cohortId,
      )
      if (!sample) throw new Error('No moderation sample is recorded for this course yet.')
      sample.status = on ? 'submitted' : 'draft'
      sample.submittedAt = on ? new Date().toISOString() : undefined
      sample.recordedBy = nameOf(by)
    },

    async listMarkEvents(schoolId, courseId, cohortId) {
      return events
        .filter(
          (e) => e.schoolId === schoolId && e.courseId === courseId && e.cohortId === cohortId,
        )
        .map<MarkEventRow>((e) => ({
          id: e.id,
          at: e.at,
          kind: e.kind,
          byName: nameOf(e.byUserId),
          studentName: e.studentId ? nameOf(e.studentId) : null,
          criterion: e.criterion ?? null,
          prev: e.prev,
          next: e.next,
          overrideReason: e.overrideReason ?? null,
        }))
        // Appended in time order, so newest-first is a reverse, not a sort.
        .reverse()
    },
  }
}
