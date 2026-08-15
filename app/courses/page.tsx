import Link from 'next/link'
import Shell from '@/components/Shell'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'

// View all courses — the catalogue as it actually stands, grouped as the IB
// groups it. Read-only on purpose: changing any of it happens in Add & assign,
// so there is exactly one place where the catalogue can be edited.

export const dynamic = 'force-dynamic'

export default async function AllCourses() {
  const session = await getSession()
  const { school } = session
  const cohorts = await repo.setup.listCohorts(school.id)
  const cohort = cohorts.find((c) => !c.archived) ?? cohorts[0]
  const rows = await repo.setup.listCourseRows(school.id, cohort?.id ?? 'c15')

  const groups = [...new Set(rows.map((r) => r.course.subjectGroup))]

  return (
    <Shell session={session} spaces={[]} current="/courses">
      <h1>All courses</h1>
      <p className="sub">
        {school.name} · {cohort?.label ?? ''} — {rows.filter((r) => r.sections.length > 0).length} of{' '}
        {rows.length} in the catalogue are running this year.
      </p>

      {groups.map((g) => (
        <div className="panel" key={g}>
          <div className="panel-h">
            <h2>{g}</h2>
            <span className="spacer" />
            <Link className="btn sm" href="/setup">Edit in Add &amp; assign</Link>
          </div>
          <div className="tableshell">
            <table className="casroster">
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Course</th>
                  <th>Level</th>
                  <th>Sections</th>
                  <th>Students</th>
                  <th>Teachers</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.course.subjectGroup === g)
                  .map((r) => (
                    <tr key={r.course.id} style={r.sections.length === 0 ? { opacity: 0.5 } : undefined}>
                      <td className="name">
                        {r.course.type === 'subject' ? (
                          r.course.name
                        ) : (
                          <Link href={`/courses/${r.course.id}`}>{r.course.name}</Link>
                        )}
                      </td>
                      <td>{r.course.level ? <span className="pill info">{r.course.level}</span> : <span className="mut">—</span>}</td>
                      <td>
                        {r.sections.length === 0 ? (
                          <span className="pill grey">Not running</span>
                        ) : (
                          r.sections.map((s) => (
                            <span key={s.section.id} className="pill grey" style={{ marginRight: 4 }}>
                              {s.section.label}
                            </span>
                          ))
                        )}
                      </td>
                      <td>{r.students || <span className="mut">—</span>}</td>
                      <td>
                        {r.sections.flatMap((s) => s.teachers).map((t) => (
                          <span key={t.userId} className="pill ok" style={{ marginRight: 4 }}>
                            {t.name}{t.isDesignatedMarker ? ' ★' : ''}
                          </span>
                        ))}
                        {r.sections.length > 0 && r.sections.flatMap((s) => s.teachers).length === 0 && (
                          <span className="pill warn">None assigned</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Shell>
  )
}
