import Link from 'next/link'

/**
 * A TEACHER'S HOME — their classes, and what each one still owes.
 *
 * Deliberately not a dashboard: no charts, no feed, no "attention items"
 * ranked by a rule nobody can inspect. A teacher has two or three classes and
 * four kinds of unfinished work, so the honest shape is one card per class with
 * the four numbers on it, each linking to the screen that fixes it.
 *
 * Every number here is COUNTED FROM THE SPINE on this request. Nothing is
 * stored to make this page, which is why it cannot drift from the grids it
 * links to.
 */

export interface TeacherClass {
  courseId: string
  courseName: string
  subjectGroup: string
  cohortId: string
  cohortLabel: string
  candidates: number
  /** null when this course has no IA grid (the core courses). */
  marksIn: number | null
  commentsMissing: number | null
  /** The reporting point currently being worked, and how many are in. */
  pointLabel: string | null
  predictedIn: number | null
  isMarker: boolean
}

export default function TeacherHome({
  name,
  classes,
}: {
  name: string
  classes: TeacherClass[]
}) {
  const owed = classes.reduce(
    (a, c) =>
      a +
      (c.marksIn == null ? 0 : c.candidates - c.marksIn) +
      (c.predictedIn == null ? 0 : c.candidates - c.predictedIn),
    0,
  )

  return (
    <>
      <h1>{name}</h1>
      <p className="sub">
        {classes.length === 0
          ? 'You are not assigned to any classes this year.'
          : owed === 0
            ? `${classes.length} class${classes.length === 1 ? '' : 'es'} · everything asked for is in.`
            : `${classes.length} class${classes.length === 1 ? '' : 'es'} · ${owed} thing${owed === 1 ? '' : 's'} still to enter.`}
      </p>

      {classes.length === 0 && (
        <div className="note">
          When a coordinator assigns you to a course, it appears here and down the left.
        </div>
      )}

      <div className="thome">
        {classes.map((c) => {
          const base = `/courses/${c.courseId}?cohort=${c.cohortId}`
          const marksOwed = c.marksIn == null ? 0 : c.candidates - c.marksIn
          const pgOwed = c.predictedIn == null ? 0 : c.candidates - c.predictedIn
          return (
            <section className="tcard" key={c.courseId + c.cohortId}>
              <div className="tcard-h">
                <div>
                  <Link href={base} className="tcard-name">{c.courseName}</Link>
                  <div className="mut" style={{ fontSize: 11.5 }}>
                    {c.subjectGroup} · {c.cohortLabel} · {c.candidates} candidates
                  </div>
                </div>
                <span className="spacer" />
                {c.isMarker ? (
                  <span className="pill info" title="You enter this course's marks and predictions.">
                    designated marker
                  </span>
                ) : (
                  <span className="pill grey" title="Another teacher is the designated marker — you read.">
                    co-teacher
                  </span>
                )}
              </div>

              <div className="tcard-b">
                {c.marksIn != null && (
                  <Link href={`${base}&screen=ia`} className="tstat">
                    <b className={marksOwed ? 'bad' : 'ok'}>{c.marksIn}/{c.candidates}</b>
                    <small>IA marks in{marksOwed ? ` · ${marksOwed} to go` : ''}</small>
                  </Link>
                )}
                {c.commentsMissing != null && c.commentsMissing > 0 && (
                  <Link href={`${base}&screen=ia`} className="tstat">
                    <b className="mid">{c.commentsMissing}</b>
                    <small>marked, no comment</small>
                  </Link>
                )}
                {c.predictedIn != null && (
                  <Link href={`${base}&screen=pg`} className="tstat">
                    <b className={pgOwed ? 'bad' : 'ok'}>{c.predictedIn}/{c.candidates}</b>
                    <small>predicted, {c.pointLabel}{pgOwed ? ` · ${pgOwed} to go` : ''}</small>
                  </Link>
                )}
                {c.marksIn == null && c.predictedIn == null && (
                  <span className="mut" style={{ fontSize: 12.5 }}>
                    This course&rsquo;s module is still to come.
                  </span>
                )}
              </div>

              <div className="tcard-f">
                <Link className="btn sm" href={`${base}&screen=ia`}>IA Marks</Link>
                {c.predictedIn != null && (
                  <Link className="btn sm" href={`${base}&screen=pg`}>Predicted Grades</Link>
                )}
                <span className="spacer" />
                <span className="mut" style={{ fontSize: 11.5 }}>
                  Click a candidate&rsquo;s name in either grid for their whole file.
                </span>
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
