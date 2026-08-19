// Dev-only user switching. Delete this route when Google Sign-In lands.
import { NextResponse } from 'next/server'
import { demoMode } from '@/lib/demo'
import { repo } from '@/lib/data'
import { landingFor } from '@/lib/session'

export async function POST(request: Request) {
  // An unauthenticated identity-switcher has no business existing in production.
  if (!demoMode()) return new NextResponse(null, { status: 404 })
  const form = await request.formData()
  const userId = String(form.get('userId') ?? 'u_michael')

  // Land where this person's job starts: a coordinator in the catalogue,
  // everyone else on Home. Signing in and then having to find your own first
  // screen is the smallest possible bad first impression.
  const memberships = await repo.getMemberships(userId)
  const schoolId = memberships[0]?.schoolId ?? 'dhahran'
  const to = landingFor(memberships, schoolId)

  const res = NextResponse.redirect(new URL(to, request.url), 303)
  res.cookies.set('dev_user', userId, { path: '/' })
  res.cookies.delete('dev_school')
  return res
}
