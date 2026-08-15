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
  Course, Enrollment, Membership, RequirementDef, Section, Student,
  TeachingAssignment, User,
} from '../types'
import { resolveCapabilities } from '../capabilities'
import { parseRoster } from '../setup/parse'
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
  cohorts: { id: string; schoolId: string; label: string; gradYear: number; archived: boolean }[]
}): SetupRepository {
  const {
    courses, sections, enrollments, users, students, memberships, assignments, defs, cohorts,
  } = deps

  const uniqueId = (base: string, taken: (id: string) => boolean) => {
    let id = base
    let n = 2
    while (taken(id)) id = `${base}_${n++}`
    return id
  }

  return {
    // ------------------------------------------------------------- reads

    async listCohorts(schoolId) {
      return cohorts.filter((c) => c.schoolId === schoolId)
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

    async listPeople(schoolId) {
      return memberships
        .filter((m) => m.schoolId === schoolId)
        .map<PersonRow>((membership) => {
          const user = users.find((u) => u.id === membership.userId)!
          const student = students.find((s) => s.userId === membership.userId) ?? null

          // A section's display name only carries its label where the course has
          // more than one — a single-section course shows the label nowhere.
          const nameOf = (sectionId: string) => {
            const section = sections.find((s) => s.id === sectionId)
            const course = courses.find((c) => c.id === section?.courseId)
            const many = section
              ? sections.filter((x) => x.courseId === section.courseId).length > 1
              : false
            return (course?.name ?? sectionId) + (many && section ? ` ${section.label}` : '')
          }
          return {
            user,
            membership,
            roles: membership.roles,
            capabilities: [...resolveCapabilities(membership)],
            isStudent: membership.roles.includes('student'),
            studentNumber: student?.studentNumber ?? null,
            candidate: student
              ? { personalCode: student.personalCode, sessionNumber: student.sessionNumber }
              : null,
            teaches: assignments
              .filter((a) => a.teacherId === membership.userId)
              .map((a) => ({ sectionId: a.sectionId, label: nameOf(a.sectionId) })),
            enrolled: enrollments
              .filter((e) => e.studentId === membership.userId)
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
          // IB identifiers arrive from the IB after exams are ordered.
          personalCode: null,
          sessionNumber: null,
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
      courses.push({
        id, schoolId, type: 'subject',
        name: input.name.trim(),
        subjectGroup: input.subjectGroup,
        level: input.level,
      })

      // A new course with no requirements would be invisible everywhere
      // downstream, so it gets the generic IA set the philosophy doc's §3.2
      // shortcut defines — the same one every other subject course carries.
      const order = defs.reduce((n, d) => Math.max(n, d.order), 0)
      defs.push(
        {
          id: id + '.file', schoolId, cohortId, scope: { kind: 'course', courseId: id },
          key: id + '.file', label: input.name + ' — IA', lane: 'Internal assessment',
          order: order + 1, recordedBy: 'student', artifact: 'file', exportTarget: 'ecoursework',
        },
        {
          id: id + '.mark', schoolId, cohortId, scope: { kind: 'course', courseId: id },
          key: id + '.mark', label: input.name + ' — mark', lane: 'Internal assessment',
          order: order + 2, recordedBy: 'staff', artifact: 'mark', markMax: 25,
          exportTarget: 'ibis_ia_marks',
        },
      )

      sections.push({ id: id + '_a', schoolId, courseId: id, cohortId, label: 'A' })
      return id
    },

    async addSection(schoolId, courseId, cohortId, label) {
      const id = uniqueId(courseId + '_' + slug(label), (x) => sections.some((s) => s.id === x))
      sections.push({ id, schoolId, courseId, cohortId, label: label.trim() || 'A' })
      return id
    },

    async enrolStudent(schoolId, studentId, sectionId) {
      if (enrollments.some((e) => e.studentId === studentId && e.sectionId === sectionId)) return
      enrollments.push({ studentId, sectionId })
    },

    async unenrolStudent(schoolId, studentId, sectionId) {
      const at = enrollments.findIndex((e) => e.studentId === studentId && e.sectionId === sectionId)
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
      if (assignments.some((a) => a.teacherId === teacherId && a.sectionId === sectionId)) return
      // First teacher on a section is the designated marker; a co-teacher is not.
      const first = !assignments.some((a) => a.sectionId === sectionId)
      assignments.push({ teacherId, sectionId, isDesignatedMarker: first })
    },

    async unassignTeacher(schoolId, teacherId, sectionId) {
      const at = assignments.findIndex((a) => a.teacherId === teacherId && a.sectionId === sectionId)
      if (at >= 0) assignments.splice(at, 1)
    },

    async setDesignatedMarker(schoolId, teacherId, sectionId, on) {
      for (const a of assignments.filter((x) => x.sectionId === sectionId)) {
        // Exactly one marker per section — that is who the IB holds responsible.
        if (a.teacherId === teacherId) a.isDesignatedMarker = on
        else if (on) a.isDesignatedMarker = false
      }
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
  }
}
