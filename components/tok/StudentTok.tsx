'use client'

// MY TOK — two screens, one route.
//
// Michael, 21 Aug: "Students should ALSO have two screens: one for exhibition
// and one for essay. Makes life easier." A student opens the one they are
// working on and sees nothing about the other. The segmented control is the
// same `pgseg` the staff screens use, so there is one pattern in the product
// rather than two.
//
// The checkpoints come from getTrack, not from the TOK repository. The moment
// this screen computes its own view of what a student owes, it can disagree
// with the coordinator board, and one of them will be wrong in March.

import { useState, useTransition } from 'react'
import ReturnedNote from '../ReturnedNote'
import type { Checkpoint } from '@/lib/types'
import type { InteractionNumber, TokInteractionView, TokStudentView } from '@/lib/tok/types'
import { SCHOOL_INTERACTION_WORD_GUIDANCE } from '@/lib/tok/types'
import { IA_PROMPTS, promptLabel } from '@/lib/tok/prompts'
import { ESSAY_WORD_LIMIT, EXHIBITION_WORD_LIMIT } from '@/lib/tok/rubric'
import { countWords } from '@/lib/ee/scoring'
import { setDraft, setPrompt, setTitle, submitInteraction, submitWork } from '@/lib/tok/actions'

const EXH_KEYS = ['tok.prompt', 'tok.exh', 'tok.exhmark']

