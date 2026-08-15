import Link from 'next/link'
import DocumentsDrawer from './DocumentsDrawer'
import { DEV_USERS, type Session } from '@/lib/session'
import { repo } from '@/lib/data'
import type { Course } from '@/lib/types'

/**
 * Sidebar carries "my spaces" — the courses this person is attached to, whether
 * that is Biology B or CAS. One uniform concept, no role-derived special cases.
 * Documents sit behind a button in the top bar.
 */
export default async function Shell({
  session,
  spaces,
  current = 'home',
  children,
}: {
  session: Session
  spaces: Course[]
  /** Which "space" is open — 'home' or a course id. */
  current?: string
  children: React.ReactNode
}) {
  const schools = await repo.listSchools()
  const mySchools = schools.filter((s) => session.memberships.some((m) => m.schoolId === s.id))
  const documents = await repo.listDocuments(session.school.id, session.user.id)

  return (
    <>
      <header className="top">
        <Link className="logo" href="/">
          IB&nbsp;Core <span>· {session.school.name}</span>
        </Link>

        {mySchools.length > 1 && (
          <form action="/api/dev/school" method="POST">
            <select name="schoolId" defaultValue={session.school.id}>
              {mySchools.map((s) => (
                <option key={s.id} value={s.id}>🏫 {s.name}</option>
              ))}
            </select>{' '}
            <button className="btn sm" type="submit">Switch</button>
          </form>
        )}

        <DocumentsDrawer documents={documents} canManage={session.can('documents.manage')} />

        <div className="devbar">
          <span className="tag">dev sign-in</span>
          <form action="/api/dev/user" method="POST">
            <select name="userId" defaultValue={session.user.id}>
              {DEV_USERS.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>{' '}
            <button className="btn sm" type="submit">Switch</button>
          </form>
        </div>
      </header>

      <div className="shell">
        <nav className="side">
          <h3>My spaces</h3>
          <Link href="/" className={`navrow ${current === 'home' ? 'on' : ''}`}>
            <span className="nm"><b>Home</b></span>
          </Link>
          {spaces.map((c) => (
            <Link
              key={c.id}
              href={`/courses/${c.id}`}
              className={`navrow ${current === c.id ? 'on' : ''}`}
            >
              <span className="nm">
                <b>{c.name}</b>
                <small>{c.type === 'subject' ? c.subjectGroup : 'Core'}</small>
              </span>
            </Link>
          ))}
          {spaces.length === 0 && (
            <p className="mut" style={{ fontSize: 12.5, padding: '0 9px' }}>Nothing assigned yet.</p>
          )}
        </nav>
        <main className="main">{children}</main>
      </div>
    </>
  )
}
