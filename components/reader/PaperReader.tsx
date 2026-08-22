'use client'

// THE READER — the second shape of a marks screen, not a second screen.
//
// IB-Reading-and-Marking-Papers.md §1, Michael: "IA marks and IA grading are
// essentially the same… If teacher opens the PDF, IA Marks changes and the PDF
// takes up the screen and shows the rubric… The screen just morphs."
//
// So this is not a route and not a tab. It is what a marks grid renders INSTEAD
// OF ITS TABLE when a File cell has been opened. There is one record and one
// screen over it; nothing forks, and nobody ever says "I put them in the grading
// screen".
//
// WHAT IS GENERIC HERE, and why that matters (§3): the paper pane never changes.
// The right-hand side is whatever the requirement already carries — criteria if
// it has criteria, one total if it is total-only, and NOTHING if it carries no
// mark. That last case is the one that proves the design: "open the file and
// check it is the right one" has to work for an EE reflection statement that
// nobody grades, and that was the original ask.
//
// THREE THINGS DELIBERATELY ABSENT:
//
//   · No "before you mark" checklist. Michael: "it does nothing. Just friction."
//     One muted reminder line points at the VERB instead of asking for a ritual.
//   · No record of viewing. Michael: "no. viewing is viewing." A screen that
//     records who looked at what becomes a screen people perform at.
//   · No queue. The strip is navigation. It counts nothing at anybody and there
//     is no "12 left to mark".
//
// SCORES ARE BUTTONS, NOT NUMBER BOXES (§2). Marking is a reading flow, and
// reaching for the keyboard to type "5" between paragraphs breaks it. The GRID
// keeps its inputs, because typing a whole set in is a different job.

import { useCallback, useEffect, useRef, useState } from 'react'
import { MediaBody } from '../MediaViewer'
import { fileSize, type FileView } from '@/lib/files'
import { describeAccepts } from '@/lib/accepts'
import { mediaUrl } from '@/lib/storage'
import type { IaCriterion } from '@/lib/templates'

export interface ReaderCandidate {
  studentId: string
  name: string
  /** IBIS lists candidates in session-number order, and so does the strip. */
  sessionNumber: string | null
  file: FileView | null
  /** Aligned to `criteria`; empty when the requirement is total-only. */
  criterionMarks: (number | null)[]
  /** The single total, for a total-only requirement. */
  mark: number | null
  /** DERIVED, never stored. null until every criterion is in. */
  total: number | null
  comment: string | null
  locked: boolean
}

