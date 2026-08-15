import type { StudentTrack } from '@/lib/types'

/**
 * ZOOM 1 — one student, full detail.
 *
 * A record of what has been completed, not a to-do list. It shows accumulated
 * progress rather than debt, and it is stable: adding a course adds one lane,
 * never twelve rows.
 */
export default function Track({
  track,
  examDate,
}: {
  track: StudentTrack
  examDate?: string
}) {
  const pct = track.total === 0 ? 0 : Math.round((track.done / track.total) * 100)
  const daysToExams = examDate
    ? Math.round(
        (new Date(examDate + 'T00:00:00Z').getTime() -
          new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()) /
          86_400_000,
      )
    : null

  return (
    <>
      <div className="finish">
        <div className="ftop">
          <div className="big">{track.done}</div>
          <div className="of">of {track.total} requirements recorded</div>
          {daysToExams != null && (
            <div className="exam">
              <b>May 2027</b>
              exams begin in {daysToExams} days
            </div>
          )}
        </div>
        <div className="fbar">
          <i style={{ width: pct + '%' }} />
          <span className="flag">🏁</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>My programme</h2>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            Each dot is one thing the IB needs recorded
          </span>
        </div>
        <div className="panel-b">
          {track.lanes.map((l) => (
            <div className="lane" key={l.lane}>
              <div className="lname">
                <b>{l.lane}</b>
                <small>
                  {l.done} of {l.total} recorded
                </small>
              </div>
              <div className="track">
                {l.checkpoints.map((c) => (
                  <div className={`cp ${c.display}`} key={c.def.id} title={c.def.label}>
                    <span className="dot" />
                    <span className="cl">{c.def.label}</span>
                  </div>
                ))}
              </div>
              <div
                className="lcount"
                style={{ color: l.done === l.total ? 'var(--ok)' : 'var(--gold)' }}
              >
                {l.done}/{l.total}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="note">
        A dashed checkpoint is <b>not yet open</b> — the RPF can&rsquo;t be written before the
        viva has happened, so it is never counted as outstanding. The coordinator sets the
        whole year&rsquo;s dates in September; you still only see what is actually actionable.
      </div>
    </>
  )
}
