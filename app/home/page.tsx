import Shell from '@/components/Shell'
import Track from '@/components/Track'
import TeacherHome, { type TeacherClass } from '@/components/TeacherHome'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { isArchived } from '@/lib/cohorts'
import { REPORTING_POINTS } from '@/lib/pg/types'

/**
 * HOME — one screen, two audiences, and its own route.
 *
 * It used to live at `/`, which was a mistake with a specific cost: `/` is the
 * readiness board for anyone holding a coordinator job, so a person who both
 * coordinates and teaches had a "Home" in their sidebar that landed on the
 * board they already reach from "Check work". Home has an address now.
 *
 *   a teacher  → their classes, and what each still owes
 *   a student  → their own track
 *
 * Every number is counted from the spine on this request. Nothing is stored to
 * make this page, which is why it cannot drift from the grids it links to.
 */

export const dynamic = 'force-dynamic'

export default async function HomeScreen() {
  const session = await getSession()
  const { user, school, memberships } = session
  const roles = memberships.find((m) => m.schoolId === school.id)?.roles ?? []
  const isStudent = roles.includes('student')
  const spaces = await repo.mySpaces(school.id, user.id)

  let body: React.ReactNode

  if (isStudent) {
    // Their OWN record — the one case identifiers show without a capability.
    const track = await repo.getTrack(school.id, user.id, { includeIdentifiers: true })
    const myCohort = track
      ? (await repo.setup.listCohorts(school.id)).find((c) => c.id === track.student.cohortId)
      : undefined
    body = track ? (
      <>
        <h1>{user.name}</h1>
        <p className="sub">
          {myCohort?.label ?? 'IB Diploma'} · Candidate {track.student.sessionNumber} /{' '}
          {track.student.personalCode ?? '—'} — a record of what you have completed.
        </p>
        <Track track={track} examDate={myCohort ? `${myCohort.gradYear}-05-01` : '2027-05-01'} />
      </>
    ) : (
      <p className="mut">No student record.</p>
    )
  } else {
    const classes: TeacherClass[] = []
    // LIVE YEARS ONLY, the same rule the sidebar applies (Michael, 17 Aug). An
    // archived year is a record, not a workspace.
    for (const group of spaces.filter((g) => !isArchived(g.cohort))) {
      for (const course of group.courses) {
        const marks = await repo.ia.getMarksView(school.id, course.id, group.cohort.id)
        const pg = await repo.pg.getView(school.id, course.id, group.cohort.id)
        const candidates = marks?.rows.length ?? pg?.rows.length ?? 0
        if (candidates === 0) continue

        // The point being worked: the last one anybody has entered, else the
        // first. Never April in September.
        let pointIndex = 0
        if (pg) {
          const touched = REPORTING_POINTS.map((_, i) =>
            pg.rows.some((r) => r.cells[i].grade != null),
          )
          pointIndex = Math.max(0, touched.lastIndexOf(true))
        }

        classes.push({
          courseId: course.id,
          courseName: course.name,
          subjectGroup: course.subjectGroup,
          cohortId: group.cohort.id,
          cohortLabel: group.cohort.label,
          candidates,
          marksIn: marks ? marks.rows.filter((r) => r.total != null).length : null,
          commentsMissing: marks
            ? marks.rows.filter((r) => r.total != null && !r.comment).length
            : null,
          pointLabel: pg ? pg.points[pointIndex].label : null,
          predictedIn: pg ? pg.rows.filter((r) => r.cells[pointIndex].grade != null).length : null,
          isMarker: await repo.ia.isMarkerFor(school.id, course.id, group.cohort.id, user.id),
        })
      }
    }
    body = <TeacherHome name={user.name} classes={classes} />
  }

  return (
    <Shell session={session} spaces={spaces} current="home">
      {body}
    </Shell>
  )
}
