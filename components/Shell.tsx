import Link from 'next/link'
import { DEV_USERS, type Session } from '@/lib/session'
import { repo } from '@/lib/data'

export default async function Shell({
  session,
  children,
}: {
  session: Session
  children: React.ReactNode
}) {
  const schools = await repo.listSchools()
  const mySchools = schools.filter((s) =>
    session.memberships.some((m) => m.schoolId === s.id),
  )

  return (
    <>
      <header className="top">
        <Link className="logo" href="/">
          IB&nbsp;Core <span>· {session.school.name}</span>
        </Link>

        {/* Only shown when the user belongs to more than one school. Most people
            never see it and have no evidence the other school exists. */}
        {mySchools.length > 1 && (
          <form action="/api/dev/school" method="POST">
            <select name="schoolId" defaultValue={session.school.id}>
              {mySchools.map((s) => (
                <option key={s.id} value={s.id}>
                  🏫 {s.name} · {s.ibSchoolCode}
                </option>
              ))}
            </select>{' '}
            <button className="btn sm" type="submit">Switch</button>
          </form>
        )}

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
      <div className="wrap">{children}</div>
    </>
  )
}