export default function StudentTok({
  view, checkpoints, screen, baseHref,
}: {
  view: TokStudentView
  checkpoints: Checkpoint[]
  screen: 'exh' | 'essay'
  baseHref: string
}) {
  const mine = checkpoints.filter((c) =>
    screen === 'exh' ? EXH_KEYS.includes(c.def.key) : !EXH_KEYS.includes(c.def.key))

  return (
    <>
      <h1>My TOK</h1>
      <p className="sub">
        {view.teacherName ? <>Teacher: <b>{view.teacherName}</b></> : 'No TOK teacher assigned yet.'}
      </p>

      <nav className="pgseg">
        <a className={screen === 'exh' ? 'on' : ''} href={`${baseHref}&screen=exh`}>Exhibition</a>
        <a className={screen === 'essay' ? 'on' : ''} href={`${baseHref}&screen=essay`}>Essay</a>
      </nav>

      <div className="panel">
        <div className="panel-b eecompact">
          {mine.map((c) => {
            const done = c.display === 'done'
            return (
              <div key={c.def.key} className={`eerow ${c.display}`}>
                <i className={`eedot ${c.display}`} />
                <span className="eerow-l">{c.def.label}</span>
                <span className="spacer" />
                {c.display === 'future' && <span className="pill grey">locked</span>}
                {c.due?.late && <span className="pill bad">overdue</span>}
                {c.due && !c.due.late && <span className="eerow-d mut">due {c.due.dueAt}</span>}
                {done && c.state?.recordedAt && <span className="eerow-d mut">{c.state.recordedAt}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {screen === 'exh'
        ? <><PromptPanel view={view} /><WorkPanel view={view} kind="exh" /><MarkPanel view={view} /></>
        : <><TitlePanel view={view} /><DraftPanel view={view} /><WorkPanel view={view} kind="essay" /><PpfPanel view={view} /></>}
    </>
  )
}

// ---------------------------------------------------------------- the prompt

/**
 * CHOSEN, NEVER TYPED. The guide: "The chosen IA prompt must be used exactly as
 * given; it must not be altered in any way." A text field would invite exactly
 * the thing that is forbidden, so this is a select over the fixed 35 and the
 * stored value is the NUMBER.
 */
function PromptPanel({ view }: { view: TokStudentView }) {
  const [n, setN] = useState(view.promptNumber ? String(view.promptNumber) : '')
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Your IA prompt</h2>
        <span className="spacer" />
        {view.promptNumber ? <span className="pill ok">chosen</span> : <span className="pill grey">not chosen</span>}
      </div>
      <div className="panel-b">
        <select
          value={n}
          style={{ width: '100%' }}
          disabled={view.exhibition != null}
          onChange={(e) => { setN(e.target.value); setSaved(false) }}
        >
          <option value="">Choose one of the 35 prompts…</option>
          {IA_PROMPTS.map((text, i) => (
            <option key={i} value={String(i + 1)}>{i + 1}. {text}</option>
          ))}
        </select>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="btn pri"
            disabled={pending || !n || view.exhibition != null}
            onClick={() => start(async () => {
              const r = await setPrompt(view.studentId, Number(n))
              setMessage(r.message ?? null)
              setSaved(r.ok)
            })}
          >
            {pending ? 'Saving…' : 'Save prompt'}
          </button>
          {saved && <span className="mut">Saved.</span>}
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            Your prompt goes at the top of your exhibition file, word for word.
          </span>
        </div>
        {view.exhibition != null && (
          <p className="mut" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
            Your exhibition is filed, so the prompt is fixed with it.
          </p>
        )}
        {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the title

function TitlePanel({ view }: { view: TokStudentView }) {
  const posted = view.titlesPosted
  const [choice, setChoice] = useState(view.title?.number ? String(view.title.number) : '')
  const [typed, setTyped] = useState(view.title && !view.title.number ? view.title.text : '')
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const save = (text: string, number: number | null) =>
    start(async () => {
      const r = await setTitle(view.studentId, { number, text, source: number ? 'teacher' : 'student' })
      setMessage(r.message ?? null)
      setSaved(r.ok)
    })

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Your prescribed title</h2>
        <span className="spacer" />
        {view.title ? <span className="pill ok">chosen</span> : <span className="pill grey">not chosen</span>}
      </div>
      <div className="panel-b">
        {posted.length === 0 ? (
          <>
            {/* THE EMPTY STATE IS THE POINT. Titles never carry over from
                another year group, so a new cohort starts with nothing here —
                and a student who already has the IB's list should not be stuck
                waiting. Michael, 21 Aug. */}
            <div className="note gold" style={{ marginBottom: 12 }}>
              <b>Your teacher has not posted the six titles for your session yet.</b> If you already
              have the IB&rsquo;s list, type yours below — your teacher will see it and can add it to
              the list for everyone.
            </div>
            <label className="fld" style={{ marginTop: 0 }}>
              Type it exactly as the IB wrote it
            </label>
            <textarea rows={2} value={typed} onChange={(e) => { setTyped(e.target.value); setSaved(false) }} />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn pri" disabled={pending || !typed.trim()} onClick={() => save(typed, null)}>
                Save title
              </button>
              {saved && <span className="mut">Saved.</span>}
              <span className="mut" style={{ fontSize: 12 }}>
                It must be one of the six for your session, unaltered. You can change it later.
              </span>
            </div>
          </>
        ) : (
          <>
            <select
              value={choice}
              style={{ width: '100%' }}
              onChange={(e) => {
                setChoice(e.target.value)
                setSaved(false)
                const t = posted.find((x) => String(x.number) === e.target.value)
                if (t) save(t.text, t.number)
              }}
            >
              <option value="">Choose your title…</option>
              {posted.map((t) => <option key={t.number} value={String(t.number)}>{t.number}. {t.text}</option>)}
            </select>
            {saved && <p className="mut" style={{ fontSize: 12, margin: '8px 0 0' }}>Saved.</p>}
            <p className="mut" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
              Changing it resets nothing — but tell your teacher first.
            </p>
          </>
        )}
        {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the draft

function DraftPanel({ view }: { view: TokStudentView }) {
  const [href, setHref] = useState(view.draftHref ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Your draft</h2>
        <span className="spacer" />
        {view.draftHref ? <span className="pill ok">in</span> : <span className="pill grey">none yet</span>}
      </div>
      <div className="panel-b">
        <div className="row">
          <input
            type="text"
            value={href}
            placeholder="https://docs.google.com/document/d/…"
            style={{ flex: 1 }}
            onChange={(e) => setHref(e.target.value)}
          />
          <button
            className="btn"
            disabled={pending}
            onClick={() => start(async () => setMessage((await setDraft(view.studentId, href)).message))}
          >
            {view.draftHref ? 'Replace' : 'Save link'}
          </button>
          {view.draftHref && <a href={view.draftHref} target="_blank" rel="noreferrer">open ↗</a>}
        </div>
        <p className="mut" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
          Your teacher may comment on <b>one</b> full draft, and may not mark or edit it. Share it
          first: <b>Anyone at International Schools Group with the link → Viewer</b>.
        </p>
        {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the files

/**
 * THE EXHIBITION AND THE ESSAY — one component, because they differ only in
 * their word limit and what the limit covers.
 *
 * ⚠ NO CANDIDATE-CODE DECLARATION. Codes are issued in the new year and the
 * exhibition is due in November; asking a student to confirm one they cannot
 * have is what produced last session's reopen-and-resubmit exercise. The code
 * is added at export. IB-Uploads-Stamping-and-Naming.md §4.
 */
function WorkPanel({ view, kind }: { view: TokStudentView; kind: 'exh' | 'essay' }) {
  const filed = kind === 'exh' ? view.exhibition : view.essay
  const limit = kind === 'exh' ? EXHIBITION_WORD_LIMIT : ESSAY_WORD_LIMIT
  const title = kind === 'exh' ? 'Your exhibition' : 'Finished essay (PDF)'

  const [file, setFile] = useState<File | null>(null)
  const [words, setWords] = useState(filed ? String(filed.declaredWords) : '')
  const [decl, setDecl] = useState({ anonymous: false, underLimit: false })
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>{title}</h2>
        <span className="spacer" />
        {filed?.locked && <span className="pill ok">🔒 filed {filed.submittedAt}</span>}
        {!filed && (
          <span className="mut" style={{ fontSize: 12 }}>
            {kind === 'exh'
              ? 'one file · commentary up to 950 words'
              : `≤ ${limit.toLocaleString()} words · the IB marks this one`}
          </span>
        )}
      </div>
      <div className="panel-b">
        {kind === 'exh' && !filed && (
          <div className="note" style={{ marginBottom: 10 }}>
            <b>One file.</b> A title showing your IA prompt, images of your three objects, and a
            commentary of up to <b>950 words</b> — identifying each object and its specific
            real-world context, justifying why it is in the exhibition, and linking it to the
            prompt. Text inside the objects, references and your bibliography do not count.
          </div>
        )}

        {filed ? (
          <>
            <p style={{ marginTop: 0 }}>
              <b>{filed.fileName}</b> · {filed.declaredWords.toLocaleString()} words · filed {filed.submittedAt}
            </p>
            {filed.unlockReason && (
              <div className="note warn">
                Reopened by {filed.unlockedByName} on {filed.unlockedAt} — {filed.unlockReason}
              </div>
            )}
          </>
        ) : (
          <>
            <ReturnedNote
              view={kind === 'exh' ? view.returned.exh : view.returned.essay}
              what={kind === 'exh' ? 'exhibition' : 'essay'}
            />
            <div className="note gold" style={{ marginBottom: 10 }}>
              <b>Cloud storage is not connected yet, so the file itself is not kept.</b> Everything
              else is real and permanent: which file you filed, of what type and size, when, and
              that it is locked. The automatic check for your name or school needs to read the PDF,
              so that one is waiting too — for now it is your own check.
            </div>

            <div className="eetwo">
              <div>
                <label className="fld">PDF only</label>
                <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {file && (
                  <p className="mut" style={{ fontSize: 12, margin: '6px 0 0' }}>
                    {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
              </div>
              <div>
                <label className="fld">Word count — you count it, before you file</label>
                <input
                  type="text"
                  value={words}
                  placeholder={String(limit - 60)}
                  onChange={(e) => setWords(e.target.value.replace(/[^0-9]/g, ''))}
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
                My name, my session number and my school appear nowhere in the PDF
              </label>
              <label className="eecheck">
                <input
                  type="checkbox"
                  checked={decl.underLimit}
                  onChange={(e) => setDecl({ ...decl, underLimit: e.target.checked })}
                />
                {kind === 'exh'
                  ? 'My commentary is under 950 words'
                  : `My essay is under ${limit.toLocaleString()} words, on one of the six prescribed titles`}
              </label>
            </div>

            <div className="note ok" style={{ marginTop: 12 }}>
              <b>You do not need your candidate personal code on this.</b> It is added automatically
              when your coordinator exports for the IB — so you will never be asked to take this
              back, add a code and upload it again.
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn pri"
                disabled={pending || !file}
                onClick={() => start(async () => {
                  if (!file) return
                  const r = await submitWork(
                    view.studentId, kind,
                    { name: file.name, mime: file.type || 'application/octet-stream', bytes: file.size },
                    Number(words), decl,
                  )
                  setMessage(r.message)
                })}
              >
                {pending ? 'Filing…' : '⤒ Upload and lock'}
              </button>
              <span className="mut" style={{ fontSize: 12 }}>
                Filing fixes the paper. Only your teacher or your IB coordinator can reopen it.
              </span>
            </div>
            {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the mark

/** Nothing at all until it is released — not a greyed-out number, not "pending". */
function MarkPanel({ view }: { view: TokStudentView }) {
  if (!view.exhibitionMark) return null
  const m = view.exhibitionMark
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Your mark</h2>
        <span className="spacer" />
        <span className="pill ok" style={{ fontSize: 14 }}>{m.mark} / 10</span>
        {m.level && <span className="pill grey">{m.level}</span>}
      </div>
      <div className="panel-b">
        {m.comment && (
          <div className="eenote" style={{ marginLeft: 0 }}>
            <div className="eenote-h">
              {view.teacherName ?? 'Your teacher'}<span className="mut"> · released {m.releasedAt}</span>
            </div>
            {m.comment}
          </div>
        )}
        <p className="mut" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
          This is the mark your school sends to the IB. The IB moderates it, so your final mark can
          differ.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- TK/PPF

function PpfPanel({ view }: { view: TokStudentView }) {
  const written = view.interactions.filter((i) => i.entry).length
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Planning and progress form (TK/PPF)</h2>
        <span className="spacer" />
        <span className={written === 3 ? 'pill ok' : 'pill info'}>{written} of 3 written</span>
        {view.signedOffAt && <span className="pill ok">🔒 signed {view.signedOffAt}</span>}
      </div>
      <div className="panel-b">
        <div className="note" style={{ marginBottom: 12 }}>
          Three dated conversations with your teacher, written up by you. <b>Each one locks when you
          submit it</b> — after that only your teacher or your IB coordinator can reopen it. The
          whole form goes to the IB with your essay, but it is never marked.
        </div>
        {view.interactions.map((i) => <Interaction key={i.n} view={view} slot={i} />)}
      </div>
    </div>
  )
}

const ORDINAL: Record<InteractionNumber, string> = { 1: 'First', 2: 'Second', 3: 'Third' }

function Interaction({ view, slot }: { view: TokStudentView; slot: TokInteractionView }) {
  const [body, setBody] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const words = countWords(body)
  const guidance = SCHOOL_INTERACTION_WORD_GUIDANCE[slot.n]

  return (
    <div className="eesession">
      <div className="row">
        <i className={`eedot ${slot.entry ? 'done' : slot.open ? 'partial' : 'future'}`} />
        <b>{ORDINAL[slot.n]} interaction</b>
        {slot.entry
          ? <span className="pill ok">🔒 {slot.entry.submittedAt}</span>
          : slot.open
            ? <span className="pill info">open</span>
            : <span className="pill grey">🔒 not open yet</span>}
      </div>

      {/* WHAT THE TEACHER LOGGED, ABOVE THE BOX. It is the prompt a student
          actually needs in order to write the entry — nobody remembers which
          meeting was which four months later. */}
      {slot.logged && (
        <p className="mut" style={{ fontSize: 11.5, margin: '6px 0 0 18px' }}>
          {slot.logged.byName} recorded {slot.logged.heldOn}: <b>{slot.logged.label}</b>
        </p>
      )}

      {slot.entry ? (
        <div className="eerpf">{slot.entry.body}</div>
      ) : slot.open ? (
        <>
          <label className="fld">
            Write it up
            <span className="wc">{words} words · your school suggests about {guidance}</span>
          </label>
          <textarea
            rows={5}
            value={body}
            placeholder="What you discussed, and what changed as a result…"
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn pri"
              disabled={pending || !body.trim()}
              onClick={() => start(async () => {
                const r = await submitInteraction(view.studentId, slot.n, body)
                setMessage(r.message ?? null)
              })}
            >
              Submit and lock
            </button>
            {/* The IB sets NO limit here. The counter is the school's guidance
                and must never block a submit. IB-TOK-research.md §4. */}
            <span className="mut" style={{ fontSize: 12 }}>
              The IB sets no word limit — the count is your school&rsquo;s guidance.
            </span>
          </div>
          {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
        </>
      ) : (
        <p className="mut" style={{ fontSize: 12, margin: '6px 0 0 18px' }}>{slot.closedReason}</p>
      )}
    </div>
  )
}
