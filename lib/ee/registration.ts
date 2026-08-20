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
