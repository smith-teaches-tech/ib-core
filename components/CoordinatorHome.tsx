import Link from 'next/link'
import type { CommandCentre } from '@/lib/types'

function daysAway(iso: string) {
  const then = new Date(iso + 'T00:00:00Z').getTime()
  const now = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((then - now) / 86_400_000)
}
function formatShort(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

/**
 * The IB Coordinator's home IS the command centre — not a generic dashboard
 * with coordinator-flavoured content. It answers one question on load:
 * am I safe? Everything is measured against what the IB requires.
 */
export default function CoordinatorHome({
  cc,
  canConfigure,
}: {
  cc: CommandCentre
  canConfigure: boolean
}) {
  const { banner, readiness, attention, staff } = cc

  if (readiness.length === 0) {
    return (
      <>
        <div className="banner">
          <div>
            <div className="big">{banner.sessionLabel}</div>
            <div style={{ opacity: 0.85, fontSize: 12.5 }}>
              {banner.cohortLabel} · {banner.candidates} candidates · school code {banner.ibSchoolCode}
            </div>
          </div>
        </div>
        <div className="note">
          Nothing set up for this school yet. Start with <Link href="/setup">Setup &amp; people</Link> —
          create the cohort, add students and teachers, then build the courses.
        </div>
      </>
    )
  }

  return (
    <>
      <div className="banner">
        <div>
          <div className="big">{banner.sessionLabel}</div>
          <div style={{ opacity: 0.85, fontSize: 12.5 }}>
            {banner.cohortLabel} · {banner.candidates} candidates · school code {banner.ibSchoolCode}
          </div>
        </div>
        <span className="spacer" />
        {banner.deadlines.map((d) => {
          const away = daysAway(d.date)
          return (
            <div className={`dl${d.urgent ? ' urgent' : ''}`} key={d.label}>
              <b>{away < 0 ? 'Done' : `${away} days`}</b>
              {d.label} · {formatShort(d.date)}
            </div>
          )
        })}
      </div>

      <h1>Command centre</h1>
      <p className="sub">
        Measured against what the IB requires, not against internal nicety.
        {canConfigure && (
          <>
            {' '}<Link href="/submission">Open the submission tracker →</Link>
          </>
        )}
      </p>

      <div className="grid" style={{ marginBottom: 16 }}>
        {readiness.map((r) => (
          <div className={`rt ${r.state}`} key={r.label}>
            <div className="k">{r.label}</div>
            <div className="v">
              {r.done}
              <small>/{r.total} {r.unit}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>⚑ Needs my attention</h2>
          <span className="spacer" />
          <span className="pill warn">{attention.length} items</span>
          <span className="mut" style={{ fontSize: 12 }}>sorted by IB deadline</span>
        </div>
        <div style={{ padding: '2px 8px' }}>
          {attention.map((a) => (
            <div className="qitem" key={a.id}>
              <span className={`qtag ${a.tone}`}>{a.tag}</span>
              <div className="qmain">
                <b>{a.title}</b>
                <small>{a.detail}</small>
              </div>
              <button className="btn sm">{a.action}</button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>Staff — what&rsquo;s outstanding</h2>
          <span className="spacer" />
          <button className="btn sm">Nudge all</button>
        </div>
        <div className="panel-b" style={{ paddingTop: 6 }}>
          {staff.map((s) => (
            <div className="linkrow" key={s.name}>
              <div className="lk">
                <b>{s.name}</b> <span className="mut">· {s.role}</span>
                <small className="mut" style={{ display: 'block' }}>{s.detail}</small>
              </div>
              <span className="pill warn">{s.count}</span>
              <button className="btn sm">Nudge</button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
