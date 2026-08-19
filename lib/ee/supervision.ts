// EE SUPERVISION — the relation, and the rule that there is always an answer.
//
// INVARIANT #12: every EE student has a responsible adult at all times. There
// is no unassigned state; there is only being assigned to the EE coordinator.
//
// This is the whole point of the file. "Unassigned" as a real state means every
// caller has to handle null, every screen has to render an empty case, and a
// student whose supervisor resigns in February belongs to nobody until somebody
// notices. Making the fallback a PERSON rather than a null turns three
// different problems — a new cohort, a departing teacher, a transfer student —
// into the same ordinary reassignment.
//
// Decided by Michael, 19 Aug 2026. See IB-Mobility-and-Transfers.md §2.5.

import type { Membership, User } from '../types'
import type { EeSupervision, ResolvedSupervisor } from './types'

/**
 * WHO THE FALLBACK IS.
 *
 * At Dhahran two people hold `ee_coordinator` — the Core teacher and the tech
 * admin who also runs EE. "The EE coordinator" therefore needs a deterministic
 * rule rather than a `.find()`, or the acting supervisor changes identity with
 * array order.
 *
 * The rule: prefer the holder who is NOT tech support. Whoever keeps the system
 * running holds the role so they can fix it, not so they can supervise essays;
 * defaulting students to them would put a real academic responsibility on an
 * account that exists for a different reason. Ties break by user id, so the
 * answer is stable across renders and across a database.
 */
export function eeCoordinatorId(
  schoolId: string,
  memberships: Membership[],
): string | null {
  const holders = memberships
    .filter((m) => m.schoolId === schoolId && m.roles.includes('ee_coordinator'))
    .sort((a, b) => {
      const at = a.presetKey === 'tech_admin' ? 1 : 0
      const bt = b.presetKey === 'tech_admin' ? 1 : 0
      return at - bt || a.userId.localeCompare(b.userId)
    })
  return holders[0]?.userId ?? null
}

/** The live assignment for one student, if anybody has made one. */
export function assignmentFor(
  studentId: string,
  supervisions: EeSupervision[],
): EeSupervision | null {
  return (
    supervisions
      .filter((s) => s.studentId === studentId && s.endedAt == null)
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))[0] ?? null
  )
}

/**
 * THE FUNCTION EVERYTHING ELSE CALLS. Always returns somebody.
 *
 * Returns null only when the school has no EE coordinator at all, which is a
 * setup error rather than a state to design around — the start-of-year
 * checklist assigns the Core roles before anyone is enrolled.
 */
export function supervisorFor(
  studentId: string,
  supervisions: EeSupervision[],
  fallbackId: string | null,
  users: User[],
): ResolvedSupervisor | null {
  const assigned = assignmentFor(studentId, supervisions)
  const id = assigned?.supervisorId ?? fallbackId
  if (!id) return null
  const user = users.find((u) => u.id === id)
  return {
    userId: id,
    name: user?.name ?? id,
    acting: assigned == null,
  }
}

/**
 * How an attestation signed by an acting supervisor must read.
 *
 * The EE coordinator standing in CAN sign — refusing would leave a student
 * unable to submit because an adult resigned — but the record has to say which
 * it was. "Attested by the person who held the reflection sessions" and
 * "attested by the coordinator covering for them" are different claims, and
 * the authenticity trail is the one thing in this system that has to be beyond
 * question (IB-Mobility-and-Transfers.md §2.5).
 */
export function attestationLabel(s: ResolvedSupervisor): string {
  return s.acting ? `${s.name} (EE coordinator, acting supervisor)` : s.name
}
