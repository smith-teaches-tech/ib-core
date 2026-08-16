'use client'

// New year group — two starts, one rule.
//
// CLONE copies STRUCTURE from an existing cohort: courses (their sections),
// who teaches them (markership included), and fresh requirement definitions
// instantiated from the CURRENT IA templates. SCRATCH creates an empty cohort
// and courses arrive later through Add & assign. Neither ever copies
// students, enrolments, marks or recorded states — work belongs to the year
// it happened in.

import { useState, useTransition } from 'react'
import * as setup from '@/lib/setup/actions'

export default function CreateCohort({
  sources,
}: {
  /** Cohorts whose structure can be cloned — label as the picker shows it. */
  sources: { id: string; label: string }[]
}) {
  const [label, setLabel] = useState('')
  const [gradYear, setGradYear] = useState('')
  const [mode, setMode] = useState<'clone' | 'scratch'>(sources.length > 0 ? 'clone' : 'scratch')
  const [from, setFrom] = useState(sources[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () => {
    setError(null)
    setCreated(null)
    start(async () => {
      try {
        const name = label
        await setup.createCohort(name, Number(gradYear), mode === 'clone' ? from : null)
        setCreated(name)
        setLabel('')
        setGradYear('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panel-h">
        <h2>New cohort</h2>
      </div>
      <div className="panel-b">
        <div className="row">
          <input
            className="cmtin"
            placeholder="Label — e.g. Class of 2029"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={pending}
            style={{ minWidth: 220 }}
          />
          <input
            className="cmtin"
            type="number"
            placeholder="Graduating year"
            value={gradYear}
            onChange={(e) => setGradYear(e.target.value)}
            disabled={pending}
            style={{ width: 140 }}
          />
        </div>

        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <label style={{ fontSize: 13 }}>
            <input
              type="radio"
              name="cohort-start"
              checked={mode === 'clone'}
              onChange={() => setMode('clone')}
              disabled={pending || sources.length === 0}
            />{' '}
            Clone structure from
          </label>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={pending || mode !== 'clone'}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <label style={{ fontSize: 13 }}>
            <input
              type="radio"
              name="cohort-start"
              checked={mode === 'scratch'}
              onChange={() => setMode('scratch')}
              disabled={pending}
            />{' '}
            Start from scratch
          </label>
        </div>

        <p className="mut" style={{ fontSize: 12, margin: '10px 0' }}>
          {mode === 'clone'
            ? 'Cloning copies courses, sections and teacher assignments, and instantiates fresh requirement definitions from the current IA templates. It never copies students, enrolments, marks or recorded states.'
            : 'An empty year group — add courses and sections through Add & assign, exactly as usual.'}
        </p>

        {error && <div className="note warn" style={{ marginBottom: 10 }}>{error}</div>}
        {created && (
          <div className="note" style={{ marginBottom: 10 }}>
            Created <b>{created}</b> — live, and already in every year-group picker.
          </div>
        )}

        <div className="row">
          <button
            className="btn sm pri"
            disabled={pending || !label.trim() || !gradYear.trim()}
            onClick={submit}
          >
            Create cohort
          </button>
        </div>
      </div>
    </div>
  )
}
