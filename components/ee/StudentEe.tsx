'use client'

// MY EXTENDED ESSAY.
//
// The checkpoints come from getTrack, not from the EE repository. The moment
// this screen computes its own view of what a student owes it can disagree with
// the coordinator board, and one of them will be wrong in March.
//
// COMPACTED 20 Aug on Michael's note — "I like the 'where you are' but it takes
// up too much space… a bit too much information." The track is now one row per
// requirement with no explanatory prose: a student who has been told what an
// outline is does not need telling again every time they open the page. The
// long-form guidance moved to the panel that needs it, once.

import { useState, useTransition } from 'react'
import ReturnedNote from '../ReturnedNote'
import type { Checkpoint } from '@/lib/types'
import type { EeSessionNote, EeStudentView, SessionStage } from '@/lib/ee/types'
import { EE_CRITERIA, INTERDISCIPLINARY_FRAMEWORKS, WORD_COUNT_RULES, WORD_LIMIT } from '@/lib/ee/rubric'
import { DP_SUBJECTS, GROUP_NAMES, subjectName } from '@/lib/ee/subjects'
import {
  addSessionNote, saveRegistration, setLink, submitFinal, submitRpf,
} from '@/lib/ee/actions'
import { countWords } from '@/lib/ee/scoring'

/** The statement's own limit — the essay's 4,000 is a different number. */
const RPF_LIMIT = 500
import { subjectWarnings } from '@/lib/ee/registration'

const SESSIONS: { stage: SessionStage; label: string; key: string }[] = [
  { stage: 'r1', label: 'Reflection session 1', key: 'ee.r1' },
  { stage: 'r2', label: 'Reflection session 2', key: 'ee.r2' },
  { stage: 'viva', label: 'Viva voce · session 3', key: 'ee.viva' },
]

