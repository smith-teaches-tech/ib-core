'use client'

// THE SIX PRESCRIBED TITLES FOR ONE SESSION.
//
// ⚠⚠ A NEW YEAR GROUP STARTS EMPTY, ALWAYS. The IB issues six new titles every
// session and an essay written on last May's title is "not a response to one of
// the prescribed titles for the correct examination session" — the zero band.
// Nothing is carried, cloned or copied from another cohort; see
// IB-TOK-research.md §6.3, asserted in the checkpoint.
//
// The distribution beside each title is a tally, not a report: it falls out of
// the students' own choices, and it tells a teacher where to aim the next
// lesson without anybody running anything.

import { useState, useTransition } from 'react'
import type { TokTitle } from '@/lib/tok/types'
import { PRESCRIBED_TITLE_COUNT } from '@/lib/tok/types'
import { adoptStudentTitle, postTitles } from '@/lib/tok/actions'

export default function TokTitles({
  cohortId, cohortLabel, sessionLabel, titles, typed, counts, notChosen, canEdit,
}: {
  cohortId: string
  cohortLabel: string
  sessionLabel: string
  titles: TokTitle[]
  /** Titles students typed that are not in the posted six. */
  typed: { studentId: string; studentName: string; text: string }[]
  counts: Record<number, number>
  notChosen: number
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(titles.length === 0)
  const [draft, setDraft] = useState<string[]>(() =>
    Array.from({ length: PRESCRIBED_TITLE_COUNT }, (_, i) =>
      titles.find((t) => t.number === i + 1)?.text ?? ''))
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const posted = titles.length

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Prescribed titles — {sessionLabel}</h2>
        <span className="spacer" />
        {posted === PRESCRIBED_TITLE_COUNT
          ? <span className="pill ok">{posted} posted</span>
          : <span className="pill gold">{posted} of {PRESCRIBED_TITLE_COUNT} posted</span>}
        {canEdit && !editing && (
          <button className="btn sm ghost" onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>
      <div className="panel-b">
        {posted === 0 && (
          <div className="note gold" style={{ marginBottom: 12 }}>
            <b>Nothing is posted for {cohortLabel} yet, and nothing was carried over.</b> The IB
            issues six new titles every session — an essay written on last year&rsquo;s title is not
            a response to a title for this session, which is the bottom band. Type this
            session&rsquo;s six in below.
          </div>
        )}

        {editing && canEdit ? (
          <>
            {draft.map((text, i) => (
              <div key={i} style={{ marginTop: i === 0 ? 0 : 8 }}>
                <label className="fld" style={{ marginTop: i === 0 ? 0 : 12 }}>Title {i + 1}</label>
                <textarea
                  rows={2}
                  value={text}
                  placeholder="Paste it exactly as the IB wrote it…"
                  onChange={(e) => {
                    const next = [...draft]
                    next[i] = e.target.value
                    setDraft(next)
                  }}
                />
              </div>
            ))}
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn pri"
                disabled={pending || draft.every((t) => !t.trim())}
                onClick={() => start(async () => {
                  const r = await postTitles(
                    cohortId,
                    draft.map((text, i) => ({ number: i + 1, text })).filter((t) => t.text.trim()),
                  )
                  setMessage(r.message ?? null)
                  if (r.ok) setEditing(false)
                })}
              >
                {pending ? 'Saving…' : 'Post titles'}
              </button>
              {posted > 0 && (
                <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
              )}
              <span className="spacer" />
              <span className="mut" style={{ fontSize: 12 }}>
                Students choose from these, so the wording they use is the wording you enter.
              </span>
            </div>
          </>
        ) : (
          <>
            {titles.map((t) => (
              <div key={t.number} className="eelinkrow">
                <span className="eelinkrow-l">{t.number}.</span>
                <span style={{ flex: 1 }}>{t.text}</span>
                <span className={`bfrac ${counts[t.number] ? 'ok' : 'zero'}`}>
                  {counts[t.number] ?? 0}
                </span>
              </div>
            ))}
            {titles.length > 0 && (
              <p className="mut" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
                The number beside each title is how many candidates chose it.
                {notChosen > 0 && ` ${notChosen} ${notChosen === 1 ? 'has' : 'have'} not chosen.`}
              </p>
            )}
          </>
        )}

        {/* THE FALLBACK, PAYING OFF. A student who had the IB's list before the
            teacher got to it typed their own; adopting it fills the list. */}
        {typed.length > 0 && (
          <>
            <div className="divider" />
            <span className="caps">Typed by students, not yet posted</span>
            {typed.map((t) => (
              <div key={t.studentId + t.text} className="eelinkrow">
                <span className="pill warn">typed by {t.studentName.split(',')[0]}</span>
                <span style={{ flex: 1 }}>{t.text}</span>
                {canEdit && posted < PRESCRIBED_TITLE_COUNT && (
                  <button
                    className="btn sm"
                    disabled={pending}
                    onClick={() => start(async () => {
                      setMessage((await adoptStudentTitle(cohortId, t.text)).message ?? null)
                    })}
                  >
                    Adopt as title {posted + 1}
                  </button>
                )}
              </div>
            ))}
            <p className="mut" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
              Adopting one adds it to the posted list for everyone. The student keeps the title they
              already chose either way — rewriting their record from here would be a silent change
              to what they said.
            </p>
          </>
        )}

        {message && <div className="note warn" style={{ marginTop: 10 }}>{message}</div>}
      </div>
    </div>
  )
}
