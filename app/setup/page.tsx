import Shell from '@/components/Shell'
import SetupPage from '@/components/setup/SetupPage'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { resolveCapabilities } from '@/lib/capabilities'

export const dynamic = 'force-dynamic'

export default async function Setup() {
  const session = await getSession()
  const { user, school, memberships } = session
  const roles = memberships.find((m) => m.schoolId === school.id)?.roles ?? []
  const isCoordinator =
    roles.includes('school_coordinator') || roles.includes('district_coordinator')

  if (!isCoordinator) {
    return (
      <Shell session={session} spaces={[]} current="/setup">
        <h1>Add &amp; assign</h1>
        <div className="note warn">This is the IB coordinator&rsquo;s screen.</div>
      </Shell>
    )
  }

  const cohorts = await repo.setup.listCohorts(school.id)
  const cohort = cohorts.find((c) => !c.archived) ?? cohorts[0]
  const [courseRows, people] = await Promise.all([
    repo.setup.listCourseRows(school.id, cohort?.id ?? 'c15'),
    // The PIN leaves the repository only for someone who may manage identifiers.
    repo.setup.listPeople(school.id, session.can('identifiers.manage')),
  ])

  const membership = memberships.find((m) => m.schoolId === school.id)
  const mine = membership ? [...resolveCapabilities(membership)] : []

  return (
    <Shell session={session} spaces={[]} current="/setup">
      <SetupPage
        courseRows={courseRows}
        people={people}
        cohortId={cohort?.id ?? 'c15'}
        cohortLabel={cohort?.label ?? 'this cohort'}
        schoolName={school.name}
        myCapabilities={mine}
        myUserId={user.id}
        can={{
          students: session.can('students.add'),
          teachers: session.can('teachers.invite'),
          catalogue: session.can('catalogue.manage'),
          sections: session.can('sections.manage'),
          enrolment: session.can('enrolment.manage'),
          roles: session.can('roles.assign'),
          identifiers: session.can('identifiers.manage'),
          distribute: session.can('identifiers.distribute'),
        }}
      />
    </Shell>
  )
}
