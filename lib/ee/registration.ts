// Is this EE registration submittable? A pure function, so the server action,
// the student's form and the checkpoint all apply the same rule.
//
// This is what `ee.rq` means. A requirement that goes 'submitted' because a
// student typed something into a box records nothing; one that goes 'submitted'
// when the registration would survive contact with IBIS records a fact.

import { INTERDISCIPLINARY_FRAMEWORKS, NOT_ELIGIBLE_INTERDISCIPLINARY } from './rubric'
import { isDpSubject } from './subjects'
import type { EeRegistration } from './types'

export interface RegistrationProblem {
  field: 'subjects' | 'framework' | 'researchQuestion' | 'title'
  message: string
}

export function validateRegistration(reg: Partial<EeRegistration>): RegistrationProblem[] {
  const p: RegistrationProblem[] = []
  const subjects = reg.subjects ?? []

  if (subjects.length === 0) {
    p.push({ field: 'subjects', message: 'Choose the subject you are registering this essay in.' })
  } else if (subjects.length > 2) {
    p.push({ field: 'subjects', message: 'An extended essay is registered in one subject, or two for the interdisciplinary pathway.' })
  } else if (new Set(subjects).size !== subjects.length) {
    p.push({ field: 'subjects', message: 'The two subjects must be different.' })
  } else if (!subjects.every(isDpSubject)) {
    // A subject outside the DP list is a registration error, which is why the
    // form offers a list rather than a free-text box: IBIS will not accept it.
    p.push({ field: 'subjects', message: 'That is not a Diploma Programme subject.' })
  }

  const interdisciplinary = subjects.length === 2
  if (interdisciplinary) {
    // Already cross-disciplinary, so they cannot be half of a pair.
    const barred = subjects.filter((s) => NOT_ELIGIBLE_INTERDISCIPLINARY.includes(s))
    if (barred.length) {
      p.push({
        field: 'subjects',
        message: 'Environmental Systems and Societies and Literature and Performance are already cross-disciplinary and cannot be used in the interdisciplinary pathway.',
      })
    }
    if (!reg.framework) {
      p.push({ field: 'framework', message: 'An interdisciplinary essay must be registered under one of the five frameworks, and it is named on the title page.' })
    } else if (!(INTERDISCIPLINARY_FRAMEWORKS as readonly string[]).includes(reg.framework)) {
      p.push({ field: 'framework', message: 'That is not one of the five registered frameworks.' })
    }
  } else if (reg.framework) {
    p.push({ field: 'framework', message: 'A framework is registered only for a two-subject interdisciplinary essay.' })
  }

  if (!reg.researchQuestion?.trim()) {
    p.push({ field: 'researchQuestion', message: 'The research question is required — it goes on the title page.' })
  }
  if (!reg.title?.trim()) {
    p.push({ field: 'title', message: 'The title is required — it goes on the title page.' })
  }
  return p
}

/** `ee.rq` is `submitted` exactly when this is true. */
export const registrationComplete = (reg: Partial<EeRegistration> | null | undefined): boolean =>
  reg != null && validateRegistration(reg).length === 0

// ---------------------------------------------------------------------------
// WARNINGS — a different thing from problems, deliberately
// ---------------------------------------------------------------------------

/**
 * A warning is NOT a problem, and the two must not share a channel.
 *
 * A problem stops the save: the registration would be rejected by IBIS, so
 * storing it would put a known-bad record in the system. A warning is a fact
 * the school should know and act on — the registration is perfectly valid and
 * the essay may well go ahead.
 *
 * Michael, 20 Aug: "we need a teacher at the school who can help a student with
 * an EE (so no theatre teacher means no EE in that subject… just a warning, not
 * a blocker — EE sup will oversee this)."
 *
 * That is exactly right, and it is why this is a second return channel rather
 * than a flag on RegistrationProblem. A student who has found an outside expert,
 * or a school about to hire, or a coordinator who will supervise it themselves —
 * all of those are legitimate, and none of them should be argued with by a form.
 */
export interface RegistrationWarning {
  subject: string
  message: string
}

/**
 * DERIVED, never stored. `supported` is the set of DP subjects somebody at the
 * school actually teaches — so if a Theatre teacher joins in September, the
 * warning disappears on its own, and if one leaves, it appears. A stored flag
 * would have to be maintained by a human who will not remember.
 */
export function subjectWarnings(
  subjects: string[],
  supported: Set<string> | string[],
): RegistrationWarning[] {
  const have = supported instanceof Set ? supported : new Set(supported)
  return subjects
    .filter((k) => !have.has(k))
    .map((k) => ({
      subject: k,
      message:
        'Nobody at the school currently teaches this subject, so there may be no one to supervise it. ' +
        'You can still register — your EE coordinator will find you a supervisor.',
    }))
}
