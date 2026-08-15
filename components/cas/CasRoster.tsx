'use client'

// The CAS coordinator's screen. One row per student, expandable in place — no
// separate pages, exactly as the mockup draws it.
//
// What replaced the mockup's "⚑ Needs my attention" panel: the two count columns.
// A queue grows without limit and becomes wallpaper; "3 unapproved, 1 awaiting
// completion" is the same information, bounded by the size of the cohort, and it
// sits next to the student it belongs to. Same for the auto-flag — the indicator
// is set by a human who has met them.

import { useState, useTransition } from 'react'
import * as cas from '@/lib/cas/actions'
import { completionGate } from '@/lib/cas/derive'
import {
  INDICATOR_META,
  type CasCohortTotals, type CasRosterRow, type IndicatorValue,
} from '@/lib/cas/types'
import ExperienceCard from './ExperienceCard'
import InterviewsPane from './InterviewsPane'
import { IndicatorGlyph, StrandChips, prettyDate } from './parts'

type Filter = 'all' | 'at_risk' | 'awaiting'

/** Click cycles. Unset is a real state — most students should be on it. */
const NEXT_INDICATOR: Record<string, IndicatorValue | null> = {
  none: 'on_track',
  on_track: 'excellent',
  excellent: 'at_risk',
  at_risk: null,
}

