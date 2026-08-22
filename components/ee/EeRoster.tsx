'use client'

// THE STAFF VIEW — supervisees for a supervisor, the cohort for `ee.manage`.
//
// Scope is decided in the repository (`getRoster`'s `forUserId`), not here. A
// component that decides who may see whom is a component that can forget to.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { EeRosterRow, SessionStage } from '@/lib/ee/types'
import { subjectName } from '@/lib/ee/subjects'
import {
  addSessionNote, assignSupervisor, recordSession, returnFinal, unlockFinal,
} from '@/lib/ee/actions'
import type { EeAssignableStaff } from '@/lib/ee/types'
import EeMarking from './EeMarking'
import PaperReader from '../reader/PaperReader'
import { summariseScore, supervisionHours } from '@/lib/ee/scoring'
import { nextStep, processSteps, type EeStep } from '@/lib/ee/derive'
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
  paperFor, paperBase, listHref, canDownload = false, mode = 'process',
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
  /**
   * WHICH OF THE TWO JOBS you are doing on this candidate.
   *
   * Michael, 22 Aug: *"We need two views: a process mode and grading mode."*
   * They are sequential rather than simultaneous — marking cannot start until
   * the essay is filed, so before November grading mode is empty BY
   * CONSTRUCTION. The page defaults the mode from the candidate's own state,
   * so nobody ever arrives in the empty one.
   */
  mode?: 'process' | 'grade'
}) {
  const [mineOnly, setMineOnly] = useState(false)
  // The reader's return runs from here rather than from a nested component,
  // because the message belongs above the reader where it can be read.
  const [returnMsg, setReturnMsg] = useState<string | null>(null)
  const [returning, startReturn] = useTransition()
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
        <p className="sub">
          {cohortLabel} · {paperRow?.studentName ?? ''}
        </p>
        {returnMsg && <div className="note warn">{returnMsg}</div>}
        {/* THE STRIP IS ABOVE THE SWITCH ON PURPOSE. Changing candidate keeps
            the mode you are working in — six candidates in process mode in
            September, the same six in grading mode in February — so the mode
            belongs to the SESSION of work, not to the candidate. */}
        <nav className="modeseg">
          <a className={mode === 'process' ? 'on' : ''} href={`${paperBase}${paperFor}&mode=process`}>
            Process
            <span className="cnt">
              {paperRow ? processSteps(paperRow).filter((x) => x.done).length : 0}/7
            </span>
          </a>
          <a
            className={`${mode === 'grade' ? 'on' : ''}${paperRow?.final ? '' : ' shut'}`}
            href={`${paperBase}${paperFor}&mode=grade`}
          >
            Grading
            <span className="cnt">
              {paperRow?.final ? `${summariseScore(paperRow.marks).entered}/5` : '—'}
            </span>
          </a>
        </nav>
        {mode === 'process' && paperRow ? (
          <EeProcess
            row={paperRow}
            canWrite={canWrite}
            canUnlock={canUnlock}
            gradeHref={`${paperBase}${paperFor}&mode=grade`}
          />
        ) : (
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
              returned: r.returned,
              locked: r.scoring?.releasedAt != null,
            }
          })}
          currentId={paperFor}
          hrefFor={(id) => paperBase + id}
          closeHref={listHref}
          editable={canWrite}
          canDownload={canDownload}
          pending={returning}
          onReturn={(studentId, note) =>
            startReturn(async () => {
              const res = await returnFinal(studentId, note)
              setReturnMsg(res.ok ? null : res.message)
            })
          }
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
            paperRow && !paperRow.final ? (
              <div className="note gold">
                <b>Nothing to grade yet — the essay is not filed.</b> Criteria A–D open the day it is;
                E opens when the reflection statement is in.
              </div>
            ) : undefined
          }
        />
        )}
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
                {/* ONE COLUMN, SEVEN DOTS, IN THE ORDER THE WORK HAPPENS.
                    Replaces "Sessions", "In 3/10" and "Late" — Michael, 22 Aug:
                    "show what is submitted more clearly… remove late".

                    `In 3/10` was a number nobody could act on and `Late`
                    repeated what a dot already says. THE FIRST EMPTY DOT IS THE
                    NEXT THING OWED, which is the question a supervisor actually
                    has: whose essay can I mark, and who do I need to sit down
                    with. */}
                <th>Outline · S1 · Draft · S2 · Essay · Viva · RPF</th>
                <th>Score</th>
                <th style={{ textAlign: 'right' }}>Hrs</th>
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
  const router = useRouter()
  const href = paperBase ? paperBase + row.studentId : null
  const steps = processSteps(row)
  const next = nextStep(steps)

  return (
    <>
      {/* THE WHOLE ROW IS THE DOOR. Michael, 22 Aug: "make the whole row the
          door." It works here because there is now exactly ONE destination —
          the drawer is gone, so nothing is ambiguous.

          IT CANNOT BE THE RULE EVERYWHERE, and that is not an inconsistency to
          tidy away later: the IA grid has criterion INPUTS in its cells, and a
          row that navigates cannot also be a row you type into. So the rule is
          "a row with nothing editable in it is itself the door; where cells are
          editable, the name and the file cell are." Written down here because
          somebody will otherwise 'fix' the difference.

          The name stays a real <a> so the keyboard, middle-click and
          open-in-new-tab all still work — the row handler is an accelerator on
          top of a link, not a replacement for one. */}
      <tr
        className={href ? 'eerow-door' : undefined}
        onClick={href ? () => router.push(href) : undefined}
      >
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
        {/* The allocation select is the one thing in the row you interact with
            rather than navigate through, so it swallows the click. */}
        <td onClick={(e) => e.stopPropagation()}>
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
          <div className="eesteps">
            {steps.map((st) => (
              <i
                key={st.key}
                className={`eedot ${st.done ? 'done' : 'not_started'}${st.key === next?.key ? ' next' : ''}`}
                title={
                  st.done
                    ? `${st.label} — in ${st.at}`
                    : `${st.label} — not in · ${st.owner === 'student' ? 'the candidate' : 'you'}`
                }
              />
            ))}
          </div>
          {/* WHOSE TURN IT IS, in words, because a ring is not a sentence. No
              count and no ranking: this says what is next, it does not say who
              is behind. */}
          <div className="mut eenext">
            {next
              ? `${next.owner === 'student' ? 'waiting on them' : 'your turn'} · ${next.label.toLowerCase()}`
              : 'everything in'}
          </div>
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
      </tr>
    </>
  )
}

