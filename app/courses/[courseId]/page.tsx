import { notFound } from 'next/navigation'
import Shell from '@/components/Shell'
import CasRoster from '@/components/cas/CasRoster'
import StudentCas from '@/components/cas/StudentCas'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'

// A course page, dispatched by course TYPE.
//
// This is the shape the philosophy doc's §5 buys us: the container is identical
// for Biology and for CAS, and only the contents differ. Adding TOK later is a
// new branch here and a new module folder — not a new kind of page, a new
// navigation concept, or a new permission model.

export const dynamic = 'force-dynamic'

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const session = await getSession()
  const { user, school, memberships } = session
  const roles = memberships.find((m) => m.schoolId === school.id)?.roles ?? []
  const isStudent = roles.includes('student')
  const isCoordinator =
    roles.includes('school_coordinator') || roles.includes('district_coordinator')

  const courses = await repo.listCourses(school.id)
  const course = courses.find((c) => c.id === courseId)
  if (!course) notFound()

  const spaces = isStudent
    ? await repo.coursesOfStudent(user.id)
    : isCoordinator
      ? courses
      : await repo.myCourses(school.id, user.id)

  // You can only open a course you are actually attached to.
  if (!spaces.some((c) => c.id === course.id)) {
    return (
      <Shell session={session} spaces={spaces} current={course.id}>
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
      const student = await repo.getStudent(user.id)
      const cohortId = student?.cohortId ?? 'c15'
      const [rows, totals] = await Promise.all([
        repo.cas.getRoster(school.id, cohortId),
        repo.cas.getTotals(school.id, cohortId),
      ])
      body = (
        <CasRoster
          rows={rows}
          totals={totals}
          cohortLabel="Class of 2027"
          canManage={session.can('cas.manage')}
          canUnlock={session.can('items.unlock')}
        />
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
  } else {
    body = (
      <>
        <h1>{course.name}</h1>
        <p className="sub">
          {course.subjectGroup}
          {course.level ? ` · ${course.level}` : ''}
        </p>
        <div className="note">
          This module is not built yet. CAS is the one that is — it is the module that tests
          whether a module can own its own entities and still feed the spine. See
          <b> IB-Build-Status.md</b> for the order.
        </div>
      </>
    )
  }

  return (
    <Shell session={session} spaces={spaces} current={course.id}>
      {body}
    </Shell>
  )
}
