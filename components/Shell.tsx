import Link from 'next/link'
import DocumentsDrawer from './DocumentsDrawer'
import { DEV_USERS, type Session } from '@/lib/session'
import { repo } from '@/lib/data'
import type { Announcement, KeyDate, ModuleTile } from '@/lib/types'

function formatShort(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}
function daysAway(iso: string) {
  const then = new Date(iso + 'T00:00:00Z').getTime()
  const now = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((then - now) / 86_400_000)
}

/**
 * The app shell: a persistent left sidebar carrying navigation, key dates and
 * announcements, with the main area free for whatever the current role is
 * actually here to do. Documents sit behind a button in the top bar.
 */
export default async function Shell({
  session,
  tiles,
  dates,
  announcements,
  children,
}: {
  session: Session
  tiles: ModuleTile[]
  dates: KeyDate[]
  announcements: Announcement[]
  children: React.ReactNode
}) {
  const schools = await repo.listSchools()
  const mySchools = schools.filter((s) =>
    session.memberships.some((m) => m.schoolId === s.id),
  )
  const documents = await repo.listDocuments(session.school.id, session.user.id)

  return (
    <>
      <header className="top">
        <Link className="logo" href="/">
          IB&nbsp;Core <span>· {session.school.name}</span>
        </Link>

        {/* Only for users who belong to more than one school. */}
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
          <h3>{session.memberships[0]?.roles.includes('student') ? 'My Core & courses' : 'Modules'}</h3>
          <Link href="/" className="navrow on">
            <span className="nm"><b>Home</b></span>
          </Link>
          {tiles.map((t) => (
            <Link key={t.key} href={t.href} className="navrow">
              <span className="nm">
                <b>{t.label}</b>
                <small>{t.sublabel}</small>
              </span>
              <span className={`badge${t.outstanding === 0 ? ' zero' : ''}`}>
                {t.outstanding === 0 ? '—' : t.outstanding}
              </span>
            </Link>
          ))}

          <h3>Key dates</h3>
          {dates.length === 0 && <p className="mut" style={{ fontSize: 12.5, padding: '0 9px' }}>None set.</p>}
          {dates.slice(0, 5).map((k) => {
            const away = daysAway(k.date)
            return (
              <div className={`sidedate${k.kind === 'ib' ? ' ib' : ''}`} key={k.id}>
                <div className="dl">
                  <b>{formatShort(k.date)}</b>
                  <span>{k.label}</span>
                </div>
                <div className="meta">
                  {away < 0 ? `${-away} days ago` : `in ${away} days`}
                  {k.kind === 'ib' ? ' · IB deadline' : ''}
                </div>
              </div>
            )
          })}

          <h3>
            Announcements
            {session.can('announcements.post') && (
              <Link href="/announcements/new" style={{ float: 'right', textDecoration: 'none' }}>+ Post</Link>
            )}
          </h3>
          {announcements.length === 0 && <p className="mut" style={{ fontSize: 12.5, padding: '0 9px' }}>Nothing posted.</p>}
          {announcements.slice(0, 4).map((a) => (
            <div className="sideann" key={a.id}>
              <b>{a.title}</b>
              <div className="meta">
                {a.postedBy} · {formatShort(a.postedAt)}
                {a.audienceRoles.length > 0 && ' · staff'}
              </div>
            </div>
          ))}
        </nav>

        <main className="main">{children}</main>
      </div>
    </>
  )
}
