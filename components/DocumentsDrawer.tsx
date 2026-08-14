'use client'

import { useState } from 'react'
import type { LibraryDocument } from '@/lib/types'

const MODULE_LABEL: Record<string, string> = {
  cas: 'CAS', ee: 'Extended Essay', tok: 'TOK', ia: 'Internal assessment',
  core: 'Core', general: 'General',
}

/**
 * Information & documents lives behind a button in the top bar rather than
 * taking up a band on every page: people need it often enough to want it one
 * click away, and rarely enough that it shouldn't crowd out today's work.
 */
export default function DocumentsDrawer({
  documents,
  canManage,
}: {
  documents: LibraryDocument[]
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const filtered = documents.filter(
    (d) =>
      q.trim() === '' ||
      (d.title + ' ' + d.description).toLowerCase().includes(q.toLowerCase()),
  )

  const byModule = filtered.reduce<Record<string, LibraryDocument[]>>((acc, d) => {
    ;(acc[d.module] ??= []).push(d)
    return acc
  }, {})

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        📄 Information &amp; documents
      </button>

      {open && (
        <>
          <div className="drawer-scrim" onClick={() => setOpen(false)} />
          <aside className="drawer">
            <div className="drawer-h">
              <h2>Information &amp; documents</h2>
              <span className="spacer" />
              {canManage && <a className="btn sm" href="/documents/manage">Manage</a>}
              <button className="btn sm" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div style={{ padding: '12px 20px 0' }}>
              <input
                type="text"
                placeholder="Search documents…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ width: '100%' }}
              />
              <p className="mut" style={{ fontSize: 12, margin: '8px 0 0' }}>
                Versioned by cohort — you see the guide for your year.
              </p>
            </div>
            <div className="drawer-b">
              {filtered.length === 0 && <p className="mut">Nothing matches that.</p>}
              {Object.entries(byModule).map(([mod, docs]) => (
                <div key={mod} style={{ marginTop: 16 }}>
                  <div className="caps" style={{ marginBottom: 4 }}>
                    {MODULE_LABEL[mod] ?? mod}
                  </div>
                  {docs.map((d) => (
                    <div className="linkrow" key={d.id}>
                      <div className="lk">
                        <a href={d.href}><b>{d.title}</b></a>
                        <div className="mut" style={{ fontSize: 12.5 }}>{d.description}</div>
                      </div>
                      {d.audience === 'staff' && <span className="pill grey">Staff</span>}
                      <span className="pill info">v{d.version}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </>
  )
}