export default function PaperReader({
  title,
  criteria,
  markMax,
  guide,
  accepts,
  exportsToIb,
  predicted,
  candidates,
  currentId,
  hrefFor,
  closeHref,
  editable,
  canDownload,
  pending,
  onScore,
  onComment,
  pane,
  paneWidth,
  footer,
}: {
  /** What the IB calls this component — "Scientific investigation". */
  title: string
  criteria: IaCriterion[]
  /** null = this requirement carries NO MARK. Read and return only. */
  markMax: number | null
  guide: string | null
  accepts?: string[]
  exportsToIb: boolean
  /** The IB marks this one; the school's number is a prediction and says so. */
  predicted?: boolean
  candidates: ReaderCandidate[]
  currentId: string
  /** Where a candidate chip points. Links, so the back button works. */
  hrefFor: (studentId: string) => string
  closeHref: string
  editable: boolean
  canDownload: boolean
  pending?: boolean
  onScore?: (studentId: string, index: number, value: number | null) => void
  onComment?: (studentId: string, text: string) => void
  /** Replaces the built-in marking pane — how EE and TOK bring their own. */
  pane?: React.ReactNode
  /**
   * 'wide' gives the pane an even split. The built-in criteria pane is a column
   * of small buttons and wants the narrow default; EE's carries five expanding
   * band descriptors and the reflection statement, and squeezing that into a
   * third of the screen wraps every criterion label onto three lines.
   */
  paneWidth?: 'default' | 'wide'
  footer?: React.ReactNode
}) {
  const i = Math.max(0, candidates.findIndex((c) => c.studentId === currentId))
  const c = candidates[i]
  const [draft, setDraft] = useState(c?.comment ?? '')
  // The last text actually sent. The trail is APPEND-ONLY, so saving the same
  // paragraph twice writes two events that say nothing — this is what stops
  // the blur and the pause both landing one.
  const sent = useRef<string | null>(null)

  // A different candidate is a different comment. Without this the textarea
  // keeps the previous student's paragraph, which is how one gets saved onto
  // the wrong record.
  useEffect(() => {
    setDraft(c?.comment ?? '')
    sent.current = null
  }, [c?.studentId, c?.comment])

  const studentId = c?.studentId
  const saved = c?.comment ?? ''
  const save = useCallback(
    (text: string) => {
      if (!studentId || !onComment) return
      if (text === saved || text === sent.current) return
      sent.current = text
      onComment(studentId, text)
    },
    [studentId, saved, onComment],
  )

  /**
   * SAVE WHEN THE TYPING STOPS, not only when the field is left.
   *
   * On-blur alone loses a paragraph in the one case that actually happens here:
   * a marker finishes the comment and clicks straight onto the next candidate's
   * chip. The blur fires, the server action starts, and the navigation cancels
   * it — silently, with the comment gone. A pause is the cheapest signal that
   * there is something worth keeping.
   */
  useEffect(() => {
    if (!editable || !onComment) return
    const t = setTimeout(() => save(draft), 1200)
    return () => clearTimeout(t)
  }, [draft, editable, onComment, save])

  if (!c) {
    return (
      <div className="note warn">
        That candidate is not in this course. <a href={closeHref}>Back to all candidates</a>.
      </div>
    )
  }

  const marked = candidates.filter((x) => x.total != null).length
  const prev = candidates[(i - 1 + candidates.length) % candidates.length]
  const next = candidates[(i + 1) % candidates.length]
  const url = c.file ? mediaUrl(c.file.ref) : null
  const carriesMark = markMax != null
  const totalOnly = carriesMark && criteria.length === 0
  const writable = editable && !c.locked && onScore != null

  return (
    <>
      {/* ---- the candidate strip: NAVIGATION, not a queue ------------------ */}
      <div className="rdstrip">
        <a className="btn sm" href={closeHref}>‹ All candidates</a>
        <a className="btn sm" href={hrefFor(prev.studentId)} title={prev.name}>‹</a>
        <a className="btn sm" href={hrefFor(next.studentId)} title={next.name}>›</a>
        <div>
          <span className="rdwho">{c.name}</span>{' '}
          <span className="rdsn">· {c.sessionNumber ?? 'no session number'}</span>
        </div>
        <div className="rdchips">
          {candidates.map((x) => (
            <a
              key={x.studentId}
              className={
                'rdchip' +
                (x.total != null ? (x.file ? ' marked' : ' nofile') : '') +
                (x.studentId === c.studentId ? ' on' : '')
              }
              href={hrefFor(x.studentId)}
              title={`${x.name} · ${x.sessionNumber ?? '—'}${
                x.total != null && !x.file ? ' — marked, no file' : ''
              }`}
            >
              {(x.sessionNumber ?? '··').slice(-2)}
            </a>
          ))}
        </div>
        <span className="spacer" />
        {carriesMark && (
          <span className="pill grey">{marked} of {candidates.length} marked</span>
        )}
      </div>

      <div className={`rdsplit${paneWidth === 'wide' ? ' wide' : ''}`}>
        {/* ---- the paper --------------------------------------------------- */}
        <div className="panel">
          <div className="rdhead">
            <span className="rdfname">{c.file ? c.file.ref.name : 'No file uploaded'}</span>
            <span className="mut">
              {c.file
                ? [
                    c.file.ref.mime === 'application/pdf' ? 'PDF' : c.file.ref.mime,
                    c.file.ref.bytes ? fileSize(c.file.ref.bytes) : null,
                    `uploaded ${c.file.addedAt}`,
                    c.file.addedBy ? `by ${c.file.addedBy}` : null,
                  ].filter(Boolean).join(' · ')
                : accepts
                  ? `This component goes to the IB as ${describeAccepts(accepts)}.`
                  : 'Nothing uploaded yet'}
            </span>
            {c.file?.supersededAt && <span className="pill gold">superseded</span>}
            {exportsToIb && <span className="tag ib">to the IB</span>}
            <span className="spacer" />
            {/* Grouped so the three actions wrap together rather than one at a
                time — a "Return with note" alone on the next line reads as a
                different control from the two above it. */}
            <span className="rdacts">
            {url ? (
              <a className="btn sm" href={url} target="_blank" rel="noreferrer">Open full</a>
            ) : (
              <button className="btn sm" disabled title="Storage is not connected yet.">
                Open full
              </button>
            )}
            {canDownload && url ? (
              <a className="btn sm" href={url} download={c.file?.ref.name}>Download</a>
            ) : (
              <button
                className="btn sm"
                disabled
                title={canDownload ? 'Storage is not connected yet.' : 'You cannot download work here.'}
              >
                Download
              </button>
            )}
            {/* STEP 5, and drawn as unbuilt rather than left off. The reminder
                below points at this verb, and a reminder pointing at a button
                that is not there reads as a screen that lost something. */}
            <button
              className="btn sm danger"
              disabled
              title="Not built yet — return-with-note is step 5 of the build order."
            >
              Return with note
            </button>
            </span>
          </div>

          {/* The whole of what replaced the three-box checklist. It names the
              verb; it records nothing; it asks for no ritual. */}
          <div className="rdremind">
            Wrong file, a draft, or the candidate&rsquo;s name still on an anonymised component?{' '}
            <b>Return it with a note</b> rather than marking it — the note is the thing the student
            can act on.
          </div>

          <div className="rdpaper">
            {c.file ? (
              <MediaBody file={c.file.ref} canDownload={canDownload} />
            ) : (
              <div className="rdempty">
                Nothing uploaded yet.
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  {carriesMark
                    ? 'The marks beside this still save — a paper copy is a legitimate way to have marked it, and the grid keeps flagging it as marked with no file.'
                    : 'Nothing to read here yet.'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---- whatever this requirement already carries -------------------- */}
        <div>
          {pane ?? (
            carriesMark ? (
              <div className="panel rdpane">
                <div className="panel-h">
                  <h2>{title}</h2>
                  <span className="pill grey">/{markMax}</span>
                  {predicted && (
                    <span
                      className="pill gold"
                      title="The IB marks this one. This number is the school’s prediction."
                    >
                      predicted
                    </span>
                  )}
                  <span className="spacer" />
                  <span className="mut" style={{ fontSize: 11.5 }}>
                    {totalOnly ? 'no criteria' : `${criteria.length} criteria`}
                  </span>
                </div>

                {totalOnly ? (
                  <Criterion
                    label={predicted ? 'Predicted mark' : 'Mark'}
                    max={markMax}
                    value={c.mark}
                    writable={writable && !pending}
                    onPick={(v) => onScore?.(c.studentId, 0, v)}
                  />
                ) : (
                  criteria.map((cr, n) => (
                    <Criterion
                      key={cr.key}
                      criterionKey={cr.key}
                      label={cr.label}
                      max={cr.max}
                      value={c.criterionMarks[n] ?? null}
                      writable={writable && !pending}
                      onPick={(v) => onScore?.(c.studentId, n, v)}
                    />
                  ))
                )}

                <div className="rdtot">
                  <div>
                    <div className="caps" style={{ margin: 0 }}>Total</div>
                    <span className="rdbig">{c.total ?? '–'}</span>
                    <span className="critmax">/{markMax}</span>
                  </div>
                  <span className="spacer" />
                  {c.locked && <span className="pill gold">locked</span>}
                  {!editable && !c.locked && <span className="pill grey">read-only</span>}
                </div>

                {onComment && (
                  <div className="panel-b">
                    <div className="caps">Teacher marking comment</div>
                    <textarea
                      className="cmtarea"
                      rows={5}
                      value={draft}
                      disabled={!editable || pending}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => save(draft)}
                      placeholder="Justify the marks per criterion — moderators say it materially helps."
                    />
                    {/* WHY THE COMMENT IS HERE AND NOT ONLY IN THE GRID: IBIS
                        asks for it for the sampled candidates only, and it asks
                        in MAY, for work marked in February. Writing it while
                        the paper is open is why nobody backfills twenty-four of
                        them the week the sample lands. */}
                    <p className="mut" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
                      Saved when you pause or click away. Every save lands on the audit trail.
                    </p>
                  </div>
                )}

                {guide && (
                  <div className="panel-b" style={{ borderTop: '1px solid var(--line)' }}>
                    <p className="mut" style={{ fontSize: 11.5, margin: 0 }}>{guide}</p>
                  </div>
                )}

                <div className="panel-b" style={{ paddingTop: 0 }}>
                  <a className="btn pri" style={{ width: '100%', textAlign: 'center' }} href={hrefFor(next.studentId)}>
                    Go to {next.name} ›
                  </a>
                </div>
              </div>
            ) : (
              /* NO MARK. The EE reflection statement is the case that proves
                 the design — read it, check it is the right one, return it if
                 it is not. Nothing is invented to fill the space. */
              <div className="panel rdpane">
                <div className="panel-h">
                  <h2>{title}</h2>
                  <span className="spacer" />
                  <span className="mut" style={{ fontSize: 11.5 }}>no mark</span>
                </div>
                <div className="panel-b">
                  <p className="mut" style={{ margin: 0, fontSize: 12.5 }}>
                    This component carries no mark. It is read, checked that it is the right file,
                    and returned with a note if it is not.
                  </p>
                </div>
                <div className="panel-b" style={{ paddingTop: 0 }}>
                  <a className="btn pri" style={{ width: '100%', textAlign: 'center' }} href={hrefFor(next.studentId)}>
                    Go to {next.name} ›
                  </a>
                </div>
              </div>
            )
          )}

          {/* THE DESCRIPTORS ARE NOT IN HERE, ON PURPOSE. Each criterion's
              label and maximum came off the guides; the best-fit descriptor
              paragraphs did not, and four families still carry [VERIFY] on
              their splits. A wrong descriptor shown confidently is worse than
              no descriptor. */}
          {footer}
        </div>
      </div>
    </>
  )
}

function Criterion({
  criterionKey,
  label,
  max,
  value,
  writable,
  onPick,
}: {
  criterionKey?: string
  label: string
  max: number
  value: number | null
  writable: boolean
  onPick: (v: number | null) => void
}) {
  return (
    <div className="rdcrit">
      <div className="rdcritline">
        {criterionKey && <span className="rdkey">{criterionKey}</span>}
        <span className="rdlab">{label}</span>
        <span className="critmax">/{max}</span>
      </div>
      <div className="rdscores">
        {Array.from({ length: max + 1 }, (_, n) => (
          <button
            key={n}
            type="button"
            className={`rdsc ${value === n ? 'on' : ''}`}
            disabled={!writable}
            // Click again to clear — the same gesture EE marking already uses,
            // and the reason there is no "clear" button anywhere.
            onClick={() => onPick(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
