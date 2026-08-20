'use client'

// THE MARKING SCREEN.
//
// Two things drive its shape, both from Michael (20 Aug):
//
//   1. "Many teachers like to score everything but the reflection before the
//      viva voce (so they don't need to read the essay three times) so they
//      should not be locked from doing that." So the gate is PER CRITERION:
//      A–D open when the essay is filed, E when the RPF is in. Every mark saves
//      on click — nothing is lost waiting for Criterion E.
//
//   2. "The rubric is large… so should be brief key points that can be
//      expanded." So each band shows a few words, and opens to the full text.
//      A wall of descriptors at the moment of marking is a wall nobody reads.
//
// The RPF sits BESIDE Criterion E, not behind a tab. A marker who has to
// navigate away to read the thing they are marking marks it from memory.

import { useState, useTransition } from 'react'
import type { EeRosterRow } from '@/lib/ee/types'
import {
  BAND_PROVENANCE, EE_CRITERIA, INDICATIVE_BOUNDARIES, MARKING_DISCIPLINE, boundariesAreOfficial,
} from '@/lib/ee/rubric'
import { criterionOpen, markingGates, releaseBlockers, summariseScore } from '@/lib/ee/scoring'
import { releaseScore, revokeScore, saveMark, saveScoring } from '@/lib/ee/actions'

