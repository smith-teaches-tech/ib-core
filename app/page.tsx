import Shell from '@/components/Shell'
import CoordinatorHome from '@/components/CoordinatorHome'
import WorkHome from '@/components/WorkHome'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'

// The home page routes by role rather than showing one generic page to
// everyone. A coordinator's home is the command centre; a teacher's and a
// student's is the queue of things waiting on them. The shell — sidebar
// navigation, key dates, announcements, documents — is the same for all.

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSession()
  const { user, school, memberships } = session

  const roles = memberships.find((m) => m.schoolId === school.id)?.roles ?? []
  const isCoordinator =
    roles.includes('school_coordinator') || roles.includes('district_coordinator')

  const student = await repo.getStudent(user.id)

  const [tiles, dates, announcements] = await Promise.all([
    repo.listModuleTiles(school.id, user.id),
    repo.listKeyDates(school.id, student?.cohortId ?? null),
    repo.listAnnouncements(school.id, user.id),
  ])

  let body: React.ReactNode

  if (isCoordinator) {
    const cc = await repo.getCommandCentre(school.id)
    body = <CoordinatorHome cc={cc} canConfigure={session.can('session.configure')} />
  } else {
    const work = await repo.listMyWork(school.id, user.id)
    const overdue = work.filter((w) => w.tone === 'overdue').length
    body = (
      <WorkHome
        name={user.name}
        subtitle={
          student
            ? overdue
              ? `${overdue} thing${overdue === 1 ? '' : 's'} overdue`
              : 'Here is where you stand'
            : roles.includes('tok_teacher')
              ? 'CAS coordinator · EE coordinator · TOK teacher · TOK coordinator'
              : 'Teacher'
        }
        work={work}
        tiles={tiles}
        student={student}
      />
    )
  }

  return (
    <Shell session={session} tiles={tiles} dates={dates} announcements={announcements}>
      {body}
    </Shell>
  )
}
