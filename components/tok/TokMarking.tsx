'use client'

// THE MARKING LIST — built for a sitting, not for a roster drawer.
//
// Twenty-four exhibitions get marked in one afternoon, so the list opens one
// candidate at a time in place and the next is already under the cursor. The
// band ladder sits beside the mark with every band readable, not just the one
// selected: a marker deciding between 7 and 8 needs to read both.
//
// One component serves the exhibition and the essay, because the two
// instruments differ only in their wording — which is exactly what
// lib/tok/rubric.ts holds as data.

import { useState, useTransition } from 'react'
import type { Instrument } from '@/lib/tok/rubric'
import { BAND_PROVENANCE, TOK_MARK_MAX, bandFor } from '@/lib/tok/rubric'
import type { AuthorshipConcern, TokMarkingRow } from '@/lib/tok/types'
import { AUTHORSHIP_LABELS, AUTHORSHIP_ORDER } from '@/lib/tok/types'
import { promptLabel } from '@/lib/tok/prompts'
import { isFlagged, promptDistribution, releaseBlockers, summariseMarking } from '@/lib/tok/marking'
import { releaseTokMark, revokeTokMark, saveTokMark, saveTokProse } from '@/lib/tok/actions'

export default function TokMarking({
  rows, instrument, kind, canMark, canRelease, canRevoke, readOnlyReason,
}: {
  rows: TokMarkingRow[]
  instrument: Instrument
  kind: 'exh' | 'essay'
  canMark: boolean
  canRelease: boolean
  canRevoke: boolean
  readOnlyReason?: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const t = summariseMarking(rows)
  const dist = kind === 'exh' ? promptDistribution(rows) : []

  return (
    <>
      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="tile stat">
          <div className="k">Filed</div>
          <div className="v">{t.filed}<small>/{t.candidates}</small></div>
          <div className="d">{t.candidates - t.filed} not in</div>
        </div>
        <div className="tile stat">
          <div className="k">Marked</div>
          <div className="v">{t.marked}<small>/{t.filed}</small></div>
          <div className="d">{Math.max(0, t.filed - t.marked)} left to mark</div>
        </div>
        <div className="tile stat">
          <div className="k">Released</div>
          <div className="v">{t.released}<small>/{t.marked}</small></div>
          <div className="d">{Math.max(0, t.marked - t.released)} marked, not released</div>
        </div>
        <div className="tile stat">
          <div className="k">{kind === 'exh' ? 'Prompts in use' : 'Authorship flags'}</div>
          <div className="v">
            {kind === 'exh' ? dist.length : t.flagged}
            {kind === 'exh' && <small>/35</small>}
          </div>
          <div className="d">
            {kind === 'exh'
              ? dist[0] ? `${dist[0].count} chose prompt ${dist[0].number}` : 'none chosen yet'
              : t.flagged === 0 ? 'none recorded' : 'recorded while marking'}
          </div>
        </div>
      </div>

      {readOnlyReason && <div className="note" style={{ marginBottom: 14 }}>{readOnlyReason}</div>}

      <div className="panel">
        <div className="panel-h">
          <h2>{instrument.label}s</h2>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            marked out of {TOK_MARK_MAX} · one holistic judgement
          </span>
        </div>
        <div className="panel-b" style={{ padding: 0 }}>
          <table className="eeroster">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>{kind === 'exh' ? 'Prompt' : 'Title'}</th>
                <th>Filed</th>
                <th>Mark</th>
                <th style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row
                  key={r.studentId}
                  row={r}
                  kind={kind}
                  instrument={instrument}
                  open={open === r.studentId}
                  onToggle={() => setOpen(open === r.studentId ? null : r.studentId)}
                  canMark={canMark}
                  canRelease={canRelease}
                  canRevoke={canRevoke}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Row({
  row, kind, instrument, open, onToggle, canMark, canRelease, canRevoke,
}: {
  row: TokMarkingRow
  kind: 'exh' | 'essay'
  instrument: Instrument
  open: boolean
  onToggle: () => void
  canMark: boolean
  canRelease: boolean
  canRevoke: boolean
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td>
          <b>{row.studentName}</b>
          {row.sessionNumber && <span className="mut"> · {row.sessionNumber}</span>}
          {isFlagged(row.prose?.authorship) && (
            <span className="pill warn" title={row.prose?.authorshipNote}>authorship</span>
          )}
        </td>
        <td>
          {kind === 'exh'
            ? row.promptNumber
              ? <span className="mut" style={{ fontSize: 12.5 }}>{promptLabel(row.promptNumber)}</span>
              : <span className="mut">— not chosen —</span>
            : row.title
              ? <span className="mut" style={{ fontSize: 12.5 }}>
                  {row.title.number ? `${row.title.number}. ` : ''}{row.title.text}
                </span>
              : <span className="mut">— not chosen —</span>}
        </td>
        <td>
          {row.file
            ? <span className="mut">{row.file.submittedAt}</span>
            : <span className="pill grey">not filed</span>}
        </td>
        <td>
          {row.mark != null
            ? <><b>{row.mark}</b> / {instrument.max}</>
            : <span className="mut">—</span>}
        </td>
        <td style={{ textAlign: 'right' }}>
          {row.releasedAt
            ? <span className="pill ok">released</span>
            : row.mark != null
              ? <span className="pill gold">marked, not released</span>
              : row.file
                ? <span className="pill info">to mark</span>
                : <span className="pill grey">waiting</span>}
        </td>
      </tr>
      {open && (
        <tr className="eedrawer">
          <td colSpan={5}>
            <Drawer
              row={row}
              kind={kind}
              instrument={instrument}
              canMark={canMark}
              canRelease={canRelease}
              canRevoke={canRevoke}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function Drawer({
  row, kind, instrument, canMark, canRelease, canRevoke,
}: {
  row: TokMarkingRow
  kind: 'exh' | 'essay'
  instrument: Instrument
  canMark: boolean
  canRelease: boolean
  canRevoke: boolean
}) {
  const [note, setNote] = useState(row.prose?.note ?? '')
  const [comment, setComment] = useState(row.prose?.comment ?? '')
  const [authorship, setAuthorship] = useState<AuthorshipConcern>(row.prose?.authorship ?? 'none')
  const [authorshipNote, setAuthorshipNote] = useState(row.prose?.authorshipNote ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const released = row.releasedAt != null
  const editable = canMark && !released
  const band = bandFor(instrument, row.mark)
  const blockers = releaseBlockers({ mark: row.mark, comment, filed: row.file != null })

  return (
    <div className="eedrawer-in">
      {kind === 'exh' && row.promptNumber && (
        <div className="note" style={{ marginBottom: 12 }}>
          <b>Prompt {row.promptNumber}:</b> {promptLabel(row.promptNumber)!.replace(/^\d+\.\s*/, '')}
        </div>
      )}
      {kind === 'essay' && row.title && (
        <div className="note" style={{ marginBottom: 12 }}>
          <b>Title{row.title.number ? ` ${row.title.number}` : ''}:</b> {row.title.text}
        </div>
      )}

      <div className="eework">
        <span className="caps">The work</span>
        {row.file ? (
          <div className="eelinkrow">
            <span className="eelinkrow-l">{row.file.fileName}</span>
            {row.file.locked && <span className="pill ok">🔒 locked</span>}
            <span className="mut" style={{ fontSize: 11.5 }}>
              {row.file.declaredWords.toLocaleString()} words · filed {row.file.submittedAt}
            </span>
            {/* Viewing needs the bytes, and storage is a stub — so the button
                that would lie is absent rather than present and dead. */}
            <span className="mut" style={{ fontSize: 11.5 }}>(viewing needs cloud storage)</span>
          </div>
        ) : (
          <p className="mut" style={{ margin: '4px 0 0' }}>Nothing filed. There is nothing to mark yet.</p>
        )}
      </div>

      <div className="eecrit">
        <div className="row">
          <span className="caps">Mark</span>
          <div className="eemarks">
            {Array.from({ length: instrument.max + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`eemark ${row.mark === i ? 'on' : ''}`}
                disabled={pending || !editable || row.file == null}
                onClick={() => start(async () => { await saveTokMark(row.studentId, kind, i) })}
              >
                {i}
              </button>
            ))}
          </div>
          {band && <span className="pill grey">{band.level}</span>}
          {kind === 'essay' && (
            <span className="mut" style={{ fontSize: 11.5 }}>
              the IB marks the real essay — this is your read, for the prediction
            </span>
          )}
        </div>

        <div className="eebands">
          {instrument.bands.map((b) => (
            <div key={`${b.from}-${b.to}`} className={`eeband ${band === b ? 'on' : ''}`}>
              <b>{b.from === b.to ? b.from : `${b.from}–${b.to}`}{b.level !== '—' ? ` · ${b.level}` : ''}</b>
              {' — '}{b.descriptor}
            </div>
          ))}
        </div>

        {/* NEVER render a band without saying where the wording came from. */}
        <div className="note gold" style={{ marginTop: 8 }}>{BAND_PROVENANCE}</div>
      </div>

      {/* TWO TEXTS, NOT ONE — Michael's own May 2026 sheet kept both columns
          across all 34 candidates, and a single box would collapse a
          distinction a real marker already maintains. */}
      <div className="eetwo" style={{ marginTop: 12 }}>
        <div>
          <label className="fld" style={{ marginTop: 0 }}>
            Your note <span className="mut">— private, the evidence behind the mark</span>
          </label>
          <textarea rows={6} value={note} disabled={!editable}
            onChange={(e) => { setNote(e.target.value); setSaved(false) }} />
        </div>
        <div>
          <label className="fld" style={{ marginTop: 0 }}>
            Released to {row.studentName.split(' ')[0]} <span className="mut">— goes out with the mark</span>
          </label>
          <textarea rows={6} value={comment} disabled={!editable}
            onChange={(e) => { setComment(e.target.value); setSaved(false) }} />
        </div>
      </div>

      <div className="eework" style={{ marginTop: 6 }}>
        <span className="caps">Authorship</span>
        <div className="row" style={{ marginTop: 5 }}>
          <select
            value={authorship}
            disabled={!editable}
            style={{ minWidth: 280 }}
            onChange={(e) => { setAuthorship(e.target.value as AuthorshipConcern); setSaved(false) }}
          >
            {AUTHORSHIP_ORDER.map((a) => (
              <option key={a} value={a}>{AUTHORSHIP_LABELS[a]}</option>
            ))}
          </select>
          {authorship !== 'none' && (
            <input
              type="text"
              value={authorshipNote}
              disabled={!editable}
              placeholder="Where, and what you saw (optional)"
              style={{ flex: 1, minWidth: 220 }}
              onChange={(e) => { setAuthorshipNote(e.target.value); setSaved(false) }}
            />
          )}
        </div>
        <p className="mut" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
          A field rather than a sentence inside a comment, so it can be found in April.
        </p>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        {editable && (
          <button
            className="btn pri"
            disabled={pending}
            onClick={() => start(async () => {
              await saveTokProse(row.studentId, kind, {
                note, comment, authorship,
                authorshipNote: authorshipNote.trim() || undefined,
              })
              setSaved(true)
            })}
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        )}
        {saved && <span className="mut">Saved.</span>}

        {!released && canRelease && (
          <button
            className="btn"
            disabled={pending || blockers.length > 0}
            title={blockers[0]}
            onClick={() => start(async () => {
              const r = await releaseTokMark(row.studentId, kind)
              setMessage(r.message ?? null)
            })}
          >
            Release to {row.studentName.split(' ')[0]}
          </button>
        )}
        {released && (
          <>
            <span className="pill ok">released {row.releasedAt}</span>
            {canRevoke && (
              <button
                className="btn sm ghost"
                disabled={pending}
                onClick={() => start(async () => { await revokeTokMark(row.studentId, kind) })}
              >
                Revoke
              </button>
            )}
          </>
        )}
        <span className="spacer" />
        {row.markedByName && (
          <span className="mut" style={{ fontSize: 11.5 }}>marked by {row.markedByName}</span>
        )}
      </div>

      {blockers.length > 0 && !released && (
        <p className="mut" style={{ fontSize: 11.5, margin: '8px 0 0' }}>{blockers[0]}</p>
      )}
      {released && (
        <p className="mut" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
          A released mark is not editable in place — revoking is the way back, and it is recorded.
        </p>
      )}
      {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
    </div>
  )
}
