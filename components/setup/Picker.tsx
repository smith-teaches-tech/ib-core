'use client'

// A type-to-search picker. No library — an input, a filtered list, and arrow keys.
//
// It exists because a plain <select> over 30 courses is a scroll, and over a few
// hundred sections it is unusable. Typing "chem" should be the fastest path to
// Chem HL, and "the one that isn't there yet" should be reachable without
// leaving the flow — which is what `allowCreate` is for, since Michael's
// catalogue changes year to year.

import { useEffect, useMemo, useRef, useState } from 'react'

export interface PickerOption {
  id: string
  label: string
  sub?: string
  disabled?: boolean
}

export default function Picker({
  options,
  placeholder,
  onPick,
  allowCreate,
  createLabel = 'Add a new course',
  onCreate,
  value,
}: {
  options: PickerOption[]
  placeholder: string
  onPick: (id: string) => void
  allowCreate?: boolean
  createLabel?: string
  onCreate?: (typed: string) => void
  /** Label to show when closed, for a picker that keeps a selection. */
  value?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => (o.label + ' ' + (o.sub ?? '')).toLowerCase().includes(q))
  }, [options, query])

  const creating = Boolean(allowCreate && query.trim())
  const total = matches.length + (creating ? 1 : 0)

  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const choose = (i: number) => {
    if (creating && i === matches.length) {
      onCreate?.(query.trim())
    } else {
      const o = matches[i]
      if (!o || o.disabled) return
      onPick(o.id)
    }
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="picker" ref={box}>
      <input
        type="text"
        value={open ? query : (value ?? query)}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor((c) => Math.min(c + 1, total - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); if (open && total > 0) choose(cursor) }
          else if (e.key === 'Escape') { setOpen(false); setQuery('') }
        }}
      />

      {open && (
        <div className="picker-list">
          {matches.length === 0 && !creating && (
            <div className="picker-empty">Nothing matches “{query}”.</div>
          )}
          {matches.map((o, i) => (
            <button
              key={o.id}
              type="button"
              className={`picker-opt ${i === cursor ? 'on' : ''} ${o.disabled ? 'off' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(i)}
              disabled={o.disabled}
            >
              <b>{o.label}</b>
              {o.sub && <small>{o.sub}</small>}
            </button>
          ))}
          {creating && (
            <button
              type="button"
              className={`picker-opt create ${cursor === matches.length ? 'on' : ''}`}
              onMouseEnter={() => setCursor(matches.length)}
              onClick={() => choose(matches.length)}
            >
              <b>＋ {createLabel}: “{query.trim()}”</b>
              <small>Not in the catalogue yet — this creates it</small>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
