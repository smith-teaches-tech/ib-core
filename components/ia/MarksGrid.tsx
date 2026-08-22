'use client'

// THE ONE MARKS GRID, worn two ways — and, since 22 Aug, in two SHAPES.
//
//   editable   — the designated marker's entry screen, on their own course page.
//                Criterion cells are inputs; the total derives as they type.
//   read-only  — the coordinator's TRANSCRIPTION view (/marks). Same grid, no
//                inputs, plus one column: "typed into IBIS", a per-candidate
//                tick. Rows sit in session-number order — the order IBIS lists
//                candidates — so transcription is read-down-type-down. Ticked
//                rows dim; the next untyped row is always obvious.
//
// IBIS asks for marks twice (totals for everyone, criterion breakdown for the
// moderation sample). Recording at criterion grain here answers both asks with
// one recording — see claude/IB-IA-Marks-Spec.md.
//
// THE MORPH. Open a File cell and this component renders the READER instead of
// the table: the paper on the left, that candidate's criteria on the right, the
// cohort along the top in session order. Close it and the table is back.
//
// It is ONE COMPONENT rather than two screens on purpose, and the reason is not
// tidiness (IB-Reading-and-Marking-Papers.md §1): two screens holding the same
// marks is two places a mark can be, and sooner or later somebody says "I put
// them in the grading screen". There is one record, so there is one screen.
//
// THE STATE IS THE URL (`&paper=<studentId>`), not React state — so the back
// button works, a reload lands where you were, and a link to a paper is a link
// to a paper. `&candidate=` was already taken by the whole-student side panel
// that the NAME column opens, and the two are different doors: the row opens
// the candidate, the file cell opens the paper.

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import PaperReader from '../reader/PaperReader'
import * as ia from '@/lib/ia/actions'
import type { IaMarksView } from '@/lib/ia/types'

/** A cell starting with = + - @ is a formula to a spreadsheet; defang it. */
const defang = (s: string) => (/^[=+\-@]/.test(s) ? "'" + s : s)

