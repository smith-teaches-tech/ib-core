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
import EeMarking from './EeMarking'
import PaperReader from '../reader/PaperReader'
import { summariseScore, supervisionHours } from '@/lib/ee/scoring'
import { EE_MARK_MAX } from '@/lib/ee/rubric'
import { PDF_ONLY } from '@/lib/accepts'
import FileChip from '../FileChip'

const SESSIONS: { stage: SessionStage; label: string }[] = [
  { stage: 'r1', label: 'Reflection session 1' },
  { stage: 'r2', label: 'Reflection session 2' },
  { stage: 'viva', label: 'Viva voce · session 3' },
]

export default function EeRoster({
  rows, cohortLabel, cohortId, scope, canWrite, canAllocate, canUnlock, canRevoke, staff, meId,
  paperFor, paperBase, listHref, canDownload = false,
}: {
  rows: EeRosterRow[]
  cohortLabel: string
  cohortId: string
  scope: 'mine' | 'all'
  canWrite: boolean
  canRevoke: boolean
  /** The viewer, so a coordinator who also supervises can filter to their own. */
  meId: string
  /** `ee.manage` — allocation is the coordinator's job, not a supervisor's. */
  canAllocate: boolean
  /** `items.unlock` — reopening a filed essay. */
  canUnlock: boolean
  staff: EeAssignableStaff[]
  /**
   * THE READER, same as the IA grid's (IB-Reading-and-Marking-Papers.md §3).
   * A student id renders the essay with the marking pane beside it instead of
   * the roster; null renders the roster. It comes off the URL, so the page owns
   * it and this component never has to keep it in sync.
   */
  paperFor?: string | null
  paperBase?: string
  listHref?: string
  canDownload?: boolean
}) {
  const [mineOnly, setMineOnly] = useState(false)
  const unallocated = rows.filter((r) => r.supervisor?.acting).length
  // THE EE COORDINATOR MAY ALSO BE A SUPERVISOR (Michael, 20 Aug). They need
  // both views, so the full list gets a filter rather than a second screen.
  const mine = meId ? rows.filter((r) => r.supervisor?.userId === meId) : []
  const shown = mineOnly ? mine : rows
  // Michael, 20 Aug: no theatre teacher means no theatre EE — a warning the EE
  // coordinator oversees, so it belongs at the top of their list, not buried.
  const needSupervisor = rows.filter((r) => r.unsupportedSubjects.length > 0)

  /**
   * THE ESSAY, WITH ITS MARKING BESIDE IT.
   *
   * Michael, 22 Aug: "Would be good to have a grading view for that as well
   * (click student or file and it opens a grading view)."
   *
   * `EeMarking` MOVED here out of the roster drawer rather than being copied
   * into it. It was always the right pane and always in the wrong place: a
   * supervisor was marking five criteria against an essay they could not see.
   * The drawer keeps what it is actually for — registration, supervisor,
   * the three sessions, the notes.
   *
   * Nothing about EE's marking pane is generic, and it does not need to be.
   * `PaperReader` takes a `pane`, so a module brings its own — which is why the
   * expanding band descriptors and the two attestations survive the move
   * untouched.
   */
  const paperRow = paperFor ? rows.find((r) => r.studentId === paperFor) : null
  if (paperFor && paperBase && listHref) {
    return (
      <>
        <h1>Extended Essay</h1>
        <p className="sub">{cohortLabel} · reading and marking one essay</p>
        <PaperReader
          title="Extended essay"
          criteria={[]}
          markMax={null}
          guide={null}
          accepts={PDF_ONLY}
          exportsToIb
          candidates={rows.map((r) => {
            const sc = summariseScore(r.marks)
            return {
              studentId: r.studentId,
              name: r.studentName,
              sessionNumber: r.sessionNumber,
              file: r.final
                ? {
                    ref: r.final.ref ?? {
                      id: 'ee_' + r.studentId, name: r.final.fileName,
                      mime: 'application/pdf', bytes: 0, key: '',
                      addedAt: r.final.submittedAt,
                    },
                    addedAt: r.final.submittedAt,
                    addedBy: r.studentName,
                    supersededAt: null,
                  }
                : null,
              criterionMarks: r.marks,
              mark: null,
              // The strip's green chip means MARKED, so it has to mean marked —
              // a partial score is not a mark, and `summariseScore` already
              // refuses to total one.
              total: sc.complete ? sc.total : null,
              comment: r.scoring?.comment ?? null,
              locked: r.scoring?.releasedAt != null,
            }
          })}
          currentId={paperFor}
          hrefFor={(id) => paperBase + id}
          closeHref={listHref}
          editable={canWrite}
          canDownload={canDownload}
          paneWidth="wide"
          pane={
            paperRow ? (
              <div className="panel rdpane">
                <div className="panel-h">
                  <h2>Extended essay</h2>
                  <span className="pill grey">/{EE_MARK_MAX}</span>
                  <span className="spacer" />
                  <span className="mut" style={{ fontSize: 11.5 }}>
                    {paperRow.registration?.subjects.map(subjectName).join(' · ') ?? 'not registered'}
                  </span>
                </div>
                {/* WHAT THIS ESSAY IS — at the top, where TOK puts the prompt
                    and the title. The research question is not part of the
                    "record": it is the thing being marked, and a marker reading
                    criterion A ("framework for the essay") is judging the essay
                    AGAINST it. Burying it below the marks was the mistake. */}
                {paperRow.registration ? (
                  <div className="note" style={{ margin: '12px 14px 0' }}>
                    <b>{paperRow.registration.title}</b>
                    <div style={{ marginTop: 4 }}>{paperRow.registration.researchQuestion}</div>
                  </div>
                ) : (
                  <div className="note warn" style={{ margin: '12px 14px 0' }}>
                    Not registered — no subject, title or research question yet.
                  </div>
                )}
                <div className="panel-b">
                  <EeMarking row={paperRow} canMark={canWrite} canRevoke={canRevoke} />
                </div>
              </div>
            ) : undefined
          }
          footer={
            paperRow ? (
              <CandidateRecord
                row={paperRow}
                canWrite={canWrite}
                canUnlock={canUnlock}
              />
            ) : undefined
          }
        />
      </>
    )
  }

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

      {scope === 'all' && mine.length > 0 && (
        <div className="row" style={{ marginBottom: 12 }}>
          <button
            className={`btn sm ${mineOnly ? '' : 'pri'}`}
            onClick={() => setMineOnly(false)}
          >
            Whole cohort ({rows.length})
          </button>
          <button
            className={`btn sm ${mineOnly ? 'pri' : ''}`}
            onClick={() => setMineOnly(true)}
          >
            ★ My supervisees ({mine.length})
          </button>
        </div>
      )}

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

      {scope === 'all' && <HoursSummary rows={rows} />}

      <div className="panel">
        <div className="panel-b" style={{ padding: 0 }}>
          <table className="eeroster">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Supervisor</th>
                <th>Subject</th>
                <th>Sessions</th>
                <th>Essay</th>
                <th>Score</th>
                <th style={{ textAlign: 'right' }}>Hrs</th>
                <th style={{ textAlign: 'right' }}>In</th>
                <th style={{ textAlign: 'right' }}>Late</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Row
                  key={r.studentId}
                  row={r}
                  cohortId={cohortId}
                  canWrite={canWrite}
                  canAllocate={canAllocate}
                  canUnlock={canUnlock}
                  canRevoke={canRevoke}
                  staff={staff}
                  paperBase={paperBase}
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
  row, cohortId, canWrite, canAllocate, canUnlock, canRevoke, staff, paperBase,
}: {
  row: EeRosterRow
  cohortId: string
  canWrite: boolean
  canAllocate: boolean
  canUnlock: boolean
  canRevoke: boolean
  staff: EeAssignableStaff[]
  /** Where the candidate's name points — the reader. Absent = no reader. */
  paperBase?: string
}) {
  const href = paperBase ? paperBase + row.studentId : null
  return (
    <>
      {/* THE ROW DOES NOTHING. Its cells are doors — the name and the essay —
          and everything that used to expand below it now opens with them.
          A row that navigates and a row you type into cannot be the same rule,
          and the IA grid has to type. So: cells are doors, rows are not. */}
      <tr>
        <td>
          {href ? (
            <a
              className="candlink"
              href={href}
              title={row.final ? `Read ${row.final.fileName}` : 'Open this candidate’s essay'}
            >
              <b>{row.studentName}</b>
              <span className="filedoor-x">{row.final ? 'Read ›' : 'Open ›'}</span>
            </a>
          ) : (
            <b>{row.studentName}</b>
          )}
          {row.sessionNumber && <span className="mut"> · {row.sessionNumber}</span>}
        </td>
        {/* ALLOCATION LIVES ON THE LIST, not in a candidate's record: it is
            the coordinator's September job across twenty candidates at once,
            and doing it one reader at a time would be twenty round trips. */}
        <td>
          {canAllocate ? (
            <Allocate row={row} cohortId={cohortId} staff={staff} />
          ) : row.supervisor ? (
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
        <td>
          {(['r1', 'r2', 'viva'] as const).map((st) => (
            <i
              key={st}
              className={`eedot ${row.sessions.some((x) => x.stage === st) ? 'done' : 'not_started'}`}
              style={{ display: 'inline-block', marginRight: 4 }}
              title={st === 'viva' ? 'Viva voce' : `Reflection session ${st.slice(1)}`}
            />
          ))}
        </td>
        {/* THE SECOND DOOR. Michael asked for name OR file, and the EE roster
            had no file cell at all — the essay was only reachable through the
            drawer that has just gone. */}
        <td>
          {href ? (
            <a className="candlink" href={href}>
              {row.final
                ? <span className="mut">{row.final.submittedAt}</span>
                : <span className="pill grey">not filed</span>}
              <span className="filedoor-x">{row.final ? 'Read ›' : 'Open ›'}</span>
            </a>
          ) : row.final ? (
            <span className="mut">{row.final.submittedAt}</span>
          ) : (
            <span className="pill grey">not filed</span>
          )}
        </td>
        <td>
          {row.scoring?.releasedAt ? (
            <span className="pill ok">{summariseScore(row.marks).total}</span>
          ) : summariseScore(row.marks).entered > 0 ? (
            <span className="mut">{summariseScore(row.marks).entered}/5 marked</span>
          ) : (
            <span className="mut">—</span>
          )}
        </td>
        <td style={{ textAlign: 'right' }}>
          {row.scoring?.hoursSupervised ?? <span className="mut">—</span>}
        </td>
        <td style={{ textAlign: 'right' }}>{row.done} / {row.total}</td>
        <td style={{ textAlign: 'right' }}>
          {row.late > 0 ? <span className="pill bad">{row.late}</span> : <span className="mut">—</span>}
        </td>
      </tr>
    </>
  )
}

/**
 * THE CANDIDATE'S RECORD — what used to be the roster drawer.
 *
 * Michael, 22 Aug: "Clicking outside name expands to show progress… we need to
 * make this more clear." The row had two destinations that looked identical,
 * which is the bug we had just fixed on the IA grid.
 *
 * ONE DOOR was the answer rather than a clearer second one. A supervisor does
 * not want the sessions INSTEAD of the essay; they want them beside it. The
 * attestation makes the case on its own: the marking pane asks a supervisor to
 * tick "I held the required reflection sessions", and until now the sessions
 * themselves were behind a different click. An attestation made with its
 * evidence off-screen is worse than an extra scroll.
 *
 * So: the name or the essay opens the reader, the row itself does nothing, and
 * there is no drawer left anywhere in the product. ALLOCATION is the one thing
 * that went the other way — onto the list row — because it is a coordinator's
 * September job across twenty candidates, not something done while reading one.
 */
function CandidateRecord({
  row, canWrite, canUnlock,
}: {
  row: EeRosterRow
  canWrite: boolean
  canUnlock: boolean
}) {
  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panel-h">
        <h2>How it got here</h2>
        <span className="spacer" />
        <span className="mut" style={{ fontSize: 11.5 }}>
          {row.done} of {row.total} in{row.late > 0 ? ` · ${row.late} late` : ''}
        </span>
      </div>
      <div className="panel-b">
        <div className="eedrawer-in">
          {/* TWO KINDS OF THING, and they are labelled as two rather than run
              together: the DOCUMENTS the candidate produced on the way, and the
              THREE CONVERSATIONS the supervisor is about to attest to having
              held. Michael, 22 Aug: "is that right though? to see everything…
              one drawer for all". No — the research question went up beside the
              marks where it is used, and what is left is process evidence. */}
          {/* `Work` brings its own headings — "Process documents" and
              "Finished essay" — so adding a third above them would be a
              heading about headings. */}
          <Work row={row} canUnlock={canUnlock} />

          <span className="caps" style={{ display: 'block', marginTop: 16 }}>
            Reflection sessions
          </span>
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
        </div>
      </div>
    </div>
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
            {/* THE CHIP OPENS IT. Until 22 Aug this row said "(viewing needs
                cloud storage)" and offered nothing — a supervisor could see
                that an essay had been filed and could not check it was the
                right one, which is the hole the reader was built to close.
                MediaViewer says the honest thing about the missing bytes, in
                one place, and starts playing the file the day storage lands. */}
            <FileChip
              file={{
                ref: row.final.ref ?? {
                  id: 'ee_' + row.studentId, name: row.final.fileName,
                  mime: 'application/pdf', bytes: 0, key: '', addedAt: row.final.submittedAt,
                },
                addedAt: row.final.submittedAt,
                addedBy: row.studentName,
                supersededAt: null,
              }}
              canDownload
            />
            {row.finalLocked && <span className="pill ok">🔒 locked</span>}
            <span className="mut" style={{ fontSize: 11.5 }}>
              {row.final.declaredWords.toLocaleString()} words · filed {row.final.submittedAt}
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
    <>
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
    </>
  )
}

// ---------------------------------------------------------------- hours

/**
 * SUPERVISION HOURS BY SUPERVISOR — for the coordinator, and for payroll.
 *
 * Michael, 20 Aug: "The school also needs this for paying teachers (so EE
 * coordinator and IB coordinator also need to see this)." So `missing` is
 * shown as loudly as the total: a payroll run that quietly treats an unlogged
 * candidate as zero hours underpays somebody, and they will notice.
 */
function HoursSummary({ rows }: { rows: EeRosterRow[] }) {
  const [open, setOpen] = useState(false)
  const hours = supervisionHours(rows)
  const total = hours.reduce((n, h) => n + h.hours, 0)
  const missing = hours.reduce((n, h) => n + h.missing, 0)

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Supervision hours</h2>
        <span className="spacer" />
        <span className="mut" style={{ fontSize: 12 }}>
          {total} hours logged
          {missing > 0 && ` · ${missing} candidate${missing === 1 ? '' : 's'} not yet logged`}
        </span>
        <button className="btn sm ghost" onClick={() => setOpen(!open)}>
          {open ? 'hide' : 'by supervisor'}
        </button>
      </div>
      {open && (
        <div className="panel-b" style={{ padding: 0 }}>
          <table className="eeroster">
            <thead>
              <tr>
                <th>Supervisor</th>
                <th style={{ textAlign: 'right' }}>Candidates</th>
                <th style={{ textAlign: 'right' }}>Hours</th>
                <th style={{ textAlign: 'right' }}>Not logged</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h.supervisorId}>
                  <td>{h.name}</td>
                  <td style={{ textAlign: 'right' }}>{h.students}</td>
                  <td style={{ textAlign: 'right' }}><b>{h.hours}</b></td>
                  <td style={{ textAlign: 'right' }}>
                    {h.missing > 0
                      ? <span className="pill warn">{h.missing}</span>
                      : <span className="mut">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
