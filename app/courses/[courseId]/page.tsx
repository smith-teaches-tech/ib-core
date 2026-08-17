import { notFound } from 'next/navigation'
import Shell from '@/components/Shell'
import CandidatePanel from '@/components/CandidatePanel'
import CasRoster from '@/components/cas/CasRoster'
import CohortBar from '@/components/CohortBar'
import MarkHistory from '@/components/ia/MarkHistory'
import MarksGrid from '@/components/ia/MarksGrid'
import SamplePanel from '@/components/ia/SamplePanel'
import UnlockMarks from '@/components/ia/UnlockMarks'
import StudentCas from '@/components/cas/StudentCas'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { cohortTitle, isArchived, sortCohorts } from '@/lib/cohorts'

// A course page, dispatched by course TYPE.
//
// This is the shape the philosophy doc's §5 buys us: the container is identical
// for Biology and for CAS, and only the contents differ. Adding TOK later is a
// new branch here and a new module folder — not a new kind of page, a new
// navigation concept, or a new permission model.

export const dynamic = 'force-dynamic'

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ cohort?: string; candidate?: string }>
}) {
  const { courseId } = await params
  const { cohort: wantedCohort, candidate: wantedCandidate } = await searchParams
  const session = await getSession()
  const { user, school, memberships } = session
  const roles = memberships.find((m) => m.schoolId === school.id)?.roles ?? []
  const isStudent = roles.includes('student')
  const isCoordinator =
    roles.includes('school_coordinator') || roles.includes('district_coordinator')

  const courses = await repo.listCourses(school.id)
  const course = courses.find((c) => c.id === courseId)
  if (!course) notFound()

  const spaces = isCoordinator ? [] : await repo.mySpaces(school.id, user.id)

  // Which year group of this course — the one asked for, else the first live
  // one this person is attached to.
  const cohorts = sortCohorts(await repo.setup.listCohorts(school.id))
  const attached = spaces.filter((g) => g.courses.some((c) => c.id === course.id))
  const cohort =
    cohorts.find((c) => c.id === wantedCohort) ??
    attached.find((g) => !isArchived(g.cohort))?.cohort ??
    attached[0]?.cohort ??
    cohorts[0]
  const current = course.id + '@' + (cohort?.id ?? '')
  const readOnly = cohort ? isArchived(cohort) : false

  // Who reads ANY course: the coordinator tier, identified by capability
  // rather than role — `marks.transcribe` / `marks.override` holders keep read
  // access to the whole catalogue. Everyone else opens only what they are
  // attached to (a teacher's assignments, a student's enrolments).
  const coordinatorReader = session.can('marks.transcribe') || session.can('marks.override')
  if (!coordinatorReader && attached.length === 0) {
    return (
      <Shell session={session} spaces={spaces} current={current}>
        <h1>{course.name}</h1>
        <div className="note warn">Not your course — you are not assigned to it.</div>
      </Shell>
    )
  }

  let body: React.ReactNode

  if (course.type === 'cas') {
    if (isStudent) {
      const view = await repo.cas.getStudentView(school.id, user.id)
      body = view ? (
        // gradYear sets the CAS timeline's window — August of DP1 to the April
        // CAS closes in. Never hardcoded: two year groups run at once.
        <StudentCas view={view} gradYear={cohort?.gradYear ?? new Date().getFullYear() + 1} />
      ) : (
        <p className="mut">No CAS record.</p>
      )
    } else if (session.can('cas.manage')) {
      const cohortId = cohort?.id ?? 'c15'
      const [rows, totals] = await Promise.all([
        repo.cas.getRoster(school.id, cohortId),
        repo.cas.getTotals(school.id, cohortId),
      ])
      body = (
        <>
          {/* Coordinator only (17 Aug). A teacher's year groups are already
              down the left, each course carrying its own cohort — two
              switchers for one choice, and they could disagree. */}
          {isCoordinator && (
            <CohortBar
              cohorts={cohorts}
              current={cohortId}
              href={(id) => `/courses/${course.id}?cohort=${id}`}
            />
          )}
          <CasRoster
            rows={rows}
            totals={totals}
            cohortLabel={cohort ? cohortTitle(cohort) : ''}
            gradYear={cohort?.gradYear ?? new Date().getFullYear() + 1}
            // An archived year is a record, not a workspace.
            canManage={session.can('cas.manage') && !readOnly}
            canUnlock={session.can('items.unlock') && !readOnly}
          />
        </>
      )
    } else {
      body = (
        <>
          <h1>CAS</h1>
          <div className="note warn">
            You do not have the <b>CAS — approve, complete, interview</b> capability for this
            school.
          </div>
        </>
      )
    }
  } else if (course.type === 'subject') {
    // A subject course's page IS its IA — the mark-entry grid for staff who can
    // mark, a plain status note for everyone else. One course screen, N
    // templates (IB-Course-Templates.md §1): what differs between Chemistry HL
    // and Visual Arts SL is the requirement set rendered into it, not the page.
    const cohortId = cohort?.id ?? 'c15'
    if (!isStudent && (session.can('ia.manage') || coordinatorReader)) {
      const view = await repo.ia.getMarksView(school.id, course.id, cohortId)
      if (view) {
        // Marker-only writes: the grid is editable for the DESIGNATED MARKER,
        // and for a `marks.override` holder only while their reasoned,
        // 30-minute unlock is live. Co-teachers read. The actions re-check all
        // of this server-side (lib/ia/authorize.ts) — this is presentation.
        const isMarker = await repo.ia.isMarkerFor(school.id, course.id, cohortId, user.id)
        const overrideHolder = !isMarker && session.can('marks.override')
        const unlock = overrideHolder
          ? await repo.ia.activeUnlock(school.id, course.id, user.id)
          : null
        const editable = !readOnly && (isMarker || unlock != null)

        // The whole-student popout, teacher edition: names in the grid open
        // the same CandidatePanel the board uses, selection in the URL. Gated
        // server-side — a teacher reaches only students in courses they are
        // assigned to, and IB identifiers leave only for identifier holders.
        const mayOpenCandidate = wantedCandidate
          ? coordinatorReader ||
            (await repo.teachesStudent(school.id, user.id, wantedCandidate))
          : false
        const track =
          wantedCandidate && mayOpenCandidate
            ? await repo.getTrack(school.id, wantedCandidate, {
                includeIdentifiers: session.can('identifiers.manage'),
              })
            : null

        const events =
          isMarker || coordinatorReader
            ? await repo.ia.listMarkEvents(school.id, course.id, cohortId)
            : null

        // The moderation sample: the MARKER (they know which candidates IBIS
        // named for their course) and the coordinator tier see and record it.
        const showSample = isMarker || coordinatorReader
        const sample = showSample
          ? await repo.ia.getSampleRequest(school.id, course.id, cohortId)
          : null

        const baseHref = `/courses/${course.id}?cohort=${cohortId}`
        body = (
          <>
            <h1>{course.name}</h1>
            <p className="sub">
              {course.subjectGroup}
              {course.level ? ` · ${course.level}` : ''} — internal assessment, entered per criterion.
              The total derives, and the moderation sample&rsquo;s criterion form is answered the day
              IBIS asks.
            </p>
            {isCoordinator && (
              <CohortBar
                cohorts={cohorts}
                current={cohortId}
                href={(id) => `/courses/${course.id}?cohort=${id}`}
              />
            )}
            {overrideHolder && !readOnly && (
              <UnlockMarks
                courseId={course.id}
                cohortId={cohortId}
                unlock={unlock ? { reason: unlock.reason, expiresAt: unlock.expiresAt } : null}
                markerName={view.marker}
              />
            )}
            <MarksGrid
              view={view}
              editable={editable}
              canTranscribe={false}
              readOnlyReason={
                readOnly
                  ? `${cohort?.label} is archived — a record, not a workspace.`
                  : !editable
                    ? view.marker
                      ? `Read-only — ${view.marker} is the designated marker for this course.`
                      : 'Read-only — no designated marker is set for this course.'
                    : undefined
              }
              candidateBase={`${baseHref}&candidate=`}
            />
            {showSample && (
              <SamplePanel
                view={view}
                sample={sample}
                canEdit={!readOnly && (isMarker || session.can('sample.import'))}
                sessionLabel={cohort ? `M${String(cohort.gradYear).slice(-2)}` : 'M27'}
              />
            )}
            {events != null && <MarkHistory events={events} />}
            {wantedCandidate && !mayOpenCandidate && (
              <div className="note warn" style={{ marginTop: 14 }}>
                Not your student — the panel opens only for students in your own courses.
              </div>
            )}
            {track && <CandidatePanel track={track} closeHref={baseHref} />}
          </>
        )
      } else {
        body = (
          <>
            <h1>{course.name}</h1>
            <div className="note">This course is not running for {cohort?.label ?? 'this year group'} yet.</div>
          </>
        )
      }
    } else {
      body = (
        <>
          <h1>{course.name}</h1>
          <p className="sub">
            {course.subjectGroup}
            {course.level ? ` · ${course.level}` : ''}
          </p>
          <div className="note">
            Your internal assessment for this course — the file, the mark and the teacher comment —
            shows on your own track on the home page. Marks are released by your teacher.
          </div>
        </>
      )
    }
  } else {
    body = (
      <>
        <h1>{course.name}</h1>
        <p className="sub">
          {course.subjectGroup}
          {course.level ? ` · ${course.level}` : ''}
        </p>
        <div className="note">
          This module is not built yet. CAS and the subject-course IA grids are the ones that are.
          See <b>IB-Build-Status.md</b> for the order.
        </div>
      </>
    )
  }

  return (
    <Shell session={session} spaces={spaces} current={current}>
      {readOnly && (
        <div className="note gold" style={{ marginBottom: 14 }}>
          <b>{cohort?.label} is archived.</b> This is a read-only record of a finished year —
          nothing here can be changed.
        </div>
      )}
      {body}
    </Shell>
  )
}
