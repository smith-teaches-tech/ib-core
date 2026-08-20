// The fixture implementation of CasRepository.
//
// A factory rather than a module-level object, so it can be handed the student
// roster from ./fixtures without the two files importing each other.
//
// Every write appends to the thread. That is not decoration: the thread IS the
// authenticity trail (spine invariant #5), and a status change with no entry
// behind it would be a change nobody can account for later.

import { randomUUID } from 'crypto'
import type { CasRepository } from './repository'
import type { Student } from '../types'
import { completionGate, summarise, viewsOf } from '../cas/derive'
import type {
  CasData, CasRosterRow, ExperienceStatus, Interview, LoKey, ThreadEntry,
} from '../cas/types'
import { INTERVIEW_LABEL, LO_LABEL } from '../cas/types'
import { riyadhPlusDays, todayRiyadh } from './dates'

const today = todayRiyadh
const plusDays = riyadhPlusDays

export function makeCasRepository(deps: {
  data: CasData
  nextExperienceId: () => string
  nextEntryId: () => string
  studentsIn: (schoolId: string, cohortId: string) => Student[]
  nameOf: (userId: string) => string
  cohortOf: (userId: string) => string
  /** When they joined the cohort — the CAS timeline must not predate it. */
  joinedAtOf: (userId: string) => string
}): CasRepository {
  const { data } = deps

  const append = (e: Omit<ThreadEntry, 'id'>) => {
    const out: ThreadEntry = { ...e, id: deps.nextEntryId() }
    data.entries.push(out)
    return out
  }

  const find = (schoolId: string, experienceId: string) =>
    data.experiences.find((e) => e.id === experienceId && e.schoolId === schoolId) ?? null

  // Everything school-scoped, so summaries and counts agree with the lists they
  // sit next to. Entries and requests hang off experiences, which carry the scope.
  const scoped = (schoolId: string): CasData => ({
    ...data,
    experiences: data.experiences.filter((e) => e.schoolId === schoolId),
    interviews: data.interviews.filter((i) => i.schoolId === schoolId),
    indicators: data.indicators.filter((i) => i.schoolId === schoolId),
    notes: data.notes.filter((n) => n.schoolId === schoolId),
    completions: data.completions.filter((c) => c.schoolId === schoolId),
  })

  const loNames = (los: LoKey[]) =>
    los.map((l) => 'LO' + l.slice(2) + ' ' + (LO_LABEL.get(l)?.short ?? '')).join(', ')

  return {
    // ---------------------------------------------------------------- reads

    async getStudentView(schoolId, studentUserId) {
      const name = deps.nameOf(studentUserId)
      if (!name) return null
      const mine = scoped(schoolId)
      return {
        studentId: studentUserId,
        studentName: name,
        joinedAt: deps.joinedAtOf(studentUserId),
        summary: summarise(studentUserId, mine),
        experiences: viewsOf(studentUserId, mine),
        interviews: mine.interviews.filter((i) => i.studentId === studentUserId),
        notes: mine.notes
          .filter((n) => n.studentId === studentUserId)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      }
    },

    async getRoster(schoolId, cohortId) {
      const mine = scoped(schoolId)
      const rows: CasRosterRow[] = []
      for (const s of deps.studentsIn(schoolId, cohortId)) {
        rows.push({
          studentId: s.userId,
          studentName: deps.nameOf(s.userId),
          joinedAt: s.joinedAt,
          sessionNumber: s.sessionNumber,
          summary: summarise(s.userId, mine),
          experiences: viewsOf(s.userId, mine),
          interviews: mine.interviews.filter((i) => i.studentId === s.userId),
          notes: mine.notes
            .filter((n) => n.studentId === s.userId)
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        })
      }
      return rows.sort((a, b) => a.studentName.localeCompare(b.studentName))
    },

    async getTotals(schoolId, cohortId) {
      const mine = scoped(schoolId)
      const students = deps.studentsIn(schoolId, cohortId)
      const sums = students.map((s) => summarise(s.userId, mine))
      return {
        students: students.length,
        atRisk: sums.filter((s) => s.indicator === 'at_risk').length,
        avgOutcomes:
          sums.length === 0
            ? 0
            : Math.round((sums.reduce((n, s) => n + s.outcomes.length, 0) / sums.length) * 10) / 10,
        projectsComplete: sums.filter((s) => s.project === 'complete').length,
      }
    },

    async getSupervisorView(token) {
      const request = data.requests.find((r) => r.token === token)
      if (!request) return null
      const experience = data.experiences.find((e) => e.id === request.experienceId)
      if (!experience) return null
      return {
        request,
        experience,
        entries: data.entries
          .filter((e) => e.experienceId === experience.id && !e.supersededBy)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        studentName: deps.nameOf(experience.studentId),
        expired: request.expiresAt < today(),
        used: Boolean(request.usedAt),
      }
    },

    // -------------------------------------------------------- student writes

    async createExperience(schoolId, studentId, input, authorName) {
      const id = deps.nextExperienceId()
      data.experiences.push({
        id,
        schoolId,
        studentId,
        cohortId: deps.cohortOf(studentId),
        title: input.title,
        description: input.description,
        strands: input.strands,
        isProject: input.isProject,
        claimedOutcomes: input.claimedOutcomes,
        status: input.submit ? 'submitted' : 'draft',
        createdAt: today(),
      })
      append({
        experienceId: id,
        kind: 'system',
        body:
          `Experience created; strands ${input.strands.join(', ')}` +
          (input.claimedOutcomes.length ? `; outcomes ${loNames(input.claimedOutcomes)}` : '') +
          (input.isProject ? '; flagged as the CAS project' : '') +
          (input.submit ? '. Submitted for approval.' : '. Saved as a draft.'),
        authorType: 'student',
        authorName,
        createdAt: today(),
      })
      return id
    },

    async addReflection(schoolId, experienceId, body, authorName, opts) {
      if (!find(schoolId, experienceId)) return
      append({
        experienceId,
        // kind STAYS 'reflection' when audio is attached. This one line is the
        // whole of §3.3, and getting it wrong would be invisible until March.
        kind: 'reflection',
        body: body || undefined,
        media: opts?.audio ? [opts.audio] : undefined,
        transcript: opts?.transcript,
        inReplyTo: opts?.inReplyTo,
        authorType: 'student', authorName, createdAt: today(),
      })
    },

    async ownerOf(schoolId, experienceId) {
      return find(schoolId, experienceId)?.studentId ?? null
    },

    async editReflection(schoolId, entryId, experienceId, body, authorName) {
      const prior = data.entries.find((e) => e.id === entryId)
      if (!prior || !find(schoolId, prior.experienceId)) {
        throw new Error('That entry does not exist at this school.')
      }
      if (prior.experienceId !== experienceId) {
        throw new Error('That entry does not belong to that experience.')
      }
      if (prior.kind !== 'reflection') {
        throw new Error('Only reflections can be edited — nothing else in the thread is yours to rewrite.')
      }
      // The prior version stays in the record. This is the whole reason edits
      // are modelled as a new entry rather than a mutation.
      const replacement = append({
        experienceId: prior.experienceId,
        kind: prior.kind,
        body,
        media: prior.media,
        authorType: prior.authorType,
        authorName,
        createdAt: today(),
        editedFrom: prior.id,
      })
      prior.supersededBy = replacement.id
    },

    async addEvidence(schoolId, experienceId, media, note, authorName, opts) {
      if (!find(schoolId, experienceId)) return
      append({
        experienceId, kind: 'evidence', body: note || undefined, media,
        inReplyTo: opts?.inReplyTo,
        authorType: 'student', authorName, createdAt: today(),
      })
    },

    async requestSupervisor(schoolId, experienceId, email, authorName) {
      const exp = find(schoolId, experienceId)
      // A fresh link supersedes every earlier one: void anything still unsigned,
      // so exactly one link can ever sign this experience off.
      for (const r of data.requests) {
        if (r.experienceId === experienceId && !r.usedAt) r.usedAt = today()
      }
      const request = {
        id: 'sq_' + experienceId + '_' + data.requests.length,
        experienceId,
        email,
        // Random, not derived: a computable token is a guessable one, and a
        // deterministic one collides with its own used or expired predecessors.
        token: randomUUID(),
        sentAt: today(),
        expiresAt: plusDays(28),
      }
      data.requests.push(request)
      if (exp) {
        exp.status = 'awaiting_signoff'
        exp.completionRoute = 'digital'
        exp.supervisorEmail = email
        append({
          experienceId, kind: 'system',
          body: `Secure sign-off link generated for ${email}, valid for 28 days.`,
          authorType: 'student', authorName, createdAt: today(),
        })
      }
      return request
    },

    async markPaperFormUploaded(schoolId, experienceId, authorName) {
      const exp = find(schoolId, experienceId)
      if (!exp) return
      exp.status = 'awaiting_signoff'
      exp.completionRoute = 'paper'
      append({
        experienceId, kind: 'system',
        body: 'Signed paper form uploaded; sent to the coordinator to verify.',
        authorType: 'student', authorName, createdAt: today(),
      })
    },

    // ---------------------------------------------------------- staff writes

    async setExperienceStatus(schoolId, experienceId, status, opts) {
      const exp = find(schoolId, experienceId)
      if (!exp) return
      const from = exp.status
      exp.status = status
      if (status === 'approved' && !exp.approvedAt) exp.approvedAt = today()
      if (status !== 'complete') exp.completedAt = undefined

      const wording: Record<ExperienceStatus, string> = {
        draft: 'returned to draft',
        submitted: 'resubmitted',
        returned: 'returned to the student',
        approved: 'approved',
        awaiting_signoff: 'sent for sign-off',
        complete: 'marked complete',
        rejected: 'recorded as not a CAS experience',
      }
      append({
        experienceId, kind: 'system',
        body:
          `Experience ${wording[status]} (was ${from})` +
          (opts.reason ? ` — reason: ${opts.reason}` : '') + '.',
        authorType: 'staff', authorName: opts.by, createdAt: today(),
      })
      if (opts.note) {
        append({
          experienceId, kind: 'note', body: opts.note,
          authorType: 'staff', authorName: opts.by, createdAt: today(),
        })
      }
    },

    async completeOnBehalf(schoolId, experienceId, confirmedOutcomes, comment, by) {
      const exp = find(schoolId, experienceId)
      if (!exp || confirmedOutcomes.length === 0) return
      exp.status = 'complete'
      exp.completedAt = today()
      append({
        experienceId,
        kind: 'signoff',
        body:
          (comment ? comment + ' ' : '') +
          `Confirmed by the CAS coordinator on the supervisor's behalf.`,
        confirmedOutcomes,
        authorType: 'staff',
        authorName: by,
        createdAt: today(),
      })
    },

    async saveInterview(schoolId, studentId, kind, notes, conductedOn, by) {
      const existing = data.interviews.find(
        (i) => i.studentId === studentId && i.kind === kind && i.schoolId === schoolId,
      )
      if (existing) {
        if (existing.lockedAt) return // locked means locked; unlock first
        existing.notes = notes
        existing.conductedOn = conductedOn || today()
        existing.lockedAt = today() // auto-lock on save, as specced
        return
      }
      const iv: Interview = {
        id: `iv_${studentId}_${kind}_${data.interviews.length}`,
        schoolId,
        studentId,
        kind,
        notes,
        conductedOn: conductedOn || today(),
        lockedAt: today(),
        conductedBy: by,
      }
      data.interviews.push(iv)
    },

    async unlockInterview(schoolId, interviewId, reason, by) {
      const iv = data.interviews.find((i) => i.id === interviewId && i.schoolId === schoolId)
      if (!iv || !reason.trim()) return
      iv.lockedAt = undefined
      data.notes.push({
        id: 'n_unlock_' + interviewId + '_' + data.notes.length,
        schoolId,
        studentId: iv.studentId,
        body: `${INTERVIEW_LABEL[iv.kind]} unlocked by ${by} — reason: ${reason}`,
        authorName: by,
        createdAt: today(),
      })
    },

    async setIndicator(schoolId, studentId, value, by) {
      const existing = data.indicators.find(
        (i) => i.studentId === studentId && i.schoolId === schoolId,
      )
      if (existing) {
        existing.value = value
        existing.setBy = by
        existing.setAt = today()
        return
      }
      data.indicators.push({ studentId, schoolId, value, setBy: by, setAt: today() })
    },

    async addNote(schoolId, studentId, body, by) {
      if (!body.trim()) return
      data.notes.push({
        id: 'n_' + studentId + '_' + data.notes.length,
        schoolId, studentId, body, authorName: by, createdAt: today(),
      })
    },

    /** The freeze check. Cheap on purpose — every student write calls it. */
    async isCasComplete(schoolId, studentId) {
      return data.completions.some((c) => c.studentId === studentId && c.schoolId === schoolId)
    },

    async setCasComplete(schoolId, studentId, complete, by) {
      const at = data.completions.findIndex(
        (c) => c.studentId === studentId && c.schoolId === schoolId,
      )
      if (!complete) {
        if (at >= 0) data.completions.splice(at, 1)
        return
      }
      // The gate is enforced here, not only in the UI. A hidden button is a
      // suggestion; this is the rule.
      if (!completionGate(summarise(studentId, data)).ready) return
      if (at < 0) {
        data.completions.push({ studentId, schoolId, confirmedBy: by, confirmedAt: today() })
      }
    },

    // ----------------------------------------------------- supervisor writes

    async signOff(token, input) {
      const request = data.requests.find((r) => r.token === token)
      if (!request || request.usedAt || request.expiresAt < today()) return false
      const exp = data.experiences.find((e) => e.id === request.experienceId)
      if (!exp || exp.status !== 'awaiting_signoff') return false
      if (input.confirmedOutcomes.length === 0 || !input.signature.trim()) return false

      request.usedAt = today()
      exp.status = 'complete'
      exp.completedAt = today()
      exp.supervisorName = input.signature.trim()

      append({
        experienceId: exp.id,
        kind: 'signoff',
        body:
          (input.comment.trim() ? input.comment.trim() + ' ' : '') +
          `Signed by ${input.signature.trim()} (${request.email}).`,
        confirmedOutcomes: input.confirmedOutcomes,
        authorType: 'supervisor',
        authorName: input.signature.trim(),
        createdAt: today(),
      })
      return true
    },
  }
}
