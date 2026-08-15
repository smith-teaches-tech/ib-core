'use client'

// Archive or reopen a year group.
//
// Deliberately a button somebody presses. An earlier version archived a cohort
// as soon as its exam session passed, which was wrong: results land in July, and
// enquiries upon results, appeals and misconduct questions come later — the last
// with no time limit at all. A cohort that locked itself in June would lock the
// coordinator out exactly when the IB started asking.

import { useState, useTransition } from 'react'
import * as setup from '@/lib/setup/actions'
import type { Cohort } from '@/lib/types'

export default function ArchiveCohort({
  cohort,
  canArchive,
}: {
  cohort: Cohort
  canArchive: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!canArchive) return null

  const run = (archived: boolean) => {
    setError(null)
    start(async () => {
      try {
        await setup.setCohortArchived(cohort.id, archived)
        setConfirming(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  if (cohort.archived) {
    return (
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn sm" disabled={pending} onClick={() => run(false)}>
          ↩ Reopen {cohort.label}
        </button>
        <span className="mut" style={{ fontSize: 12 }}>
          Reopening makes it editable again and puts it back in everyone&rsquo;s list.
        </span>
        {error && <div className="note warn">{error}</div>}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {!confirming ? (
        <button className="btn sm ghost" onClick={() => setConfirming(true)}>
          🗄 Archive {cohort.label}
        </button>
      ) : (
        <div className="cob">
          <b>Archive {cohort.label}?</b>
          <ul style={{ margin: '8px 0', paddingLeft: 18, fontSize: 13 }}>
            <li>It becomes <b>read-only</b> — nothing in it can be changed by anyone.</li>
            <li>Students lose access entirely. Teachers keep a read-only view of what they taught.</li>
            <li>You keep full access, and you can reopen it at any time.</li>
          </ul>
          <div className="note gold" style={{ marginBottom: 10 }}>
            <b>Do not archive until you are finished with the session.</b> Results arrive in July, and
            the IB can ask for further information well after that — enquiries upon results, appeals,
            and academic misconduct questions, the last of which has no stated time limit.
          </div>
          {error && <div className="note warn" style={{ marginBottom: 10 }}>{error}</div>}
          <div className="row">
            <button className="btn danger sm" disabled={pending} onClick={() => run(true)}>
              Archive it
            </button>
            <button className="btn sm ghost" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
