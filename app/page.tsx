import CohortBar from '@/components/CohortBar'
import Shell from '@/components/Shell'
import Track from '@/components/Track'
import BoardView from '@/components/BoardView'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { cohortTitle, sortCohorts } from '@/lib/cohorts'

// Home routes by role, but both views are the SAME data at different zooms:
//   student      → their track  (one student, full detail)
//   coordinator  → the board    (every student, compressed to a row)
//
// Neither reads anything the modules don't write. There is no separate
// coordinator data source, by design.

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ export?: string; cohort?: string }>
}) {
  const session = await getSession()
  const { user, school, memberships } = session
  const roles = memberships.find((m) => m.schoolId === school.id)?.roles ?? []
  const isStudent = roles.includes('student')
  const exportOnly = (await searchParams).export === '1'

  const isCoordinator =
    roles.includes('school_coordinator') || roles.includes('district_coordinator')

  // "My spaces" is uniform: the things you are attached to, grouped by the year
  // group they belong to. A coordinator gets a page list instead (lib/nav.ts),
  // so there is nothing to compute for them.
  const spaces = isCoordinator ? [] : await repo.mySpaces(school.id, user.id)

  let body: React.ReactNode

  if (isStudent) {
    const track = await repo.getTrack(school.id, user.id)
    body = track ? (
      <>
        <h1>{user.name}</h1>
        <p className="sub">
          Class of 2027 · Candidate {track.student.sessionNumber} / {track.student.personalCode ?? '—'}
          {' '}— a record of what you have completed.
        </p>
        <Track track={track} examDate="2027-05-01" />
      </>
    ) : (
      <p className="mut">No student record.</p>
    )
  } else {
    // The board shows one year group at a time; default to the one graduating
    // soonest, since that is the one with an exam session bearing down on it.
    const cohorts = sortCohorts(await repo.setup.listCohorts(school.id))
    const wanted = (await searchParams).cohort
    const cohort = cohorts.find((c) => c.id === wanted) ?? cohorts[0]
    const board = await repo.getBoard(school.id, cohort?.id ?? 'c15', exportOnly)
    body = (
      <>
        <h1>Completeness</h1>
        <p className="sub">
          What is recorded and what isn&rsquo;t — every candidate&rsquo;s track, compressed to one row.
        </p>
        <CohortBar
          cohorts={cohorts}
          current={cohort?.id ?? ''}
          href={(id) => `/?cohort=${id}${exportOnly ? '&export=1' : ''}`}
        />
        <BoardView
          board={board}
          cohortLabel={cohort ? cohortTitle(cohort) : ''}
          exportOnly={exportOnly}
        />
      </>
    )
  }

  return (
    <Shell session={session} spaces={spaces} current={isStudent ? 'home' : '/'}>
      {body}
    </Shell>
  )
}
