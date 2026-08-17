'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The board's finder — the ONLY client component on the board, and it holds no
 * view state of its own: it writes `q` into the URL, which is still the view.
 * Typing is debounced so a 24-row cohort isn't re-rendered on every keystroke.
 *
 * `params` is a plain object, never a function. A function prop crossing the
 * server/client boundary is what 500'd /courses/[courseId] — don't reintroduce
 * it here.
 *
 * The candidate panel is deliberately dropped from `params` by the caller:
 * searching while a panel is open should not carry a candidate the search may
 * have just filtered away.
 */
export default function BoardSearch({
  base,
  params,
  value,
}: {
  base: string
  params: Record<string, string>
  value: string
}) {
  const router = useRouter()
  const [text, setText] = useState(value)
  const typed = useRef(false)

  // The URL is the source of truth: if it changes underneath us (back button, a
  // cohort chip, a bookmark), follow it — but never clobber what is being typed.
  useEffect(() => {
    if (!typed.current) setText(value)
  }, [value])

  useEffect(() => {
    if (!typed.current) return
    const t = setTimeout(() => {
      const q = new URLSearchParams(params)
      const v = text.trim()
      if (v) q.set('q', v)
      else q.delete('q')
      const s = q.toString()
      typed.current = false
      router.replace(s ? `${base}?${s}` : base, { scroll: false })
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const clear = () => {
    typed.current = true
    setText('')
  }

  return (
    <>
      <span className="caps">Find</span>
      <span className="bfind">
        <input
          type="search"
          className="bfindin"
          value={text}
          placeholder="Name, session no. or code"
          aria-label="Find a candidate"
          onChange={(e) => {
            typed.current = true
            setText(e.target.value)
          }}
        />
        {text !== '' && (
          <button type="button" className="bfindx" onClick={clear} title="Clear the search">
            ×
          </button>
        )}
      </span>
    </>
  )
}
