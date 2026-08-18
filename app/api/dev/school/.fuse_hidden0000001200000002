// Dev-only school switching. In production this is a real, logged action.
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { repo } from '@/lib/data'

export async function POST(request: Request) {
  // An unauthenticated identity-switcher has no business existing in production.
  if (process.env.NODE_ENV === 'production') return new NextResponse(null, { status: 404 })

  // School switching is a DISTRICT-TIER act — hiding the switcher is a
  // courtesy; this is the rule. An IB coordinator lives in one school.
  const jar = await cookies()
  const userId = jar.get('dev_user')?.value ?? 'u_michael'
  const memberships = await repo.getMemberships(userId)
  if (!memberships.some((m) => m.presetKey === 'district')) {
    return new NextResponse('Only the district coordinator switches schools.', { status: 403 })
  }

  const form = await request.formData()
  const schoolId = String(form.get('schoolId') ?? 'dhahran')
  // Only a school this user actually belongs to.
  if (!memberships.some((m) => m.schoolId === schoolId)) {
    return new NextResponse('Not a school you belong to.', { status: 403 })
  }
  const res = NextResponse.redirect(new URL('/', request.url), 303)
  res.cookies.set('dev_school', schoolId, { path: '/' })
  return res
}
