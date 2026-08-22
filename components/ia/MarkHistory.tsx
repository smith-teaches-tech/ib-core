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

/** Reporting-point keys read as 'p2' on the trail otherwise, which nobody says out loud. */
const POINT_LABEL: Record<string, string> = { p1: 'End Y1', p2: 'Jan Y2', p3: 'Apr Y2' }
const point = (k: string | null) => (k ? (POINT_LABEL[k] ?? k) : 'predicted grade')

const what = (e: MarkEventRow) =>
  // The file, not a mark — so it reads as the file, and the note is quoted
  // rather than summarised. The note IS the event.
  e.kind === 'return' ? `returned ${val(e.prev)} with a note: “${e.note ?? ''}”`
    : e.kind === 'unlock' ? 'unlocked editing'
    : e.kind === 'relock' ? 're-locked editing'
    : e.kind === 'transcribe' ? `typed into IBIS: ${val(e.prev)} → ${val(e.next)}`
    : e.kind === 'comment' ? `comment: ${val(e.prev)} → ${val(e.next)}`
    // A predicted grade that goes from nothing to a value is SET; one that goes
    // from a value to another was unlocked first, and reads as a move.
    : e.kind === 'pg_unlock' ? `${point(e.criterion)} predicted grade — unlocked to change (${val(e.prev)})`
    : e.kind === 'pg'
      ? e.prev == null
        ? `${point(e.criterion)} predicted grade: set to ${val(e.next)} — locked`
        : `${point(e.criterion)} predicted grade: ${val(e.prev)} → ${val(e.next)}`
    : `${e.criterion ?? 'mark'}: ${val(e.prev)} → ${val(e.next)}`

export default function MarkHistory({ events }: { events: MarkEventRow[] }) {
  return (
    <details className="cob" style={{ marginTop: 14 }}>
      <summary style={{ cursor: 'pointer' }}>
        <b>Change history</b>{' '}
        <span className="mut">
          ({events.length} event{events.length === 1 ? '' : 's'} — every mark, predicted grade,
          comment, transcription tick, unlock and returned paper; nothing is ever edited or
          deleted)
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
                  {e.kind === 'unlock' || e.kind === 'relock' || e.kind === 'pg' || e.kind === 'pg_unlock'
                    ? 'reason'
                    : 'override'}
                  :{' '}
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
