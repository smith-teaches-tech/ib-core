'use client'

// THE STAFF VIEW — supervisees for a supervisor, the cohort for `ee.manage`.
//
// Scope is decided in the repository (`getRoster`'s `forUserId`), not here. A
// component that decides who may see whom is a component that can forget to.

import { useState, useTransition } from 'react'
import type { EeRosterRow, SessionStage } from '@/lib/ee/types'
import { subjectName } from '@/lib/ee/subjects'
import { addSessionNote, assignSupervisor, recordSession, unlockFinal } from '@/lib/ee/actions'
import type { EeAssignableStaff } from '@/lib/ee/types'

const SESSIONS: { stage: SessionStage; label: string }[] = [
  { stage: 'r1', label: 'Reflection session 1' },
  { stage: 'r2', label: 'Reflection session 2' },
  { stage: 'viva', label: 'Viva voce · session 3' },
]

export default function EeRoster({
  rows, cohortLabel, cohortId, scope, canWrite, canAllocate, canUnlock, staff,
}: {
  rows: EeRosterRow[]
  cohortLabel: string
  cohortId: string
  scope: 'mine' | 'all'
  canWrite: boolean
  /** `ee.manage` — allocation is the coordinator's job, not a supervisor's. */
  canAllocate: boolean
  /** `items.unlock` — reopening a filed essay. */
  canUnlock: boolean
  staff: EeAssignableStaff[]
}) {
  const [open, setOpen] = useState<string | null>(null)
  const unallocated = rows.filter((r) => r.supervisor?.acting).length
  // Michael, 20 Aug: no theatre teacher means no theatre EE — a warning the EE
  // coordinator oversees, so it belongs at the top of their list, not buried.
  const needSupervisor = rows.filter((r) => r.unsupportedSubjects.length > 0)

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

      {needSupervisor.length > 0 && (
        <div className="note" style={{ marginBottom: 14 }}>
          <b>
            {needSupervisor.length}{' '}
            {needSupervisor.length === 1 ? 'candidate has' : 'candidates have'} registered in a
            subject nobody here teaches.
          </b>{' '}
          Not a problem with the registration — it needs a supervisor found, which is yours to
          arrange.
          <div style={{ marginTop: 6 }}>
            {needSupervisor.map((r) => (
              <div key={r.studentId} className="mut" style={{ fontSize: 12.5 }}>
                {r.studentName} — {r.unsupportedSubjects.map(subjectName).join(', ')}
              </div>
            ))}
          </div>
        </div>
      )}

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
                  cohortId={cohortId}
                  open={open === r.studentId}
                  onToggle={() => setOpen(open === r.studentId ? null : r.studentId)}
                  canWrite={canWrite}
                  canAllocate={canAllocate}
                  canUnlock={canUnlock}
                  staff={staff}
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
  row, cohortId, open, onToggle, canWrite, canAllocate, canUnlock, staff,
}: {
  row: EeRosterRow
  cohortId: string
  open: boolean
  onToggle: () => void
  canWrite: boolean
  canAllocate: boolean
  canUnlock: boolean
  staff: EeAssignableStaff[]
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
              {row.unsupportedSubjects.length > 0 && (
                <span
                  className="pill warn"
                  title="Nobody at the school teaches this — a supervisor needs finding"
                >
                  no supervisor here
                </span>
              )}
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

              {/* THE WORK ITSELF. A drawer that summarises documents nobody can
                  open is a summary, not a record — and Michael asked for the
                  links and files in the first pass. */}
              <Work row={row} canUnlock={canUnlock} />

              {canAllocate && <Allocate row={row} cohortId={cohortId} staff={staff} />}

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

// ---------------------------------------------------------------- the work

function Work({ row, canUnlock }: { row: EeRosterRow; canUnlock: boolean }) {
  const [reason, setReason] = useState('')
  const [asking, setAsking] = useState(false)
  const [pending, start] = useTransition()

  return (
    <div className="eework">
      <span className="caps">Process documents</span>
      {row.links.length === 0 && <p className="mut" style={{ margin: '4px 0 0' }}>Nothing filed yet.</p>}
      {row.links.map((l) => (
        <div key={l.stage} className="eelinkrow">
          <span className="eelinkrow-l">{l.stage === 'outline' ? 'Outline' : 'Full draft'}</span>
          <a href={l.href} target="_blank" rel="noreferrer">open ↗</a>
          <span className="mut" style={{ fontSize: 11.5 }}>{l.addedAt}</span>
        </div>
      ))}

      <span className="caps" style={{ display: 'block', marginTop: 10 }}>Finished essay</span>
      {row.final ? (
        <>
          <div className="eelinkrow">
            <span className="eelinkrow-l">{row.final.fileName}</span>
            {row.finalLocked && <span className="pill ok">🔒 locked</span>}
            <span className="mut" style={{ fontSize: 11.5 }}>
              {row.final.declaredWords.toLocaleString()} words · filed {row.final.submittedAt}
            </span>
            {/* Viewing needs the bytes, and storage is a stub — so the button
                that would lie is simply absent rather than present and dead. */}
            <span className="mut" style={{ fontSize: 11.5 }}>
              (viewing needs cloud storage)
            </span>
          </div>
          {row.final.unlockReason && (
            <div className="note warn" style={{ marginTop: 6 }}>
              Reopened by {row.final.unlockedByName} on {row.final.unlockedAt} —{' '}
              {row.final.unlockReason}
            </div>
          )}
          {canUnlock && row.finalLocked && (
            asking ? (
              <div className="row" style={{ marginTop: 6 }}>
                <input
                  type="text"
                  value={reason}
                  placeholder="Why is this being reopened? (kept on the record)"
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  className="btn sm"
                  disabled={pending || !reason.trim()}
                  onClick={() => start(async () => {
                    await unlockFinal(row.studentId, reason)
                    setAsking(false)
                    setReason('')
                  })}
                >
                  Reopen
                </button>
                <button className="btn sm ghost" onClick={() => setAsking(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setAsking(true)}>
                Reopen for editing…
              </button>
            )
          )}
        </>
      ) : (
        <p className="mut" style={{ margin: '4px 0 0' }}>
          Not filed. The viva stays locked until it is.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- allocation

/**
 * ALLOCATION — the September job, and the reason the coordinator's list looks
 * full at the start of the year. `load` is shown against each name so the work
 * can be spread deliberately rather than discovered in February.
 */
function Allocate({
  row, cohortId, staff,
}: {
  row: EeRosterRow
  cohortId: string
  staff: EeAssignableStaff[]
}) {
  const [pending, start] = useTransition()
  const current = row.supervisor?.acting ? '' : row.supervisor?.userId ?? ''

  return (
    <div className="eework">
      <span className="caps">Supervisor</span>
      <div className="row" style={{ marginTop: 4 }}>
        <select
          value={current}
          disabled={pending}
          onChange={(e) =>
            e.target.value &&
            start(async () => { await assignSupervisor(cohortId, row.studentId, e.target.value) })
          }
        >
          <option value="">Not allocated — sitting with the coordinator</option>
          {staff.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name} — {p.load} {p.load === 1 ? 'supervisee' : 'supervisees'}
            </option>
          ))}
        </select>
        {row.supervisor?.acting && <span className="pill grey">acting</span>}
      </div>
      <p className="mut" style={{ fontSize: 11.5, margin: '4px 0 0' }}>
        Reassigning ends the current allocation rather than editing it — whoever held the earlier
        sessions stays named on them.
      </p>
    </div>
  )
}
