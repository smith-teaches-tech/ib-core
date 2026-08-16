'use client'

// DOWNLOAD FOR IBIS — the upload board (IB-Export-and-Samples.md §3, mockup v9
// tab 3), wired to the spine. Three sections mirror how work leaves the
// building: whole-cohort eCoursework packs · moderation samples · what gets
// typed into IBIS by hand. Below them, the secondary downloads Michael asked
// for ("download everything / download THESE things"): all IAs, and the
// whole-cohort archive.
//
// Every ZIP is built client-side (jszip, like the sample pack): the scores or
// roster CSV is REAL today; file bytes pend storage, so a manifest names every
// expected file and says exactly which are pending and which are missing. When
// storage lands the same packs pick up real bytes — the shape does not change.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import JSZip from 'jszip'
import * as x from '@/lib/export/actions'
import type { CohortJob, IaFileGroup, PackRow, UploadBoardView } from '@/lib/export/types'

/** A cell starting with = + - @ is a formula to a spreadsheet; defang it. */
const defang = (s: string) => (/^[=+\-@]/.test(s) ? "'" + s : s)
const q = (s: string) => '"' + defang(s).replace(/"/g, '""') + '"'

function rosterCsv(rows: PackRow[]): string {
  const head = 'session_number,candidate,file,status'
  const lines = rows.map((r) =>
    [
      defang(r.sessionNumber ?? ''),
      q(r.name),
      r.fileName,
      r.present ? (r.submitted ? 'submitted' : 'ready') : (r.detail ?? 'missing'),
    ].join(','),
  )
  return [head, ...lines].join('\n')
}

function manifest(rows: PackRow[]): string {
  return rows
    .map((r) => {
      if (!r.present) return `${r.fileName} — MISSING — ${r.detail ?? 'not recorded yet'}`
      return r.source === 'generated'
        ? `${r.fileName} — generated from the typed entries into the official IB form (pending form-fill)`
        : `${r.fileName} — file pending — storage not yet connected`
    })
    .join('\n')
}

function saveZip(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

async function downloadJob(job: CohortJob, sessionLabel: string) {
  const zip = new JSZip()
  zip.file(job.csvName, rosterCsv(job.rows))
  zip.file(
    'manifest.txt',
    `${job.label} — ${sessionLabel}\n${job.ready} of ${job.total} ready\n\n` +
      manifest(job.rows) + '\n',
  )
  saveZip(await zip.generateAsync({ type: 'blob' }), job.zipName)
}

async function downloadAllIas(groups: IaFileGroup[], sessionLabel: string) {
  const zip = new JSZip()
  for (const g of groups) {
    const folder = zip.folder(g.compact)!
    folder.file(`${g.compact}_roster.csv`, rosterCsv(g.rows))
    folder.file('manifest.txt', `${g.courseName} — IA files (${sessionLabel})\n\n` + manifest(g.rows) + '\n')
  }
  saveZip(await zip.generateAsync({ type: 'blob' }), `All_IAs_${sessionLabel}.zip`)
}

async function downloadArchive(view: UploadBoardView) {
  const zip = new JSZip()
  for (const job of view.cohortJobs) {
    const folder = zip.folder(job.zipName.replace(/\.zip$/, ''))!
    folder.file(job.csvName, rosterCsv(job.rows))
    folder.file('manifest.txt', `${job.label} — ${view.sessionLabel}\n\n` + manifest(job.rows) + '\n')
  }
  const ias = zip.folder('IA_files')!
  for (const g of view.iaFiles) {
    const folder = ias.folder(g.compact)!
    folder.file(`${g.compact}_roster.csv`, rosterCsv(g.rows))
    folder.file('manifest.txt', `${g.courseName} — IA files (${view.sessionLabel})\n\n` + manifest(g.rows) + '\n')
  }
  saveZip(await zip.generateAsync({ type: 'blob' }), `${view.sessionLabel}_cohort_archive.zip`)
}

function StatusChip({ job }: { job: CohortJob }) {
  if (job.total === 0) return <span className="pill grey">nobody enrolled</span>
  if (job.submitted) return <span className="pill ok">submitted in eCoursework</span>
  if (job.ready === job.total) {
    return <span className="pill ok">ready for submission — {job.total} file{job.total === 1 ? '' : 's'}</span>
  }
  return <span className="pill gold">in progress — {job.total - job.ready} missing</span>
}

export default function UploadBoard({
  view,
  canSubmit,
  readOnly,
}: {
  view: UploadBoardView
  /** Holds `ecoursework.status` — may flip jobs to submitted. */
  canSubmit: boolean
  /** Archived cohort: a record, not a workspace. Downloads stay; writes go. */
  readOnly: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = (jobKey: string, on: boolean) => {
    setError(null)
    start(async () => {
      try {
        await x.setJobSubmitted(view.cohortId, jobKey, on)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  return (
    <>
      {error && <div className="note warn" style={{ marginBottom: 12 }}>{error}</div>}

      {/* ------------------------------------------------ whole cohort */}
      <div className="panel">
        <div className="panel-h">
          <h2>Whole cohort — uploaded for every candidate</h2>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            named <span className="mono">sessionNo_Component.pdf</span> · IBIS candidate order
          </span>
        </div>
        <div className="panel-b" style={{ paddingTop: 6 }}>
          {view.cohortJobs.map((job) => {
            const missing = job.rows.filter((r) => !r.present)
            return (
              <div className="xjob" key={job.key}>
                <div className="xjl">
                  {job.label}
                  <span className="crs">
                    {job.formNote ?? `uploaded by candidates · ${job.covers}`}
                  </span>
                  {missing.length > 0 && (
                    <details className="xmiss">
                      <summary>{missing.length} missing — who?</summary>
                      {missing.map((r) => (
                        <div key={r.studentId} className="xmissrow">
                          <span className="mono">{r.sessionNumber ?? '—'}</span> {r.name}
                          {r.detail ? <span className="mut"> · {r.detail}</span> : null}
                        </div>
                      ))}
                    </details>
                  )}
                </div>
                <span className={`xfrac ${job.total > 0 && job.ready === job.total ? 'ok' : job.ready === 0 ? 'zero' : 'mid'}`}>
                  {job.ready}/{job.total}
                </span>
                <StatusChip job={job} />
                <span className="spacer" />
                <button
                  className="btn sm"
                  disabled={job.ready === 0}
                  title="ZIP: the roster CSV + a manifest of every expected file. Real bytes arrive with storage."
                  onClick={() => void downloadJob(job, view.sessionLabel)}
                >
                  ⤓ {job.zipName}
                </button>
                {canSubmit && !readOnly && (
                  job.submitted ? (
                    <button className="btn sm" disabled={pending} title="Reopens the job"
                      onClick={() => submit(job.key, false)}>
                      Amend
                    </button>
                  ) : (
                    <button className="btn sm" disabled={pending || job.ready === 0}
                      title="Stamps eCoursework's own status on everything in the pack — the school record is untouched"
                      onClick={() => submit(job.key, true)}>
                      Mark as submitted
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------ samples */}
      <div className="panel">
        <div className="panel-h">
          <h2>Moderation samples — one per course, subject and level</h2>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            IBIS names the candidates after that course&apos;s marks go in
          </span>
        </div>
        <div className="panel-b" style={{ paddingTop: 6 }}>
          {view.sampleJobs.map((sj) => {
            const waiting = sj.marksIn < sj.enrolled
            const s = sj.sample
            return (
              <div className="xjob" key={sj.courseId + sj.kind}>
                <div className="xjl">
                  {sj.courseName}
                  <span className="crs">
                    {sj.enrolled} enrolled · {sj.marksIn} mark{sj.marksIn === 1 ? '' : 's'} in
                    {s ? ` · sample of ${s.size} recorded` : ''}
                  </span>
                </div>
                {waiting ? (
                  <span className="pill grey">
                    waiting — {sj.enrolled - sj.marksIn} mark{sj.enrolled - sj.marksIn === 1 ? '' : 's'} to enter
                  </span>
                ) : s == null ? (
                  <span className="pill info">marks in — paste the sample when IBIS issues it</span>
                ) : s.status === 'submitted' ? (
                  <span className="pill ok">
                    submitted{s.submittedAt ? ` · ${s.submittedAt.slice(0, 10)}` : ''}
                  </span>
                ) : s.filesReady === s.size && s.size > 0 ? (
                  <span className="pill ok">ready for submission — {s.size} files</span>
                ) : (
                  <span className="pill gold">
                    draft — {s.filesReady}/{s.size} files found
                  </span>
                )}
                <span className="spacer" />
                {sj.pickerHref ? (
                  <Link href={sj.pickerHref} className="btn sm">
                    {waiting ? 'Chase marks' : s?.status === 'submitted' ? 'View pack' : 'Open sample'}
                  </Link>
                ) : (
                  <span className="mut" style={{ fontSize: 11.5 }}>
                    picker arrives with the TOK module
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------ typed by hand */}
      <div className="panel">
        <div className="panel-h">
          <h2>Typed into IBIS by hand — no files</h2>
        </div>
        <div className="panel-b" style={{ paddingTop: 6 }}>
          {view.typedJobs.map((tj) => (
            <div className="xjob" key={tj.key}>
              <div className="xjl">
                {tj.label}
                <span className="crs">{tj.detail}</span>
              </div>
              <span className={`xfrac ${tj.total > 0 && tj.done === tj.total ? 'ok' : tj.done === 0 ? 'zero' : 'mid'}`}>
                {tj.done}/{tj.total}
              </span>
              {tj.done === tj.total && tj.total > 0 ? (
                <span className="pill ok">all typed</span>
              ) : (
                <span className="pill grey">{tj.total - tj.done} to type</span>
              )}
              <span className="spacer" />
              <Link href={tj.href} className="btn sm">
                {tj.key === 'ia_marks' ? 'Transcription view' : 'Candidate panel'}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ other downloads */}
      <div className="panel">
        <div className="panel-h">
          <h2>Other downloads</h2>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            the &ldquo;everything&rdquo; buttons — packs above stay the day-to-day route
          </span>
        </div>
        <div className="panel-b">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => void downloadAllIas(view.iaFiles, view.sessionLabel)}
              title="Every subject course's IA files, one folder per course, with a roster CSV each">
              ⤓ All_IAs_{view.sessionLabel}.zip
            </button>
            <button className="btn sm" onClick={() => void downloadArchive(view)}
              title="Every pack above in one ZIP — the end-of-season school archive">
              ⤓ {view.sessionLabel}_cohort_archive.zip
            </button>
          </div>
          <p className="mut" style={{ fontSize: 12, marginBottom: 0 }}>
            File bytes are a stub until storage lands: every ZIP already contains the real roster
            CSVs, and its manifest names each expected file so the pack&apos;s shape is checkable today.
          </p>
        </div>
      </div>
    </>
  )
}
