'use client'

// THE SCHOOL'S OWN A–E TABLE.
//
// Not the IB's. No official boundary table could be found for any session, and
// the sources that publish one disagree about whether it moves — so the app
// holds no claim about the IB's, and applies the one the teacher entered.
//
// It CARRIES FORWARD to a new year group and arrives UNCONFIRMED, which is the
// opposite of the prescribed titles two panels up. A teacher who retypes four
// numbers every August will eventually type one wrong; a teacher who never
// looks at a carried table will eventually apply last year's. Carrying it and
// making them confirm it costs one click and answers both.

import { useState, useTransition } from 'react'
import type { TokBoundaryTable } from '@/lib/tok/types'
import { boundaryProblems } from '@/lib/tok/types'
import { TOK_TOTAL_MAX } from '@/lib/tok/rubric'
import { confirmBoundaries, setBoundaries } from '@/lib/tok/actions'

const GRADES = ['A', 'B', 'C', 'D'] as const

export default function TokBoundaries({
  cohortId, sessionLabel, table, canEdit,
}: {
  cohortId: string
  sessionLabel: string
  table: TokBoundaryTable
  canEdit: boolean
}) {
  const [lower, setLower] = useState(table.lower)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const problems = boundaryProblems(lower)
  const upperFor = (g: 'A' | 'B' | 'C' | 'D' | 'E') =>
    g === 'A' ? TOK_TOTAL_MAX
      : g === 'B' ? lower.A - 1
        : g === 'C' ? lower.B - 1
          : g === 'D' ? lower.C - 1
            : lower.D - 1

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Grade boundaries — {sessionLabel}</h2>
        <span className="spacer" />
        {table.confirmed
          ? <span className="pill ok">confirmed {table.confirmedAt}</span>
          : <span className="pill gold">not confirmed for this session</span>}
      </div>
      <div className="panel-b">
        {!table.confirmed && (
          <div className="note gold" style={{ marginBottom: 12 }}>
            <b>
              {table.carriedFrom
                ? 'Carried over from the previous year group, and not confirmed for this session yet.'
                : 'This is a starting point, not the IB’s table.'}
            </b>{' '}
            The IB moves these between sessions, so a table nobody has looked at is a guess. Until
            you confirm it, every indicative letter below says it is on an unconfirmed table.
            Confirming an unchanged table is one click — it just has to be your click.
          </div>
        )}

        <div className="row" style={{ alignItems: 'flex-start' }}>
          <table className="eeroster" style={{ width: 'auto' }}>
            <thead>
              <tr>
                <th>Grade</th>
                <th style={{ textAlign: 'right' }}>From</th>
                <th style={{ textAlign: 'right' }}>To</th>
              </tr>
            </thead>
            <tbody>
              {GRADES.map((g) => (
                <tr key={g}>
                  <td><b>{g}</b></td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      className="cin"
                      value={String(lower[g])}
                      disabled={!canEdit}
                      onChange={(e) => setLower({
                        ...lower, [g]: Number(e.target.value.replace(/[^0-9]/g, '')) || 0,
                      })}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>{upperFor(g)}</td>
                </tr>
              ))}
              <tr>
                <td><b>E</b></td>
                <td style={{ textAlign: 'right' }} className="mut">0</td>
                <td style={{ textAlign: 'right' }}>{upperFor('E')}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ flex: 1, minWidth: 220 }}>
            <p className="mut" style={{ fontSize: 11.5, margin: '10px 0 10px' }}>
              You set the lower bound of each grade; the upper follows from the grade above, so the
              table can never have a gap or an overlap in it. E is always the floor.
            </p>
            {canEdit && (
              <div className="row">
                <button
                  className="btn pri"
                  disabled={pending || problems.length > 0}
                  onClick={() => start(async () => {
                    setMessage((await setBoundaries(cohortId, lower)).message ?? null)
                  })}
                >
                  {pending ? 'Saving…' : 'Save table'}
                </button>
                {!table.confirmed && problems.length === 0 && (
                  <button
                    className="btn"
                    disabled={pending}
                    onClick={() => start(async () => { await confirmBoundaries(cohortId) })}
                  >
                    Confirm unchanged
                  </button>
                )}
              </div>
            )}
            {problems.map((x) => (
              <p key={x} className="mut" style={{ fontSize: 11.5, margin: '8px 0 0' }}>{x}</p>
            ))}
            {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
