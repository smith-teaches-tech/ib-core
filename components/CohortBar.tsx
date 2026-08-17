import Link from 'next/link'
import type { Cohort } from '@/lib/types'
import { cohortTitle, isArchived } from '@/lib/cohorts'

/**
 * Switch year group. Chips rather than a dropdown — with two or three cohorts
 * there is never enough to justify hiding them, and seeing the whole set at a
 * glance is most of the point.
 *
 * Named by class year, with the school's own cohort number alongside — the two
 * names ISG already uses. Nothing invents a third.
 *
 * WHO SEES THIS AT ALL (Michael, 17 Aug): the IB coordinator, and nobody else.
 * A teacher already has their year groups down the left-hand side, each course
 * carrying its own cohort — a second switcher at the top of the page was the
 * same choice offered twice, and the two could disagree. Coordinators have no
 * "my spaces" (lib/nav.ts explains why), so for them this bar is the only place
 * the year group is chosen. Callers gate it; this component does not know who
 * is looking.
 *
 * ARCHIVED YEARS ARE NOT HERE. Archiving means "this is a record now", and a
 * record does not belong in the switcher you use forty times a day. They are
 * reachable from Cohorts, which is where archiving happens and where every year
 * group — live and finished — is listed. The ONE exception is when you are
 * already looking at an archived year: its chip stays, active, so the page can
 * still say where you are.
 */
export default function CohortBar({
  cohorts,
  current,
  href,
}: {
  cohorts: Cohort[]
  current: string
  href: (cohortId: string) => string
}) {
  const shown = cohorts.filter((c) => !isArchived(c) || c.id === current)
  if (shown.length < 2) return null
  return (
    <div className="cohortbar">
      <span className="caps">Year group</span>
      {shown.map((c) => (
        <Link
          key={c.id}
          href={href(c.id)}
          className={`fchip ${c.id === current ? 'active' : ''}`}
          title={isArchived(c) ? 'Archived — read-only' : cohortTitle(c)}
        >
          {isArchived(c) && '🗄 '}
          {c.label}
          {c.number != null && <span className="mut"> · Cohort {c.number}</span>}
        </Link>
      ))}
    </div>
  )
}
