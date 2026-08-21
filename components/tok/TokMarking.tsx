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
import type {
  AuthorshipConcern, InteractionNumber, TokMarkingRow, TokPpfView,
} from '@/lib/tok/types'
import { AUTHORSHIP_LABELS, AUTHORSHIP_ORDER } from '@/lib/tok/types'
import { promptLabel } from '@/lib/tok/prompts'
import { isFlagged, promptDistribution, releaseBlockers, summariseMarking } from '@/lib/tok/marking'
import {
  draftTeacherComment, logInteraction, releaseTokMark, revokeTokMark, saveTeacherComment,
  saveTokMark, saveTokProse, signPpf, unsignPpf,
} from '@/lib/tok/actions'
import { INTERACTION_LINES, canSign, signWarnings } from '@/lib/tok/ppf'

export default function TokMarking({
  rows, instrument, kind, canMark, canRelease, canRevoke, canUnlock, readOnlyReason,
}: {
  rows: TokMarkingRow[]
  instrument: Instrument
  kind: 'exh' | 'essay'
  canMark: boolean
  canRelease: boolean
  canRevoke: boolean
  /** `items.unlock` — reopening a signed TK/PPF. */
  canUnlock?: boolean
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
                  canUnlock={canUnlock ?? false}
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
  row, kind, instrument, open, onToggle, canMark, canRelease, canRevoke, canUnlock,
}: {
  row: TokMarkingRow
  kind: 'exh' | 'essay'
  instrument: Instrument
  open: boolean
  onToggle: () => void
  canMark: boolean
  canRelease: boolean
  canRevoke: boolean
  canUnlock: boolean
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
          {kind === 'essay' && row.ppf && (
            <span className={row.ppf.signedAt ? 'pill ok' : 'pill grey'} style={{ marginRight: 6 }}>
              {row.ppf.signedAt ? '🔒 form signed' : `form ${row.ppf.written}/3`}
            </span>
          )}
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
              canUnlock={canUnlock}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function Drawer({
  row, kind, instrument, canMark, canRelease, canRevoke, canUnlock,
}: {
  row: TokMarkingRow
  kind: 'exh' | 'essay'
  instrument: Instrument
  canMark: boolean
  canRelease: boolean
  canRevoke: boolean
  canUnlock: boolean
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

      {kind === 'essay' && row.ppf && (
        <PpfBlock row={row} ppf={row.ppf} canWrite={canMark} canUnlock={canUnlock} />
      )}

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

// ---------------------------------------------------------------- the TK/PPF

/**
 * THE FORM, BOTH HALVES.
 *
 * The student writes the three interaction boxes; the teacher picks one line
 * per meeting and writes ONE comment at the end — which is exactly what the
 * official PDF carries. The three picked lines COMPOSE a draft of that comment,
 * so the year's small acts become the form rather than twenty-four blank boxes
 * in March.
 */
function PpfBlock({
  row, ppf, canWrite, canUnlock,
}: {
  row: TokMarkingRow
  ppf: TokPpfView
  canWrite: boolean
  canUnlock: boolean
}) {
  const [comment, setComment] = useState(ppf.comment)
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const signed = ppf.signedAt != null
  const warnings = signWarnings(ppf)
  const blocked = !canSign({ ...ppf, comment })

  return (
    <>
      <div className="eework">
        <span className="caps">The one draft</span>
        {row.draftHref ? (
          <div className="eelinkrow">
            <a href={row.draftHref} target="_blank" rel="noreferrer">Working draft ↗</a>
          </div>
        ) : (
          <p className="mut" style={{ margin: '4px 0 0', fontSize: 12.5 }}>No draft link yet.</p>
        )}
        <p className="mut" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
          &ldquo;The teacher is permitted to provide oral or written comments on your draft, but will
          not mark or edit your draft.&rdquo; — TK/PPF, 2022
        </p>
      </div>

      <div className="eework">
        <span className="caps">Planning form — three interactions</span>
        {ppf.interactions.map((i) => (
          <InteractionRow key={i.n} studentId={row.studentId} slot={i} canWrite={canWrite && !signed} />
        ))}
      </div>

      <div className="eework">
        <span className="caps">Your comment on the form</span>
        {signed ? (
          <>
            <div className="eerpf">{ppf.comment}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="pill ok">🔒 signed {ppf.signedAt} by {ppf.signedByName}</span>
              {canUnlock && (
                <button
                  className="btn sm ghost"
                  disabled={pending}
                  onClick={() => start(async () => { await unsignPpf(row.studentId) })}
                >
                  Reopen
                </button>
              )}
              <span className="spacer" />
              <span className="mut" style={{ fontSize: 11.5 }}>
                &ldquo;I confirm that my comments above are accurate&rdquo; — so it locks with the signature.
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="note" style={{ margin: '6px 0 8px' }}>
              This is the <b>only</b> thing you write on the official form, and it goes to the IB.
              Draft it from your three interaction lines, then edit it into your own words.
            </div>
            <textarea
              rows={4}
              value={comment}
              disabled={!canWrite}
              placeholder="Draft from the interactions above, or write your own…"
              onChange={(e) => { setComment(e.target.value); setSaved(false) }}
            />
            {canWrite && (
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn sm"
                  disabled={pending}
                  onClick={() => start(async () => {
                    setComment(await draftTeacherComment(row.studentId))
                    setSaved(false)
                  })}
                >
                  Draft from the interactions
                </button>
                <button
                  className="btn"
                  disabled={pending || !comment.trim()}
                  onClick={() => start(async () => {
                    await saveTeacherComment(row.studentId, comment)
                    setSaved(true)
                  })}
                >
                  Save
                </button>
                {saved && <span className="mut">Saved.</span>}
                <button
                  className="btn pri"
                  disabled={pending || blocked}
                  onClick={() => start(async () => {
                    await saveTeacherComment(row.studentId, comment)
                    const r = await signPpf(row.studentId)
                    setMessage(r.message ?? null)
                  })}
                >
                  Sign the form
                </button>
              </div>
            )}
            {/* WARNINGS, NEVER REFUSALS. The IB publishes no guidance on a
                missed interaction, and a coordinator in May must be able to
                send a short form rather than no form. The export still counts
                all three interactions AND the sign-off, so signing early never
                makes a pack claim readiness it does not have. */}
            {warnings.map((w) => (
              <p key={w} className="mut" style={{ fontSize: 11.5, margin: '8px 0 0' }}>{w}</p>
            ))}
            {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
          </>
        )}
      </div>
    </>
  )
}

const PPF_ORDINAL: Record<InteractionNumber, string> = { 1: 'First', 2: 'Second', 3: 'Third' }

function InteractionRow({
  studentId, slot, canWrite,
}: {
  studentId: string
  slot: TokPpfView['interactions'][number]
  canWrite: boolean
}) {
  const [lineKey, setLineKey] = useState(slot.logged?.lineKey ?? '')
  const [heldOn, setHeldOn] = useState(slot.logged?.heldOn ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = (key: string, date: string) => {
    if (!key || !date) return
    start(async () => {
      setMessage((await logInteraction(studentId, slot.n, key, date)).message ?? null)
    })
  }

  return (
    <div className="eesession">
      <div className="row">
        <i className={`eedot ${slot.entry ? 'done' : slot.logged ? 'partial' : ''}`} />
        <b>{PPF_ORDINAL[slot.n]}</b>
        {canWrite ? (
          <>
            <input
              type="date"
              value={heldOn}
              style={{ maxWidth: 150 }}
              title="The day the meeting actually happened"
              onChange={(e) => { setHeldOn(e.target.value); save(lineKey, e.target.value) }}
            />
            <select
              value={lineKey}
              style={{ minWidth: 300, flex: 1 }}
              onChange={(e) => { setLineKey(e.target.value); save(e.target.value, heldOn) }}
            >
              <option value="">What did this cover?</option>
              {INTERACTION_LINES[slot.n].map((l) => (
                <option key={l.key} value={l.key}>{l.label}</option>
              ))}
            </select>
          </>
        ) : (
          <span className="mut" style={{ fontSize: 12.5 }}>
            {slot.logged ? `${slot.logged.heldOn} · ${slot.logged.label}` : 'not recorded'}
          </span>
        )}
      </div>

      {slot.entry ? (
        <div className="eerpf">{slot.entry.body}</div>
      ) : slot.logged ? (
        <p className="mut" style={{ fontSize: 11.5, margin: '6px 0 0 18px' }}>
          Logged. Their box opened when you recorded this; they have not written it up yet.
        </p>
      ) : (
        <p className="mut" style={{ fontSize: 11.5, margin: '6px 0 0 18px' }}>
          Recording this is what opens the student&rsquo;s box.
        </p>
      )}
      {message && <div className="note warn" style={{ marginTop: 6 }}>{message}</div>}
    </div>
  )
}
