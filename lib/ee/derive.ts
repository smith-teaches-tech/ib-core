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
