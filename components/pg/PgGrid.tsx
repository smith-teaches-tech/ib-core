'use client'

// THE PREDICTED-GRADES GRID — one screen, every course.
//
// The screen does not know what subject it is looking at. It asks the view for
// its SCALE (lib/pg/scale.ts) and renders the values it is handed: 1–7 for a
// subject, A–E for TOK. That is the whole of the difference between Biology's
// predicted grades and TOK's, which is why there is one component here and not
// one per course type.
//
// It sits beside the IA grid on the same route rather than inside it, because
// the two enforce DIFFERENT write rules — the IA grid is marker-only with a
// 30-minute coordinator override; this is marker or coordinator, directly, with
// a per-cell lock. One component applying two authorization models to adjacent
// cells is how a permission bug gets written.
//
// THE LOCK. A grade locks the moment it is saved, and a locked cell is rendered
// as a VALUE, not a field — there is nothing to tab into and nothing a stray
// keystroke can reach. Changing one costs a sentence. That is a guard against
// accident, not a permission boundary: whoever may write may unlock.

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import * as pg from '@/lib/pg/actions'
import { normaliseGrade, scaleOf } from '@/lib/pg/scale'
import type { PgView, ReportingPoint } from '@/lib/pg/types'

export default function PgGrid({
  view,
  editable,
  readOnlyReason,
  candidateBase,
}: {
  view: PgView
  editable: boolean
  /** Set when the cohort is archived, or the reader may not write. */
  readOnlyReason?: string
  /** When set, candidate names link to `candidateBase + studentId`. */
  candidateBase?: string
}) {
  const scale = scaleOf(view.scale)
  const [error, setError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState<{ studentId: string; point: ReportingPoint } | null>(null)
  const [reason, setReason] = useState('')
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

  useEffect(() => {
    if (!unlocking) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUnlocking(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [unlocking])

  const row = unlocking ? view.rows.find((r) => r.studentId === unlocking.studentId) : null
  const cell =
    row && unlocking
      ? row.cells[view.points.findIndex((p) => p.key === unlocking.point.key)]
      : null

  /**
   * Save on blur — but check the value HERE first.
   *
   * The repository refuses an off-scale value too, and must: it is the rule,
   * and a forged request has to meet it. But a server action that throws for a
   * typo is a bad way to tell somebody they typed a typo — Next redacts the
   * message in production, so the user gets "an error occurred" for pressing 8
   * instead of 7. So the typo is caught in the cell, the field is put back, and
   * the server never hears about it. The server check stays as the rule; this
   * is the manners.
   */
  const save = (
    studentId: string, point: ReportingPoint['key'], raw: string, field: HTMLInputElement,
    previous: string | null,
  ) => {
    const text = raw.trim()
    if (text !== '' && normaliseGrade(text, view.scale) == null) {
      field.value = previous ?? ''
      setError(`“${text}” is not a grade on this course’s ${scale.label} scale.`)
      return
    }
    setError(null)
    const value = normaliseGrade(text, view.scale)
    if (value === previous) return
    run(() =>
      pg.setPredictedGrade(view.course.id, view.cohortId, studentId, point, value),
    )
  }

  const filled = view.points.map((_, i) => view.rows.filter((r) => r.cells[i].grade != null).length)
  const lockedCount = view.rows.reduce(
    (a, r) => a + r.cells.filter((c) => c.locked).length, 0,
  )
  // The point being worked on: the last one with anything in it.
  const liveIndex = Math.max(0, filled.map((n) => n > 0).lastIndexOf(true))
  const liveValues = view.rows.map((r) => r.cells[liveIndex].grade).filter((g): g is string => g != null)
  const distribution = scale.values
    .map((v) => [v, liveValues.filter((g) => g === v).length] as const)
    .filter(([, n]) => n > 0)

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>
          {view.course.name} — predicted grades <span className="mut">{scale.label}</span>
        </h2>
        <span className="spacer" />
        <span className="mut" style={{ fontSize: 12 }}>
          {view.rows.length} candidate{view.rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="panel-h bcontrols" style={{ gap: 10 }}>
        <span className="caps">Designated marker</span>
        {view.marker ? (
          <span className="pill info">{view.marker}</span>
        ) : (
          <span className="pill warn">none set</span>
        )}
        {view.points.map((p, i) => (
          <span key={p.key} className={filled[i] === view.rows.length ? 'pill ok' : 'pill grey'}>
            {p.label} {filled[i]}/{view.rows.length}
          </span>
        ))}
        <span className="spacer" />
        {lockedCount > 0 && <span className="pill gold">{lockedCount} locked</span>}
        {distribution.length > 0 && (
          <span className="pill grey" title={`Spread at ${view.points[liveIndex].label}`}>
            {distribution.map(([v, n]) => `${n}×${v}`).join(' · ')}
          </span>
        )}
      </div>

      {readOnlyReason && (
        <div className="panel-h" style={{ paddingTop: 0, borderBottom: 0 }}>
          <div className="note gold" style={{ flex: 1 }}>{readOnlyReason}</div>
        </div>
      )}
      {editable && (
        <div className="panel-h" style={{ paddingTop: 0, borderBottom: 0 }}>
          <div className="note" style={{ flex: 1 }}>
            <b>A predicted grade locks the moment it is saved.</b> That is a guard against a stray
            keystroke, not a permission boundary — click a locked grade, give a reason, and it opens
            for you. The old value is never erased; it goes to the change history.
          </div>
        </div>
      )}
      {error && (
        <div className="panel-h" style={{ paddingTop: 0, borderBottom: 0 }}>
          <div className="note warn" style={{ flex: 1 }}>{error}</div>
        </div>
      )}

      <div className="bscroll">
        <table className="board marks">
          <thead>
            <tr className="bcols">
              <th className="idc">#</th>
              <th className="idc">Candidate</th>
              <th className="lanesep">
                IA<div className="critmax">evidence · read-only</div>
              </th>
              {view.points.map((p, i) => (
                <th key={p.key} className={i === 0 ? 'lanesep' : undefined} style={{ textAlign: 'center' }}>
                  {p.label}
                  {/* THE DATE THE COORDINATOR SET, OR NOTHING. There is no
                      fallback prose: a sentence about roughly when reads as a
                      deadline while being nobody's decision. Blank means she
                      has not set one — which is a legitimate state, not a gap
                      for this column to complain about. */}
                  {view.pointDue[i] && (
                    <div className="pgdue">
                      {'due ' + new Date(view.pointDue[i] + 'T00:00:00Z').toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
                      })}
                    </div>
                  )}
                  {p.toIb && <div className="ibsend">goes to the IB</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.studentId}>
                <td className="sn idc">{r.sessionNumber ?? '—'}</td>
                <td className="nm idc">
                  {candidateBase ? (
                    <Link
                      className="candlink"
                      href={candidateBase + r.studentId}
                      title="Open this candidate's whole file"
                    >
                      {r.name}
                      <span className="chev">›</span>
                    </Link>
                  ) : (
                    r.name
                  )}
                </td>
                <td className="lanesep">
                  {r.iaTotal == null ? (
                    <span className="cv none">—</span>
                  ) : (
                    <span className="pgref">
                      {r.iaTotal}
                      <span className="critmax">/{r.iaMax ?? ''}</span>
                    </span>
                  )}
                </td>
                {view.points.map((p, i) => {
                  const c = r.cells[i]
                  const sep = i === 0 ? 'lanesep' : undefined
                  if (c.locked) {
                    return (
                      <td key={p.key} className={sep}>
                        <button
                          type="button"
                          className="pglock"
                          disabled={!editable || pending}
                          title={
                            editable
                              ? `Locked — recorded by ${c.by ?? 'unknown'}${c.at ? ' on ' + c.at : ''}. Click to unlock.`
                              : `Recorded by ${c.by ?? 'unknown'}${c.at ? ' on ' + c.at : ''}.`
                          }
                          onClick={() => {
                            setReason('')
                            setUnlocking({ studentId: r.studentId, point: p })
                          }}
                        >
                          {c.grade}
                          <LockGlyph />
                        </button>
                      </td>
                    )
                  }
                  if (!editable) {
                    return (
                      <td key={p.key} className={sep}>
                        <span className={`cv ${c.grade == null ? 'none' : ''}`}>{c.grade ?? '–'}</span>
                      </td>
                    )
                  }
                  return (
                    <td key={p.key} className={sep}>
                      <input
                        className={`cin ltr ${c.grade != null ? 'open' : ''}`}
                        type="text"
                        maxLength={1}
                        defaultValue={c.grade ?? ''}
                        placeholder={scale.placeholder}
                        disabled={pending}
                        title={
                          c.openReason
                            ? `Open for change — “${c.openReason}”. It re-locks when you leave the cell.`
                            : `${scale.label} — it locks when you leave the cell`
                        }
                        onBlur={(e) => save(r.studentId, p.key, e.target.value, e.target, c.grade)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="idc" />
              <th className="idc">{view.rows.length} candidates</th>
              <td className="lanesep" />
              {view.points.map((p, i) => (
                <td key={p.key} className={i === 0 ? 'lanesep' : undefined}>
                  <span className={`btot ${filled[i] === view.rows.length ? 'ok' : filled[i] > 0 ? 'mid' : 'bad'}`}>
                    {filled[i]}/{view.rows.length}
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="panel-b" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="legend">
          <span className="mut">
            The IA column is evidence, not a field — the IA screen owns it. Only the April point is
            transcribed into IBIS; the earlier two are the school&rsquo;s own reads.
          </span>
        </div>
      </div>

      {/* The unlock. A reason, then one cell opens for one change. */}
      {unlocking && row && cell && (
        <div className="cmtback" onMouseDown={() => setUnlocking(null)}>
          <div
            className="cmtcard"
            role="dialog"
            aria-label={`Unlock predicted grade — ${row.name}`}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ width: 'min(460px, calc(100vw - 40px))' }}
          >
            <div className="cmtcard-h">
              <b>{row.name}</b>
              <span className="mut" style={{ marginLeft: 6 }}>— {unlocking.point.label}</span>
              <span className="spacer" />
              <button className="mini" title="Close (Esc)" onClick={() => setUnlocking(null)}>✕</button>
            </div>
            <div className="mut" style={{ fontSize: 12.5, marginBottom: 10 }}>
              Recorded <b style={{ color: 'var(--ink)' }}>{cell.grade}</b>
              {cell.by ? ` by ${cell.by}` : ''}
              {cell.at ? ` on ${cell.at}` : ''}.
            </div>
            <div className="caps" style={{ marginBottom: 4 }}>Reason for changing it</div>
            <textarea
              className="cmtarea"
              autoFocus
              rows={3}
              placeholder="e.g. Mock exam result arrived after I entered this."
              value={reason}
              disabled={pending}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="btn sm pri"
                disabled={pending || !reason.trim()}
                onClick={() =>
                  run(async () => {
                    await pg.unlockPredictedGrade(
                      view.course.id, view.cohortId, row.studentId, unlocking.point.key, reason,
                    )
                    setUnlocking(null)
                  })
                }
              >
                Unlock to change
              </button>
              <button className="btn sm ghost" disabled={pending} onClick={() => setUnlocking(null)}>
                Cancel
              </button>
              <span className="mut" style={{ fontSize: 11.5 }}>
                Required — it lands on the change history with your name.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** A drawn padlock. The product uses no emoji, and a column of coloured glyphs
 *  would shout louder than the grades they sit beside. */
function LockGlyph() {
  return (
    <svg className="lk" viewBox="0 0 10 12" fill="none" aria-hidden="true">
      <rect x="1" y="5" width="8" height="6.2" rx="1.4" fill="currentColor" />
      <path d="M2.9 5V3.4a2.1 2.1 0 0 1 4.2 0V5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
