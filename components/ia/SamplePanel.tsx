'use client'

// THE MODERATION SAMPLE — the IBIS flow, made concrete:
//
//   1. the coordinator types every candidate's total into IBIS;
//   2. IBIS names the sampled candidates;
//   3. the school uploads those candidates' IA files and scores.
//
// This panel records step 2 (tick candidates, or paste the numbers straight
// out of IBIS — any format, digits are extracted and matched) and packages
// step 3: a ZIP with the sample's marks CSV and a manifest naming the files
// eCoursework expects. File storage is a stub today, so the manifest says so
// per candidate — the pack's SHAPE is right, and real files slot in later.
//
// The selection persists as a SampleRequest (at most one per course + cohort).
// "Mark as submitted" freezes it read-only; "Amend" reopens a draft.

import { useEffect, useMemo, useState, useTransition } from 'react'
import JSZip from 'jszip'
import * as ia from '@/lib/ia/actions'
import { matchSessionNumbers } from '@/lib/ia/sample'
import type { IaMarksView, SampleRequest } from '@/lib/ia/types'

/** A cell starting with = + - @ is a formula to a spreadsheet; defang it. */
const defang = (s: string) => (/^[=+\-@]/.test(s) ? "'" + s : s)

export default function SamplePanel({
  view,
  sample,
  canEdit,
  sessionLabel,
}: {
  view: IaMarksView
  sample: SampleRequest | null
  /** Marker or coordinator — the server action re-checks regardless. */
  canEdit: boolean
  /** The exam session the pack is named for — e.g. "M27". */
  sessionLabel: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>(sample?.studentIds ?? [])
  const [paste, setPaste] = useState('')
  const [unknown, setUnknown] = useState<string[]>([])
  const [pending, start] = useTransition()

  // A save round-trips through the server; when the stored request changes,
  // the local draft follows it.
  useEffect(() => {
    setSelected(sample?.studentIds ?? [])
  }, [sample?.recordedAt, sample?.studentIds])

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

  const submitted = sample?.status === 'submitted'
  const editable = canEdit && !submitted

  const chosenRows = useMemo(
    () => view.rows.filter((r) => selected.includes(r.studentId)),
    [view.rows, selected],
  )

  const toggle = (studentId: string) =>
    setSelected((s) =>
      s.includes(studentId) ? s.filter((x) => x !== studentId) : [...s, studentId],
    )

  const applyPaste = () => {
    const match = matchSessionNumbers(
      paste,
      view.rows.map((r) => ({ studentId: r.studentId, sessionNumber: r.sessionNumber })),
    )
    setSelected((s) => [...new Set([...s, ...match.studentIds])])
    setUnknown(match.unknown)
    setPaste('')
  }

  const compactCourse = view.course.name.replace(/[^A-Za-z0-9]+/g, '')

  const downloadPack = async () => {
    setError(null)
    const zip = new JSZip()

    const critHeads = view.criteria.map((c) => c.key)
    const head = [
      'session_number', 'candidate', ...critHeads, `total_of_${view.markMax}`, 'teacher_comment',
    ]
    const lines = chosenRows.map((r) =>
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
    zip.file(`${compactCourse}_sample_marks.csv`, [head.join(','), ...lines].join('\n'))

    const manifest = chosenRows
      .map(
        (r) =>
          `${r.sessionNumber ?? 'no-session-number'}_${compactCourse}_IA.pdf — ` +
          'file pending — storage not yet connected',
      )
      .join('\n')
    zip.file(
      'manifest.txt',
      `${view.course.name} — IA moderation sample (${sessionLabel})\n` +
        `${chosenRows.length} candidate${chosenRows.length === 1 ? '' : 's'}\n\n` +
        manifest + '\n',
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${compactCourse}_IA_sample_${sessionLabel}.zip`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panel-h">
        <h2>Moderation sample</h2>
        <span className="spacer" />
        {submitted ? (
          <span className="pill ok" title={sample?.submittedAt}>
            submitted in eCoursework
            {sample?.submittedAt ? ` · ${sample.submittedAt.slice(0, 10)}` : ''}
          </span>
        ) : sample ? (
          <span className="pill gold">draft — {sample.studentIds.length} selected</span>
        ) : (
          <span className="pill grey">none recorded yet</span>
        )}
      </div>

      <div className="panel-b">
        <p className="mut" style={{ fontSize: 12.5, marginTop: 0 }}>
          IBIS names the sampled candidates once every total is in. Tick them below — or paste the
          session numbers straight from IBIS, in any format — then download the pack for the
          eCoursework upload.
        </p>

        {editable && (
          <div className="row exptools" style={{ marginBottom: 12 }}>
            <span className="caps" style={{ minWidth: 110 }}>Paste from IBIS</span>
            <input
              type="text"
              value={paste}
              placeholder="e.g. 0004, 0007, 12 — digits are extracted and matched"
              style={{ minWidth: 320 }}
              onChange={(e) => setPaste(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && paste.trim()) applyPaste()
              }}
            />
            <button className="btn sm" disabled={!paste.trim()} onClick={applyPaste}>
              Match
            </button>
          </div>
        )}

        {unknown.length > 0 && (
          <div className="note warn" style={{ marginBottom: 12 }}>
            <b>No candidate</b> for: {unknown.join(', ')} — check the numbers against IBIS. Matched
            numbers were added to the selection.
          </div>
        )}
        {error && <div className="note warn" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="samplerows">
          {view.rows.map((r) => {
            const on = selected.includes(r.studentId)
            return (
              <label key={r.studentId} className={`samplerow ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!editable || pending}
                  onChange={() => toggle(r.studentId)}
                />
                <span className="sn">{r.sessionNumber ?? '—'}</span>
                <span className="nm">{r.name}</span>
                <span className="mut" style={{ fontSize: 11.5 }}>
                  {r.total != null ? `${r.total}/${view.markMax}` : 'no mark'}
                  {r.fileDisplay !== 'done' && ' · no file'}
                </span>
              </label>
            )
          })}
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          {editable && (
            <button
              className="btn sm pri"
              disabled={pending}
              onClick={() => run(() => ia.saveSampleRequest(view.course.id, view.cohortId, selected))}
            >
              Save selection ({selected.length})
            </button>
          )}
          <button
            className="btn sm"
            disabled={chosenRows.length === 0}
            title="A ZIP with the sample's marks CSV and the manifest of expected files"
            onClick={() => void downloadPack()}
          >
            ⤓ {compactCourse}_IA_sample_{sessionLabel}.zip
          </button>
          {canEdit && sample && !submitted && (
            <button
              className="btn sm ghost"
              disabled={pending}
              onClick={() => run(() => ia.setSampleSubmitted(view.course.id, view.cohortId, true))}
            >
              Mark as submitted in eCoursework
            </button>
          )}
          {canEdit && submitted && (
            <button
              className="btn sm ghost"
              disabled={pending}
              title="Reopens the selection as a draft"
              onClick={() => run(() => ia.setSampleSubmitted(view.course.id, view.cohortId, false))}
            >
              Amend
            </button>
          )}
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 11.5 }}>
            {submitted
              ? 'Submitted — the selection is read-only. Amend reopens it as a draft.'
              : 'Files are a stub today: the manifest names what eCoursework expects, and real files slot in when storage lands.'}
          </span>
        </div>
      </div>
    </div>
  )
}
