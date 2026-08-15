import CohortBar from '@/components/CohortBar'
import Shell from '@/components/Shell'
import SetupPage from '@/components/setup/SetupPage'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { resolveCapabilities } from '@/lib/capabilities'
import { cohortTitle, isArchived, sortCohorts } from '@/lib/cohorts'

export const dynamic = 'force-dynamic'

export default async function Setup({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>
}) {
  const wanted = (await searchParams).cohort
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

  const cohorts = sortCohorts(await repo.setup.listCohorts(school.id))
  // Defaults to the Year 2 group — sortCohorts puts it first — but every cohort
  // including the archive is reachable, because a coordinator answers questions
  // about finished sessions for years afterwards.
  const cohort = cohorts.find((c) => c.id === wanted) ?? cohorts[0]
  const readOnly = cohort ? isArchived(cohort) : false
  const [courseRows, people] = await Promise.all([
    repo.setup.listCourseRows(school.id, cohort?.id ?? 'c15'),
    // The PIN leaves the repository only for someone who may manage identifiers.
    repo.setup.listPeople(school.id, session.can('identifiers.manage')),
  ])

  const membership = memberships.find((m) => m.schoolId === school.id)
  const mine = membership ? [...resolveCapabilities(membership)] : []

  return (
    <Shell session={session} spaces={[]} current="/setup">
      <CohortBar
        cohorts={cohorts}
        current={cohort?.id ?? ''}
        href={(id) => `/setup?cohort=${id}`}
      />
      {readOnly && (
        <div className="note gold" style={{ marginBottom: 14 }}>
          <b>{cohort?.label} is archived.</b> You can read it; nothing can be changed.
        </div>
      )}
      <SetupPage
        courseRows={courseRows}
        people={people}
        cohortId={cohort?.id ?? 'c15'}
        cohortLabel={cohort ? cohortTitle(cohort) : 'this cohort'}
        schoolName={school.name}
        myCapabilities={mine}
        myUserId={user.id}
        // An archived year is a record, not a workspace: every write capability
        // is withdrawn on the way in. The actions enforce it again server-side.
        can={{
          students: session.can('students.add') && !readOnly,
          teachers: session.can('teachers.invite') && !readOnly,
          catalogue: session.can('catalogue.manage') && !readOnly,
          sections: session.can('sections.manage') && !readOnly,
          enrolment: session.can('enrolment.manage') && !readOnly,
          roles: session.can('roles.assign') && !readOnly,
          identifiers: session.can('identifiers.manage') && !readOnly,
          distribute: session.can('identifiers.distribute'),
        }}
      />
    </Shell>
  )
}