export default function StudentEe({
  view,
  checkpoints,
}: {
  view: EeStudentView
  checkpoints: Checkpoint[]
}) {
  const done = checkpoints.filter((c) => c.display === 'done').length

  return (
    <>
      <h1>My Extended Essay</h1>
      <p className="sub">
        {view.supervisor ? (
          <>
            Supervisor: <b>{view.supervisor.name}</b>
            {view.supervisor.acting && (
              <span className="pill grey" style={{ marginLeft: 8 }}>
                not allocated yet
              </span>
            )}
          </>
        ) : (
          'No supervisor yet.'
        )}
        {' · '}
        {done} of {checkpoints.length} recorded
      </p>

      {/* ---- the track: one compact row each, no prose ------------------- */}
      <div className="panel">
        <div className="panel-b eecompact">
          {checkpoints.map((c) => {
            const link = c.state?.artifacts.find((a) => a.kind === 'link')
            return (
              <div key={c.def.key} className={`eerow ${c.display}`}>
                <i className={`eedot ${c.display}`} />
                <span className="eerow-l">{c.def.label}</span>
                <span className="spacer" />
                {link?.href && (
                  <a className="eerow-a" href={link.href} target="_blank" rel="noreferrer">
                    open ↗
                  </a>
                )}
                {c.display === 'future' && <span className="pill grey">locked</span>}
                {c.due?.late && <span className="pill bad">overdue</span>}
                {c.due && !c.due.late && <span className="eerow-d mut">{c.due.dueAt}</span>}
                {c.state?.recordedAt && c.display === 'done' && (
                  <span className="eerow-d mut">{c.state.recordedAt}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Registration view={view} />

      <LinkPanel
        studentId={view.studentId}
        stage="outline"
        label="Outline"
        checkpoint={checkpoints.find((c) => c.def.key === 'ee.outline')}
      />
      <LinkPanel
        studentId={view.studentId}
        stage="draft"
        label="Full draft"
        checkpoint={checkpoints.find((c) => c.def.key === 'ee.draft')}
      />

      {/* DIRECTLY UNDER THE DRAFT, and before the sessions — the order on this
          page is the order of the work, and the finished PDF comes in before
          the viva so the supervisor can read it first. */}
      <FinalPanel view={view} checkpoint={checkpoints.find((c) => c.def.key === 'ee.final')} />

      <Sessions view={view} checkpoints={checkpoints} />
      <RpfPanel view={view} />
      <ReleasedScore view={view} />
    </>
  )
}

// ---------------------------------------------------------------- registration

function Registration({ view }: { view: EeStudentView }) {
  const reg = view.registration
  const [subjects, setSubjects] = useState<string[]>(reg?.subjects ?? [])
  const [framework, setFramework] = useState(reg?.framework ?? '')
  const [rq, setRq] = useState(reg?.researchQuestion ?? '')
  const [title, setTitle] = useState(reg?.title ?? '')
  const [problems, setProblems] = useState(view.problems)
  const [saved, setSaved] = useState(false)
  const [second, setSecond] = useState(Boolean(reg && reg.subjects.length === 2))
  const [pending, start] = useTransition()

  const complete = reg != null && problems.length === 0
  const problemFor = (f: string) => problems.find((p) => p.field === f)?.message
  // Computed from what is CURRENTLY chosen, not from what was saved — a student
  // should see this while deciding, not after committing.
  const warnings = subjectWarnings(
    (second ? subjects.slice(0, 2) : subjects.slice(0, 1)).filter(Boolean),
    view.supportedSubjects,
  )

  const setAt = (i: number, value: string) =>
    setSubjects((prev) => {
      const next = [...prev]
      if (value) next[i] = value
      else next.splice(i, 1)
      return next.filter(Boolean)
    })

  const save = () =>
    start(async () => {
      const r = await saveRegistration(view.studentId, {
        subjects: second ? subjects.slice(0, 2) : subjects.slice(0, 1),
        framework: second ? framework : null,
        researchQuestion: rq,
        title,
      })
      setProblems(r.problems)
      setSaved(r.ok)
    })

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Registration</h2>
        <span className="spacer" />
        {complete && <span className="pill ok">complete</span>}
      </div>
      <div className="panel-b">
        <div className="eetwo">
          <div>
            <label className="fld">Subject</label>
            <SubjectSelect
              value={subjects[0] ?? ''}
              likely={view.likelySubjects}
              supported={view.supportedSubjects}
              onChange={(v) => setAt(0, v)}
            />
          </div>
          <div>
            <label className="fld">
              <input
                type="checkbox"
                checked={second}
                onChange={(e) => setSecond(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Interdisciplinary — a second subject
            </label>
            {second && (
              <SubjectSelect
                value={subjects[1] ?? ''}
                likely={view.likelySubjects}
                supported={view.supportedSubjects}
                onChange={(v) => setAt(1, v)}
              />
            )}
          </div>
        </div>
        {problemFor('subjects') && <div className="note warn">{problemFor('subjects')}</div>}
        {warnings.map((w) => (
          <div key={w.subject} className="note" style={{ marginTop: 8 }}>
            <b>{subjectName(w.subject)}:</b> {w.message}
          </div>
        ))}

        {second && (
          <div style={{ marginTop: 10 }}>
            <label className="fld">Framework — required, and named on your title page</label>
            <select value={framework} onChange={(e) => setFramework(e.target.value)}>
              <option value="">Choose a framework…</option>
              {INTERDISCIPLINARY_FRAMEWORKS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            {problemFor('framework') && <div className="note warn">{problemFor('framework')}</div>}
          </div>
        )}

        <label className="fld" style={{ marginTop: 12 }}>Research question</label>
        <textarea rows={2} value={rq} onChange={(e) => setRq(e.target.value)} />
        {problemFor('researchQuestion') && (
          <div className="note warn">{problemFor('researchQuestion')}</div>
        )}

        <label className="fld" style={{ marginTop: 10 }}>Title</label>
        <textarea rows={2} value={title} onChange={(e) => setTitle(e.target.value)} />
        {problemFor('title') && <div className="note warn">{problemFor('title')}</div>}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn pri" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save registration'}
          </button>
          {saved && <span className="mut">Saved.</span>}
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            Subject, question and title all appear on your title page.
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Every DP subject, not just the ones this school timetables — an essay can be
 * registered in a subject the student does not take. Their own subjects sit at
 * the top as a shortcut, and the rest of the programme is underneath.
 */
function SubjectSelect({
  value,
  likely,
  supported,
  onChange,
}: {
  value: string
  likely: string[]
  /** Subjects somebody here teaches. Annotates the list; never filters it. */
  supported: string[]
  onChange: (v: string) => void
}) {
  const rest = DP_SUBJECTS.filter((s) => !likely.includes(s.key))
  const groups = [...new Set(rest.map((s) => s.group))].sort()
  const have = new Set(supported)
  // The annotation matters more than the warning underneath: a student should
  // learn this while scanning the list, not after committing to a choice.
  const label = (key: string, name: string) =>
    have.has(key) ? name : `${name} — no supervisor here yet`
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a subject…</option>
      {likely.length > 0 && (
        <optgroup label="Your subjects">
          {likely.map((k) => (
            <option key={k} value={k}>{label(k, subjectName(k))}</option>
          ))}
        </optgroup>
      )}
      {groups.map((g) => (
        <optgroup key={g} label={GROUP_NAMES[g]}>
          {rest.filter((s) => s.group === g).map((s) => (
            <option key={s.key} value={s.key}>{label(s.key, s.name)}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

// ---------------------------------------------------------------- links

function LinkPanel({
  studentId, stage, label, checkpoint,
}: {
  studentId: string
  stage: 'outline' | 'draft'
  label: string
  checkpoint?: Checkpoint
}) {
  const current = checkpoint?.state?.artifacts.find((a) => a.kind === 'link')
  const [href, setHref] = useState(current?.href ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>{label}</h2>
        <span className="spacer" />
        {current && <span className="pill ok">in</span>}
        {checkpoint?.due && (
          <span className="mut" style={{ fontSize: 12 }}>due {checkpoint.due.dueAt}</span>
        )}
      </div>
      <div className="panel-b">
        <div className="row">
          <input
            type="text"
            value={href}
            placeholder="https://docs.google.com/document/d/…"
            onChange={(e) => setHref(e.target.value)}
          />
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => setMessage((await setLink(studentId, stage, href, label)).message))
            }
          >
            {current ? 'Replace' : 'Save link'}
          </button>
        </div>
        <p className="mut" style={{ fontSize: 12, margin: '8px 0 0' }}>
          Share it first: <b>Anyone at International Schools Group with the link → Viewer</b>.
        </p>
        {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- sessions

function Sessions({ view, checkpoints }: { view: EeStudentView; checkpoints: Checkpoint[] }) {
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Reflection sessions</h2>
        <span className="spacer" />
        <span className="mut" style={{ fontSize: 12 }}>
          {view.sessions.length} of 3 held
        </span>
      </div>
      <div className="panel-b">
        {SESSIONS.map((s) => {
          const held = view.sessions.find((x) => x.stage === s.stage)
          const notes = view.notes.filter((n) => n.stage === s.stage)
          return (
            <SessionBlock
              key={s.stage}
              studentId={view.studentId}
              stage={s.stage}
              label={s.label}
              heldOn={held?.heldOn ?? null}
              onBehalf={held?.onBehalf}
              notes={notes}
              locked={checkpoints.find((c) => c.def.key === s.key)?.display === 'future'}
            />
          )
        })}
      </div>
    </div>
  )
}

function SessionBlock({
  studentId, stage, label, heldOn, onBehalf, notes, locked,
}: {
  studentId: string
  stage: SessionStage
  label: string
  heldOn: string | null
  onBehalf?: boolean
  notes: EeSessionNote[]
  locked: boolean
}) {
  const [body, setBody] = useState('')
  const [pending, start] = useTransition()

  return (
    <div className="eesession">
      <div className="eerow-l" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className={`eedot ${heldOn ? 'done' : locked ? 'future' : 'not_started'}`} />
        <b>{label}</b>
        {heldOn ? (
          <span className="pill ok">held {heldOn}</span>
        ) : (
          <span className="mut" style={{ fontSize: 12 }}>not yet recorded by your supervisor</span>
        )}
        {onBehalf && (
          <span className="pill grey" title="Filed by a coordinator, not by the supervisor">
            recorded on the supervisor’s behalf
          </span>
        )}
      </div>

      {notes.map((n) => (
        <div key={n.id} className={`eenote ${n.authorType}`}>
          <div className="eenote-h">
            {n.authorName}
            <span className="mut"> · {n.createdAt}</span>
          </div>
          {n.body}
        </div>
      ))}

      <div className="row" style={{ marginTop: 6 }}>
        <input
          type="text"
          value={body}
          placeholder="Add a note about this session (optional) — your supervisor will see it"
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          className="btn sm"
          disabled={pending || !body.trim()}
          onClick={() =>
            start(async () => {
              await addSessionNote(studentId, stage, body)
              setBody('')
            })
          }
        >
          Add
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- final PDF

/**
 * THE FINISHED ESSAY.
 *
 * Why a PDF and not another Google Doc link, in the student's own terms: a link
 * is a live document. Filing a PDF fixes the paper, so the essay the supervisor
 * reads before the viva is the essay that is marked afterwards. Filing is what
 * locks it — there is no separate lock button.
 */
function FinalPanel({ view, checkpoint }: { view: EeStudentView; checkpoint?: Checkpoint }) {
  // A REAL PICKER against a stubbed store — the CAS pattern. The bytes go
  // nowhere yet; which file, of what type, how big and filed when are real.
  const [file, setFile] = useState<File | null>(null)
  const [words, setWords] = useState(view.final ? String(view.final.declaredWords) : '')
  const [decl, setDecl] = useState({ anonymous: false, underLimit: false })
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const filed = view.final != null
  const locked = view.finalLocked

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Finished essay (PDF)</h2>
        <span className="spacer" />
        {locked && <span className="pill ok">🔒 filed and locked</span>}
        {!filed && checkpoint?.due && (
          <span className="mut" style={{ fontSize: 12 }}>due {checkpoint.due.dueAt}</span>
        )}
      </div>
      <div className="panel-b">
        <div className="note" style={{ marginBottom: 10 }}>
          <b>This goes in before your viva voce.</b> Your supervisor reads it to prepare, and
          filing it fixes the paper — so the essay they read is the essay that gets marked. It
          cannot be changed afterwards without your EE coordinator reopening it.
        </div>

        {locked ? (
          <>
            <p style={{ marginTop: 0 }}>
              <b>{view.final!.fileName}</b> · {view.final!.declaredWords.toLocaleString()} words ·
              filed {view.final!.submittedAt}
            </p>
            {view.final!.unlockReason && (
              <div className="note warn">
                Reopened by {view.final!.unlockedByName} on {view.final!.unlockedAt} —{' '}
                {view.final!.unlockReason}
              </div>
            )}
          </>
        ) : (
          <>
            <ReturnedNote view={view.returned} what="essay" />
            <div className="note gold" style={{ marginBottom: 10 }}>
              <b>Cloud storage is not connected yet, so the file itself is not kept.</b> Everything
              else is real and permanent: which file you filed, of what type and size, when, and
              that it is locked. The automatic check for your name, the school or your supervisor
              needs to read the PDF, so that one is waiting too — for now it is your own check.
            </div>

            <div className="eetwo">
              <div>
                <label className="fld">Your finished essay — PDF only</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && (
                  <p className="mut" style={{ fontSize: 12, margin: '6px 0 0' }}>
                    {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
              </div>
              <div>
                <label className="fld">Word count — you count it, before you file</label>
                <input
                  type="number"
                  value={words}
                  placeholder="3800"
                  onChange={(e) => setWords(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <span className="caps">Before you file</span>
              <label className="eecheck">
                <input
                  type="checkbox"
                  checked={decl.anonymous}
                  onChange={(e) => setDecl({ ...decl, anonymous: e.target.checked })}
                />
                My name, candidate number, school and supervisor appear nowhere in the PDF
              </label>
              <label className="eecheck">
                <input
                  type="checkbox"
                  checked={decl.underLimit}
                  onChange={(e) => setDecl({ ...decl, underLimit: e.target.checked })}
                />
                The essay is under {WORD_LIMIT.toLocaleString()} words
              </label>
            </div>

            <div className="note ok" style={{ marginTop: 12 }}>
              <b>You do not need your candidate personal code on this.</b> The IB issues codes in
              the new year, long after this is due, and the code is added automatically when your
              coordinator exports for the IB. You will never be asked to take this back, add a code
              and re-upload it.
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn pri"
                disabled={pending || !file}
                onClick={() =>
                  start(async () => {
                    if (!file) return
                    const r = await submitFinal(
                      view.studentId,
                      {
                        name: file.name,
                        mime: file.type || 'application/octet-stream',
                        bytes: file.size,
                      },
                      Number(words),
                      decl,
                    )
                    setMessage(r.message)
                  })
                }
              >
                {pending ? 'Filing…' : '⤒ Upload and lock'}
              </button>
              <span className="mut" style={{ fontSize: 12 }}>
                This locks the paper. Your viva voce opens once it is in.
              </span>
            </div>
            {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- RPF

/**
 * ALWAYS VISIBLE, so a student knows it is coming; writable only once the viva
 * is recorded. Michael, 20 Aug. The lock is `opensAfter: ee.viva` in the spine,
 * and the way a coordinator opens it for a student whose supervisor has not
 * filed the meeting is to RECORD THE MEETING — not to override the gate.
 */
function RpfPanel({ view }: { view: EeStudentView }) {
  const [body, setBody] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const words = countWords(body)
  const over = words > RPF_LIMIT

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Reflection statement (RPF)</h2>
        <span className="spacer" />
        {view.rpf ? (
          <span className="pill ok">🔒 submitted {view.rpf.submittedAt}</span>
        ) : view.rpfOpen ? (
          <span className="pill info">open</span>
        ) : (
          <span className="pill grey">🔒 unlocks after your viva voce</span>
        )}
      </div>
      <div className="panel-b">
        {view.rpf ? (
          <>
            <p className="mut" style={{ marginTop: 0, fontSize: 12 }}>
              {view.rpf.words} words · locked. Your supervisor reads this to mark Criterion E.
            </p>
            <div className="eerpf">{view.rpf.body}</div>
          </>
        ) : (
          <>
            {!view.rpfOpen && (
              <div className="note" style={{ marginBottom: 10 }}>
                This opens as soon as your supervisor records your viva voce. If the viva has
                happened and this is still locked, tell your EE coordinator — they can record it.
              </div>
            )}
            <p className="mut" style={{ marginTop: 0 }}>
              <b>One</b> statement, up to <b>{RPF_LIMIT} words</b>, written after the viva. It is
              Criterion E — 4 of the 30 marks. Write it in a Doc and paste it here. It is{' '}
              <b>not</b> part of your {WORD_LIMIT.toLocaleString()}-word essay limit.
            </p>
            <div className="mut" style={{ fontSize: 12, marginBottom: 6 }}>
              What it is for: how your thinking changed, which skills transfer, what you would do
              differently — not a summary of what you did.
            </div>
            <textarea
              rows={8}
              value={body}
              disabled={!view.rpfOpen}
              placeholder={view.rpfOpen ? 'Paste your statement…' : 'Opens after your viva voce…'}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="row" style={{ marginTop: 6 }}>
              <span className={over ? 'pill bad' : 'mut'} style={{ fontSize: 12 }}>
                {words} / {RPF_LIMIT} words
              </span>
              <span className="spacer" />
              <button
                className="btn pri"
                disabled={pending || !view.rpfOpen || words === 0 || over}
                onClick={() =>
                  start(async () => setMessage((await submitRpf(view.studentId, body)).message))
                }
              >
                Submit and lock
              </button>
            </div>
            <p className="mut" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
              Submitting locks it — your supervisor marks Criterion E from it, so it cannot change
              after they have read it.
            </p>
            {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- released score

function ReleasedScore({ view }: { view: EeStudentView }) {
  if (!view.releasedScore) return null
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Your score</h2>
        <span className="spacer" />
        <span className="pill ok">
          {view.releasedScore.total} / 30
          {view.releasedScore.band ? ` · indicative ${view.releasedScore.band}` : ''}
        </span>
      </div>
      <div className="panel-b">
        <div className="eecrit-s">
          {EE_CRITERIA.map((c, i) => (
            <span key={c.key} style={{ marginRight: 14 }}>
              <b>{c.key}</b> {view.releasedScore!.marks[i] ?? '—'}/{c.max}
            </span>
          ))}
        </div>
        <p className="mut" style={{ fontSize: 12, marginBottom: 0 }}>
          This is your school&rsquo;s predicted mark. The IB marks the essay itself and sets its own
          grade boundaries, so your final grade can differ.
        </p>
      </div>
    </div>
  )
}
