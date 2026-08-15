'use client'

// The roster: import, then enrol.
//
// Enrolment is the only thing that decides what a student is responsible for.
// There is no per-student requirement configuration anywhere in the system —
// requirements attach to courses, and a student's set is the union of what they
// take. Which means this table IS the answer to "why is this candidate missing
// from the Chemistry upload".

import { useState, useTransition } from 'react'
import * as setup from '@/lib/setup/actions'
import type { PersonRow } from '@/lib/setup/types'
import ImportStudents from './ImportStudents'
import Picker, { type PickerOption } from './Picker'

export default function StudentsTab({
  people,
  sectionOptions,
  cohortId,
  cohortLabel,
  canImport,
  canEnrol,
}: {
  people: PersonRow[]
  sectionOptions: PickerOption[]
  cohortId: string
  cohortLabel: string
  canImport: boolean
  canEnrol: boolean
}) {
  const [q, setQ] = useState('')
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

  const students = people
    .filter((p) => p.isStudent)
    .filter((p) =>
      q.trim() === '' ||
      (p.user.name + ' ' + p.user.email + ' ' + (p.studentNumber ?? '')).toLowerCase().includes(q.toLowerCase()),
    )

  return (
    <>
      <ImportStudents cohortId={cohortId} cohortLabel={cohortLabel} canImport={canImport} />

      <div className="row exptools" style={{ marginTop: 20 }}>
        <span className="caps" style={{ minWidth: 90 }}>Roster</span>
        <input
          type="text"
          value={q}
          placeholder="Search name, email or student number…"
          style={{ maxWidth: 300 }}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="mut" style={{ fontSize: 12 }}>
          {students.length} shown · a student&rsquo;s requirements are the union of the courses they
          take, so enrolment is the whole configuration.
        </span>
      </div>

      {error && <div className="note warn" style={{ marginTop: 12 }}>{error}</div>}

      <div className="tableshell">
        <table className="casroster">
          <thead>
            <tr>
              <th style={{ width: 165 }}>Candidate</th>
              <th>Student no.</th>
              <th>Email</th>
              <th>IB identifiers</th>
              <th>Courses</th>
              {canEnrol && <th style={{ width: 230 }}>Enrol in</th>}
            </tr>
          </thead>
          <tbody>
            {students.map((p) => (
              <tr key={p.user.id}>
                <td className="name">
                  {p.user.name}
                  {p.user.status === 'invited' && <span className="pill gold" style={{ marginLeft: 6 }}>invited</span>}
                </td>
                <td className="mono">{p.studentNumber ?? <span className="mut">—</span>}</td>
                <td className="mono mut">{p.user.email}</td>
                <td>
                  {p.candidate?.personalCode ? (
                    <span className="pill ok">
                      {p.candidate.sessionNumber} / {p.candidate.personalCode}
                    </span>
                  ) : (
                    <span className="pill grey" title="Arrives from the IB once exams are ordered">
                      not yet issued
                    </span>
                  )}
                </td>
                <td>
                  {p.enrolled.length === 0 && <span className="pill warn">Not enrolled</span>}
                  {p.enrolled.map((e) => (
                    <span key={e.sectionId} className="assigned">
                      {e.label}
                      {canEnrol && (
                        <button
                          className="mini"
                          title="Remove from this course"
                          disabled={pending}
                          onClick={() => run(() => setup.unenrolStudent(p.user.id, e.sectionId))}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </td>
                {canEnrol && (
                  <td>
                    <Picker
                      placeholder="Type a course…"
                      options={sectionOptions.map((o) => ({
                        ...o,
                        disabled: p.enrolled.some((e) => e.sectionId === o.id),
                      }))}
                      onPick={(sectionId) => run(() => setup.enrolStudent(p.user.id, sectionId))}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
