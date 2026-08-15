import Link from 'next/link'
import DocumentsDrawer from './DocumentsDrawer'
import { COORDINATOR_PAGES } from '@/lib/nav'
import { DEV_USERS, type Session } from '@/lib/session'
import { repo } from '@/lib/data'
import type { CohortSpaces } from '@/lib/data/repository'
import { cohortTitle, isArchived } from '@/lib/cohorts'

/**
 * Two sidebars, chosen by role.
 *
 * A student or teacher gets "my spaces" — the courses they are attached to,
 * whether that is Biology B or CAS. Short, and exactly what they need.
 *
 * A coordinator gets a list of PAGES instead. They are attached to the whole
 * programme, so their course list is the entire catalogue: 33 rows of
 * navigation that helps nobody. What a coordinator moves between is jobs.
 * See lib/nav.ts.
 */
export default async function Shell({
  session,
  spaces,
  current = 'home',
  children,
}: {
  session: Session
  spaces: CohortSpaces[]
  /** Which "space" is open — 'home' or a course id. */
  current?: string
  children: React.ReactNode
}) {
  const roles = session.memberships.find((m) => m.schoolId === session.school.id)?.roles ?? []
  const isCoordinator =
    roles.includes('school_coordinator') || roles.includes('district_coordinator')

  // Students lose access to a finished year entirely — at ISG their school email
  // is gone by 31 July, so the account is closed before the archive would matter.
  // Teachers keep read-only access to the years they taught.
  const isStudent = roles.includes('student')
  const live = spaces.filter((g) => !isArchived(g.cohort))
  const archived = isStudent ? [] : spaces.filter((g) => isArchived(g.cohort))

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
          {isCoordinator ? (
            <>
              <h3>IB coordinator</h3>
              {COORDINATOR_PAGES.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className={`navrow ${current === p.href ? 'on' : ''}`}
                >
                  <span className="nm">
                    <b>{p.label}</b>
                    <small>{p.hint}</small>
                  </span>
                  {!p.ready && <span className="pill grey">soon</span>}
                </Link>
              ))}
            </>
          ) : (
            <>
              {/* Grouped by cohort, because two year groups run at once and a
                  teacher may take both. No switcher and no mode: Year 2 and
                  Year 1 are both on screen and you click the one you want. */}
              <h3>My spaces</h3>
              <Link href="/" className={`navrow ${current === 'home' ? 'on' : ''}`}>
                <span className="nm"><b>Home</b></span>
              </Link>

              {live.map((group) => (
                <div key={group.cohort.id}>
                  <h3>{cohortTitle(group.cohort)}</h3>
                  {group.courses.map((c) => (
                    <Link
                      key={group.cohort.id + c.id}
                      href={`/courses/${c.id}?cohort=${group.cohort.id}`}
                      className={`navrow ${current === c.id + '@' + group.cohort.id ? 'on' : ''}`}
                    >
                      <span className="nm">
                        <b>{c.name}</b>
                        <small>{c.type === 'subject' ? c.subjectGroup : 'Core'}</small>
                      </span>
                    </Link>
                  ))}
                </div>
              ))}

              {live.length === 0 && (
                <p className="mut" style={{ fontSize: 12.5, padding: '0 9px' }}>
                  Nothing assigned yet.
                </p>
              )}

              {/* Tucked away on purpose — a past year is occasionally useful and
                  never the thing you came here for. */}
              {archived.length > 0 && (
                <details className="archived">
                  <summary>Archived years</summary>
                  {archived.map((group) => (
                    <div key={group.cohort.id}>
                      <h3>{group.cohort.label}</h3>
                      {group.courses.map((c) => (
                        <Link
                          key={group.cohort.id + c.id}
                          href={`/courses/${c.id}?cohort=${group.cohort.id}`}
                          className="navrow"
                        >
                          <span className="nm">
                            <b>{c.name}</b>
                            <small>read-only</small>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
        </nav>
        <main className="main">{children}</main>
      </div>
    </>
  )
}
