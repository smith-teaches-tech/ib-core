// The change history — the append-only trail, rendered plainly.
//
// Newest first, no filters: date, who, student, what moved, and the override
// reason where a write rode a coordinator unlock. Collapsed by default because
// on a good day nobody needs it; on the day somebody does, it is all here.

import type { MarkEventRow } from '@/lib/ia/types'

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(iso))

const val = (x: string | number | null) => {
  if (x == null) return '—'
  const s = String(x)
  return s.length > 48 ? s.slice(0, 45) + '…' : s
}

const what = (e: MarkEventRow) =>
  e.kind === 'unlock' ? 'unlocked editing'
    : e.kind === 'relock' ? 're-locked editing'
    : e.kind === 'transcribe' ? `typed into IBIS: ${val(e.prev)} → ${val(e.next)}`
    : e.kind === 'comment' ? `comment: ${val(e.prev)} → ${val(e.next)}`
    : `${e.criterion ?? 'mark'}: ${val(e.prev)} → ${val(e.next)}`

export default function MarkHistory({ events }: { events: MarkEventRow[] }) {
  return (
    <details className="cob" style={{ marginTop: 14 }}>
      <summary style={{ cursor: 'pointer' }}>
        <b>Change history</b>{' '}
        <span className="mut">
          ({events.length} event{events.length === 1 ? '' : 's'} — every mark, comment,
          transcription tick and unlock; nothing is ever edited or deleted)
        </span>
      </summary>
      {events.length === 0 ? (
        <p className="mut" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
          Nothing recorded yet — the trail starts with the first write.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {events.map((e) => (
            <li key={e.id} style={{ fontSize: 12.5, padding: '3px 0' }}>
              <span className="mut">{when(e.at)}</span> · <b>{e.byName}</b>
              {e.studentName != null && <> · {e.studentName}</>}
              {' · '}
              {what(e)}
              {e.overrideReason != null && (
                <span className="pill gold" style={{ marginLeft: 6, fontSize: 10.5 }}>
                  {e.kind === 'unlock' || e.kind === 'relock' ? 'reason' : 'override'}:{' '}
                  {e.overrideReason}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
