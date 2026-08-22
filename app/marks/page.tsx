// Check work → Marks for IBIS — THE TRANSCRIPTION VIEW.
//
// The values live here, one course at a time; the board only ever shows the
// fractions. Same grid the designated marker uses on their course page, worn
// read-only, plus the typed-into-IBIS column — because IBIS entry is manual and
// a phone call happens halfway through.

import Link from 'next/link'
import CohortBar from '@/components/CohortBar'
import MarkHistory from '@/components/ia/MarkHistory'
import MarksGrid from '@/components/ia/MarksGrid'
import SamplePanel from '@/components/ia/SamplePanel'
import Shell from '@/components/Shell'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { isArchived, sortCohorts } from '@/lib/cohorts'

export const dynamic = 'force-dynamic'

export default async function MarksPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string; course?: string }>
}) {
  const params = await searchParams
  const session = await getSession()
  const { user, school } = session
  // Everyone gets their spaces looked up, not just teachers: a person can hold
  // a coordinator job AND teach (see Shell). A pure coordinator is attached to
  // no courses, so this returns [] for them and costs nothing.
  const spaces = await repo.mySpaces(session.school.id, session.user.id)

  /**
   * `marks.transcribe` ONLY — narrowed in the 22 Aug wiring audit.
   *
   * The gate used to accept `ia.manage` as well, and `ia.manage` is in the
   * TEACHER preset. Past it there is no per-course scoping: the course comes
   * from `?course=` and `getMarksView` answers for any of them. So every
   * teacher could read — and CSV-download — every candidate's marks, teacher
   * comments and personal codes in every subject.
   *
   * This screen is the coordinator's transcription companion; `lib/nav.ts` has
   * only ever offered it under `marks.transcribe`, so the capability and the
   * navigation now agree. A teacher's own marks are on their course page, where
   * markership is checked per course.
   */
  if (!session.can('marks.transcribe')) {
    return (
      <Shell session={session} spaces={spaces} current="/marks">
        <h1>Marks for IBIS</h1>
        <div className="note warn">
          You need <b>Run the mark transcription companion</b> for this school. Your own courses’
          marks are on each course page.
        </div>
      </Shell>
    )
  }

  const cohorts = sortCohorts(await repo.setup.listCohorts(school.id))
  const cohort = cohorts.find((c) => c.id === params.cohort) ?? cohorts[0]
  const cohortId = cohort?.id ?? 'c15'

  // Marks are BY COURSE — subject and level — because that is both how marking
  // happens and how IBIS asks for them. Chips list what this cohort runs.
  const courseRows = await repo.setup.listCourseRows(school.id, cohortId)
  const running = courseRows
    .filter((r) => r.course.type === 'subject' && r.sections.length > 0 && r.students > 0)
    .sort((a, b) => a.course.name.localeCompare(b.course.name))

  const courseId = params.course ?? running[0]?.course.id
  const view = courseId ? await repo.ia.getMarksView(school.id, courseId, cohortId) : null
  const readOnly = cohort ? isArchived(cohort) : false

  return (
    <Shell session={session} spaces={spaces} current="/marks">
      <h1>Marks for IBIS</h1>
      <p className="sub">
        Entered by the designated marker, per criterion, on their course\u2019s <b>IA Marks</b> tab —
        read here, in session order, as they go into IBIS. The board shows the fractions; this screen
        shows the values.
      </p>

      <CohortBar
        cohorts={cohorts}
        current={cohortId}
        href={(id) => `/marks?cohort=${id}`}
      />

      <div className="row" style={{ marginBottom: 14, gap: 6 }}>
        {running.map((r) => (
          <Link
            key={r.course.id}
            href={`/marks?cohort=${cohortId}&course=${r.course.id}`}
            className={`chip ${r.course.id === courseId ? 'on' : ''}`}
          >
            {r.course.name}
            <span className="n">{r.students}</span>
          </Link>
        ))}
      </div>

      {view ? (
        <>
          <MarksGrid
            view={view}
            editable={false}
            canTranscribe={session.can('marks.transcribe') && !readOnly}
            readOnlyReason={
              readOnly
                ? `${cohort?.label} is archived — a record, not a workspace.`
                : undefined
            }
          />
          {/* The coordinator's copy of the moderation-sample panel — same
              entity the marker sees on the course page. */}
          {session.can('sample.import') && (
            <SamplePanel
              view={view}
              sample={await repo.ia.getSampleRequest(school.id, view.course.id, cohortId)}
              canEdit={!readOnly}
              sessionLabel={cohort ? `M${String(cohort.gradYear).slice(-2)}` : 'M27'}
            />
          )}
          {session.can('marks.transcribe') && (
            <MarkHistory
              events={await repo.ia.listMarkEvents(school.id, view.course.id, cohortId)}
            />
          )}
        </>
      ) : (
        <div className="note">No subject courses are running for this year group yet.</div>
      )}
    </Shell>
  )
}
