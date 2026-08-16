'use client'

// Teachers, and what they teach.
//
// One uniform way to be attached to anything: a TeachingAssignment onto a
// course's (invisible, exactly-one) section. That is what makes handing TOK to
// a different teacher a one-row change, and it is why the bug where a teacher
// saw every course is structurally impossible rather than merely fixed.

import { useState, useTransition } from 'react'
import * as setup from '@/lib/setup/actions'
import type { PersonRow } from '@/lib/setup/types'
import Picker, { type PickerOption } from './Picker'

export default function TeachersTab({
  people,
  sectionOptions,
  canInvite,
  canAssign,
}: {
  people: PersonRow[]
  sectionOptions: PickerOption[]
  canInvite: boolean
  canAssign: boolean
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const staff = people.filter((p) => !p.isStudent)

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

  return (
    <>
      {canInvite ? (
        <div className="row exptools">
          <span className="caps" style={{ minWidth: 90 }}>Invite</span>
          <input
            type="text"
            value={name}
            placeholder="Name, e.g. R. Farouk"
            style={{ maxWidth: 210 }}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="text"
            value={email}
            placeholder="school email"
            style={{ maxWidth: 250 }}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="btn pri sm"
            disabled={pending || !name.trim() || !email.includes('@')}
            onClick={() =>
              run(async () => {
                await setup.inviteTeacher(name, email)
                setName('')
                setEmail('')
              })
            }
          >
            Invite
          </button>
          <span className="mut" style={{ fontSize: 12 }}>
            They appear as <b>invited</b> until sign-in exists.
          </span>
        </div>
      ) : (
        <div className="note warn">
          <b>You cannot invite teachers at this school.</b> The District coordinator grants this
          under <b>Permissions</b>.
        </div>
      )}

      {error && <div className="note warn" style={{ marginTop: 12 }}>{error}</div>}

      <div className="tableshell" style={{ marginTop: 14 }}>
        <table className="casroster">
          <thead>
            <tr>
              <th style={{ width: 170 }}>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Teaches</th>
              {canAssign && <th style={{ width: 250 }}>Assign to a course</th>}
            </tr>
          </thead>
          <tbody>
            {staff.map((p) => (
              <tr key={p.user.id}>
                <td className="name">
                  {p.user.name}
                  {p.user.status === 'invited' && <span className="pill gold" style={{ marginLeft: 6 }}>invited</span>}
                </td>
                <td className="mono mut">{p.user.email}</td>
                <td>
                  {p.roles.map((r) => (
                    <span key={r} className="pill grey" style={{ marginRight: 4 }}>
                      {r.replace(/_/g, ' ')}
                    </span>
                  ))}
                </td>
                <td>
                  {p.teaches.length === 0 && <span className="mut">—</span>}
                  {p.teaches.map((t) => (
                    <span key={t.sectionId} className="assigned">
                      {t.label}
                      {canAssign && (
                        <>
                          <button
                            className="mini"
                            title="Designated marker — the teacher the IB holds responsible for this course's marks"
                            disabled={pending}
                            onClick={() => run(() => setup.setDesignatedMarker(p.user.id, t.sectionId, true))}
                          >
                            ★
                          </button>
                          <button
                            className="mini"
                            title="Remove from this course"
                            disabled={pending}
                            onClick={() => run(() => setup.unassignTeacher(p.user.id, t.sectionId))}
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </span>
                  ))}
                </td>
                {canAssign && (
                  <td>
                    <Picker
                      placeholder="Type a course…"
                      options={sectionOptions.map((o) => ({
                        ...o,
                        disabled: p.teaches.some((t) => t.sectionId === o.id),
                      }))}
                      onPick={(sectionId) => run(() => setup.assignTeacher(p.user.id, sectionId))}
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
