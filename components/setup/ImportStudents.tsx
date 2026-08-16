'use client'

// Paste a roster, look at what it will do, then commit.
//
// The preview is the whole design. An import that silently creates duplicates,
// or silently drops a row it could not parse, is worse than no import — you find
// out in March when a candidate is missing from an upload. So nothing is written
// until the coordinator has seen every row and what will happen to it.

import { useState, useTransition } from 'react'
import * as setup from '@/lib/setup/actions'
import type { ImportPreview, RowVerdict } from '@/lib/setup/types'

const VERDICT: Record<RowVerdict, { pill: string; label: string }> = {
  new: { pill: 'ok', label: 'Will import' },
  already_here: { pill: 'grey', label: 'Already here' },
  duplicate_in_paste: { pill: 'gold', label: 'Duplicate' },
  error: { pill: 'warn', label: 'Cannot import' },
}

const SAMPLE = `Last Name\tFirst Name\tEmail\tStudent number
Nakamura\tRen\trnakamura@isg.edu.sa\t204233
Osei\tAma\taosei@isg.edu.sa\t204236`

export default function ImportStudents({
  cohortId,
  cohortLabel,
  canImport,
}: {
  cohortId: string
  cohortLabel: string
  canImport: boolean
}) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  if (!canImport) {
    return (
      <div className="note warn">
        <b>You cannot import students at this school.</b> The District coordinator grants this
        under <b>Permissions</b>. Nothing here is hidden from you — you simply have not been given
        the <code>students.add</code> capability.
      </div>
    )
  }

  return (
    <>
      <div className="note">
        <b>Upload a CSV, or paste straight from a spreadsheet</b> — Last name · First name · Email ·
        Student number, tab or comma separated. A header row is detected and skipped. Nothing is
        written until you have seen the preview.
      </div>

      <div className="row exptools" style={{ marginTop: 12 }}>
        <span className="caps" style={{ minWidth: 70 }}>Upload</span>
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setError(null)
            // Read in the browser and drop it into the same box. The parser
            // already handles both separators, so a file and a paste are the
            // same input — one code path, one preview, one set of verdicts.
            file
              .text()
              .then((body) => {
                setText(body.trim())
                setPreview(null)
                setDone(null)
              })
              .catch(() => setError('That file could not be read as text.'))
          }}
        />
        <span className="mut" style={{ fontSize: 12 }}>
          A .csv or .tsv export from Skyward. Excel workbooks need saving as CSV first.
        </span>
      </div>

      <label className="fld">
        Roster for {cohortLabel}
        <span className="wc">{text.split('\n').filter((l) => l.trim()).length} lines</span>
      </label>
      <textarea
        className="big mono"
        rows={8}
        value={text}
        placeholder={SAMPLE}
        onChange={(e) => {
          setText(e.target.value)
          setPreview(null)
          setDone(null)
        }}
      />

      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn"
          disabled={pending || !text.trim()}
          onClick={() => run(async () => setPreview(await setup.previewImport(text)))}
        >
          Check this roster
        </button>
        {preview && preview.newCount > 0 && (
          <button
            className="btn pri"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const n = await setup.importStudents(cohortId, preview.rows)
                setDone(n)
                setPreview(null)
                setText('')
              })
            }
          >
            Import {preview.newCount} student{preview.newCount === 1 ? '' : 's'}
          </button>
        )}
        <span className="mut" style={{ fontSize: 12 }}>
          Email is the key — it is what Google sign-in will match on later.
        </span>
      </div>

      {error && <div className="note warn" style={{ marginTop: 12 }}>{error}</div>}

      {done != null && (
        <div className="note ok" style={{ marginTop: 12 }}>
          <b>{done} student{done === 1 ? '' : 's'} imported into {cohortLabel}.</b> They have no IB
          candidate identifiers yet — those arrive from the IB once exams are ordered, and are added
          on the candidates screen then. Enrol them in courses below.
        </div>
      )}

      {preview && (
        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="pill ok">{preview.newCount} will import</span>
            {preview.skipCount > 0 && <span className="pill grey">{preview.skipCount} skipped</span>}
            {preview.errorCount > 0 && <span className="pill warn">{preview.errorCount} cannot import</span>}
            {preview.headerSkipped && <span className="mut" style={{ fontSize: 12 }}>Header row detected and skipped.</span>}
          </div>

          <div className="tableshell">
            <table className="casroster">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Last</th>
                  <th>First</th>
                  <th>Email</th>
                  <th>Student no.</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="mut">{r.line}</td>
                    <td>{r.lastName || <span className="mut">—</span>}</td>
                    <td>{r.firstName || <span className="mut">—</span>}</td>
                    <td className="mono">{r.email || <span className="mut">—</span>}</td>
                    <td className="mono">{r.studentNumber || <span className="mut">—</span>}</td>
                    <td>
                      <span className={`pill ${VERDICT[r.verdict].pill}`}>{VERDICT[r.verdict].label}</span>
                      {r.message && (
                        <div className="mut" style={{ fontSize: 12, marginTop: 2 }}>{r.message}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
