'use client'

// MY EXTENDED ESSAY — the student's own screen.
//
// It renders the SAME checkpoints the coordinator board and the student track
// render, passed in from getTrack rather than fetched separately. That is
// deliberate: the moment this screen computes its own view of what a student
// owes, it can disagree with the board, and one of them will be wrong in March.

import { useState, useTransition } from 'react'
import type { Checkpoint } from '@/lib/types'
import type { EeStudentView } from '@/lib/ee/types'
import { INTERDISCIPLINARY_FRAMEWORKS, WORD_COUNT_RULES, WORD_LIMIT } from '@/lib/ee/rubric'
import { saveRegistration, setLink } from '@/lib/ee/actions'

const STAGE_NOTE: Record<string, string> = {
  'ee.rq': 'Your subject, research question and title. These go on the title page.',
  'ee.outline': 'A Google Doc link. Share it so your supervisor can open it.',
  'ee.r1': 'Recorded by your supervisor after your first reflection session.',
  'ee.draft': 'A Google Doc link, discussed at reflection session 2.',
  'ee.r2': 'Recorded by your supervisor after your second reflection session.',
  'ee.final': 'The finished PDF, uploaded here.',
  'ee.viva': 'Your concluding interview — reflection session 3.',
  'ee.rpf': 'One reflection of up to 500 words, written after the viva.',
  'ee.attest': 'Your supervisor confirms the sessions were held and the work is your own.',
  'ee.score': 'Marked by your supervisor and released when it is ready.',
}

function Dot({ display }: { display: Checkpoint['display'] }) {
  const cls =
    display === 'done' ? 'ok' : display === 'partial' ? 'warn' : display === 'future' ? 'future' : 'grey'
  return <i className={`eedot ${cls}`} />
}

