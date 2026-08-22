// EE sessions → RequirementStates. The crossing point, exactly as CAS's
// lib/cas/derive.ts is: the module owns EeSession, the spine sees ee.r1,
// ee.r2 and ee.viva, and nothing outside the module knows which.
//
// Computed on every read, cached nowhere (spine invariant #2). A coordinator
// recording a viva on a supervisor's behalf unlocks that student's RPF on the
// next render, because opensAfter reads a state that has just come into being.

import type { RequirementDef, RequirementState } from '../types'
import type { EeSession } from './types'

const STAGE_KEY = { r1: 'ee.r1', r2: 'ee.r2', viva: 'ee.viva' } as const

export function deriveEeSessionStates(
  sessions: EeSession[],
  defs: RequirementDef[],
): RequirementState[] {
  const out: RequirementState[] = []
  for (const s of sessions) {
    const key = STAGE_KEY[s.stage]
    // A def per cohort, so match on the student's own cohort via the def set
    // the caller passed — the caller filters, this function does not guess.
    for (const def of defs.filter((d) => d.key === key && d.schoolId === s.schoolId)) {
      out.push({
        studentId: s.studentId,
        requirementDefId: def.id,
        schoolId: s.schoolId,
        recordStatus: 'submitted',
        artifacts: [{
          id: `ee_sess_${s.studentId}_${s.stage}`,
          kind: 'text',
          label: `Held ${s.heldOn}`,
          body: s.onBehalf
            ? `Recorded by ${s.recordedByName} on the supervisor's behalf.`
            : `Recorded by ${s.recordedByName}.`,
          addedAt: s.recordedAt,
        }],
        recordedBy: s.recordedByName,
        recordedAt: s.heldOn,
      })
    }
  }
  return out
}

/**
 * The attestation is DERIVED from the scoring record, for the same reason the
 * sessions are: it is a fact the module already holds, and storing it a second
 * time would let the two disagree. `ee.attest` carries no exportTarget, so
 * nothing outside the module writes to it — which is the test for whether a
 * state can be derived at all (see EeFinal's note for the case that fails it).
 */
export function deriveEeAttestStates(
  scoring: { schoolId: string; studentId: string; attestedSessions: boolean; attestedAuthentic: boolean; attestedByName?: string; attestedAt?: string }[],
  defs: RequirementDef[],
): RequirementState[] {
  const out: RequirementState[] = []
  for (const sc of scoring) {
    if (!sc.attestedSessions || !sc.attestedAuthentic || !sc.attestedAt) continue
    for (const def of defs.filter((d) => d.key === 'ee.attest' && d.schoolId === sc.schoolId)) {
      out.push({
        studentId: sc.studentId,
        requirementDefId: def.id,
        schoolId: sc.schoolId,
        recordStatus: 'submitted',
        artifacts: [],
        recordedBy: sc.attestedByName,
        recordedAt: sc.attestedAt,
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// THE PROCESS — seven steps, in the order the year actually runs
// ---------------------------------------------------------------------------

/**
 * WHAT A SUPERVISOR IS RUNNING BEFORE NOVEMBER.
 *
 * Michael, 22 Aug: *"needs to see the outline before the first meeting, needs
 * to see the draft before the second… we NEED the process screen as well."*
 *
 * ONE DERIVATION, TWO READERS: the roster's dot column and the process screen
 * itself are the same seven steps in the same order. Two lists would eventually
 * disagree about whether a candidate is ready, and the disagreement would land
 * on the teacher deciding who to schedule.
 *
 * INTERLEAVED, not grouped — documents and meetings alternate because that is
 * what happens: you read the outline TO HAVE the first meeting, you read the
 * draft TO HAVE the second. Grouped as "three sessions" and "four documents",
 * a reader has to hold both groups in their head to work out what is owed.
 * In this order, **the first empty dot is the next thing owed**, which is the
 * whole question a supervisor has in September.
 */
export type EeStepKey = 'outline' | 'r1' | 'draft' | 'r2' | 'final' | 'viva' | 'rpf'

export interface EeStep {
  key: EeStepKey
  label: string
  /** Whose turn it is when it is not in — the same vocabulary as `recordedBy`. */
  owner: 'student' | 'staff'
  done: boolean
  /** The school day it arrived, when it has. */
  at: string | null
}

export function processSteps(row: {
  links: { stage: 'outline' | 'draft'; addedAt: string }[]
  sessions: { stage: 'r1' | 'r2' | 'viva'; heldOn: string }[]
  final: { submittedAt: string } | null
  rpf: { submittedAt: string } | null
}): EeStep[] {
  const link = (stage: 'outline' | 'draft') => row.links.find((l) => l.stage === stage) ?? null
  const held = (stage: 'r1' | 'r2' | 'viva') => row.sessions.find((s) => s.stage === stage) ?? null
  const step = (
    key: EeStepKey, label: string, owner: 'student' | 'staff', at: string | null,
  ): EeStep => ({ key, label, owner, done: at != null, at })

  return [
    step('outline', 'Outline', 'student', link('outline')?.addedAt ?? null),
    step('r1', 'Reflection session 1', 'staff', held('r1')?.heldOn ?? null),
    step('draft', 'Full draft', 'student', link('draft')?.addedAt ?? null),
    step('r2', 'Reflection session 2', 'staff', held('r2')?.heldOn ?? null),
    step('final', 'Finished essay', 'student', row.final?.submittedAt ?? null),
    step('viva', 'Viva voce', 'staff', held('viva')?.heldOn ?? null),
    step('rpf', 'Reflection statement', 'student', row.rpf?.submittedAt ?? null),
  ]
}

/**
 * The next thing owed, and by whom — the first step that is not in.
 * `null` once the whole process is complete.
 */
export function nextStep(steps: EeStep[]): EeStep | null {
  return steps.find((s) => !s.done) ?? null
}
