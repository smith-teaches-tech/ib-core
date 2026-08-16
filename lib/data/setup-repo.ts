// The fixture implementation of SetupRepository.
//
// A factory, like the CAS one, so it can be handed the spine arrays from
// ./fixtures without the two files importing each other.
//
// Every write here mutates a PINNED array (see ./pin.ts). That is what makes an
// imported student visible on the very next page render instead of vanishing
// into a second module instance.

import type { SetupRepository } from './repository'
import type {
  Cohort, Course, Enrollment, Membership, RequirementDef, RequirementState,
  Section, Student, TeachingAssignment, User,
} from '../types'
import type { MarkEvent } from '../ia/types'
import { resolveCapabilities } from '../capabilities'
import { templateOf } from '../templates'
import { normaliseSessionNumber, parseIdentifiers, parseRoster } from '../setup/parse'
import type { CourseRow, PersonRow } from '../setup/types'

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28) || 'course'

export function makeSetupRepository(deps: {
  courses: Course[]
  sections: Section[]
  enrollments: Enrollment[]
  users: User[]
  students: Student[]
  memberships: Membership[]
  assignments: TeachingAssignment[]
  defs: RequirementDef[]
  cohorts: Cohort[]
  /** Read-only here — removeCourse refuses whenever these reference the course. */
  states: RequirementState[]
  events: MarkEvent[]
}): SetupRepository {
  const {
    courses, sections, enrollments, users, students, memberships, assignments, defs, cohorts,
    states, events,
  } = deps

  const uniqueId = (base: string, taken: (id: string) => boolean) => {
    let id = base
    let n = 2
    while (taken(id)) id = `${base}_${n++}`
    return id
  }

  /** Scope is a boundary: a ref from another school is an error, not a no-op. */
  const sectionAt = (schoolId: string, sectionId: string) => {
    const section = sections.find((s) => s.id === sectionId && s.schoolId === schoolId)
    if (!section) throw new Error('That section is not at this school.')
    return section
  }

  /**
   * THE IMPLICIT SECTION — exactly one per course per cohort, and the whole
   * of what "Section" means to a user now (which is: nothing). Course-level
   * operations resolve through this; a course with no section simply does not
   * run for that year group.
   */
  const implicitSection = (schoolId: string, cohortId: string, courseId: string) => {
    const section = sections.find(
      (s) => s.schoolId === schoolId && s.cohortId === cohortId && s.courseId === courseId,
    )
    if (!section) throw new Error('That course does not run for that year group.')
    return section
  }

  /**
   * THE def-instantiation path — a subject course's IA requirement set for one
   * cohort, from its TEMPLATE FAMILY: the right rubric and the right mark
   * maximum, not a guessed /25. addCourse and cloneCohortStructure both come
   * through here, so there is exactly one place template logic lives.
   */
  const instantiateIaDefs = (
    course: { id: string; name: string; iaTemplateKey?: string },
    cohortId: string,
    schoolId: string,
  ) => {
    const t = templateOf(course.iaTemplateKey)
    const order = defs.reduce((n, d) => Math.max(n, d.order), 0)
    defs.push(
      {
        id: `${cohortId}:${course.id}.file`, schoolId, cohortId,
        scope: { kind: 'course', courseId: course.id },
        key: course.id + '.file', label: `${course.name} — ${t.component}`,
        lane: 'Internal assessment',
        order: order + 1, recordedBy: 'student', artifact: 'file', exportTarget: 'ecoursework',
      },
      {
        id: `${cohortId}:${course.id}.mark`, schoolId, cohortId,
        scope: { kind: 'course', courseId: course.id },
        key: course.id + '.mark', label: course.name + ' — mark', lane: 'Internal assessment',
        order: order + 2, recordedBy: 'staff', artifact: 'mark',
        markMax: t.markMax,
        criteria: t.criteria.length > 0 ? t.criteria : undefined,
        exportTarget: 'ibis_ia_marks',
      },
      {
        id: `${cohortId}:${course.id}.comment`, schoolId, cohortId,
        scope: { kind: 'course', courseId: course.id },
        key: course.id + '.comment', label: course.name + ' — teacher comment',
        lane: 'Internal assessment',
        order: order + 3, recordedBy: 'staff', artifact: 'text',
      },
    )
  }

  return {
    // ------------------------------------------------------------- reads

    async listCohorts(schoolId) {
      return cohorts.filter((c) => c.schoolId === schoolId)
    },

    async listCohortSummaries(schoolId) {
      return cohorts
        .filter((c) => c.schoolId === schoolId)
        .map((cohort) => {
          const mine = sections.filter(
            (s) => s.cohortId === cohort.id && s.schoolId === schoolId,
          )
          return {
            cohort,
            students: students.filter(
              (s) => s.cohortId === cohort.id && s.schoolId === schoolId,
            ).length,
            courses: new Set(mine.map((s) => s.courseId)).size,
          }
        })
    },

    async listCourseRows(schoolId, cohortId) {
      return courses
        .filter((c) => c.schoolId === schoolId)
        .map<CourseRow>((course) => {
          const mine = sections.filter((s) => s.courseId === course.id && s.cohortId === cohortId)
          const rows = mine.map((section) => ({
            section,
            students: enrollments.filter((e) => e.sectionId === section.id).length,
            teachers: assignments
              .filter((a) => a.sectionId === section.id)
              .map((a) => ({
                userId: a.teacherId,
                name: users.find((u) => u.id === a.teacherId)?.name ?? a.teacherId,
                isDesignatedMarker: a.isDesignatedMarker,
              })),
          }))
          return {
            course,
            sections: rows,
            students: rows.reduce((n, r) => n + r.students, 0),
          }
        })
    },

    async listPeople(schoolId, includePins = false, cohortId) {
      const inCohort = (sectionId: string) =>
        cohortId == null || sections.some((s) => s.id === sectionId && s.cohortId === cohortId)
      return memberships
        .filter((m) => m.schoolId === schoolId)
        .map<PersonRow>((membership) => {
          const user = users.find((u) => u.id === membership.userId)!
          const student = students.find((s) => s.userId === membership.userId) ?? null

          // A section IS its course now (exactly one per course per cohort),
          // so its display name is the course name and nothing else — no A/B
          // label anywhere in the product.
          const nameOf = (sectionId: string) => {
            const section = sections.find((s) => s.id === sectionId)
            const course = courses.find((c) => c.id === section?.courseId)
            return course?.name ?? sectionId
          }
          return {
            user,
            membership,
            roles: membership.roles,
            capabilities: [...resolveCapabilities(membership)],
            isStudent: membership.roles.includes('student'),
            studentNumber: student?.studentNumber ?? null,
            candidate: student
              ? {
                  sessionNumber: student.sessionNumber,
                  personalCode: student.personalCode,
                  state: student.identifiersState,
                  // The PIN leaves this repository only when the caller holds
                  // `identifiers.distribute`. Redacting in a component would be
                  // a suggestion; redacting here is the rule.
                  resultsPin: includePins ? student.resultsPin : null,
                  hasPin: student.resultsPin != null,
                }
              : null,
            teaches: assignments
              .filter((a) => a.teacherId === membership.userId && inCohort(a.sectionId))
              .map((a) => ({ sectionId: a.sectionId, label: nameOf(a.sectionId) })),
            enrolled: enrollments
              .filter((e) => e.studentId === membership.userId && inCohort(e.sectionId))
              .map((e) => ({ sectionId: e.sectionId, label: nameOf(e.sectionId) }))
              .sort((a, b) => a.label.localeCompare(b.label)),
          }
        })
        .filter((p) => p.user != null)
        .sort((a, b) => Number(a.isStudent) - Number(b.isStudent) || a.user.name.localeCompare(b.user.name))
    },

    async previewImport(schoolId, text) {
      // Collision is checked against EVERY user, not just this school's students:
      // a teacher and a student must never end up sharing an identity.
      return parseRoster(text, users.map((u) => u.email))
    },

    // ---------------------------------------------------------- students

    async importStudents(schoolId, cohortId, rows) {
      let added = 0
      for (const row of rows) {
        if (row.verdict !== 'new') continue
        if (users.some((u) => u.email.toLowerCase() === row.email)) continue

        const id = uniqueId('s_' + slug(row.email.split('@')[0]), (x) => users.some((u) => u.id === x))
        const name = [row.lastName, row.firstName].filter(Boolean).join(', ')

        users.push({ id, name, email: row.email, status: 'invited' })
        students.push({
          userId: id,
          schoolId,
          cohortId,
          studentNumber: row.studentNumber || null,
          // All three IB identifiers arrive after exams are ordered.
          sessionNumber: null,
          personalCode: null,
          resultsPin: null,
          identifiersState: 'missing',
        })
        memberships.push({
          userId: id, schoolId, roles: ['student'],
          presetKey: 'student', addedCapabilities: [], removedCapabilities: [],
        })
        added += 1
      }
      return added
    },

    // --------------------------------------------------------- catalogue

    async addCourse(schoolId, input, cohortId) {
      const id = uniqueId(slug(input.name), (x) => courses.some((c) => c.id === x))
      const t = templateOf(input.iaTemplateKey)
      courses.push({
        id, schoolId, type: 'subject',
        name: input.name.trim(),
        subjectGroup: input.subjectGroup,
        level: input.level,
        iaTemplateKey: t.key,
      })

      // A new course with no requirements would be invisible everywhere
      // downstream, so its IA defs are instantiated FROM ITS TEMPLATE FAMILY —
      // the right rubric and the right mark maximum, not a guessed /25. A family
      // whose criterion split is unconfirmed arrives total-only and says so.
      instantiateIaDefs({ id, name: input.name.trim(), iaTemplateKey: t.key }, cohortId, schoolId)

      sections.push({ id: id + '_a', schoolId, courseId: id, cohortId, label: 'A' })
      return id
    },

    async addSection(schoolId, courseId, cohortId, label) {
      // ONE section per course per cohort — the invariant that makes sections
      // invisible. Asking to run a course that already runs returns the
      // existing section rather than minting a second group.
      const existing = sections.find(
        (s) => s.schoolId === schoolId && s.courseId === courseId && s.cohortId === cohortId,
      )
      if (existing) return existing.id
      const id = uniqueId(courseId + '_' + slug(label), (x) => sections.some((s) => s.id === x))
      sections.push({ id, schoolId, courseId, cohortId, label: label.trim() || 'A' })
      return id
    },

    async removeCourse(schoolId, courseId, cohortId) {
      const course = courses.find((c) => c.id === courseId && c.schoolId === schoolId)
      if (!course) throw new Error('That course is not at this school.')
      const courseDefs = defs.filter(
        (d) =>
          d.schoolId === schoolId && d.cohortId === cohortId &&
          d.scope.kind === 'course' && d.scope.courseId === courseId,
      )
      // The refusal, and it is the whole safety of the feature: any recorded
      // work — marks, files, comments, or a mark event in the audit trail —
      // means this course carries history that belongs to its year.
      const defIds = new Set(courseDefs.map((d) => d.id))
      const hasStates = states.some((s) => defIds.has(s.requirementDefId))
      const hasEvents = events.some(
        (e) => e.schoolId === schoolId && e.courseId === courseId && e.cohortId === cohortId,
      )
      if (hasStates || hasEvents) {
        throw new Error(
          'Recorded work exists for this course — archive the cohort instead of removing it.',
        )
      }

      const mine = sections.filter(
        (s) => s.schoolId === schoolId && s.courseId === courseId && s.cohortId === cohortId,
      )
      const mineIds = new Set(mine.map((s) => s.id))
      for (let i = enrollments.length - 1; i >= 0; i--) {
        if (mineIds.has(enrollments[i].sectionId)) enrollments.splice(i, 1)
      }
      for (let i = assignments.length - 1; i >= 0; i--) {
        if (mineIds.has(assignments[i].sectionId)) assignments.splice(i, 1)
      }
      for (let i = sections.length - 1; i >= 0; i--) {
        if (mineIds.has(sections[i].id)) sections.splice(i, 1)
      }
      for (let i = defs.length - 1; i >= 0; i--) {
        if (defIds.has(defs[i].id)) defs.splice(i, 1)
      }
      // The catalogue entry outlives cohorts — unless nobody runs it anywhere
      // any more, in which case removing the course removes the course.
      const stillRuns = sections.some((s) => s.courseId === courseId)
      const stillDefined = defs.some(
        (d) => d.scope.kind === 'course' && d.scope.courseId === courseId,
      )
      if (!stillRuns && !stillDefined) {
        const at = courses.findIndex((c) => c.id === courseId)
        if (at >= 0) courses.splice(at, 1)
      }
    },

    async enrolStudent(schoolId, studentId, sectionId) {
      sectionAt(schoolId, sectionId)
      if (enrollments.some((e) => e.studentId === studentId && e.sectionId === sectionId)) return
      enrollments.push({ studentId, sectionId })
    },

    async unenrolStudent(schoolId, studentId, sectionId) {
      sectionAt(schoolId, sectionId)
      const at = enrollments.findIndex((e) => e.studentId === studentId && e.sectionId === sectionId)
      if (at >= 0) enrollments.splice(at, 1)
    },

    // ---- course-level operations — the section resolves internally --------

    async enrolInCourse(schoolId, cohortId, courseId, studentId) {
      const section = implicitSection(schoolId, cohortId, courseId)
      if (enrollments.some((e) => e.studentId === studentId && e.sectionId === section.id)) return
      enrollments.push({ studentId, sectionId: section.id })
    },

    async unenrolFromCourse(schoolId, cohortId, courseId, studentId) {
      const section = implicitSection(schoolId, cohortId, courseId)
      const at = enrollments.findIndex(
        (e) => e.studentId === studentId && e.sectionId === section.id,
      )
      if (at >= 0) enrollments.splice(at, 1)
    },

    // ------------------------------------------------------------- staff

    async inviteTeacher(schoolId, name, email) {
      const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase())
      if (existing) {
        // Already a person here — a teacher at a second school, most likely.
        // Give them a membership rather than a duplicate identity.
        if (!memberships.some((m) => m.userId === existing.id && m.schoolId === schoolId)) {
          memberships.push({
            userId: existing.id, schoolId, roles: ['teacher'],
            presetKey: 'teacher', addedCapabilities: [], removedCapabilities: [],
          })
        }
        return existing.id
      }
      const id = uniqueId('t_' + slug(email.split('@')[0]), (x) => users.some((u) => u.id === x))
      users.push({ id, name: name.trim(), email: email.trim(), status: 'invited' })
      memberships.push({
        userId: id, schoolId, roles: ['teacher'],
        presetKey: 'teacher', addedCapabilities: [], removedCapabilities: [],
      })
      return id
    },

    async assignTeacher(schoolId, teacherId, sectionId) {
      sectionAt(schoolId, sectionId)
      if (assignments.some((a) => a.teacherId === teacherId && a.sectionId === sectionId)) return
      // First teacher on a section is the designated marker; a co-teacher is not.
      const first = !assignments.some((a) => a.sectionId === sectionId)
      assignments.push({ teacherId, sectionId, isDesignatedMarker: first })
    },

    async unassignTeacher(schoolId, teacherId, sectionId) {
      sectionAt(schoolId, sectionId)
      const at = assignments.findIndex((a) => a.teacherId === teacherId && a.sectionId === sectionId)
      if (at >= 0) assignments.splice(at, 1)
    },

    async setDesignatedMarker(schoolId, teacherId, sectionId, on) {
      sectionAt(schoolId, sectionId)
      const mine = assignments.filter((x) => x.sectionId === sectionId)
      // Clearing the LAST marker is refused outright: writes are marker-only
      // (lib/ia/authorize.ts), so a markerless course is an unmarkable course.
      if (
        !on &&
        mine.some((a) => a.teacherId === teacherId && a.isDesignatedMarker) &&
        !mine.some((a) => a.teacherId !== teacherId && a.isDesignatedMarker)
      ) {
        throw new Error(
          'A course needs a designated marker — set another teacher as marker instead of clearing this one.',
        )
      }
      for (const a of mine) {
        // Exactly one marker per course — that is who the IB holds responsible.
        if (a.teacherId === teacherId) a.isDesignatedMarker = on
        else if (on) a.isDesignatedMarker = false
      }
    },

    async assignTeacherToCourse(schoolId, cohortId, courseId, teacherId) {
      const section = implicitSection(schoolId, cohortId, courseId)
      if (assignments.some((a) => a.teacherId === teacherId && a.sectionId === section.id)) return
      const first = !assignments.some((a) => a.sectionId === section.id)
      assignments.push({ teacherId, sectionId: section.id, isDesignatedMarker: first })
    },

    async unassignTeacherFromCourse(schoolId, cohortId, courseId, teacherId) {
      const section = implicitSection(schoolId, cohortId, courseId)
      const at = assignments.findIndex(
        (a) => a.teacherId === teacherId && a.sectionId === section.id,
      )
      if (at >= 0) assignments.splice(at, 1)
    },

    async setCourseMarker(schoolId, cohortId, courseId, teacherId) {
      const section = implicitSection(schoolId, cohortId, courseId)
      // Setting THE marker assigns the teacher if they were not already —
      // markership implies teaching the course.
      if (!assignments.some((a) => a.teacherId === teacherId && a.sectionId === section.id)) {
        assignments.push({ teacherId, sectionId: section.id, isDesignatedMarker: false })
      }
      for (const a of assignments.filter((x) => x.sectionId === section.id)) {
        a.isDesignatedMarker = a.teacherId === teacherId
      }
    },

    async cohortOf(schoolId, ref) {
      const id =
        ref.cohortId ??
        (ref.sectionId
          ? sections.find((x) => x.id === ref.sectionId && x.schoolId === schoolId)?.cohortId
          : undefined) ??
        (ref.studentId
          ? students.find((x) => x.userId === ref.studentId && x.schoolId === schoolId)?.cohortId
          : undefined)
      return cohorts.find((c) => c.id === id && c.schoolId === schoolId) ?? null
    },

    async setCohortArchived(schoolId, cohortId, archived) {
      const cohort = cohorts.find((c) => c.id === cohortId && c.schoolId === schoolId)
      if (cohort) cohort.archived = archived
    },

    async createCohort(schoolId, label, gradYear) {
      const name = label.trim()
      if (!name) throw new Error('A cohort needs a label — "Class of 2029" is the convention.')
      if (!Number.isInteger(gradYear) || gradYear < 2000 || gradYear > 2100) {
        throw new Error('The graduating year should be a four-digit year.')
      }
      const mine = cohorts.filter((c) => c.schoolId === schoolId)
      if (mine.some((c) => c.label.toLowerCase() === name.toLowerCase())) {
        throw new Error('A cohort with that label already exists at this school.')
      }
      // The school's own running cohort number continues the sequence — the
      // two names ISG already uses, no third invented.
      const numbers = mine.map((c) => c.number).filter((n): n is number => n != null)
      const id = uniqueId(
        'c' + String(gradYear).slice(-2),
        (x) => cohorts.some((c) => c.id === x),
      )
      cohorts.push({
        id, schoolId, label: name,
        number: numbers.length > 0 ? Math.max(...numbers) + 1 : null,
        gradYear,
        // Live from birth — nothing archives itself (lib/cohorts.ts).
        archived: false,
      })
      return id
    },

    async cloneCohortStructure(schoolId, fromCohortId, toCohortId) {
      const from = cohorts.find((c) => c.id === fromCohortId && c.schoolId === schoolId)
      const to = cohorts.find((c) => c.id === toCohortId && c.schoolId === schoolId)
      if (!from || !to) throw new Error('Both year groups must be at this school.')

      const srcSections = sections.filter(
        (s) => s.cohortId === fromCohortId && s.schoolId === schoolId,
      )

      // STRUCTURE ONLY. Fresh IA defs come from the CURRENT templates via the
      // same path addCourse uses — a rubric that changed between sessions
      // versions forward here, never backwards. Students, enrolments, marks
      // and states are never copied: recorded work belongs to its own year.
      for (const courseId of [...new Set(srcSections.map((s) => s.courseId))]) {
        const course = courses.find((c) => c.id === courseId && c.schoolId === schoolId)
        if (
          course && course.type === 'subject' &&
          !defs.some((d) => d.cohortId === toCohortId && d.key === courseId + '.mark')
        ) {
          instantiateIaDefs(course, toCohortId, schoolId)
        }
      }

      for (const src of srcSections) {
        const id = uniqueId(
          `${src.courseId}_${toCohortId}_${slug(src.label)}`,
          (x) => sections.some((s) => s.id === x),
        )
        sections.push({ id, schoolId, courseId: src.courseId, cohortId: toCohortId, label: src.label })
        // The same people teach it until somebody says otherwise — markership
        // included, because a section without a designated marker is a gap the
        // marks screen would flag all year.
        for (const a of assignments.filter((x) => x.sectionId === src.id)) {
          assignments.push({ teacherId: a.teacherId, sectionId: id, isDesignatedMarker: a.isDesignatedMarker })
        }
      }
    },

    // ------------------------------------------------- IB identifiers

    async setIdentifiers(schoolId, studentId, input) {
      const student = students.find((x) => x.userId === studentId && x.schoolId === schoolId)
      if (!student) return
      if (input.sessionNumber !== undefined) {
        if (!input.sessionNumber.trim()) {
          student.sessionNumber = null
        } else {
          const n = normaliseSessionNumber(input.sessionNumber)
          if (!n) throw new Error('A candidate session number is 1–4 digits.')
          student.sessionNumber = n
        }
      }
      if (input.personalCode !== undefined) student.personalCode = input.personalCode || null
      if (input.resultsPin !== undefined) student.resultsPin = input.resultsPin || null

      // The state is derived from what is actually there, except for the
      // confirmation itself, which is a recorded act.
      if (!student.personalCode && !student.sessionNumber) student.identifiersState = 'missing'
      else if (input.confirmed === true) student.identifiersState = 'confirmed'
      else if (input.confirmed === false) student.identifiersState = 'unconfirmed'
      else if (student.identifiersState === 'missing') student.identifiersState = 'unconfirmed'
    },

    async previewIdentifiers(schoolId, text) {
      return parseIdentifiers(
        text,
        students
          .filter((x) => x.schoolId === schoolId)
          .map((x) => ({
            userId: x.userId,
            name: users.find((u) => u.id === x.userId)?.name ?? '',
            email: users.find((u) => u.id === x.userId)?.email ?? '',
            studentNumber: x.studentNumber,
          })),
      )
    },

    async importIdentifiers(schoolId, rows) {
      let applied = 0
      for (const row of rows) {
        if (!row.studentId) continue
        const student = students.find((x) => x.userId === row.studentId && x.schoolId === schoolId)
        if (!student) continue
        const before = {
          sessionNumber: student.sessionNumber,
          personalCode: student.personalCode,
          resultsPin: student.resultsPin,
        }
        if (row.sessionNumber) {
          const n = normaliseSessionNumber(row.sessionNumber)
          if (n) student.sessionNumber = n
        }
        if (row.personalCode) student.personalCode = row.personalCode
        if (row.resultsPin) student.resultsPin = row.resultsPin
        if (student.identifiersState === 'missing') student.identifiersState = 'unconfirmed'
        // A confirmation covered the values it was made against. Overwrite one
        // and the confirmation no longer describes what is stored.
        else if (
          student.identifiersState === 'confirmed' &&
          (student.sessionNumber !== before.sessionNumber ||
            student.personalCode !== before.personalCode ||
            student.resultsPin !== before.resultsPin)
        ) {
          student.identifiersState = 'unconfirmed'
        }
        applied += 1
      }
      return applied
    },

    // -------------------------------------------------------- delegation

    async setCapability(schoolId, userId, capability, granted) {
      const m = memberships.find((x) => x.userId === userId && x.schoolId === schoolId)
      if (!m) return
      m.addedCapabilities = m.addedCapabilities.filter((c) => c !== capability)
      m.removedCapabilities = m.removedCapabilities.filter((c) => c !== capability)
      // Store the DEVIATION, not the answer: if the preset already agrees,
      // record nothing, so a later change to the preset still reaches them.
      const fromPreset = resolveCapabilities({
        ...m, addedCapabilities: [], removedCapabilities: [],
      }).has(capability)
      if (granted && !fromPreset) m.addedCapabilities.push(capability)
      if (!granted && fromPreset) m.removedCapabilities.push(capability)
    },

    async setPreset(schoolId, userId, presetKey) {
      const m = memberships.find((x) => x.userId === userId && x.schoolId === schoolId)
      if (!m) throw new Error('That person has no membership at this school.')

      const isStudent = m.roles.includes('student')
      if (isStudent && presetKey !== 'student') {
        throw new Error('A student membership takes only the student preset.')
      }
      if (!isStudent && presetKey === 'student') {
        throw new Error('The student preset is for students.')
      }

      // EXACTLY ONE district coordinator, enforced at the data layer rather
      // than only in the screen. Michael's two memberships are one person —
      // the guard is per USER, so holding the tier at both schools is fine.
      if (
        presetKey === 'district' &&
        memberships.some((x) => x.presetKey === 'district' && x.userId !== userId)
      ) {
        throw new Error(
          'There is already a district coordinator — transfer instead. (A transfer flow is future work.)',
        )
      }

      m.presetKey = presetKey
      // Deviations were recorded RELATIVE TO the old preset; under a new one
      // they would mean something different, so a preset change clears them.
      m.addedCapabilities = []
      m.removedCapabilities = []

      // Keep the tier roles in step with the preset — the pages dispatch
      // coordinator views on them. Specialist roles (cas_coordinator, …) are
      // the person's jobs and survive a preset change untouched.
      m.roles = m.roles.filter(
        (r) => r !== 'district_coordinator' && r !== 'school_coordinator',
      )
      if (presetKey === 'district') m.roles.unshift('district_coordinator')
      else if (presetKey === 'school_full' || presetKey === 'school_standard') {
        m.roles.unshift('school_coordinator')
      }
      if (m.roles.length === 0) m.roles.push('teacher')
    },
  }
}
