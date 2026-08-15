'use client'

// Delegation: the district coordinator deciding what a school coordinator may do.
//
// TWO RULES MAKE THIS SAFE, and both live in lib/capabilities.ts rather than here:
//
//  1. NO PRIVILEGE ESCALATION — you cannot grant a capability you do not hold.
//     Without it, anyone who can assign roles could bootstrap themselves to
//     everything, and the district tier would mean nothing.
//  2. DEVIATIONS ARE STORED, NOT ANSWERS — a membership records what was added
//     and removed relative to its preset, never the resolved set. So improving a
//     preset later still reaches everyone who was not explicitly overridden.
//
// The screen is a grid of checkboxes. The care is underneath it.

import { useState, useTransition } from 'react'
import * as setup from '@/lib/setup/actions'
import { CAPABILITIES } from '@/lib/capabilities'
import type { PersonRow } from '@/lib/setup/types'

/** The two Michael named, first and framed plainly. */
const HEADLINE = ['students.add', 'teachers.invite']

export default function PermissionsTab({
  people,
  myCapabilities,
  canAssign,
  myUserId,
}: {
  people: PersonRow[]
  myCapabilities: string[]
  canAssign: boolean
  myUserId: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [pending, start] = useTransition()

  const staff = people.filter((p) => !p.isStudent && p.user.id !== myUserId)
  const shown = showAll
    ? CAPABILITIES
    : CAPABILITIES.filter((c) => HEADLINE.includes(c.key))

  const toggle = (userId: string, key: string, on: boolean) => {
    setError(null)
    start(async () => {
      try {
        await setup.setCapability(userId, key, on)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  if (!canAssign) {
    return (
      <div className="note warn">
        <b>Only a coordinator who can assign roles sees this.</b> At ISG that is the district IB
        coordinator. It is deliberately not something a school coordinator can grant themselves.
      </div>
    )
  }

  return (
    <>
      <div className="note">
        <b>What each person at this school may do.</b> A tick you cannot set is a capability{' '}
        <i>you</i> do not hold — nobody can grant what they do not have themselves, which is what
        keeps the district tier meaningful. Your own row is not shown, for the same reason.
      </div>

      <div className="row" style={{ margin: '12px 0' }}>
        <button className="btn sm" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show just the two that matter' : `Show all ${CAPABILITIES.length} capabilities`}
        </button>
        {!showAll && (
          <span className="mut" style={{ fontSize: 12 }}>
            Importing students and inviting teachers — the two the district coordinator decides.
          </span>
        )}
      </div>

      {error && <div className="note warn" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="tableshell">
        <table className="casroster">
          <thead>
            <tr>
              <th style={{ width: 170 }}>Person</th>
              <th style={{ width: 150 }}>Preset</th>
              {shown.map((c) => (
                <th key={c.key} title={c.key}>
                  {c.label}
                  {c.privileged && <span className="pill warn" style={{ marginLeft: 4 }}>high</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((p) => (
              <tr key={p.user.id}>
                <td className="name">
                  {p.user.name}
                  <div className="mut" style={{ fontSize: 11.5, fontWeight: 400 }}>
                    {p.roles.map((r) => r.replace(/_/g, ' ')).join(' · ')}
                  </div>
                </td>
                <td className="mut">{p.membership.presetKey.replace(/_/g, ' ')}</td>
                {shown.map((c) => {
                  const on = p.capabilities.includes(c.key)
                  const mine = myCapabilities.includes(c.key)
                  const deviation =
                    p.membership.addedCapabilities.includes(c.key) ||
                    p.membership.removedCapabilities.includes(c.key)
                  return (
                    <td key={c.key}>
                      <label
                        className="capbox"
                        title={
                          mine
                            ? deviation
                              ? 'Set explicitly, overriding the preset'
                              : 'Comes from the preset'
                            : 'You do not hold this capability, so you cannot grant it'
                        }
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={pending || !mine}
                          onChange={() => toggle(p.user.id, c.key, !on)}
                        />
                        {deviation && <i className="dev" />}
                      </label>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mut" style={{ fontSize: 12, marginTop: 10 }}>
        A dot marks a setting that differs from the person&rsquo;s preset. Everything else follows
        the preset and will keep following it if the preset changes.
      </p>
    </>
  )
}
