import { redirect } from 'next/navigation'
import { DEV_USERS, signedInUserId } from '@/lib/session'
import { demoMode } from '@/lib/demo'
import { repo } from '@/lib/data'

/**
 * THE SIGN-IN SCREEN — the first thing the link opens.
 *
 * Nothing here authenticates anything yet, and the screen says so rather than
 * pretending. Real sign-in is Google, restricted to the school domain, and it
 * needs a Google Cloud project we do not have; when it arrives it replaces the
 * top half of this page and deletes the bottom half.
 *
 * The role switcher stays at the top on purpose: this is a demo people are
 * being walked through, and being able to say "now watch it as a teacher" from
 * any screen is the point.
 */

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ switch?: string }>
}) {
  const { switch: wantSwitch } = await searchParams
  const already = await signedInUserId()

  // Someone who has already chosen doesn't need this screen again — unless they
  // came back to it deliberately to change who they are.
  if (already && !wantSwitch) redirect('/')

  const schools = await repo.listSchools()
  const school = schools[0]

  return (
    <div className="signin">
      <header className="top signin-top">
        <span className="logo">
          IB&nbsp;Central <span>· {school?.name ?? 'International Schools Group'}</span>
        </span>
        <div className="devbar">
          <span className="tag">demo</span>
          {demoMode() && (
            <form action="/api/dev/user" method="POST">
              <select name="userId" defaultValue={already ?? 'u_michael'} aria-label="Sign in as">
                {DEV_USERS.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>{' '}
              <button className="btn sm" type="submit">Switch role</button>
            </form>
          )}
        </div>
      </header>

      <main className="signin-main">
        <div className="signin-card">
          <div className="signin-mark" aria-hidden="true">IB</div>
          <h1>IB Central</h1>
          <p className="signin-sub">
            {school?.name ?? 'International Schools Group'} — coursework, marks, predicted grades and
            everything the IB asks for, in one place.
          </p>

          <button className="btn signin-google" type="button" disabled>
            <GoogleMark />
            Continue with your school Google account
          </button>
          <p className="signin-note">
            Sign-in will be restricted to <b>@isg.edu.sa</b> accounts. Not connected yet — this
            screen is the design, not the door.
          </p>

          {demoMode() && (
            <>
              <div className="signin-or"><span>or, for this walkthrough</span></div>
              <form action="/api/dev/user" method="POST" className="signin-demo">
                <label className="caps" htmlFor="who">Open it as</label>
                <select id="who" name="userId" defaultValue={already ?? 'u_michael'}>
                  {DEV_USERS.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
                <button className="btn pri" type="submit">Enter</button>
              </form>
              <p className="signin-note">
                A coordinator lands on the course catalogue; a teacher and a student land on their own
                home. You can change role from the top of any screen.
              </p>
            </>
          )}
        </div>

        <p className="signin-foot">
          Built for the May 2027 session · candidate data in this demo is invented
        </p>
      </main>
    </div>
  )
}

/** Google's mark, drawn — no external asset, no network request on a sign-in page. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.2 6.8-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.3l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.4 0-11.7-3.7-13.6-9.9l-7.8 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}
