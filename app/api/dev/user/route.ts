// Dev-only user switching. Delete this route when Google Sign-In lands.
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const form = await request.formData()
  const userId = String(form.get('userId') ?? 'u_michael')
  const res = NextResponse.redirect(new URL('/', request.url), 303)
  res.cookies.set('dev_user', userId, { path: '/' })
  res.cookies.delete('dev_school')
  return res
}
