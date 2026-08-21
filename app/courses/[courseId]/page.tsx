import { notFound } from 'next/navigation'
import Shell from '@/components/Shell'
import CandidatePanel from '@/components/CandidatePanel'
import CasRoster from '@/components/cas/CasRoster'
import EeRoster from '@/components/ee/EeRoster'
import StudentEe from '@/components/ee/StudentEe'
import CohortBar from '@/components/CohortBar'
import MarkHistory from '@/components/ia/MarkHistory'
import MarksGrid from '@/components/ia/MarksGrid'
import PgGrid from '@/components/pg/PgGrid'
import SamplePanel from '@/components/ia/SamplePanel'
import UnlockMarks from '@/components/ia/UnlockMarks'
import StudentCas from '@/components/cas/StudentCas'
import StudentTok from '@/components/tok/StudentTok'
import TokMarking from '@/components/tok/TokMarking'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { cohortTitle, isArchived, sortCohorts } from '@/lib/cohorts'
import { isCoordinatorTier, restrictStudentView } from '@/lib/pg/authorize'
import { ESSAY_INSTRUMENT, EXHIBITION_INSTRUMENT } from '@/lib/tok/rubric'

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
  searchParams: Promise<{ cohort?: string; candidate?: string; screen?: string }>
}) {
  const { courseId } = await params
  const {
    cohort: wantedCohort,
    candidate: wantedCandidate,
    screen: wantedScreen,
  } = await searchParams
  const session = await getSession()
  const { user, school, memberships } = session
  const roles = memberships.find((m) => m.schoolId === school.id)?.roles ?? []
  const isStudent = roles.includes('student')
  const isCoordinator =
    roles.includes('school_coordinator') || roles.includes('district_coordinator')

  const courses = await repo.listCourses(school.id)
  const course = courses.find((c) => c.id === courseId)
  if (!course) notFound()

  // Not gated on role any more: someone can hold a coordinator job AND teach,
  // and the sidebar shows both (see Shell). A pure coordinator is attached to
  // no courses, so this comes back empty for them by itself.
  const spaces = await repo.mySpaces(school.id, user.id)

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

  /**
   * THE TWO SCREENS on a class page. One route; the segmented control below
   * chooses which component renders. Not one grid with extra columns: the IA
   * grid is marker-only with a 30-minute coordinator override, predicted grades
   * are marker-or-coordinator with a per-cell lock, and a single component
   * applying two authorization models to adjacent cells is how a permission bug
   * gets written.
   */
  const screen: 'ia' | 'pg' = wantedScreen === 'pg' ? 'pg' : 'ia'

  /**
   * The whole-student panel, teacher edition — the SAME component the board
   * uses. A teacher reaches only students in courses they are assigned to;
   * identifiers leave only for identifier holders; and predicted grades in
   * OTHER courses leave only for `grades.cross_course` holders.
   */
  const renderCandidatePanel = async (closeHref: string) => {
    const mayOpen = wantedCandidate
      ? coordinatorReader || (await repo.teachesStudent(school.id, user.id, wantedCandidate))
      : false
    if (!wantedCandidate || !mayOpen) {
      return {
        panel: null,
        refused: Boolean(wantedCandidate) && !mayOpen,
      }
    }
    const track = await repo.getTrack(school.id, wantedCandidate, {
      includeIdentifiers: session.can('identifiers.manage'),
    })
    if (!track) return { panel: null, refused: false }

    const full = await repo.pg.getStudentView(school.id, wantedCandidate)
    let pgView = full
    let hidden = 0
    if (full && !session.can('grades.cross_course')) {
      // Without the capability a teacher still sees the courses they teach —
      // the thing being granted is the OTHER courses, so that is the thing
      // taken away.
      const mine = new Set((await repo.myCourses(school.id, user.id)).map((c) => c.id))
      const r = restrictStudentView(full, mine)
      pgView = r.view
      hidden = r.hidden
    }
    return {
      refused: false,
      panel: (
        <CandidatePanel
          track={track}
          closeHref={closeHref}
          pg={pgView && pgView.courses.length > 0 ? pgView : null}
          pgRedacted={hidden > 0}
        />
      ),
    }
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
        const { panel, refused } = await renderCandidatePanel(baseHref)

        // Predicted grades: the same roster, the other screen. Editable for the
        // marker OR the coordinator tier — directly, no unlock ceremony. The
        // per-cell lock is what stands between them and an accident, and the
        // server action re-checks all of it (lib/pg/authorize.ts).
        const pgView = await repo.pg.getView(school.id, course.id, cohortId)
        const pgEditable =
          !readOnly && session.can('pg.manage') && (isMarker || isCoordinatorTier(session.can))

        const screens = (
          <nav className="pgseg">
            <a className={screen === 'ia' ? 'on' : ''} href={`${baseHref}&screen=ia`}>IA marks</a>
            <a className={screen === 'pg' ? 'on' : ''} href={`${baseHref}&screen=pg`}>
              Predicted grades
            </a>
          </nav>
        )

        body = (
          <>
            <h1>{course.name}</h1>
            <p className="sub">
              {course.subjectGroup}
              {course.level ? ` · ${course.level}` : ''}
              {screen === 'ia'
                ? ' — internal assessment, entered per criterion. The total derives, and the moderation sample’s criterion form is answered the day IBIS asks.'
                : ' — predicted grades at three reporting points. Only the April set goes to the IB; the earlier two are the school’s own reads.'}
            </p>
            {isCoordinator && (
              <CohortBar
                cohorts={cohorts}
                current={cohortId}
                href={(id) => `/courses/${course.id}?cohort=${id}`}
              />
            )}
            {screens}
            {screen === 'pg' && pgView && (
              <PgGrid
                view={pgView}
                editable={pgEditable}
                readOnlyReason={
                  readOnly
                    ? `${cohort?.label} is archived — a record, not a workspace.`
                    : !session.can('pg.manage')
                      ? 'Read-only — you do not hold the predicted-grades capability.'
                      : !pgEditable
                        ? view.marker
                          ? `Read-only — ${view.marker} is the designated marker for this course.`
                          : 'Read-only — no designated marker is set for this course.'
                        : undefined
                }
                candidateBase={`${baseHref}&screen=pg&candidate=`}
              />
            )}
            {screen === 'pg' && !pgView && (
              <div className="note">
                No predicted-grade requirements exist for this course and year group yet.
              </div>
            )}
            {screen === 'ia' && overrideHolder && !readOnly && (
              <UnlockMarks
                courseId={course.id}
                cohortId={cohortId}
                unlock={unlock ? { reason: unlock.reason, expiresAt: unlock.expiresAt } : null}
                markerName={view.marker}
              />
            )}
            {screen === 'ia' && (
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
              candidateBase={`${baseHref}&screen=ia&candidate=`}
            />
            )}
            {screen === 'ia' && showSample && (
              <SamplePanel
                view={view}
                sample={sample}
                canEdit={!readOnly && (isMarker || session.can('sample.import'))}
                sessionLabel={cohort ? `M${String(cohort.gradYear).slice(-2)}` : 'M27'}
              />
            )}
            {/* ONE trail per course. A predicted grade and an IA mark land on
                the same history, because the question a reader has is "what
                happened to this candidate in my course", not "what kind of
                thing happened". */}
            {events != null && <MarkHistory events={events} />}
            {refused && (
              <div className="note warn" style={{ marginTop: 14 }}>
                Not your student — the panel opens only for students in your own courses.
              </div>
            )}
            {panel}
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
  } else if (course.type === 'ee') {
    if (isStudent) {
      // The checkpoints come from getTrack, NOT from the EE repository — the
      // student's screen and the coordinator's board read one derivation.
      const [view, track] = await Promise.all([
        repo.ee.getStudentView(school.id, user.id),
        repo.getTrack(school.id, user.id),
      ])
      const lane = track?.lanes.find((l) => l.lane === 'Extended Essay')
      body = view ? (
        <StudentEe view={view} checkpoints={lane?.checkpoints ?? []} />
      ) : (
        <p className="mut">No extended essay record.</p>
      )
    } else {
      const cohortId = cohort?.id ?? 'c15'
      // `ee.manage` sees the cohort; a supervisor sees their own supervisees.
      // Passing null vs the user id is the whole of the scoping decision, and
      // it is made here rather than filtered in the component.
      const all = session.can('ee.manage')
      const [rows, staff] = await Promise.all([
        repo.ee.getRoster(school.id, cohortId, all ? null : user.id),
        all ? repo.ee.listAssignableStaff(school.id, cohortId) : Promise.resolve([]),
      ])
      body = (
        <>
          {isCoordinator && (
            <CohortBar
              cohorts={cohorts}
              current={cohortId}
              href={(id) => `/courses/${course.id}?cohort=${id}`}
            />
          )}
          <EeRoster
            rows={rows}
            cohortLabel={cohort ? cohortTitle(cohort) : ''}
            cohortId={cohortId}
            scope={all ? 'all' : 'mine'}
            canWrite={!readOnly}
            // Allocation is the coordinator's job; reopening a filed essay is
            // the same `items.unlock` capability CAS and IA marks use.
            canAllocate={all && !readOnly}
            canUnlock={session.can('items.unlock') && !readOnly}
            canRevoke={session.can('scores.revoke') && !readOnly}
            staff={staff}
            meId={user.id}
          />
        </>
      )
    }
  } else if (course.type === 'tok') {
    /**
     * THREE SCREENS, ONE ROUTE — the same segmented control a subject course
     * uses. The student sees two of them (Exhibition | Essay); staff see the
     * marking screens and predicted grades. TOK's predicted grade is a LETTER,
     * and the scale rides on the requirement def, so PgGrid renders it
     * unchanged.
     */
    const cohortId = cohort?.id ?? 'c15'

    if (isStudent) {
      // Checkpoints come from getTrack, NOT from the TOK repository — the
      // student's screen and the coordinator's board read one derivation.
      const [tokView, track] = await Promise.all([
        repo.tok.getStudentView(school.id, user.id),
        repo.getTrack(school.id, user.id),
      ])
      const lane = track?.lanes.find((l) => l.lane === 'TOK')
      return (
        <Shell session={session} spaces={spaces} current={current}>
          {readOnly && (
            <div className="note gold" style={{ marginBottom: 14 }}>
              <b>{cohort?.label} is archived.</b> This is a read-only record of a finished year.
            </div>
          )}
          {tokView ? (
            <StudentTok
              view={tokView}
              checkpoints={lane?.checkpoints ?? []}
              screen={wantedScreen === 'essay' ? 'essay' : 'exh'}
              baseHref={`/courses/${course.id}?cohort=${cohortId}`}
            />
          ) : (
            <p className="mut">No TOK record.</p>
          )}
        </Shell>
      )
    }

    const baseHref = `/courses/${course.id}?cohort=${cohortId}`

    /**
     * THREE STAFF SCREENS, one route — the pattern a subject course already
     * uses. Exhibition and Essay are marking screens; predicted grades is the
     * screen that was built before the module and never depended on it.
     */
    const tokScreen: 'exh' | 'essay' | 'pg' =
      wantedScreen === 'essay' ? 'essay' : wantedScreen === 'pg' ? 'pg' : 'exh'

    const pgView =
      !isStudent && session.can('pg.manage')
        ? await repo.pg.getView(school.id, course.id, cohortId)
        : null
    const isMarker = await repo.ia.isMarkerFor(school.id, course.id, cohortId, user.id)
    const markingRows =
      tokScreen !== 'pg' && (isMarker || coordinatorReader)
        ? await repo.tok.getMarkingRoster(school.id, cohortId, tokScreen)
        : null
    const tokScreens = (
      <nav className="pgseg">
        <a className={tokScreen === 'exh' ? 'on' : ''} href={`${baseHref}&screen=exh`}>Exhibition</a>
        <a className={tokScreen === 'essay' ? 'on' : ''} href={`${baseHref}&screen=essay`}>Essay</a>
        <a className={tokScreen === 'pg' ? 'on' : ''} href={`${baseHref}&screen=pg`}>Predicted grades</a>
      </nav>
    )
    const pgEditable =
      !readOnly && session.can('pg.manage') && (isMarker || isCoordinatorTier(session.can))
    const { panel, refused } = await renderCandidatePanel(baseHref)

    body = (
      <>
        <h1>{course.name}</h1>
        <p className="sub">
          {course.subjectGroup} — predicted as a <b>letter A–E</b>, which is what IBIS asks for.
          No grade-boundary table is involved in predicting.
        </p>
        {isCoordinator && (
          <CohortBar
            cohorts={cohorts}
            current={cohortId}
            href={(id) => `/courses/${course.id}?cohort=${id}`}
          />
        )}
        {tokScreens}
        {tokScreen !== 'pg' && (markingRows == null ? (
          <div className="note">
            TOK marking opens to the designated TOK marker and the coordinator tier.
          </div>
        ) : (
          <TokMarking
            rows={markingRows}
            kind={tokScreen}
            instrument={tokScreen === 'exh' ? EXHIBITION_INSTRUMENT : ESSAY_INSTRUMENT}
            canMark={!readOnly && isMarker}
            canRelease={!readOnly && (isMarker || session.can('tok.manage'))}
            canRevoke={!readOnly && session.can('scores.revoke')}
            readOnlyReason={
              readOnly
                ? `${cohort?.label} is archived — a record, not a workspace.`
                : !isMarker
                  ? 'Read-only — you are not the designated TOK marker. Releasing a finished mark is still open to you if you hold the TOK capability.'
                  : undefined
            }
          />
        ))}
        {tokScreen === 'pg' && (pgView ? (
          <PgGrid
            view={pgView}
            editable={pgEditable}
            readOnlyReason={
              readOnly
                ? `${cohort?.label} is archived — a record, not a workspace.`
                : !pgEditable
                  ? pgView.marker
                    ? `Read-only — ${pgView.marker} is the designated marker for TOK.`
                    : 'Read-only — no designated marker is set for TOK.'
                  : undefined
            }
            candidateBase={`${baseHref}&candidate=`}
          />
        ) : (
          <div className="note">
            Predicted grades for TOK open to the TOK teacher and the coordinator tier.
          </div>
        ))}
        {tokScreen === 'essay' && (
          <div className="note">
            The prescribed titles, the TK/PPF interaction lines and the sign-off arrive with the
            rest of the essay screen. The mark and its two comments work now.
          </div>
        )}
        {refused && (
          <div className="note warn" style={{ marginTop: 14 }}>
            Not your student — the panel opens only for students in your own courses.
          </div>
        )}
        {panel}
      </>
    )
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