/**
 * PROCESS MODE — the supervisor's job from September to November.
 *
 * Michael, 22 Aug: *"needs to see the outline before the first meeting, needs
 * to see the draft before the second… needs to see these as well to attest…
 * we NEED the process screen as well. The student screen is perfect. We need
 * that info to go to the teacher though."*
 *
 * So this is `StudentEe` read from the other end: the same seven steps in the
 * same order, from the same derivation (`processSteps`), with staff
 * affordances instead of student ones — the teacher records a meeting and
 * corrects its date; the student pastes the links and files the PDF.
 *
 * ONE COLUMN, NOT A SPLIT. Everything here is a link, a date or a note. The
 * outline and the draft are Google Docs and open in Drive, where the commenting
 * actually happens — there is nothing for a paper pane to show, so there is no
 * paper pane. Grading mode is the split, because there the paper is the point.
 *
 * IN ORDER, AND INTERLEAVED. You read the outline TO HAVE the first meeting and
 * the draft TO HAVE the second, so documents and meetings alternate. Each step
 * that is not in says what it is FOR rather than merely that it is missing.
 */
function EeProcess({
  row, canWrite, canUnlock, gradeHref,
}: {
  row: EeRosterRow
  canWrite: boolean
  canUnlock: boolean
  gradeHref: string
}) {
  const steps = processSteps(row)
  const next = nextStep(steps)
  const done = steps.filter((s) => s.done).length

  return (
    <>
      {row.registration ? (
        <div className="note" style={{ marginBottom: 14 }}>
          <b>{row.registration.title}</b>
          <div style={{ marginTop: 4 }}>{row.registration.researchQuestion}</div>
        </div>
      ) : (
        <div className="note warn" style={{ marginBottom: 14 }}>
          Not registered — no subject, title or research question yet. Nothing else can start until
          this is in.
        </div>
      )}

      <div className="panel">
        <div className="panel-h">
          <h2>The process</h2>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 11.5 }}>
            {done} of 7 in
            {next ? ` · next: ${next.label.toLowerCase()}` : ' · everything in'}
          </span>
        </div>
        <div className="panel-b">
          <div className="eespine">
            <Step
              step={steps[0]}
              next={next}
              body={
                row.links.find((l) => l.stage === 'outline') ? (
                  <LinkLine link={row.links.find((l) => l.stage === 'outline')!} />
                ) : (
                  <div className="eeowed">
                    Nothing pasted yet. <b>You need this before the first meeting</b> — it is what
                    the meeting is about.
                  </div>
                )
              }
            />
            <StepSession step={steps[1]} next={next} row={row} stage="r1" canWrite={canWrite} />
            <Step
              step={steps[2]}
              next={next}
              body={
                row.links.find((l) => l.stage === 'draft') ? (
                  <LinkLine link={row.links.find((l) => l.stage === 'draft')!} note="the one draft you may comment on" />
                ) : (
                  <div className="eeowed">
                    <b>You need this before the second meeting.</b> The IB permits written or oral
                    comments on exactly one draft.
                  </div>
                )
              }
            />
            <StepSession step={steps[3]} next={next} row={row} stage="r2" canWrite={canWrite} />
            <Step
              step={steps[4]}
              next={next}
              body={<Work row={row} canUnlock={canUnlock} bare />}
            />
            <StepSession step={steps[5]} next={next} row={row} stage="viva" canWrite={canWrite} />
            <Step
              step={steps[6]}
              next={next}
              body={
                row.rpf ? (
                  <div className="eerpf">
                    <div className="eenote-h">
                      {row.rpf.words} words · submitted {row.rpf.submittedAt}
                    </div>
                    {row.rpf.body}
                  </div>
                ) : (
                  <div className="eeowed">
                    Unlocks for the candidate once the viva is recorded.{' '}
                    <b>Criterion E cannot be marked until it is in.</b>
                  </div>
                )
              }
            />
          </div>
        </div>
        {row.final && (
          <div className="panel-b" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <a className="btn pri" href={gradeHref}>Read and mark the essay ›</a>
          </div>
        )}
      </div>
    </>
  )
}

