'use client'

// THE STAFF VIEW — supervisees for a supervisor, the cohort for `ee.manage`.
//
// Scope is decided in the repository (`getRoster`'s `forUserId`), not here. A
// component that decides who may see whom is a component that can forget to.

import { useState, useTransition } from 'react'
import type { EeRosterRow, SessionStage } from '@/lib/ee/types'
import { subjectName } from '@/lib/ee/subjects'
import { addSessionNote, recordSession } from '@/lib/ee/actions'

const SESSIONS: { stage: SessionStage; label: string }[] = [
  { stage: 'r1', label: 'Reflection session 1' },
  { stage: 'r2', label: 'Reflection session 2' },
  { stage: 'viva', label: 'Viva voce · session 3' },
]

export default function EeRoster({
  rows, cohortLabel, scope, canWrite,
}: {
  rows: EeRosterRow[]
  cohortLabel: string
  scope: 'mine' | 'all'
  canWrite: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)
  const unallocated = rows.filter((r) => r.supervisor?.acting).length

  return (
    <>
      <h1>Extended Essay</h1>
      <p className="sub">
        {cohortLabel} ·{' '}
        {scope === 'mine'
          ? `${rows.length} ${rows.length === 1 ? 'supervisee' : 'supervisees'}`
          : `${rows.length} candidates`}
        {scope === 'all' && unallocated > 0 && ` · ${unallocated} not yet allocated`}
      </p>

      <div className="panel">
        <div className="panel-b" style={{ padding: 0 }}>
          <table className="eeroster">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Supervisor</th>
                <th>Subject</th>
                <th>Sessions</th>
                <th style={{ textAlign: 'right' }}>In</th>
                <th style={{ textAlign: 'right' }}>Late</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row
                  key={r.studentId}
                  row={r}
                  open={open === r.studentId}
                  onToggle={() => setOpen(open === r.studentId ? null : r.studentId)}
                  canWrite={canWrite}
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
  row, open, onToggle, canWrite,
}: {
  row: EeRosterRow
  open: boolean
  onToggle: () => void
  canWrite: boolean
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td>
          <b>{row.studentName}</b>
          {row.sessionNumber && <span className="mut"> · {row.sessionNumber}</span>}
        </td>
        <td>
          {row.supervisor ? (
            <>
              {row.supervisor.name}
              {row.supervisor.acting && <span className="pill grey">acting</span>}
            </>
          ) : (
            <span className="mut">—</span>
          )}
        </td>
        <td>
          {row.registration?.subjects.length ? (
            <>
              {row.registration.subjects.map(subjectName).join(' + ')}
              {row.registration.framework && (
                <div className="mut" style={{ fontSize: 11.5 }}>{row.registration.framework}</div>
              )}
            </>
          ) : (
            <span className="pill grey">not registered</span>
          )}
        </td>
        <td>{row.sessions.length} / 3</td>
        <td style={{ textAlign: 'right' }}>{row.done} / {row.total}</td>
        <td style={{ textAlign: 'right' }}>
          {row.late > 0 ? <span className="pill bad">{row.late}</span> : <span className="mut">—</span>}
        </td>
      </tr>
      {open && (
        <tr className="eedrawer">
          <td colSpan={6}>
            <div className="eedrawer-in">
              {row.registration ? (
                <p style={{ marginTop: 0 }}>
                  <b>{row.registration.title}</b>
                  <br />
                  <span className="mut">{row.registration.researchQuestion}</span>
                </p>
              ) : (
                <p className="mut" style={{ marginTop: 0 }}>Not registered yet.</p>
              )}

              {SESSIONS.map((s) => {
                const held = row.sessions.find((x) => x.stage === s.stage)
                const notes = row.notes.filter((n) => n.stage === s.stage)
                return (
                  <SessionRow
                    key={s.stage}
                    studentId={row.studentId}
                    stage={s.stage}
                    label={s.label}
                    heldOn={held?.heldOn ?? null}
                    onBehalf={held?.onBehalf}
                    notes={notes}
                    canWrite={canWrite}
                  />
                )
              })}

              <div className="note gold" style={{ marginTop: 10 }}>
                <b>Marking is the next step.</b> The rubric, the attestation and release come with
                step 6 — see <b>IB-EE-Build-Plan.md</b>.
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function SessionRow({
  studentId, stage, label, heldOn, onBehalf, notes, canWrite,
}: {
  studentId: string
  stage: SessionStage
  label: string
  heldOn: string | null
  onBehalf?: boolean
  notes: { id: string; authorType: string; authorName: string; body: string; createdAt: string }[]
  canWrite: boolean
}) {
  const [date, setDate] = useState(heldOn ?? '')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="eesession">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <i className={`eedot ${heldOn ? 'done' : 'not_started'}`} />
        <b>{label}</b>
        {heldOn && <span className="pill ok">held {heldOn}</span>}
        {onBehalf && <span className="pill grey">recorded on the supervisor’s behalf</span>}
        {canWrite && (
          <>
            <span className="spacer" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ maxWidth: 160 }}
              title="The day the meeting actually happened"
            />
            <button
              className="btn sm"
              disabled={pending || !date}
              onClick={() =>
                start(async () => setMessage((await recordSession(studentId, stage, date)).message))
              }
            >
              {heldOn ? 'Correct date' : 'Record as held'}
            </button>
          </>
        )}
      </div>
      {message && <div className="note warn" style={{ marginTop: 6 }}>{message}</div>}

      {notes.map((n) => (
        <div key={n.id} className={`eenote ${n.authorType}`}>
          <div className="eenote-h">
            {n.authorName}
            <span className="mut"> · {n.createdAt}</span>
            {n.authorType === 'student' && <span className="pill grey">student</span>}
          </div>
          {n.body}
        </div>
      ))}

      {canWrite && (
        <div className="row" style={{ marginTop: 6 }}>
          <input
            type="text"
            value={note}
            placeholder="Note about this session (optional) — the student sees it"
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className="btn sm"
            disabled={pending || !note.trim()}
            onClick={() =>
              start(async () => {
                await addSessionNote(studentId, stage, note)
                setNote('')
              })
            }
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
