import Shell from '@/components/Shell'
import CohortBar from '@/components/CohortBar'
import DeadlineTable from '@/components/deadlines/DeadlineTable'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { cohortTitle, isArchived, sortCohorts } from '@/lib/cohorts'
import { stagesIn } from '@/lib/deadlines'

/**
 * DUE DATES — the coordinator's screen, and a teacher's too.
 *
 * One screen rather than two, because reading a date is not sensitive: students
 * see their own, and a teacher seeing when Chemistry's IA is due is useful. What
 * differs is EDITING, and that is decided per row in the repository.
 */

export const dynamic = 'force-dynamic'

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>
}) {
  const { cohort: wanted } = await searchParams
  const session = await getSession()
  const { user, school, memberships } = session
  const roles = memberships.find((m) => m.schoolId === school.id)?.roles ?? []
  const isStudent = roles.includes('student')
  const spaces = await repo.mySpaces(school.id, user.id)

  const cohorts = sortCohorts(await repo.setup.listCohorts(school.id))
  const cohort = cohorts.find((c) => c.id === wanted) ?? cohorts[0]
  const cohortId = cohort?.id ?? 'c15'
  const readOnly = cohort ? isArchived(cohort) : false

  const coordinator = session.can('deadlines.set')

  // A student has no business here: they see their own dates on their home page,
  // where the work is. This screen is about setting them.
  if (isStudent) {
    return (
      <Shell session={session} spaces={spaces} current="/deadlines">
        <h1>Due dates</h1>
        <div className="note">Your own due dates are on your home page, next to the work.</div>
      </Shell>
    )
  }

  const rows = await repo.deadlines.listResolved(school.id, cohortId, {
    userId: user.id,
    hasDeadlinesSet: coordinator,
  })

  // What this person may ADD. A coordinator: every stage in the cohort, and any
  // course. A teacher: the non-predicted stages, on the courses they mark.
  const defs = await repo.deadlines.definitionsIn(school.id, cohortId)
  const allStages = stagesIn(defs)
  const myCourses = spaces
    .filter((g) => g.cohort.id === cohortId)
    .flatMap((g) => g.courses)
  const markedCourses: { id: string; name: string }[] = []
  for (const c of myCourses) {
    if (await repo.ia.isMarkerFor(school.id, c.id, cohortId, user.id)) {
      markedCourses.push({ id: c.id, name: c.name })
    }
  }

  const stages = coordinator
    ? allStages
    : allStages.filter((s) => !s.key.startsWith('pg.') && !s.cohortWide)
  const courses = coordinator
    ? (await repo.listCourses(school.id)).map((c) => ({ id: c.id, name: c.name }))
    : markedCourses

  return (
    <Shell session={session} spaces={spaces} current="/deadlines">
      <h1>Due dates</h1>
      <p className="sub">
        Every date the year runs on, in one place. A date here is the record — moving one supersedes it
        rather than erasing it, so what was promised in September survives being asked in March.
      </p>
      {coordinator && (
        <CohortBar
          cohorts={cohorts}
          current={cohortId}
          href={(id) => `/deadlines?cohort=${id}`}
        />
      )}
      <DeadlineTable
        rows={rows}
        cohortId={cohortId}
        cohortLabel={cohort ? cohortTitle(cohort) : ''}
        courses={courses}
        stages={stages}
        canAddAnything={!readOnly && (coordinator || markedCourses.length > 0)}
        readOnlyReason={
          readOnly
            ? `${cohort?.label} is archived — a record, not a workspace.`
            : !coordinator
              ? 'You can change dates on the courses you mark. Predicted-grade dates and anything cohort-wide belong to the IB coordinator.'
              : undefined
        }
      />
    </Shell>
  )
}
