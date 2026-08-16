// Dev-only school switching. In production this is a real, logged action.
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // An unauthenticated identity-switcher has no business existing in production.
  if (process.env.NODE_ENV === 'production') return new NextResponse(null, { status: 404 })
  const form = await request.formData()
  const schoolId = String(form.get('schoolId') ?? 'dhahran')
  const res = NextResponse.redirect(new URL('/', request.url), 303)
  res.cookies.set('dev_school', schoolId, { path: '/' })
  return res
}
