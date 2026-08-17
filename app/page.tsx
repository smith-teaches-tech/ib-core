import CohortBar from '@/components/CohortBar'
import Shell from '@/components/Shell'
import Track from '@/components/Track'
import BoardView from '@/components/BoardView'
import CandidatePanel from '@/components/CandidatePanel'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { cohortTitle, sortCohorts } from '@/lib/cohorts'
import type { BoardControls, SortKey } from '@/components/BoardView'

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
  // `rows` and `turn` were v8's triage filters, dropped 17 Aug. They are still
  // accepted and ignored so old bookmarks resolve to the same board instead of
  // choking on a param that no longer exists.
  searchParams: Promise<{
    cohort?: string
    view?: string
    rows?: string
    sort?: string
    turn?: string
    q?: string
    candidate?: string
  }>
}) {
  const params = await searchParams
  const session = await getSession()
  const { user, school, memberships } = session
  const roles = memberships.find((m) => m.schoolId === school.id)?.roles ?? []
  const isStudent = roles.includes('student')

  const isCoordinator =
    roles.includes('school_coordinator') || roles.includes('district_coordinator')

  // "My spaces" is uniform: the things you are attached to, grouped by the year
  // group they belong to. A coordinator gets a page list instead (lib/nav.ts),
  // so there is nothing to compute for them.
  const spaces = isCoordinator ? [] : await repo.mySpaces(school.id, user.id)

  let body: React.ReactNode

  if (isStudent) {
    // Their OWN record — the one case identifiers show without a capability.
    const track = await repo.getTrack(school.id, user.id, { includeIdentifiers: true })
    // The header and exam date come from the student's OWN cohort — two year
    // groups run at once, and a hardcoded year is wrong for one of them.
    const myCohort = track
      ? (await repo.setup.listCohorts(school.id)).find((c) => c.id === track.student.cohortId)
      : undefined
    body = track ? (
      <>
        <h1>{user.name}</h1>
        <p className="sub">
          {myCohort?.label ?? 'IB Diploma'} · Candidate {track.student.sessionNumber} / {track.student.personalCode ?? '—'}
          {' '}— a record of what you have completed.
        </p>
        <Track track={track} examDate={myCohort ? `${myCohort.gradYear}-05-01` : '2027-05-01'} />
      </>
    ) : (
      <p className="mut">No student record.</p>
    )
  } else {
    // The board shows one year group at a time; default to the one graduating
    // soonest, since that is the one with an exam session bearing down on it.
    const cohorts = sortCohorts(await repo.setup.listCohorts(school.id))
    const cohort = cohorts.find((c) => c.id === params.cohort) ?? cohorts[0]

    // The whole view lives in the URL — tab, order, search and the open
    // candidate panel are all params, so any of it can be bookmarked.
    const controls: BoardControls = {
      view: params.view === 'records' ? 'records' : 'ib',
      sort: params.sort === 'name' ? 'name' : ('session' as SortKey),
      q: params.q ?? '',
      candidate: params.candidate ?? null,
    }

    const board = await repo.getBoard(school.id, cohort?.id ?? 'c15', {
      view: controls.view,
    })

    // The open panel — a candidate of THIS cohort, or nothing.
    const track =
      controls.candidate && board.rows.some((r) => r.student.userId === controls.candidate)
        ? await repo.getTrack(school.id, controls.candidate, {
            includeIdentifiers: session.can('identifiers.manage'),
          })
        : null

    // The cohort chips carry the rest of the view with them, and the board's own
    // links carry the cohort back — otherwise either one silently resets the other.
    const keep: Record<string, string> = cohort ? { cohort: cohort.id } : {}
    const withParams = (patch: Record<string, string | null>) => {
      const q = new URLSearchParams(keep)
      if (controls.view !== 'ib') q.set('view', controls.view)
      if (controls.sort !== 'session') q.set('sort', controls.sort)
      if (controls.q) q.set('q', controls.q)
      if (controls.candidate) q.set('candidate', controls.candidate)
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) q.delete(k)
        else q.set(k, v)
      }
      const s = q.toString()
      return s ? `/?${s}` : '/'
    }

    body = (
      <>
        <h1>IBIS readiness</h1>
        <p className="sub">
          Two boards, split by where the work goes — every candidate, one row each. Click a
          candidate for their whole file.
        </p>
        <CohortBar
          cohorts={cohorts}
          current={cohort?.id ?? ''}
          href={(id) => withParams({ cohort: id, candidate: null })}
        />
        <BoardView
          board={board}
          cohortLabel={cohort ? cohortTitle(cohort) : ''}
          controls={controls}
          base="/"
          keep={keep}
        />
        {track && <CandidatePanel track={track} closeHref={withParams({ candidate: null })} />}
      </>
    )
  }

  return (
    <Shell session={session} spaces={spaces} current={isStudent ? 'home' : '/'}>
      {body}
    </Shell>
  )
}