export default function CasRoster({
  rows,
  totals,
  cohortLabel,
  canManage,
  canUnlock,
}: {
  rows: CasRosterRow[]
  totals: CasCohortTotals
  cohortLabel: string
  canManage: boolean
  canUnlock: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const shown = rows.filter((r) =>
    filter === 'at_risk'
      ? r.summary.indicator === 'at_risk'
      : filter === 'awaiting'
        ? r.summary.unapproved + r.summary.awaiting > 0
        : true,
  )

  return (
    <>
      <h1>CAS — {cohortLabel}</h1>
      <p className="sub">
        One row per candidate. Open a row to read the experiences, the dated threads and the
        interview records.
      </p>

      <div className="grid" style={{ marginBottom: 14 }}>
        <div className="tile stat">
          <div className="k">Candidates</div>
          <div className="v">{totals.students}</div>
        </div>
        <div className="tile stat">
          <div className="k">Marked at risk</div>
          <div className="v" style={{ color: 'var(--warn)' }}>{totals.atRisk}</div>
        </div>
        <div className="tile stat">
          <div className="k">Avg outcomes confirmed</div>
          <div className="v">
            {totals.avgOutcomes}
            <small>/7</small>
          </div>
        </div>
        <div className="tile stat">
          <div className="k">Projects complete</div>
          <div className="v">
            {totals.projectsComplete}
            <small>/{totals.students}</small>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>Students</h2>
          <span className="filterchips" style={{ marginLeft: 12 }}>
            {([
              ['all', 'All'],
              ['at_risk', 'At risk'],
              ['awaiting', 'Awaiting action'],
            ] as [Filter, string][]).map(([k, label]) => (
              <button
                key={k}
                className={`fchip ${filter === k ? 'active' : ''}`}
                onClick={() => setFilter(k)}
              >
                {label}
              </button>
            ))}
          </span>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            {shown.length} of {rows.length} shown
          </span>
        </div>

        <div className="tableshell">
          <table className="casroster">
            <thead>
              <tr>
                <th style={{ width: 200 }}>Candidate</th>
                <th>Strands</th>
                <th>Outcomes</th>
                <th>Project</th>
                <th>Unapproved</th>
                <th>Awaiting completion</th>
                <th>Interviews</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <RosterRow
                  key={row.studentId}
                  row={row}
                  open={openId === row.studentId}
                  onToggle={() => setOpenId(openId === row.studentId ? null : row.studentId)}
                  canManage={canManage}
                  canUnlock={canUnlock}
                />
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="mut">Nothing matches that filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel-b" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="note">
            <b>Outcomes are counted only when confirmed.</b> A student can claim LO6 on
            everything they do; it appears on the board when a supervisor, or you, says they saw
            it. The gap between claimed and confirmed is the part of the record that is worth
            anything.
          </div>
        </div>
      </div>
    </>
  )
}

function RosterRow({
  row,
  open,
  onToggle,
  canManage,
  canUnlock,
}: {
  row: CasRosterRow
  open: boolean
  onToggle: () => void
  canManage: boolean
  canUnlock: boolean
}) {
  const [tab, setTab] = useState<'experiences' | 'interviews' | 'notes'>('experiences')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const s = row.summary
  const gate = completionGate(s)

  const run = (fn: () => Promise<unknown>) => {
    setError(null)
    start(async () => {
      try {
        await fn()
        setNote('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const cycle = () =>
    run(() => cas.setIndicator(row.studentId, NEXT_INDICATOR[s.indicator ?? 'none']))

  return (
    <>
      <tr className={`srow ${open ? 'open' : ''}`} onClick={onToggle}>
        <td className="name">
          <span className="chev">▶</span>
          {row.studentName}
        </td>
        <td><StrandChips strands={s.strands} showAll /></td>
        <td>
          <span className={`pill ${s.outcomes.length === 7 ? 'ok' : s.outcomes.length >= 4 ? 'info' : 'warn'}`}>
            {s.outcomes.length}/7
          </span>
        </td>
        <td>
          <span className={`pill ${s.project === 'complete' ? 'ok' : s.project === 'in_progress' ? 'info' : 'grey'}`}>
            {s.project === 'complete' ? 'Complete' : s.project === 'in_progress' ? 'In progress' : 'Not started'}
          </span>
        </td>
        <td><span className={`count ${s.unapproved ? 'hot' : ''}`}>{s.unapproved}</span></td>
        <td><span className={`count ${s.awaiting ? 'hot' : ''}`}>{s.awaiting}</span></td>
        <td>
          <span className={`pill ${s.interviews === 3 ? 'info' : 'grey'}`}>{s.interviews}/3</span>
        </td>
        <td style={{ textAlign: 'center' }}>
          {canManage ? (
            <button
              className="ind"
              disabled={pending}
              title={
                s.indicator
                  ? `${INDICATOR_META[s.indicator].label} — click to change`
                  : 'Not yet assessed — click to set'
              }
              onClick={(e) => {
                e.stopPropagation()
                cycle()
              }}
            >
              {s.indicator ? INDICATOR_META[s.indicator].emoji : '⚪'}
            </button>
          ) : (
            <IndicatorGlyph value={s.indicator} />
          )}
        </td>
      </tr>

      {open && (
        <tr className="casdrawer">
          <td colSpan={8}>
            <div className="casdrawer-inner">
              <div className="tabs">
                <button
                  className={`tab ${tab === 'experiences' ? 'active' : ''}`}
                  onClick={() => setTab('experiences')}
                >
                  Experiences ({row.experiences.length})
                </button>
                <button
                  className={`tab ${tab === 'interviews' ? 'active' : ''}`}
                  onClick={() => setTab('interviews')}
                >
                  Interviews ({s.interviews}/3)
                </button>
                <button
                  className={`tab ${tab === 'notes' ? 'active' : ''}`}
                  onClick={() => setTab('notes')}
                >
                  Notes ({row.notes.length})
                </button>
              </div>

              {error && <div className="note warn" style={{ marginBottom: 10 }}>{error}</div>}

              {tab === 'experiences' && (
                <>
                  {s.awaiting > 0 && (
                    <div className="note warn" style={{ marginBottom: 12 }}>
                      {s.awaiting} experience{s.awaiting === 1 ? ' is' : 's are'} awaiting
                      completion — open{s.awaiting === 1 ? ' it' : ' them'} to verify the sign-off
                      and confirm the outcomes.
                    </div>
                  )}
                  {row.experiences.length === 0 && (
                    <p className="mut">No experiences recorded yet.</p>
                  )}
                  {row.experiences.map((v) => (
                    <ExperienceCard
                      key={v.experience.id}
                      view={v}
                      mode="coordinator"
                      canManage={canManage}
                    />
                  ))}

                  {/* cas.complete — the one CAS requirement recorded, not derived */}
                  <div className="actionbar">
                    <span className="lbl">CAS complete</span>
                    {s.complete ? (
                      <>
                        <span className="pill ok">Confirmed</span>
                        {canManage && (
                          <button
                            className="btn danger sm"
                            disabled={pending}
                            onClick={() => run(() => cas.setCasComplete(row.studentId, false))}
                          >
                            Withdraw confirmation
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          className="btn pri sm"
                          disabled={pending || !gate.ready || !canManage}
                          onClick={() => run(() => cas.setCasComplete(row.studentId, true))}
                        >
                          ✓ Confirm CAS complete
                        </button>
                        <span className="mut" style={{ fontSize: 12 }}>
                          {gate.ready
                            ? 'All seven outcomes, the project and three interviews are recorded.'
                            : 'Still outstanding: ' + gate.missing.join(' · ')}
                        </span>
                      </>
                    )}
                  </div>
                </>
              )}

              {tab === 'interviews' && (
                <InterviewsPane
                  studentId={row.studentId}
                  interviews={row.interviews}
                  canManage={canManage}
                  canUnlock={canUnlock}
                />
              )}

              {tab === 'notes' && (
                <>
                  <div className="note">
                    Notes are messages to the student — for arranging an extra interview, or a
                    nudge. <b>They can see these.</b>
                  </div>
                  {row.notes.map((n) => (
                    <div className="linkrow" key={n.id}>
                      <div className="lk">
                        {n.body}
                        <div className="mut" style={{ fontSize: 12 }}>
                          {n.authorName} · {prettyDate(n.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {canManage && (
                    <>
                      <label className="fld">Write a note to {row.studentName}</label>
                      <textarea
                        rows={3}
                        value={note}
                        placeholder="Write a note…"
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <div style={{ marginTop: 8 }}>
                        <button
                          className="btn pri sm"
                          disabled={pending || !note.trim()}
                          onClick={() => run(() => cas.addNote(row.studentId, note))}
                        >
                          Send note
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
