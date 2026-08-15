import { notFound } from 'next/navigation'
import Shell from '@/components/Shell'
import CasRoster from '@/components/cas/CasRoster'
import CohortBar from '@/components/CohortBar'
import MarksGrid from '@/components/ia/MarksGrid'
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
  searchParams: Promise<{ cohort?: string }>
}) {
  const { courseId } = await params
  const wantedCohort = (await searchParams).cohort
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

  // You can only open a course you are actually attached to.
  if (!isCoordinator && attached.length === 0) {
    return (
      <Shell session={session} spaces={spaces} current={current}>
        <h1>{course.name}</h1>
        <div className="note warn">You are not attached to this course.</div>
      </Shell>
    )
  }

  let body: React.ReactNode

  if (course.type === 'cas') {
    if (isStudent) {
      const view = await repo.cas.getStudentView(school.id, user.id)
      body = view ? <StudentCas view={view} /> : <p className="mut">No CAS record.</p>
    } else if (session.can('cas.manage')) {
      const cohortId = cohort?.id ?? 'c15'
      const [rows, totals] = await Promise.all([
        repo.cas.getRoster(school.id, cohortId),
        repo.cas.getTotals(school.id, cohortId),
      ])
      body = (
        <>
          <CohortBar
            cohorts={isCoordinator ? cohorts : attached.map((g) => g.cohort)}
            current={cohortId}
            href={(id) => `/courses/${course.id}?cohort=${id}`}
          />
          <CasRoster
            rows={rows}
            totals={totals}
            cohortLabel={cohort ? cohortTitle(cohort) : ''}
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
    if (!isStudent && session.can('ia.manage')) {
      const view = await repo.ia.getMarksView(school.id, course.id, cohortId)
      body = view ? (
        <>
          <h1>{course.name}</h1>
          <p className="sub">
            {course.subjectGroup}
            {course.level ? ` · ${course.level}` : ''} — internal assessment, entered per criterion.
            The total derives, and the moderation sample&rsquo;s criterion form is answered the day
            IBIS asks.
          </p>
          <CohortBar
            cohorts={isCoordinator ? cohorts : attached.map((g) => g.cohort)}
            current={cohortId}
            href={(id) => `/courses/${course.id}?cohort=${id}`}
          />
          <MarksGrid
            view={view}
            editable={session.can('ia.manage') && !readOnly}
            canTranscribe={false}
            readOnlyReason={
              readOnly ? `${cohort?.label} is archived — a record, not a workspace.` : undefined
            }
          />
        </>
      ) : (
        <>
          <h1>{course.name}</h1>
          <div className="note">This course has no sections for {cohort?.label ?? 'this year group'} yet.</div>
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
