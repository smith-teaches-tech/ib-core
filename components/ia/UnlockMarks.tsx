'use client'

// The coordinator's escape hatch, deliberately loud.
//
// A `marks.override` holder never simply edits another teacher's marks: they
// unlock, with a reason, for 30 minutes. While unlocked this banner stays on
// screen saying so, every change they make carries the reason into the change
// history, and the expiry re-locks the course with nobody watching.

import { useState, useTransition } from 'react'
import * as ia from '@/lib/ia/actions'

const riyadhTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

export default function UnlockMarks({
  courseId,
  cohortId,
  unlock,
  markerName,
}: {
  courseId: string
  cohortId: string
  /** The caller's own unexpired unlock, or null when the grid is locked. */
  unlock: { reason: string; expiresAt: string } | null
  markerName: string | null
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<unknown>) => {
    setError(null)
    start(async () => {
      try {
        await fn()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  if (unlock) {
    return (
      <div className="note gold" style={{ marginBottom: 14 }}>
        <b>Editing unlocked</b> — {unlock.reason} — temporary: it re-locks itself at{' '}
        {riyadhTime(unlock.expiresAt)}. Every change you make carries this reason in the
        change history.{' '}
        <button
          className="btn sm"
          disabled={pending}
          onClick={() => run(() => ia.relockMarks(courseId))}
        >
          Re-lock
        </button>
        {error && <div className="note warn" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {!open ? (
        <div className="row">
          <button className="btn sm ghost" onClick={() => setOpen(true)}>
            🔓 Unlock editing
          </button>
          <span className="mut" style={{ fontSize: 12 }}>
            {markerName
              ? `${markerName} is the designated marker — this grid is read-only for you.`
              : 'No designated marker is set — this grid is read-only for you.'}{' '}
            An unlock lasts 30 minutes and needs a reason.
          </span>
        </div>
      ) : (
        <div className="cob">
          <b>Unlock mark editing</b>
          <p className="mut" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>
            The reason is required. It is stamped onto every change you make while unlocked, and
            the unlock ends by itself after 30 minutes.
          </p>
          {error && <div className="note warn" style={{ marginBottom: 10 }}>{error}</div>}
          <div className="row">
            <input
              className="cmtin"
              autoFocus
              placeholder="Why — e.g. marker on leave; moderation deadline"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              style={{ minWidth: 280 }}
            />
            <button
              className="btn sm pri"
              disabled={pending || !reason.trim()}
              onClick={() =>
                run(async () => {
                  await ia.unlockMarks(courseId, cohortId, reason)
                  setOpen(false)
                  setReason('')
                })
              }
            >
              Unlock
            </button>
            <button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
