'use client'

// One experience card. The SAME component for the student and the coordinator —
// the mockup deliberately shows the coordinator exactly what the student sees,
// with an action bar added underneath, and building it twice would be how those
// two views quietly drift apart.

import { useState, useTransition } from 'react'
import * as cas from '@/lib/cas/actions'
import { LEARNING_OUTCOMES, type ExperienceView, type LoKey } from '@/lib/cas/types'
import { LoChips, StatusPill, StrandChips, Thread, prettyDate } from './parts'

const PROMPTS = [
  'What surprised you?',
  'What would you do differently?',
  'How did others respond?',
  'What did you find harder than you expected?',
]

const SNIPPETS = [
  'Connect this more explicitly to each chosen outcome.',
  'Add at least one reflection before resubmitting.',
  'Upload evidence to authenticate this experience.',
  'Great start — clarify how this meets LO4.',
]

type Panel = 'reflect' | 'evidence' | 'complete' | 'return' | 'cob' | 'reopen' | null

export default function ExperienceCard({
  view,
  mode,
  canManage = false,
  defaultOpen = false,
}: {
  view: ExperienceView
  mode: 'student' | 'coordinator'
  canManage?: boolean
  defaultOpen?: boolean
}) {
  const { experience: e, entries, confirmedOutcomes, request } = view
  const [open, setOpen] = useState(defaultOpen)
  const [panel, setPanel] = useState<Panel>(null)
  const [history, setHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [email, setEmail] = useState(e.supervisorEmail ?? '')
  const [ticked, setTicked] = useState<LoKey[]>([])

  const run = (fn: () => Promise<unknown>) => {
    setError(null)
    start(async () => {
      try {
        await fn()
        setPanel(null)
        setText('')
        setFiles([])
        setTicked([])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const toggle = (p: Panel) => {
    setError(null)
    setPanel(panel === p ? null : p)
  }
  const tick = (lo: LoKey) =>
    setTicked((t) => (t.includes(lo) ? t.filter((x) => x !== lo) : [...t, lo]))

  const claimedNotConfirmed = e.claimedOutcomes.filter((l) => !confirmedOutcomes.includes(l))
  const signLink = request ? `/cas/sign-off/${request.token}` : null
  const locked = e.status === 'complete' || e.status === 'rejected'

  return (
    <div className={`exp ${open ? 'open' : ''}`} id={'exp-' + e.id}>
      <div className="exp-h click" onClick={() => setOpen(!open)}>
        <StrandChips strands={e.strands} />
        <span className="t">{e.title}</span>
        {e.isProject && <span className="flag">PROJECT</span>}
        <StatusPill status={e.status} route={e.completionRoute} />
        <span className="echev">▶</span>
      </div>

      <p className="exp-meta">
        Created {prettyDate(e.createdAt)}
        {e.approvedAt && ` · approved ${prettyDate(e.approvedAt)}`}
        {e.completedAt && ` · completed ${prettyDate(e.completedAt)}`}
        {e.supervisorName && ` · supervisor: ${e.supervisorName}`}
      </p>

      {open && (
        <div className="exp-detail">
          {e.description && <p style={{ marginTop: 0 }}>{e.description}</p>}

          {confirmedOutcomes.length > 0 && (
            <div>
              <span className="caps">Confirmed</span> <LoChips los={confirmedOutcomes} />
            </div>
          )}
          {claimedNotConfirmed.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <span className="caps">Claimed, not yet confirmed</span>{' '}
              <LoChips los={claimedNotConfirmed} claimed />
            </div>
          )}

          {e.status === 'complete' && (
            <div className="note ok" style={{ marginTop: 10 }}>
              ✓ Completed on {prettyDate(e.completedAt ?? e.createdAt)}
              {e.completionRoute === 'digital'
                ? ` when ${e.supervisorName ?? 'the supervisor'} signed off.`
                : ' after the signed form was verified.'}{' '}
              {mode === 'coordinator' && 'Reopen only if you find a problem.'}
            </div>
          )}
          {e.status === 'returned' && (
            <div className="note warn" style={{ marginTop: 10 }}>
              Returned to the student. Read the note in the thread, then resubmit.
            </div>
          )}

          <div className="caps" style={{ marginTop: 12 }}>
            Reflections &amp; evidence — newest first
          </div>
          <Thread entries={entries} canDownload />

          {error && (
            <div className="note warn" style={{ marginTop: 10 }}>{error}</div>
          )}

          {/* ------------------------------------------------ the student ---- */}
          {mode === 'student' && !locked && (
            <>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn pri sm" onClick={() => toggle('reflect')}>
                  ✎ Add reflection
                </button>
                <button className="btn sm" onClick={() => toggle('evidence')}>
                  ⤒ Add evidence
                </button>
                {e.status === 'draft' && (
                  <button
                    className="btn sm"
                    disabled={pending}
                    onClick={() => run(() => cas.submitForApproval(e.id))}
                  >
                    Submit for approval
                  </button>
                )}
                {(e.status === 'approved' || e.status === 'awaiting_signoff') && (
                  <button className="btn sm" onClick={() => toggle('complete')}>
                    ✓ Ready to complete
                  </button>
                )}
                <span className="mut" style={{ fontSize: 12 }}>
                  Each addition becomes a new dated entry above.
                </span>
              </div>

              {panel === 'reflect' && (
                <div className="cob">
                  <div style={{ marginBottom: 8 }}>
                    <span className="caps">Prompts</span>{' '}
                    {PROMPTS.map((p) => (
                      <button
                        key={p}
                        className="snip"
                        onClick={() => setText((t) => (t ? t + ' ' : '') + p + ' ')}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <div className="note" style={{ marginBottom: 8 }}>
                    Write about <b>a paragraph</b> — the box is resizable, so make it as big as
                    you need.
                  </div>
                  <textarea
                    className="big"
                    rows={6}
                    value={text}
                    placeholder="Write your reflection here…"
                    onChange={(ev) => setText(ev.target.value)}
                  />
                  <div className="resize-hint">
                    ↕ Drag the bottom edge to make this taller — some students write a lot.
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button
                      className="btn pri sm"
                      disabled={pending || !text.trim()}
                      onClick={() => run(() => cas.addReflection(e.id, text))}
                    >
                      Save dated reflection
                    </button>
                  </div>
                </div>
              )}

              {panel === 'evidence' && (
                <div className="cob">
                  <label className="fld">Photos, video, audio or PDFs</label>
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*,application/pdf"
                    onChange={(ev) => setFiles(Array.from(ev.target.files ?? []))}
                  />
                  <label className="fld">
                    A note, or a link — either on its own counts as evidence
                  </label>
                  <textarea
                    rows={2}
                    value={text}
                    placeholder="e.g. Finished mural and volunteer group photos — or paste a link: https://…"
                    onChange={(ev) => setText(ev.target.value)}
                  />
                  <p className="mut" style={{ fontSize: 12, margin: '6px 0 0' }}>
                    A link to a video, an article or a shared album is evidence like anything else.
                    Paste it here and it becomes a link in the thread.
                  </p>
                  <div className="note" style={{ marginTop: 8 }}>
                    Cloud storage is not connected yet, so the files themselves are not kept.
                    The record of what you added, when, and of what type is real and permanent.
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button
                      className="btn pri sm"
                      disabled={pending || (files.length === 0 && !text.trim())}
                      onClick={() =>
                        run(() =>
                          cas.addEvidence(
                            e.id,
                            files.map((f) => ({
                              name: f.name,
                              mime: f.type || 'application/octet-stream',
                              bytes: f.size,
                            })),
                            text,
                          ),
                        )
                      }
                    >
                      {files.length > 0
                        ? `Add ${files.length} file${files.length === 1 ? '' : 's'}`
                        : 'Add link / note as evidence'}
                    </button>
                  </div>
                </div>
              )}

              {panel === 'complete' && (
                <div className="cob">
                  <div className="note">
                    <b>Two ways to finish.</b> Email your supervisor a secure link to review and
                    sign, <b>or</b> print a form for paper sign-off, then photograph and upload it.
                  </div>
                  <label className="fld">Supervisor&rsquo;s email</label>
                  <div className="row">
                    <input
                      type="text"
                      value={email}
                      placeholder="supervisor@example.org"
                      style={{ maxWidth: 300 }}
                      onChange={(ev) => setEmail(ev.target.value)}
                    />
                    <button
                      className="btn pri sm"
                      disabled={pending || !email.includes('@')}
                      onClick={() => run(() => cas.emailSupervisor(e.id, email))}
                    >
                      ✉ Generate secure link
                    </button>
                    <a className="btn sm" href={`/cas/form/${e.id}`} target="_blank" rel="noreferrer">
                      🖨 Print form
                    </a>
                  </div>
                  <p className="mut" style={{ fontSize: 12, marginBottom: 0 }}>
                    Email sending needs infrastructure we do not have yet, so the link is shown
                    here for you to send yourself. It expires after 28 days.
                  </p>
                  {e.status === 'awaiting_signoff' && e.completionRoute !== 'paper' && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        className="btn sm"
                        disabled={pending}
                        onClick={() => run(() => cas.paperFormUploaded(e.id))}
                      >
                        I uploaded a signed paper form instead
                      </button>
                    </div>
                  )}
                </div>
              )}

              {signLink && (
                <div className="note gold" style={{ marginTop: 10 }}>
                  <b>Secure sign-off link</b> for {request?.email} — expires{' '}
                  {prettyDate(request!.expiresAt)}.
                  <div style={{ marginTop: 6 }}>
                    <a href={signLink} target="_blank" rel="noreferrer">
                      <code>{signLink}</code>
                    </a>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'student' && locked && (
            <p className="mut" style={{ fontSize: 12.5, marginTop: 12 }}>
              This experience is locked. Ask your coordinator if something needs changing.
            </p>
          )}

          {/* -------------------------------------------- the coordinator ---- */}
          {mode === 'coordinator' && canManage && (
            <>
              <div className="actionbar">
                <span className="lbl">Coordinator</span>

                {e.status === 'submitted' && (
                  <>
                    <button
                      className="btn pri sm"
                      disabled={pending}
                      onClick={() => run(() => cas.setExperienceStatus(e.id, 'approved'))}
                    >
                      Approve
                    </button>
                    <button className="btn sm" onClick={() => toggle('return')}>
                      Return with note
                    </button>
                    <button
                      className="btn danger sm"
                      disabled={pending}
                      onClick={() => run(() => cas.setExperienceStatus(e.id, 'rejected'))}
                    >
                      Not a CAS experience
                    </button>
                  </>
                )}

                {(e.status === 'approved' || e.status === 'awaiting_signoff') && (
                  <>
                    <button className="btn pri sm" onClick={() => toggle('cob')}>
                      {e.completionRoute === 'paper'
                        ? '✓ Verify & mark complete'
                        : '✓ Complete on behalf of student'}
                    </button>
                    <button className="btn sm" onClick={() => toggle('return')}>
                      Return with note
                    </button>
                    <span className="mut" style={{ fontSize: 12 }}>
                      {e.completionRoute === 'paper'
                        ? 'Check the signature against the form in the thread.'
                        : 'Use when a supervisor will not sign digitally.'}
                    </span>
                  </>
                )}

                {e.status === 'returned' && (
                  <span className="mut" style={{ fontSize: 12 }}>
                    Waiting on the student to resubmit.
                  </span>
                )}

                {e.status === 'complete' && (
                  <>
                    <button className="btn danger sm" onClick={() => toggle('reopen')}>
                      ↩ Reopen / un-complete
                    </button>
                    <span className="mut" style={{ fontSize: 12 }}>
                      Complete by default — reopening notifies the student.
                    </span>
                  </>
                )}

                {e.status === 'rejected' && (
                  <button
                    className="btn sm"
                    disabled={pending}
                    onClick={() => run(() => cas.setExperienceStatus(e.id, 'submitted'))}
                  >
                    Put back for approval
                  </button>
                )}
              </div>

              {panel === 'return' && (
                <div className="cob">
                  <div className="caps">Saved snippets — click to insert</div>
                  <div className="badgerow" style={{ marginTop: 6 }}>
                    {SNIPPETS.map((s) => (
                      <button
                        key={s}
                        className="snip"
                        onClick={() => setText((t) => (t ? t + ' ' : '') + s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    value={text}
                    placeholder="Note to the student…"
                    onChange={(ev) => setText(ev.target.value)}
                    style={{ marginTop: 8 }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <button
                      className="btn pri sm"
                      disabled={pending || !text.trim()}
                      onClick={() =>
                        run(() => cas.setExperienceStatus(e.id, 'returned', { note: text }))
                      }
                    >
                      Send &amp; return
                    </button>
                  </div>
                </div>
              )}

              {panel === 'cob' && (
                <div className="cob">
                  <div className="caps">
                    You are completing this — tick only the outcomes you can actually see
                    evidenced
                  </div>
                  <div className="badgerow" style={{ marginTop: 8 }}>
                    {(e.claimedOutcomes.length ? e.claimedOutcomes : LEARNING_OUTCOMES.map((l) => l.key)).map(
                      (lo) => (
                        <label key={lo} className={`chk ${ticked.includes(lo) ? 'on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={ticked.includes(lo)}
                            onChange={() => tick(lo)}
                          />
                          LO{lo.slice(2)} —{' '}
                          {LEARNING_OUTCOMES.find((l) => l.key === lo)?.label}
                        </label>
                      ),
                    )}
                  </div>
                  <label className="fld">Comment (optional)</label>
                  <textarea
                    rows={2}
                    value={text}
                    placeholder="Note for the portfolio…"
                    onChange={(ev) => setText(ev.target.value)}
                  />
                  <div style={{ marginTop: 8 }}>
                    <button
                      className="btn pri sm"
                      disabled={pending || ticked.length === 0}
                      onClick={() => run(() => cas.completeOnBehalf(e.id, ticked, text))}
                    >
                      Confirm completion
                    </button>
                  </div>
                </div>
              )}

              {panel === 'reopen' && (
                <div className="cob">
                  <label className="fld">Reason for reopening (required)</label>
                  <input
                    type="text"
                    value={text}
                    style={{ width: '100%' }}
                    placeholder="e.g. Evidence doesn't clearly support LO3"
                    onChange={(ev) => setText(ev.target.value)}
                  />
                  <div style={{ marginTop: 8 }}>
                    <button
                      className="btn danger sm"
                      disabled={pending || !text.trim()}
                      onClick={() =>
                        run(() => cas.setExperienceStatus(e.id, 'approved', { reason: text }))
                      }
                    >
                      Confirm reopen
                    </button>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <button className="btn sm ghost" onClick={() => setHistory(!history)}>
                  🕘 History (authenticity trail) {history ? '▴' : '▾'}
                </button>
                {history && (
                  <div className="hist">
                    <div className="caps">Append-only. Every entry names who, what and when.</div>
                    <Thread entries={entries} showSystem canDownload />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
