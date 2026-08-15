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
  if (cohorts.length < 2) return null
  return (
    <div className="cohortbar">
      <span className="caps">Year group</span>
      {cohorts.map((c) => (
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
