import CohortBar from '@/components/CohortBar'
import Shell from '@/components/Shell'
import Track from '@/components/Track'
import BoardView from '@/components/BoardView'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { cohortTitle, sortCohorts } from '@/lib/cohorts'
import { LANE_ORDER } from '@/lib/board'
import type { BoardControls, RowFilter, SortKey, TurnKey } from '@/components/BoardView'
import type { Lane } from '@/lib/types'

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
  searchParams: Promise<{
    export?: string
    cohort?: string
    expand?: string
    rows?: string
    sort?: string
    turn?: string
  }>
}) {
  const params = await searchParams
  const session = await getSession()
  const { user, school, memberships } = session
  const roles = memberships.find((m) => m.schoolId === school.id)?.roles ?? []
  const isStudent = roles.includes('student')
  const exportOnly = params.export === '1'

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
    const cohort = cohorts.find((c) => c.id === params.cohort) ?? cohorts[0]

    // The whole view lives in the URL — no client state, and a coordinator can
    // bookmark "teachers, export-blocking" and find it there tomorrow.
    const controls: BoardControls = {
      expanded: (params.expand ?? '')
        .split(',')
        .filter((l): l is Lane => (LANE_ORDER as string[]).includes(l)),
      rows: params.rows === 'all' ? 'all' : ('outstanding' as RowFilter),
      sort: params.sort === 'session' ? 'session' : ('outstanding' as SortKey),
      turn: (['student', 'staff', 'coordinator'] as const).includes(params.turn as never)
        ? (params.turn as TurnKey)
        : 'any',
      exportOnly,
    }

    const board = await repo.getBoard(school.id, cohort?.id ?? 'c15', {
      expanded: controls.expanded,
      exportOnly,
    })

    // The cohort chips carry the rest of the view with them, and the board's own
    // links carry the cohort back — otherwise either one silently resets the other.
    const keep: Record<string, string> = cohort ? { cohort: cohort.id } : {}
    const cohortHref = (id: string) => {
      const q = new URLSearchParams({ cohort: id })
      if (controls.expanded.length) q.set('expand', controls.expanded.join(','))
      if (controls.rows !== 'outstanding') q.set('rows', controls.rows)
      if (controls.sort !== 'outstanding') q.set('sort', controls.sort)
      if (controls.turn !== 'any') q.set('turn', controls.turn)
      if (exportOnly) q.set('export', '1')
      return `/?${q.toString()}`
    }

    body = (
      <>
        <h1>IBIS readiness</h1>
        <p className="sub">
          What has to be true before the upload window opens — every candidate, one row each.
        </p>
        <CohortBar cohorts={cohorts} current={cohort?.id ?? ''} href={cohortHref} />
        <BoardView
          board={board}
          cohortLabel={cohort ? cohortTitle(cohort) : ''}
          controls={controls}
          base="/"
          keep={keep}
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