function csvOf(view: IaMarksView): string {
  const critHeads = view.criteria.map((c) => c.key)
  const head = ['session_number', 'candidate', ...critHeads, `total_of_${view.markMax}`, 'comment']
  const lines = view.rows.map((r) =>
    [
      defang(r.sessionNumber ?? ''),
      '"' + defang(r.name).replace(/"/g, '""') + '"',
      ...(view.criteria.length > 0
        ? r.criterionMarks.map((m) => (m == null ? '' : String(m)))
        : []),
      r.total == null ? '' : String(r.total),
      '"' + defang(r.comment ?? '').replace(/"/g, '""') + '"',
    ].join(','),
  )
  return [head.join(','), ...lines].join('\n')
}

export default function MarksGrid({
  view,
  editable,
  canTranscribe,
  readOnlyReason,
  paperFor,
  paperBase,
  gridHref,
  canDownload = false,
}: {
  view: IaMarksView
  editable: boolean
  /** Show the typed-into-IBIS column and allow ticking it. */
  canTranscribe: boolean
  /** Set when the cohort is archived — explains why nothing is editable. */
  readOnlyReason?: string
  /**
   * THE MORPH. A student id renders the reader over this candidate's paper
   * instead of the table; null renders the table. It comes off the URL, so the
   * page decides it and this component never has to keep it in sync.
   */
  paperFor?: string | null
  /** Where a File cell points: `paperBase + studentId`. Absent = no reader. */
  paperBase?: string
  /** Back to the table. */
  gridHref?: string
  /** Downloading someone's coursework is a capability, here as everywhere. */
  canDownload?: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  // IA/EE/TOK comments are PARAGRAPHS, so the cell shows a one-line preview
  // and the full text opens in an overlay with a real textarea — editable for
  // whoever may write (marker / active override), read-only for everyone else.
  const [commentFor, setCommentFor] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<unknown>) => {
    setError(null)
    start(async () => {
      try {
        await fn()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const openComment = (studentId: string, current: string | null) => {
    setCommentDraft(current ?? '')
    setCommentFor(studentId)
  }

  // Esc dismisses the overlay from anywhere; click-outside is the backdrop.
  useEffect(() => {
    if (commentFor == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCommentFor(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [commentFor])

  const overlayRow = commentFor ? (view.rows.find((r) => r.studentId === commentFor) ?? null) : null

  const totalOnly = view.criteria.length === 0
  const marked = view.rows.filter((r) => r.total != null).length
  const missingMarks = view.rows.length - marked
  const missingComments = view.rows.filter((r) => r.total != null && !r.comment).length
  const markNoFile = view.rows.filter((r) => r.total != null && r.fileDisplay !== 'done').length
  const typedCount = view.rows.filter((r) => r.typed).length
  const withTotals = view.rows.filter((r) => r.total != null)
  const mean = withTotals.length
    ? (withTotals.reduce((a, r) => a + (r.total ?? 0), 0) / withTotals.length).toFixed(1)
    : '—'

  // ---- THE READER ---------------------------------------------------------
  // Rendered INSTEAD OF the panel below. Everything it writes goes through the
  // same two actions the grid uses, onto the same record — which is the whole
  // point of not having built a second screen.
  if (paperFor && paperBase && gridHref) {
    return (
      <>
        {error && <div className="note warn" style={{ marginBottom: 12 }}>{error}</div>}
        <PaperReader
          title={view.component}
          criteria={view.criteria}
          markMax={view.markMax}
          guide={view.guide}
          accepts={view.accepts}
          exportsToIb={view.exportsToIb}
          candidates={view.rows.map((r) => ({
            studentId: r.studentId,
            name: r.name,
            sessionNumber: r.sessionNumber,
            file: r.file,
            criterionMarks: r.criterionMarks,
            mark: r.mark,
            total: r.total,
            comment: r.comment,
            returned: r.returned,
            locked: r.locked,
          }))}
          currentId={paperFor}
          hrefFor={(id) => paperBase + id}
          closeHref={gridHref}
          editable={editable}
          canDownload={canDownload}
          pending={pending}
          onScore={(studentId, index, value) =>
            run(() => ia.setCriterionMark(view.course.id, view.cohortId, studentId, index, value))
          }
          onComment={(studentId, text) =>
            run(() => ia.setComment(view.course.id, view.cohortId, studentId, text))
          }
          // Through the SAME `run` as a mark, so a refusal (empty note, nothing
          // filed) lands in the same error banner rather than in a second one.
          onReturn={(studentId, note) =>
            run(() => ia.returnWithNote(view.course.id, view.cohortId, studentId, note))
          }
          footer={
            view.verify ? (
              <div className="note gold">
                <b>Check this rubric:</b> {view.verify} <span className="mut">({view.guide})</span>
              </div>
            ) : (
              <div className="note gold">
                <b>The descriptors are not in here, on purpose for now.</b> Each criterion&rsquo;s
                label and maximum came off the guides; the best-fit descriptor paragraphs are not in
                the data yet. A wrong descriptor shown confidently is worse than no descriptor.
              </div>
            )
          }
        />
      </>
    )
  }

  const download = () => {
    const blob = new Blob([csvOf(view)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${view.course.name.replace(/[^A-Za-z0-9]+/g, '')}_IA_marks.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>
          {view.course.name} — {view.component} <span className="mut">/{view.markMax}</span>
        </h2>
        <span className="spacer" />
        <button className="btn sm" onClick={download}>
          ⤓ {view.course.name.replace(/[^A-Za-z0-9]+/g, '')}_IA_marks.csv
        </button>
      </div>

      <div className="panel-h bcontrols" style={{ gap: 10 }}>
        <span className="caps">Designated marker</span>
        {view.marker ? <span className="pill info">{view.marker}</span> : <span className="pill warn">none set</span>}
        <span className={missingMarks ? 'owe' : 'owe done'}>
          {missingMarks
            ? `${missingMarks} mark${missingMarks === 1 ? '' : 's'} missing`
            : 'every mark is in'}
        </span>
        {missingComments > 0 && <span className="pill gold">{missingComments} without a comment</span>}
        {markNoFile > 0 && (
          <span className="pill warn" title="A mark with no file means nothing to moderate if this candidate is sampled.">
            {markNoFile} marked with NO file
          </span>
        )}
        <span className="spacer" />
        {missingMarks === 0 ? (
          <span className="pill ok" title="IBIS runs dynamic sampling once every total is entered. The criterion breakdown for the sampled candidates is already recorded here.">
            all totals in — IBIS can issue the sample; criteria already recorded
          </span>
        ) : (
          <span className="pill grey">IBIS issues the moderation sample only after all {view.rows.length} totals are entered</span>
        )}
      </div>

      {view.verify && (
        <div className="panel-h" style={{ paddingTop: 0, borderBottom: 0 }}>
          <div className="note gold" style={{ flex: 1 }}>
            <b>Check this rubric:</b> {view.verify} <span className="mut">({view.guide})</span>
          </div>
        </div>
      )}
      {readOnlyReason && (
        <div className="panel-h" style={{ paddingTop: 0, borderBottom: 0 }}>
          <div className="note gold" style={{ flex: 1 }}>{readOnlyReason}</div>
        </div>
      )}
      {error && (
        <div className="panel-h" style={{ paddingTop: 0, borderBottom: 0 }}>
          <div className="note warn" style={{ flex: 1 }}>{error}</div>
        </div>
      )}

      <div className="bscroll">
        <table className="board marks">
          <thead>
            <tr className="bcols">
              <th className="idc">#</th>
              <th className="idc">Candidate</th>
              {totalOnly ? (
                <th className="lanesep" title={view.guide}>Total /{view.markMax}</th>
              ) : (
                view.criteria.map((c, i) => (
                  <th
                    key={c.key}
                    className={i === 0 ? 'lanesep' : undefined}
                    title={`${c.label} — out of ${c.max}`}
                  >
                    {c.key}
                    <div className="critmax">/{c.max}</div>
                  </th>
                ))
              )}
              {!totalOnly && <th className="lanesep">Total</th>}
              <th className="lanesep">File</th>
              <th>Comment</th>
              {canTranscribe && <th className="lanesep">Typed into IBIS</th>}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => {
              const dim = canTranscribe && r.typed
              return (
                <tr key={r.studentId} className={dim ? 'dim' : undefined}>
                  <td className="sn idc">{r.sessionNumber ?? '—'}</td>
                  {/* THE NAME IS THE SAME DOOR AS THE FILE (22 Aug). Michael:
                      "Clicking on the student (or the file) should do what
                      clicking on the FILE does: open the read view to read and
                      score. THAT is an intuitive way to get to the grading view
                      two different ways."

                      It used to open the whole-student panel, which was the
                      coordinator's object and is now the board's alone. A name
                      in a register of WORK means that person's work here — so
                      it takes the file cell's affordance, `Read ›`, rather than
                      a chevron that would promise somewhere else. */}
                  <td className="nm idc">
                    {paperBase ? (
                      <Link
                        className="candlink"
                        href={paperBase + r.studentId}
                        title={r.file ? `Read ${r.file.ref.name}` : 'Open this candidate’s paper'}
                      >
                        {r.name}
                        <span className="filedoor-x">{r.file ? 'Read ›' : 'Open ›'}</span>
                      </Link>
                    ) : (
                      r.name
                    )}
                  </td>

                  {totalOnly ? (
                    <td className="lanesep">
                      {editable && !r.locked ? (
                        <input
                          className="cin wide"
                          type="number"
                          min={0}
                          max={view.markMax}
                          defaultValue={r.mark ?? ''}
                          disabled={pending}
                          onBlur={(e) =>
                            run(() =>
                              ia.setCriterionMark(
                                view.course.id, view.cohortId, r.studentId, 0,
                                e.target.value === '' ? null : Number(e.target.value),
                              ),
                            )
                          }
                        />
                      ) : (
                        <span className={`cv ${r.mark == null ? 'none' : ''}`}>{r.mark ?? '–'}</span>
                      )}
                    </td>
                  ) : (
                    view.criteria.map((c, i) => (
                      <td key={c.key} className={i === 0 ? 'lanesep' : undefined}>
                        {editable && !r.locked ? (
                          <input
                            className="cin"
                            type="number"
                            min={0}
                            max={c.max}
                            defaultValue={r.criterionMarks[i] ?? ''}
                            disabled={pending}
                            onBlur={(e) =>
                              run(() =>
                                ia.setCriterionMark(
                                  view.course.id, view.cohortId, r.studentId, i,
                                  e.target.value === '' ? null : Number(e.target.value),
                                ),
                              )
                            }
                          />
                        ) : (
                          <span className={`cv ${r.criterionMarks[i] == null ? 'none' : ''}`}>
                            {r.criterionMarks[i] ?? '–'}
                          </span>
                        )}
                      </td>
                    ))
                  )}

                  {!totalOnly && (
                    <td className="lanesep">
                      {r.total != null ? (
                        <b className="totv">{r.total}<span className="critmax">/{view.markMax}</span></b>
                      ) : (
                        <span className="cv none">—</span>
                      )}
                    </td>
                  )}

                  {/* THE FILE CELL IS THE DOOR (§1). Not the row — the row
                      already opens the candidate's whole file through the name
                      link, and that stays. This is where "there is a PDF here"
                      is already said, so it is where "show me" belongs. An
                      EMPTY cell opens the reader too: the marking side works
                      for a teacher who marked from a paper copy. */}
                  <td className="lanesep filecell">
                    {paperBase ? (
                      <a
                        href={paperBase + r.studentId}
                        className="filedoor"
                        title={
                          r.file
                            ? `Read ${r.file.ref.name}`
                            : r.returned
                              ? `Returned ${r.returned.fileName} — ${r.returned.note}`
                              : 'No file uploaded — opens the reader anyway'
                        }
                      >
                        <i
                          className={`cellbox ${r.fileDisplay === 'not_started' ? '' : r.fileDisplay}`}
                        />
                        <span className="filedoor-x">{r.file ? 'Read ›' : 'Open ›'}</span>
                      </a>
                    ) : (
                      <i
                        className={`cellbox ${r.fileDisplay === 'not_started' ? '' : r.fileDisplay}`}
                        title={r.fileDisplay === 'done' ? 'Final file uploaded' : r.fileDisplay === 'partial' ? 'In progress' : 'No file uploaded'}
                      />
                    )}
                    {/* RETURNED IS NOT THE SAME AS NEVER FILED, and the grid
                        should not draw them the same — one candidate has not
                        got round to it, the other has been told to do it again.
                        The pill wins over "no file" because it is the more
                        specific fact. */}
                    {r.returned ? (
                      <div>
                        <span className="pill warn" style={{ fontSize: 10 }} title={r.returned.note}>
                          returned
                        </span>
                      </div>
                    ) : r.total != null && r.fileDisplay !== 'done' ? (
                      <div><span className="pill warn" style={{ fontSize: 10 }}>no file</span></div>
                    ) : null}
                  </td>

                  <td style={{ textAlign: 'left', maxWidth: 220 }}>
                    {r.comment ? (
                      // One-line preview with a clear "there's more" affordance;
                      // the full paragraph lives in the overlay.
                      <button
                        type="button"
                        className="cmtprev"
                        title={editable ? 'Open the full comment — edit' : 'Open the full comment'}
                        onClick={() => openComment(r.studentId, r.comment)}
                      >
                        <span className="cmt">{r.comment}</span>
                        <span className="cmtmore">…</span>
                      </button>
                    ) : r.total != null ? (
                      editable ? (
                        <button
                          className="btn sm ghost"
                          onClick={() => openComment(r.studentId, null)}
                        >
                          + add
                        </button>
                      ) : (
                        <span className="pill gold" style={{ fontSize: 10.5 }}>none</span>
                      )
                    ) : (
                      <span className="mut">·</span>
                    )}
                  </td>

                  {canTranscribe && (
                    <td className="lanesep">
                      {r.total == null ? (
                        <span className="mut" title="Nothing to type — no mark yet">·</span>
                      ) : (
                        <button
                          className={`tick ${r.typed ? 'on' : ''}`}
                          disabled={pending}
                          title={r.typed ? 'Typed into IBIS — click to undo' : 'Mark as typed into IBIS'}
                          onClick={() =>
                            run(() =>
                              ia.setTypedIntoIbis(view.course.id, view.cohortId, r.studentId, !r.typed),
                            )
                          }
                        >
                          ✓
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th className="idc" />
              <th className="idc">{marked}/{view.rows.length} marked</th>
              <td
                className="lanesep"
                colSpan={totalOnly ? 1 : view.criteria.length + 1}
                style={{ textAlign: 'left', paddingLeft: 10 }}
              >
                <span className="mut">
                  mean <b>{mean}</b>
                  {withTotals.length > 0 && (
                    <>
                      {' '}· range{' '}
                      <b>
                        {Math.min(...withTotals.map((r) => r.total ?? 0))}–
                        {Math.max(...withTotals.map((r) => r.total ?? 0))}
                      </b>
                    </>
                  )}
                </span>
              </td>
              <td className="lanesep" />
              <td />
              {canTranscribe && (
                <td className="lanesep">
                  <span className={`btot ${typedCount === marked && marked > 0 ? 'ok' : typedCount > 0 ? 'mid' : 'bad'}`}>
                    {typedCount}/{marked}
                  </span>
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="panel-b" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="legend">
          <span className="mut">
            {canTranscribe
              ? 'Read down, type down — rows are in session-number order, the order IBIS lists candidates. Tick a row when its total is in IBIS; ticked rows dim.'
              : totalOnly
                ? 'This family’s criterion split is not yet confirmed against the guide, so the mark is a single total.'
                : 'Enter criterion marks as you mark — the total derives, and the moderation sample’s criterion form is already answered the day IBIS asks.'}
          </span>
          <span className="spacer" />
          <b>{view.guide}</b>
        </div>
      </div>

      {/* The comment overlay — a plain fixed-position card, no new deps.
          Click-outside (the backdrop) and Esc both close it. Saving goes
          through the same setComment action, which appends its MarkEvent. */}
      {overlayRow && (
        <div className="cmtback" onMouseDown={() => setCommentFor(null)}>
          <div
            className="cmtcard"
            role="dialog"
            aria-label={`Teacher comment — ${overlayRow.name}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="cmtcard-h">
              <b>{overlayRow.name}</b>
              <span className="mut" style={{ marginLeft: 6 }}>
                — teacher comment{editable ? '' : ' (read-only)'}
              </span>
              <span className="spacer" />
              <button className="mini" title="Close (Esc)" onClick={() => setCommentFor(null)}>
                ✕
              </button>
            </div>
            {editable ? (
              <>
                <textarea
                  className="cmtarea"
                  autoFocus
                  rows={8}
                  placeholder="Justify the marks per criterion — moderators say it materially helps."
                  value={commentDraft}
                  disabled={pending}
                  onChange={(e) => setCommentDraft(e.target.value)}
                />
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="btn sm pri"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await ia.setComment(
                          view.course.id, view.cohortId, overlayRow.studentId, commentDraft,
                        )
                        setCommentFor(null)
                      })
                    }
                  >
                    Save
                  </button>
                  <button className="btn sm ghost" disabled={pending} onClick={() => setCommentFor(null)}>
                    Cancel
                  </button>
                  <span className="mut" style={{ fontSize: 11.5 }}>
                    Every save lands on the audit trail.
                  </span>
                </div>
              </>
            ) : (
              <div className="cmtfull">
                {overlayRow.comment ?? <span className="mut">No comment recorded.</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