function Step({
  step, next, body,
}: {
  step: EeStep
  next: EeStep | null
  body: React.ReactNode
}) {
  const state = step.done ? 'done' : step.key === next?.key ? 'now' : ''
  return (
    <div className={`eestep ${state}`}>
      <div className="eestep-h">
        <b>{step.label}</b>
        {step.done ? (
          <span className="pill ok">in {step.at}</span>
        ) : (
          <span className="pill grey">
            {step.owner === 'student' ? 'waiting on the candidate' : 'your turn'}
          </span>
        )}
      </div>
      <div className="eestep-b">{body}</div>
    </div>
  )
}

/** A meeting — the existing SessionRow, wearing the spine's chrome. */
function StepSession({
  step, next, row, stage, canWrite,
}: {
  step: EeStep
  next: EeStep | null
  row: EeRosterRow
  stage: SessionStage
  canWrite: boolean
}) {
  const held = row.sessions.find((x) => x.stage === stage)
  const notes = row.notes.filter((n) => n.stage === stage)
  return (
    <div className={`eestep ${step.done ? 'done' : step.key === next?.key ? 'now' : ''}`}>
      <SessionRow
        studentId={row.studentId}
        stage={stage}
        label={step.label}
        heldOn={held?.heldOn ?? null}
        onBehalf={held?.onBehalf}
        notes={notes}
        canWrite={canWrite}
      />
    </div>
  )
}

function LinkLine({
  link, note,
}: {
  link: { stage: 'outline' | 'draft'; label: string; href: string; addedAt: string }
  note?: string
}) {
  return (
    <div className="eelinkrow">
      <a href={link.href} target="_blank" rel="noreferrer">open in Drive ↗</a>
      <span className="mut" style={{ fontSize: 11.5 }}>added {link.addedAt}</span>
      {note && <span className="mut" style={{ fontSize: 11.5 }}>— {note}</span>}
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

function Work({
  row, canUnlock, bare,
}: {
  row: EeRosterRow
  canUnlock: boolean
  /**
   * In the SPINE the outline and the draft are steps of their own, and this
   * component's own headings would repeat them — the outline was rendering
   * twice, once as its own step and once inside "Finished essay". `bare` drops
   * the links and the heading and leaves the filed PDF, which is what the step
   * it sits in is about.
   */
  bare?: boolean
}) {
  const [reason, setReason] = useState('')
  const [asking, setAsking] = useState(false)
  const [pending, start] = useTransition()

  return (
    <div className="eework">
      {!bare && (
        <>
          <span className="caps">Process documents</span>
          {row.links.length === 0 && (
            <p className="mut" style={{ margin: '4px 0 0' }}>Nothing filed yet.</p>
          )}
          {row.links.map((l) => (
            <div key={l.stage} className="eelinkrow">
              <span className="eelinkrow-l">{l.stage === 'outline' ? 'Outline' : 'Full draft'}</span>
              <a href={l.href} target="_blank" rel="noreferrer">open ↗</a>
              <span className="mut" style={{ fontSize: 11.5 }}>{l.addedAt}</span>
            </div>
          ))}
          <span className="caps" style={{ display: 'block', marginTop: 10 }}>Finished essay</span>
        </>
      )}
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
      ) : row.returned ? (
        /* NOT THE SAME AS "not filed". This candidate filed something and it
           went back — with a sentence, which is the thing the supervisor
           standing here needs to be reminded they wrote. */
        <div className="note warn" style={{ marginTop: 4 }}>
          <b>Returned to the student</b> — {row.returned.fileName}, sent back by{' '}
          {row.returned.byName}.
          <div style={{ marginTop: 4 }}>{row.returned.note}</div>
        </div>
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