export default function EeMarking({
  row, canMark, canRevoke,
}: {
  row: EeRosterRow
  canMark: boolean
  canRevoke: boolean
}) {
  const [marks, setMarks] = useState<(number | null)[]>(
    row.marks.length ? row.marks : EE_CRITERIA.map(() => null),
  )
  const [comment, setComment] = useState(row.scoring?.comment ?? '')
  const [hours, setHours] = useState(row.scoring?.hoursSupervised?.toString() ?? '')
  const [sessions, setSessions] = useState(row.scoring?.attestedSessions ?? false)
  const [authentic, setAuthentic] = useState(row.scoring?.attestedAuthentic ?? false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const released = row.scoring?.releasedAt != null
  const gates = markingGates({ finalFiled: row.final != null, rpfIn: row.rpf != null })
  const score = summariseScore(marks)
  const blockers = releaseBlockers({
    marks, attestedSessions: sessions, attestedAuthentic: authentic, comment,
  })

  const setMark = (i: number, v: number | null) =>
    start(async () => {
      const next = [...marks]
      next[i] = v
      setMarks(next)
      const r = await saveMark(row.studentId, i, v)
      setMessage(r.message)
    })

  const persist = () =>
    start(async () => {
      await saveScoring(row.studentId, {
        comment,
        hoursSupervised: hours ? Number(hours) : null,
        attestedSessions: sessions,
        attestedAuthentic: authentic,
      })
    })

  return (
    <div className="eework">
      <div className="row">
        <span className="caps">Marking</span>
        <span className="spacer" />
        {released ? (
          <span className="pill ok">
            released {row.scoring!.releasedAt} · {score.total}/{score.max}
            {score.band ? ` · ${score.band}` : ''}
          </span>
        ) : (
          <span className="mut" style={{ fontSize: 12 }}>
            {score.entered} of {EE_CRITERIA.length} criteria · {score.soFar} so far
          </span>
        )}
      </div>

      {!gates.core && (
        <div className="note" style={{ marginTop: 6 }}>
          {gates.coreReason} A–D open as soon as it is.
        </div>
      )}

      {EE_CRITERIA.map((c, i) => (
        <Criterion
          key={c.key}
          criterion={c}
          value={marks[i] ?? null}
          open={criterionOpen(c.key, gates) && canMark && !released}
          closedReason={c.key === 'E' ? gates.reflectionReason : gates.coreReason}
          onChange={(v) => setMark(i, v)}
          /* Criterion E is marked FROM the reflection, so the reflection is here. */
          aside={c.key === 'E' ? <Rpf row={row} /> : null}
        />
      ))}

      <div className="eetotal">
        <b>{score.complete ? `${score.total} / ${score.max}` : `${score.soFar} so far`}</b>
        {score.band && <span className="pill info">indicative {score.band}</span>}
        {!boundariesAreOfficial && (
          <span className="mut" style={{ fontSize: 11.5 }}>
            Boundaries are indicative — the IB publishes none until the first 2027 subject report
            ({INDICATIVE_BOUNDARIES.map((b) => `${b.grade} ${b.min}+`).join(' · ')}).
          </span>
        )}
      </div>

      {!released && canMark && (
        <>
          <label className="fld" style={{ marginTop: 12 }}>
            Justification — a few sentences on the marks and on authenticity
          </label>
          <textarea
            rows={4}
            value={comment}
            onBlur={persist}
            placeholder="Why these marks, and what you saw across the three sessions that makes this the candidate's own work…"
            onChange={(e) => setComment(e.target.value)}
          />
          <p className="mut" style={{ fontSize: 11.5, margin: '4px 0 0' }}>
            Goes to the IB with the RPF. Moderators say per-criterion justification helps them, and
            it is what an authenticity query is answered from a year later.
          </p>

          <div className="eetwo" style={{ marginTop: 10 }}>
            <div>
              <label className="fld">Hours spent supervising</label>
              <input
                type="number" step="0.5" value={hours} style={{ maxWidth: 120 }}
                onBlur={persist} onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div>
              <span className="caps">Attestation</span>
              <label className="eecheck">
                <input
                  type="checkbox" checked={sessions}
                  onChange={(e) => { setSessions(e.target.checked); setTimeout(persist, 0) }}
                />
                I held the required reflection sessions
              </label>
              <label className="eecheck">
                <input
                  type="checkbox" checked={authentic}
                  onChange={(e) => { setAuthentic(e.target.checked); setTimeout(persist, 0) }}
                />
                I confirm this is the candidate’s own work
              </label>
              <p className="mut" style={{ fontSize: 11.5, margin: '4px 0 0' }}>
                Two ticks, because someone covering for a colleague can confirm the second without
                claiming the first.
              </p>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn pri"
              disabled={pending || blockers.length > 0}
              onClick={() => start(async () => setMessage((await releaseScore(row.studentId)).message))}
            >
              Release to student
            </button>
            {blockers.length > 0 && (
              <span className="mut" style={{ fontSize: 12 }}>{blockers[0].message}</span>
            )}
          </div>
        </>
      )}

      {released && canRevoke && (
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="btn sm ghost"
            disabled={pending}
            onClick={() => start(async () => { await revokeScore(row.studentId) })}
          >
            Revoke release
          </button>
          <span className="mut" style={{ fontSize: 12 }}>
            Released by {row.scoring!.releasedByName}. Revoking takes the grade back off the
            student’s screen and out of the bonus-point matrix.
          </span>
        </div>
      )}

      {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}

      <details style={{ marginTop: 10 }}>
        <summary className="mut" style={{ fontSize: 12, cursor: 'pointer' }}>
          Marking discipline
        </summary>
        <ul style={{ fontSize: 12.5, margin: '6px 0 0' }}>
          {MARKING_DISCIPLINE.map((m) => (
            <li key={m.rule}><b>{m.rule}</b> {m.detail}</li>
          ))}
        </ul>
      </details>
      <p className="mut" style={{ fontSize: 11.5, marginTop: 6 }}>⚠ {BAND_PROVENANCE}</p>
    </div>
  )
}

function Criterion({
  criterion, value, open, closedReason, onChange, aside,
}: {
  criterion: (typeof EE_CRITERIA)[number]
  value: number | null
  open: boolean
  closedReason: string | null
  onChange: (v: number | null) => void
  aside: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const band = criterion.bands.find((b) => value != null && value >= b.min && value <= b.max)

  return (
    <div className={`eecrit ${open ? '' : 'shut'}`}>
      <div className="eecrit-h">
        <b>{criterion.key}</b>
        <span>{criterion.label}</span>
        <span className="spacer" />
        <div className="eemarks">
          {Array.from({ length: criterion.max + 1 }, (_, n) => (
            <button
              key={n}
              type="button"
              className={`eemark ${value === n ? 'on' : ''}`}
              disabled={!open}
              onClick={() => onChange(value === n ? null : n)}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="mut" style={{ fontSize: 11.5 }}>/{criterion.max}</span>
      </div>

      {!open && closedReason && <div className="mut eecrit-s">🔒 {closedReason}</div>}

      {/* THE COLLAPSED RUBRIC: the band you have chosen, in a few words. */}
      {open && (
        <>
          <div className="eecrit-s">
            {band ? (
              <><b>{band.label}</b> · {band.summary}</>
            ) : (
              <span className="mut">{criterion.guidingQuestion}</span>
            )}
            <button type="button" className="btn sm ghost" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'less' : 'descriptors'}
            </button>
          </div>
          {expanded && (
            <div className="eebands">
              <p className="mut" style={{ margin: '0 0 6px', fontSize: 12 }}>
                <i>{criterion.guidingQuestion}</i> — strands: {criterion.strands.join(' · ')}
              </p>
              {criterion.bands.map((b) => (
                <div key={b.label} className={`eeband ${band?.label === b.label ? 'on' : ''}`}>
                  <b>{b.label}</b> {b.guidance}
                </div>
              ))}
              {criterion.notes?.map((n) => (
                <div key={n.heading} style={{ marginTop: 6 }}>
                  <b style={{ fontSize: 12 }}>{n.heading}</b>
                  <ul style={{ fontSize: 12, margin: '2px 0 0' }}>
                    {n.points.map((pt) => <li key={pt}>{pt}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {aside}
    </div>
  )
}

/** The statement itself, beside Criterion E. */
function Rpf({ row }: { row: EeRosterRow }) {
  if (!row.rpf) {
    return (
      <div className="mut eecrit-s">
        No reflection statement yet — it unlocks for the student once the viva is recorded.
      </div>
    )
  }
  return (
    <div className="eerpf">
      <div className="eenote-h">
        Reflection statement · {row.rpf.words} words · submitted {row.rpf.submittedAt}
      </div>
      {row.rpf.body}
    </div>
  )
}
