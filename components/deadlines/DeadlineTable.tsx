'use client'

// DUE DATES — one screen, two audiences.
//
// Reading a date is not sensitive: students see their own, and a teacher seeing
// when Chemistry's IA is due is useful rather than nosy. So the LIST is the same
// for everyone and the EDITING differs row by row — `mayEdit`, decided in the
// repository so this component cannot be the thing that gets it wrong.
//
// A predicted-grade row is locked for a teacher on purpose: a PG point is a
// cohort-wide commitment and the April one is an IB deadline the coordinator
// signs for.

import { useState, useTransition } from 'react'
import * as dl from '@/lib/deadline-actions'
import type { ResolvedDeadline, UnsetStage } from '@/lib/data/repository'

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function when(daysAway: number, done: number, total: number) {
  if (total > 0 && done === total) return { text: 'all in', tone: 'ok' as const }
  if (daysAway < 0) return { text: `${-daysAway} day${daysAway === -1 ? '' : 's'} ago`, tone: 'warn' as const }
  if (daysAway === 0) return { text: 'today', tone: 'gold' as const }
  if (daysAway <= 14) return { text: `in ${daysAway} days`, tone: 'gold' as const }
  return { text: `in ${daysAway} days`, tone: 'grey' as const }
}

export default function DeadlineTable({
  rows,
  unset,
  cohortId,
  cohortLabel,
  courses,
  stages,
  canAddAnything,
  readOnly,
  readOnlyReason,
}: {
  rows: ResolvedDeadline[]
  /** Datable stages with no date. OFFERED, never demanded — see the section below. */
  unset: UnsetStage[]
  cohortId: string
  cohortLabel: string
  /** Courses this viewer may date, for the add form. */
  courses: { id: string; name: string }[]
  /** Stages this viewer may date. PG stages are absent unless they hold deadlines.set. */
  stages: { key: string; label: string; cohortWide: boolean }[]
  canAddAnything: boolean
  /** An archived cohort is a record, not a workspace — nothing here is settable. */
  readOnly: boolean
  readOnlyReason?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [stage, setStage] = useState(stages[0]?.key ?? '')
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [dueAt, setDueAt] = useState('')
  const [major, setMajor] = useState(true)
  const [decidedBy, setDecidedBy] = useState('')

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

  const chosen = stages.find((s) => s.key === stage)
  const late = rows.filter((r) => r.daysAway < 0 && r.done < r.total).length

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          <h2>Due dates <span className="mut">{cohortLabel}</span></h2>
          <span className="pill grey">{rows.length} set</span>
          {late > 0 && (
            <span className="pill warn" title="Dates that have passed with work still outstanding.">
              {late} passed with work outstanding
            </span>
          )}
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            Setting a date here is what makes a cell late everywhere else.
          </span>
        </div>

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

        <div className="panel-b" style={{ paddingTop: 6 }}>
          <table className="dl">
            <thead>
              <tr>
                <th style={{ width: 66 }}>Date</th>
                <th>What</th>
                <th>Course</th>
                <th style={{ textAlign: 'center' }}>In</th>
                <th>Decided by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const w = when(r.daysAway, r.done, r.total)
                const d = new Date(r.deadline.dueAt + 'T00:00:00Z')
                return (
                  <tr key={r.deadline.id}>
                    <td>
                      <span className="dlday">
                        <b>{d.getUTCDate()}</b>
                        <small>{MON[d.getUTCMonth()]} {String(d.getUTCFullYear()).slice(-2)}</small>
                      </span>
                    </td>
                    <td>
                      <b>{r.label}</b>
                      {r.deadline.isMajor && (
                        <span className="pill gold" style={{ fontSize: 10, marginLeft: 6 }}>major</span>
                      )}
                      <div className="mut" style={{ fontSize: 11 }}>
                        {r.courses === 1 ? '1 requirement' : `${r.courses} requirements`}
                        {r.deadline.supersedes && ' · moved'}
                      </div>
                    </td>
                    <td>{r.courseName}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`pill ${w.tone}`}>{r.done}/{r.total}</span>
                      <div className="mut" style={{ fontSize: 10.5, marginTop: 2 }}>{w.text}</div>
                    </td>
                    <td className="who">{r.deadline.decidedBy}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.mayEdit ? (
                        <>
                          <input
                            type="date"
                            defaultValue={r.deadline.dueAt}
                            disabled={pending}
                            title="Change the date — the old one is superseded, not erased"
                            onChange={(e) => {
                              const v = e.target.value
                              if (v && v !== r.deadline.dueAt) {
                                run(() =>
                                  dl.setDeadline(
                                    cohortId, r.deadline.requirementKey, r.deadline.courseId,
                                    v, r.deadline.isMajor, r.deadline.decidedBy,
                                  ),
                                )
                              }
                            }}
                          />{' '}
                          <button
                            className="btn sm ghost"
                            disabled={pending}
                            onClick={() => run(() => dl.removeDeadline(cohortId, r.deadline.id))}
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <span className="locked" title={r.lockedBecause}>
                          <LockGlyph />
                          {r.tier === 'programme' ? 'coordinator only' : 'not your course'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {unset.length > 0 && !readOnly && (
            /*
              NOT SET — offered, never demanded.

              No count, no badge, no colour, and nothing anywhere else in the
              product asks why a row is still here. Some teachers run their
              pacing in Google Classroom and always will, so unset has to be a
              legitimate permanent state rather than a gap the product complains
              about. It is collapsed by default for the same reason.

              Students never see this at all: a blank date reads to them as "my
              teacher does not run deadlines here", which is true, and "no date
              set" would only invite them to go and ask for one.
            */
            <details className="unset">
              <summary className="mut" style={{ fontSize: 12, cursor: 'pointer', padding: '8px 0' }}>
                Dates not set ({unset.length}) — optional
              </summary>
              <table className="dl">
                <tbody>
                  {unset.map((u) => (
                    <tr key={u.key + '/' + (u.courseId ?? '*')}>
                      <td style={{ width: 66 }} className="mut">—</td>
                      <td>
                        <b>{u.label}</b>
                        <div className="mut" style={{ fontSize: 11 }}>{u.lane}</div>
                      </td>
                      <td>{u.courseName}</td>
                      <td colSpan={2} className="mut" style={{ fontSize: 11.5 }}>
                        No date. Nothing is late without one.
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <input
                          type="date"
                          disabled={pending}
                          title="Set a date for this"
                          onChange={(e) => {
                            const v = e.target.value
                            if (v) {
                              run(() =>
                                dl.setDeadline(cohortId, u.key, u.courseId, v, false, decidedBy),
                              )
                            }
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mut" style={{ fontSize: 11.5, paddingBottom: 8 }}>
                Leaving these blank is a choice, not an omission — a stage with no date simply
                never goes late, and nothing here will ask again.
              </div>
            </details>
          )}

          {canAddAnything ? (
            <div className="addrow">
              <label>
                <div className="caps">What</div>
                <select value={stage} onChange={(e) => setStage(e.target.value)}>
                  {stages.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <div className="caps">Course</div>
                <select
                  value={chosen?.cohortWide ? '' : courseId}
                  disabled={chosen?.cohortWide}
                  onChange={(e) => setCourseId(e.target.value)}
                >
                  {chosen?.cohortWide ? (
                    <option value="">All courses</option>
                  ) : (
                    courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
                  )}
                </select>
              </label>
              <label>
                <div className="caps">Date</div>
                <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </label>
              <label>
                <div className="caps">Decided by</div>
                <input
                  type="text"
                  size={26}
                  placeholder="IB planning meeting, 4 Sep 26"
                  value={decidedBy}
                  onChange={(e) => setDecidedBy(e.target.value)}
                />
              </label>
              <label className="row" style={{ gap: 6, paddingBottom: 7 }}>
                <input type="checkbox" checked={major} onChange={(e) => setMajor(e.target.checked)} />
                <span className="caps" style={{ marginBottom: 0 }}>Major</span>
              </label>
              <button
                className="btn pri"
                disabled={pending || !dueAt || !stage}
                onClick={() =>
                  run(async () => {
                    await dl.setDeadline(
                      cohortId, stage, chosen?.cohortWide ? null : courseId,
                      dueAt, major, decidedBy,
                    )
                    setDueAt('')
                  })
                }
              >
                {pending ? 'Saving…' : 'Add date'}
              </button>
            </div>
          ) : (
            <div className="note" style={{ marginTop: 12 }}>
              You can change dates on courses you are the designated marker of. Adding a new one, and
              anything cohort-wide, is the IB coordinator&rsquo;s.
            </div>
          )}

          <div className="mut" style={{ fontSize: 11.5, marginTop: 10 }}>
            A cohort-wide date is the default; a course-specific one overrides it. Moving a date
            <b> supersedes</b> the old row rather than erasing it — so &ldquo;what did we tell them in
            September&rdquo; stays answerable.
          </div>
        </div>
      </div>
    </>
  )
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 10 12" fill="none" aria-hidden="true">
      <rect x="1" y="5" width="8" height="6.2" rx="1.4" fill="currentColor" />
      <path d="M2.9 5V3.4a2.1 2.1 0 0 1 4.2 0V5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