export default function StudentEe({
  view,
  checkpoints,
}: {
  view: EeStudentView
  /** The Extended Essay lane, straight off getTrack. */
  checkpoints: Checkpoint[]
}) {
  const reg = view.registration
  const [subjects, setSubjects] = useState<string[]>(reg?.subjects ?? [])
  const [framework, setFramework] = useState(reg?.framework ?? '')
  const [rq, setRq] = useState(reg?.researchQuestion ?? '')
  const [title, setTitle] = useState(reg?.title ?? '')
  const [problems, setProblems] = useState(view.problems)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const interdisciplinary = subjects.length === 2

  const toggleSubject = (id: string) =>
    setSubjects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? prev : [...prev, id],
    )

  const save = () =>
    start(async () => {
      const r = await saveRegistration(view.studentId, {
        subjects,
        framework: interdisciplinary ? framework : null,
        researchQuestion: rq,
        title,
      })
      setProblems(r.problems)
      setSaved(r.ok)
    })

  const problemFor = (field: string) => problems.find((p) => p.field === field)?.message

  return (
    <>
      <h1>My Extended Essay</h1>
      <p className="sub">
        {view.supervisor ? (
          <>
            Supervisor: <b>{view.supervisor.name}</b>
            {view.supervisor.acting && (
              <span className="pill grey" style={{ marginLeft: 8 }}>
                acting — you have not been allocated a supervisor yet
              </span>
            )}
          </>
        ) : (
          'No supervisor yet.'
        )}
      </p>

      {/* ------------------------------------------------ the track, first */}
      <div className="panel">
        <div className="panel-h">
          <h2>Where you are</h2>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            {checkpoints.filter((c) => c.display === 'done').length} of {checkpoints.length} recorded
          </span>
        </div>
        <div className="panel-b">
          <div className="eetrack">
            {checkpoints.map((c) => (
              <div key={c.def.key} className={`eestep ${c.display}`}>
                <Dot display={c.display} />
                <div className="eestep-b">
                  <div className="eestep-t">
                    {c.def.label}
                    {c.display === 'future' && <span className="pill grey">not open yet</span>}
                    {c.due?.late && <span className="pill bad">overdue</span>}
                    {c.due?.deferredTo && (
                      <span className="pill grey" title={`Not counted late until ${c.due.deferredTo}`}>
                        you joined after this date
                      </span>
                    )}
                  </div>
                  <div className="eestep-d mut">
                    {STAGE_NOTE[c.def.key]}
                    {c.due && ` · due ${c.due.dueAt}`}
                  </div>
                  {c.state?.artifacts.map((a) => (
                    <div key={a.id} className="eelink">
                      {a.kind === 'link' && a.href ? (
                        <a href={a.href} target="_blank" rel="noreferrer">
                          {a.label} ↗
                        </a>
                      ) : (
                        <span>{a.label}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ registration */}
      <div className="panel">
        <div className="panel-h">
          <h2>Registration</h2>
          <span className="spacer" />
          {reg && problems.length === 0 && <span className="pill ok">complete</span>}
        </div>
        <div className="panel-b">
          <span className="caps">Subject — pick one, or two for an interdisciplinary essay</span>
          <div className="eechips">
            {view.subjectChoices.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`eechip ${subjects.includes(c.id) ? 'on' : ''}`}
                onClick={() => toggleSubject(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          {problemFor('subjects') && <div className="note warn">{problemFor('subjects')}</div>}

          {interdisciplinary && (
            <div style={{ marginTop: 12 }}>
              <span className="caps">Interdisciplinary framework — required, and named on the title page</span>
              <select
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                style={{ display: 'block', marginTop: 6, maxWidth: 360 }}
              >
                <option value="">Choose a framework…</option>
                {INTERDISCIPLINARY_FRAMEWORKS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              {problemFor('framework') && <div className="note warn">{problemFor('framework')}</div>}
            </div>
          )}

          <label className="fld" style={{ marginTop: 14 }}>
            Research question
          </label>
          <textarea rows={2} value={rq} onChange={(e) => setRq(e.target.value)} />
          {problemFor('researchQuestion') && (
            <div className="note warn">{problemFor('researchQuestion')}</div>
          )}

          <label className="fld" style={{ marginTop: 10 }}>
            Title
          </label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          {problemFor('title') && <div className="note warn">{problemFor('title')}</div>}

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn pri" onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save registration'}
            </button>
            {saved && <span className="mut">Saved.</span>}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ links */}
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

      {/* ------------------------------------------------ what is not built */}
      <div className="panel">
        <div className="panel-h">
          <h2>The finished essay, and your reflection</h2>
        </div>
        <div className="panel-b">
          <div className="note gold">
            <b>Not built yet.</b> Uploading the finished PDF needs cloud storage, which the school
            has not set up — so the anonymity check cannot read your file yet either. The
            reflection statement (RPF) unlocks after your viva voce and is not open to you.
          </div>
          <h3 style={{ marginBottom: 4 }}>The word limit is {WORD_LIMIT.toLocaleString()}</h3>
          <p style={{ marginTop: 0 }} className="mut">
            <b>Counted:</b> {WORD_COUNT_RULES.counted.join(', ')}.<br />
            <b>Not counted:</b> {WORD_COUNT_RULES.notCounted.join(', ')}.
          </p>
        </div>
      </div>
    </>
  )
}

function LinkPanel({
  studentId,
  stage,
  label,
  checkpoint,
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
        {checkpoint?.due && <span className="mut" style={{ fontSize: 12 }}>due {checkpoint.due.dueAt}</span>}
      </div>
      <div className="panel-b">
        <div className="note" style={{ marginBottom: 10 }}>
          📎 Before pasting, set sharing so your supervisor can open it:{' '}
          <b>Share → Anyone at International Schools Group with the link → Viewer</b>.
        </div>
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
              start(async () => {
                const r = await setLink(studentId, stage, href, label)
                setMessage(r.message)
              })
            }
          >
            {current ? 'Replace' : 'Save link'}
          </button>
        </div>
        {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
      </div>
    </div>
  )
}
