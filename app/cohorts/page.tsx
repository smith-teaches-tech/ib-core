// Cohorts — THE ONE HOME for the year-group lifecycle.
//
// Create a new cohort (empty, or with an existing cohort's structure cloned
// in), see every year group live and archived, and archive or reopen — the
// control that used to sit on Setup lives here now, so there is exactly one
// place a cohort's life is decided. Day-to-day setup (students, courses,
// enrolment) stays on Add & assign.

import ArchiveCohort from '@/components/setup/ArchiveCohort'
import CreateCohort from '@/components/cohorts/CreateCohort'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { cohortTitle, isArchived, sortCohorts } from '@/lib/cohorts'

export const dynamic = 'force-dynamic'

export default async function CohortsPage() {
  const session = await getSession()
  const { school } = session

  if (!session.can('cohorts.manage')) {
    return (
      <Shell session={session} spaces={[]} current="/cohorts">
        <h1>Cohorts</h1>
        <div className="note warn">
          You need <b>Create and edit cohorts</b> for this school.
        </div>
      </Shell>
    )
  }

  const summaries = await repo.setup.listCohortSummaries(school.id)
  // Live first, soonest-graduating at the front; archived after — the same
  // order every cohort picker uses.
  const ordered = sortCohorts(summaries.map((s) => s.cohort)).map(
    (c) => summaries.find((s) => s.cohort.id === c.id)!,
  )
  const canArchive = session.can('cohort.archive')

  return (
    <Shell session={session} spaces={[]} current="/cohorts">
      <h1>Cohorts</h1>
      <p className="sub">
        {school.name} — every year group, live and archived. Create the next one here, clone this
        year&rsquo;s structure into it, and archive a year only when the IB has finally stopped
        asking about it.
      </p>

      {/* Creation FIRST — the reason a coordinator opens this page is usually
          "start the next year", so the form sits above the list. */}
      <CreateCohort
        sources={ordered.map((s) => ({
          id: s.cohort.id,
          label: cohortTitle(s.cohort) + (isArchived(s.cohort) ? ' (archived)' : ''),
        }))}
      />

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h">
          <h2>Year groups</h2>
        </div>
        <div className="panel-b">
          <table className="sp-ia" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Cohort</th>
                <th>Status</th>
                <th>Students</th>
                <th>Courses running</th>
                <th style={{ textAlign: 'left' }} />
              </tr>
            </thead>
            <tbody>
              {ordered.map(({ cohort, students, courses }) => (
                <tr key={cohort.id}>
                  <td style={{ textAlign: 'left', fontWeight: 600 }}>
                    {cohortTitle(cohort)}{' '}
                    <span className="mut" style={{ fontWeight: 400 }}>· grad {cohort.gradYear}</span>
                  </td>
                  <td>
                    {isArchived(cohort) ? (
                      <span className="pill grey">🗄 archived</span>
                    ) : (
                      <span className="pill ok">live</span>
                    )}
                  </td>
                  <td>{students}</td>
                  <td>{courses}</td>
                  <td style={{ textAlign: 'left' }}>
                    {/* The way INTO a year group, live or finished. The year
                        switcher at the top of every page shows live years only
                        (17 Aug) — archiving means "this is a record now", and a
                        record does not belong in a switcher you use forty times
                        a day. This link is what makes that removal safe: every
                        year ever run is still one click from here. */}
                    <Link href={`/?cohort=${cohort.id}`} className="btn sm">
                      Open{isArchived(cohort) ? ' (read-only)' : ''}
                    </Link>{' '}
                    <ArchiveCohort cohort={cohort} canArchive={canArchive} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!canArchive && (
            <p className="mut" style={{ fontSize: 12, marginTop: 8 }}>
              Archiving needs <b>Archive a cohort</b> — off in every preset, deliberately. The
              district coordinator grants it under Permissions.
            </p>
          )}
        </div>
      </div>
    </Shell>
  )
}
