// DEVELOPMENT AUTHENTICATION ONLY.
//
// Real auth is Google Sign-In restricted to the school domain, which needs a
// Google Cloud project we do not have yet. Until then the current user is held
// in a cookie and switched from the header — the same role-switcher idea as the
// mockups, promoted into the app.
//
// When Google auth arrives, replace getSession() and delete nothing else.

import { cookies } from 'next/headers'
import { demoMode } from './demo'
import { repo } from './data'
import { can as canCap } from './capabilities'
import type { CapabilityKey, Membership, School, User } from './types'

export const DEV_USERS = [
  { id: 'u_michael', label: 'D. Whitfield — District coordinator' },
  { id: 'u_msmith', label: 'Michael Smith — Tech support · CAS/EE/TOK' },
  { id: 'u_haddad', label: 'S. Haddad — School coordinator (Jubail)' },
  { id: 'u_adeyemi', label: 'H. Adeyemi — Core teacher (CAS/EE/TOK)' },
  { id: 'u_farouk', label: 'R. Farouk — Teacher (Biology)' },
  { id: 'st01', label: 'Layla Ahmed — Student' },
]

export interface Session {
  user: User
  memberships: Membership[]
  school: School
  can: (capability: CapabilityKey) => boolean
}

export async function getSession(): Promise<Session> {
  const jar = await cookies()
  const cookieUser = jar.get('dev_user')?.value
  let user = cookieUser ? await repo.getUser(cookieUser) : null

  if (!user) {
    // No cookie yet. On a demo deployment we land on the district coordinator so
    // the bare URL shows something to whoever opens it. Outside a demo an
    // unidentified request is a failure, NOT an invitation to be an administrator
    // — which is what the unconditional fallback here briefly made it.
    if (!demoMode()) throw new Error('No authenticated user.')
    user = (await repo.getUser('u_michael'))!
  }

  const memberships = await repo.getMemberships(user.id)

  // Land in the last school used; fall back to the first membership.
  const wanted = jar.get('dev_school')?.value
  const schoolId =
    memberships.find((m) => m.schoolId === wanted)?.schoolId ??
    memberships[0]?.schoolId ??
    'dhahran'
  const school = (await repo.getSchool(schoolId))!

  return {
    user,
    memberships,
    school,
    can: (capability) => canCap(memberships, capability, school.id),
  }
}
