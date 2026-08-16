import Link from 'next/link'
import type { Checkpoint, StudentTrack } from '@/lib/types'
import { iaTotal } from '@/lib/templates'

/**
 * THE SIDE PANEL — what replaced v7's expanding lanes and drill-down rows.
 *
 * One candidate's whole file, next to the board, without the grid ever changing
 * shape. Server-rendered from the same track the student themselves sees; the
 * open candidate is a URL param, so a panel can be bookmarked or sent.
 *
 * The predicted-grades section will grow into the IBIS transcription table
 * (six subjects + EE + TOK letters, read down the April column) when the
 * predicted-grades module lands — the honest version today shows exactly what
 * the spine records now, and says what is coming.
 */

const box = (display: Checkpoint['display'], title?: string) => (
  <i className={`cellbox sm ${display === 'not_started' ? '' : display}`} title={title} />
)

const word = (display: Checkpoint['display']) =>
  display === 'done' ? 'done'
    : display === 'partial' ? 'in progress'
    : display === 'future' ? 'not open yet'
    : 'missing'

export default function CandidatePanel({
  track,
  closeHref,
}: {
  track: StudentTrack
  closeHref: string
}) {
  const all = track.lanes.flatMap((l) => l.checkpoints)
  const byKey = new Map(all.map((c) => [c.def.key, c]))

  const item = (key: string, label: string) => {
    const c = byKey.get(key)
    if (!c) return null
    return (
      <div className="ck" key={key}>
        {box(c.display)}
        <span className="lab">{label}</span>
        <span className={`st ${c.display === 'done' ? 'ok' : c.display === 'not_started' ? 'bad' : ''}`}>
          {word(c.display)}
        </span>
      </div>
    )
  }

  const ppf = ['tok.ppf1', 'tok.ppf2', 'tok.ppf3']
    .map((k) => byKey.get(k))
    .filter((c): c is Checkpoint => c != null)
  const ppfDone = ppf.filter((c) => c.display === 'done').length

  const supervision = ['ee.rq', 'ee.r1', 'ee.r2', 'ee.viva', 'ee.attest']
    .map((k) => byKey.get(k))
    .filter((c): c is Checkpoint => c != null)
  const supDone = supervision.filter((c) => c.display === 'done').length

  // Internal assessment, grouped by course — key shape is `<courseId>.<stage>`.
  const iaLane = track.lanes.find((l) => l.lane === 'Internal assessment')
  const iaByCourse = new Map<string, { name: string; file?: Checkpoint; mark?: Checkpoint; comment?: Checkpoint }>()
  for (const c of iaLane?.checkpoints ?? []) {
    const dot = c.def.key.lastIndexOf('.')
    const courseId = c.def.key.slice(0, dot)
    const stage = c.def.key.slice(dot + 1)
    const entry = iaByCourse.get(courseId) ?? {
      name: c.def.label.split(' — ')[0],
    }
    if (stage === 'file') entry.file = c
    if (stage === 'mark') entry.mark = c
    if (stage === 'comment') entry.comment = c
    iaByCourse.set(courseId, entry)
  }

  const outstanding = all.filter(
    (c) => c.display !== 'done' && c.display !== 'future',
  ).length

  const pg = byKey.get('ib.pg')

  return (
    <>
      <Link href={closeHref} className="soverlay" aria-label="Close panel" />
      <aside className="spanel">
        <div className="sp-h">
          <div>
            <h3>{track.user.name}</h3>
            <div className="ids">
              session {track.student.sessionNumber ?? '—'} · {track.student.personalCode ?? 'no code yet'} ·{' '}
              {outstanding === 0
                ? 'nothing outstanding'
                : `${outstanding} item${outstanding === 1 ? '' : 's'} outstanding`}
            </div>
          </div>
          <Link href={closeHref} className="sp-x" title="Close">✕</Link>
        </div>

        <div className="sp-b">
          <div className="sp-sec">
            <h4>
              IB checklist <span className="tag ib">uploaded / confirmed / typed</span>
            </h4>
            {item('cas.complete', 'CAS complete')}
            {item('ee.final', 'EE — final essay')}
            {item('ee.rpf', 'EE — RPF')}
            {item('tok.essay', 'TOK essay')}
            {ppf.length > 0 && (
              <div className="ck">
                <span className={`bfrac ${ppfDone === ppf.length ? 'ok' : ppfDone > 0 ? 'mid' : 'bad'}`}>
                  {ppfDone}/{ppf.length}
                </span>
                <span className="lab">TK/PPF interactions</span>
                <span className={`st ${ppfDone === ppf.length ? 'ok' : ''}`}>
                  {ppfDone === ppf.length ? 'all three' : `${ppf.length - ppfDone} to go`}
                </span>
              </div>
            )}
            {pg && (
              <div className="ck">
                {box(pg.display)}
                <span className="lab">Predicted grades</span>
                <span className={`st ${pg.display === 'done' ? 'ok' : ''}`}>{word(pg.display)}</span>
              </div>
            )}
            <div className="sp-note">
              The per-course predicted-grade table — six subjects + EE + TOK letters, read down into
              IBIS — arrives with the predicted-grades module (next on the build order).
            </div>
          </div>

          <div className="sp-sec">
            <h4>
              School tracking <span className="tag int">not sent to IB unless sampled</span>
            </h4>
            <table className="sp-ia">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Course</th>
                  <th>File</th>
                  <th>Mark</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {[...iaByCourse.values()].map((r) => {
                  const total = r.mark ? iaTotal(r.mark.def.criteria, r.mark.state) : null
                  return (
                    <tr key={r.name}>
                      <td style={{ textAlign: 'left', fontWeight: 600 }}>{r.name}</td>
                      <td>{r.file ? box(r.file.display, r.file.def.label) : <span className="mut">·</span>}</td>
                      <td>
                        {total != null ? (
                          <b className="totv sm">
                            {total}
                            <span className="critmax">/{r.mark?.def.markMax ?? ''}</span>
                          </b>
                        ) : r.mark && r.mark.display === 'partial' ? (
                          <span className="pill gold" style={{ fontSize: 10 }}>partial</span>
                        ) : (
                          <span className="cv none">–</span>
                        )}
                      </td>
                      <td>{r.comment ? box(r.comment.display, 'Teacher comment') : <span className="mut">·</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {supervision.length > 0 && (
              <div className="ck" style={{ marginTop: 8 }}>
                <span className={`bfrac ${supDone === supervision.length ? 'ok' : supDone > 0 ? 'mid' : 'bad'}`}>
                  {supDone}/{supervision.length}
                </span>
                <span className="lab">EE supervision</span>
                <span className="st">RQ · refl. 1 · refl. 2 · viva · attestation</span>
              </div>
            )}
            <div className="ck">
              {['tok.exh', 'tok.exhmark', 'tok.title'].map((k) => {
                const c = byKey.get(k)
                return c ? <span key={k}>{box(c.display, c.def.label)}</span> : null
              })}
              <span className="lab" style={{ marginLeft: 2 }}>TOK exhibition · mark · title</span>
            </div>
          </div>

          <div className="note" style={{ fontSize: 12 }}>
            This panel replaces the old expanding columns and drill-down rows — the grid never
            changes shape; one candidate&rsquo;s whole file lives here. It reads the same track the
            student sees.
          </div>
        </div>
      </aside>
    </>
  )
}
