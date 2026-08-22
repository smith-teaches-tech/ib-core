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
import { fileOf } from '../files'
import { outstandingReturn, type ReturnEvent } from '../returns'
import { releaseBlockers, type BatchRelease } from '../ia/marking'
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
  /**
   * THE SAME ARRAY the returns repository appends to — read here, never
   * written. Returns are folded into this course's history rather than copied
   * onto it, so the two can never disagree about what happened.
   */
  returns: ReturnEvent[]
}): IaRepository {
  const {
    courses, sections, enrollments, students, users, assignments, defs, states,
    events, unlocks, samples, returns,
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
            // A released mark is one whose state SAYS released — there is no
            // second flag to keep in step with the status.
            releasedAt: mark?.recordStatus === 'released' ? (mark.recordedAt ?? null) : null,
            releaseBlockers: releaseBlockers({
              total: iaTotal(criteria, mark),
              comment: commentBody,
              filed: file != null && file.recordStatus !== 'not_started',
            }),
            fileDisplay:
              file == null || file.recordStatus === 'not_started'
                ? 'not_started'
                : file.recordStatus === 'in_progress'
                  ? 'partial'
                  : 'done',
            file: fileOf(file),
            // Only ever set when nothing is filed — `outstandingReturn` reads
            // the state, so a candidate who has refiled has no return showing
            // and nobody has to remember to clear a flag.
            returned: fileDef
              ? outstandingReturn(
                  returns.filter(
                    (r) => r.studentId === st.userId && r.requirementDefId === fileDef.id,
                  ),
                  file,
                )
              : null,
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
        // Both off the DEF, not off the template: a def is immutable once work
        // exists against it, so a candidate who filed under last year's rules
        // is still read under last year's rules.
        accepts: fileDef?.accepts,
        exportsToIb: fileDef?.exportTarget != null,
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

    // ------------------------------------------- release

    /**
     * PUT THE MARK IN FRONT OF THE CANDIDATE.
     *
     * The blockers are checked HERE rather than in the action — TOK's pattern
     * rather than the EE's — because a repository method that trusts its
     * caller to have checked is one direct call away from releasing an
     * unjustified mark. The action re-checks the CAPABILITY; the rules live
     * with the write.
     *
     * `lockedAt` is what makes the standing rule true: setCriterionMark already
     * refuses a locked state, so "a released mark is not editable in place"
     * needs no new check anywhere. Revoking clears it.
     */
    async releaseMark(schoolId, courseId, cohortId, studentId, by) {
      const markDef = defFor(schoolId, cohortId, courseId, '.mark')
      if (!markDef) return { ok: false, blockers: [{ key: 'course', message: 'No such course.' }] }
      const s = stateFor(schoolId, studentId, markDef.id)
      const fileDef = defFor(schoolId, cohortId, courseId, '.file')
      const fileState = fileDef ? stateFor(schoolId, studentId, fileDef.id) : null
      const commentDef = defFor(schoolId, cohortId, courseId, '.comment')
      const comment = commentDef
        ? (stateFor(schoolId, studentId, commentDef.id)?.artifacts.find((a) => a.kind === 'text')
            ?.body ?? null)
        : null

      const blockers = releaseBlockers({
        total: iaTotal(markDef.criteria ?? [], s),
        comment,
        filed: fileState != null && fileState.recordStatus !== 'not_started',
      })
      if (blockers.length > 0 || !s) return { ok: false, blockers }
      if (s.recordStatus === 'released') return { ok: true, blockers: [] }

      s.recordStatus = 'released'
      s.lockedAt = new Date(todayRiyadh() + 'T00:00:00.000Z').toISOString()
      s.recordedBy = nameOf(by)
      s.recordedAt = todayRiyadh()
      logEvent({
        schoolId, cohortId, courseId, studentId, kind: 'release',
        prev: 'marked', next: 'released', byUserId: by,
      })
      return { ok: true, blockers: [] }
    },

    /** Take it back. Recorded, because "they saw it and then it changed" is a
     *  question that gets asked, and the mark returns to editable. */
    async revokeMark(schoolId, courseId, cohortId, studentId, by) {
      const markDef = defFor(schoolId, cohortId, courseId, '.mark')
      if (!markDef) return
      const s = stateFor(schoolId, studentId, markDef.id)
      if (!s || s.recordStatus !== 'released') return
      // Back to what the marks themselves say — never a stored guess.
      const criteria = markDef.criteria ?? []
      const entered = (s.criterionMarks ?? []).filter((m) => m != null).length
      s.recordStatus =
        criteria.length === 0
          ? s.mark == null ? 'not_started' : 'marked'
          : entered === 0 ? 'not_started' : entered === criteria.length ? 'marked' : 'in_progress'
      delete s.lockedAt
      s.recordedBy = nameOf(by)
      s.recordedAt = todayRiyadh()
      logEvent({
        schoolId, cohortId, courseId, studentId, kind: 'revoke',
        prev: 'released', next: s.recordStatus, byUserId: by,
      })
    },

    /**
     * THE WHOLE CLASS AT ONCE — skipping, never failing.
     *
     * Same shape as setJobSubmitted: iterate the enrolled roster, release what
     * qualifies, and report what did not and why. A class of twenty where two
     * marks are unjustified releases eighteen; refusing all twenty over two is
     * how a button stops being used.
     */
    async releaseCourse(schoolId, courseId, cohortId, by): Promise<BatchRelease> {
      const view = await this.getMarksView(schoolId, courseId, cohortId)
      if (!view) return { released: 0, skipped: [] }
      const out: BatchRelease = { released: 0, skipped: [] }
      for (const row of view.rows) {
        if (row.releasedAt != null) continue
        if (row.releaseBlockers.length > 0) {
          out.skipped.push({ studentId: row.studentId, name: row.name, blockers: row.releaseBlockers })
          continue
        }
        const r = await this.releaseMark(schoolId, courseId, cohortId, row.studentId, by)
        if (r.ok) out.released += 1
        else out.skipped.push({ studentId: row.studentId, name: row.name, blockers: r.blockers })
      }
      return out
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
      // The file requirement's returns, as trail rows. Derived on read — the
      // ReturnEvent is the record and this is a second reader of it, which is
      // invariant #2 applied to an audit trail.
      const fileDef = defFor(schoolId, cohortId, courseId, '.file')
      const returnRows: MarkEventRow[] = fileDef
        ? returns
            .filter((r) => r.schoolId === schoolId && r.requirementDefId === fileDef.id)
            .map((r) => ({
              id: r.id,
              at: r.at,
              kind: 'return' as const,
              byName: r.byName,
              studentName: nameOf(r.studentId),
              criterion: null,
              prev: r.fileName,
              next: null,
              overrideReason: null,
              note: r.note,
            }))
        : []
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
        // The returns come from a different array, so THIS pair does need a
        // sort — two append-only lists interleaved are not one append-only list.
        .concat(returnRows)
        .sort((a, b) => b.at.localeCompare(a.at))
    },
  }
}
