// Download for IBIS — the point of the product.
//
// The upload board (IB-Export-and-Samples.md §3, mockup v9 tab 3): what the IB
// wants, whether the school holds it, and the download that produces it with
// IBIS-ready names. Everything on this page is a projection — the modules
// recorded it all; this screen only selects.

import CohortBar from '@/components/CohortBar'
import Shell from '@/components/Shell'
import UploadBoard from '@/components/export/UploadBoard'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { isArchived, sortCohorts } from '@/lib/cohorts'

export const dynamic = 'force-dynamic'

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>
}) {
  const params = await searchParams
  const session = await getSession()
  const { user, school } = session
  // Everyone gets their spaces looked up, not just teachers: a person can hold
  // a coordinator job AND teach (see Shell). A pure coordinator is attached to
  // no courses, so this returns [] for them and costs nothing.
  const spaces = await repo.mySpaces(session.school.id, session.user.id)

  if (!session.can('pack.school')) {
    return (
      <Shell session={session} spaces={spaces} current="/export">
        <h1>Download for IBIS</h1>
        <div className="note warn">
          You need <b>Build school packs</b> for this school.
        </div>
      </Shell>
    )
  }

  const cohorts = sortCohorts(await repo.setup.listCohorts(school.id))
  const cohort = cohorts.find((c) => c.id === params.cohort) ?? cohorts[0]
  const cohortId = cohort?.id ?? 'c15'
  const view = await repo.export.getUploadBoard(school.id, cohortId)
  const readOnly = cohort ? isArchived(cohort) : false

  return (
    <Shell session={session} spaces={spaces} current="/export">
      <h1>Download for IBIS</h1>
      <p className="sub">
        Download here, upload to eCoursework, mark it done. Files are named{' '}
        <span className="mono">sessionNo_Component.pdf</span> in IBIS candidate order — for your
        sanity, not the moderator&apos;s. Forms (RPPF, TK/PPF) are the <b>official IB PDFs, filled
        from what was typed into the app</b> — nobody downloads a blank form again.
      </p>

      <CohortBar cohorts={cohorts} current={cohortId} href={(id) => `/export?cohort=${id}`} />

      {readOnly && (
        <div className="note" style={{ marginBottom: 12 }}>
          {cohort?.label} is archived — a record, not a workspace. Downloads work; nothing writes.
        </div>
      )}

      {view ? (
        <UploadBoard
          view={view}
          canSubmit={session.can('ecoursework.status')}
          readOnly={readOnly}
        />
      ) : (
        <div className="note">No year group selected.</div>
      )}
    </Shell>
  )
}
