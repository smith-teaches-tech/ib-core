import Link from 'next/link'
import type { Cohort } from '@/lib/types'
import { STAGE_LABEL, stageOf } from '@/lib/cohorts'

/**
 * Switch year group. A row of chips rather than a dropdown, because with two
 * live cohorts and one archive there is never enough to justify hiding them —
 * and seeing "Year 2 · Year 1 · Archived" at a glance is most of the point.
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
      {cohorts.map((c) => {
        const stage = stageOf(c)
        return (
          <Link
            key={c.id}
            href={href(c.id)}
            className={`fchip ${c.id === current ? 'active' : ''}`}
            title={STAGE_LABEL[stage]}
          >
            {stage === 'archived' ? '🗄 ' : ''}
            {c.label}
            {stage !== 'archived' && stage !== 'not_started' && (
              <span className="mut"> · {STAGE_LABEL[stage]}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
