'use client'

// The supervisor's half of the sign-off page.
//
// The guidance wording matters more than the widget. A supervisor asked to
// "confirm this experience" will tick everything; a supervisor asked to confirm
// only what they SAW will not. The whole value of the CAS record downstream
// rests on that distinction, so it is said twice and the boxes start empty.

import { useState, useTransition } from 'react'
import { supervisorSignOff } from '@/lib/cas/actions'
import { LEARNING_OUTCOMES, type LoKey } from '@/lib/cas/types'

export default function SignOffForm({
  token,
  claimed,
  studentName,
}: {
  token: string
  claimed: LoKey[]
  studentName: string
}) {
  const [ticked, setTicked] = useState<LoKey[]>([])
  const [comment, setComment] = useState('')
  const [signature, setSignature] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const tick = (lo: LoKey) =>
    setTicked((t) => (t.includes(lo) ? t.filter((x) => x !== lo) : [...t, lo]))

  if (done) {
    return (
      <div className="note ok">
        <b>Thank you — signed.</b> {studentName}&rsquo;s experience is now marked complete and the
        outcomes you confirmed have been added to their record. You can close this page; the link
        will not work again.
      </div>
    )
  }

  return (
    <>
      <div className="divider" />
      <div className="caps">
        Outcomes {studentName} is claiming — tick only the ones you saw evidence of
      </div>
      <div className="badgerow" style={{ marginTop: 8 }}>
        {claimed.map((lo) => (
          <label key={lo} className={`chk ${ticked.includes(lo) ? 'on' : ''}`}>
            <input type="checkbox" checked={ticked.includes(lo)} onChange={() => tick(lo)} />
            LO{lo.slice(2)} — {LEARNING_OUTCOMES.find((l) => l.key === lo)?.label}
          </label>
        ))}
      </div>
      <p className="mut" style={{ fontSize: 12.5 }}>
        Leaving one unticked is a perfectly normal answer. It is more useful to {studentName} than
        a confirmation that is not true.
      </p>

      <label className="fld">Comment to the student (encouraged)</label>
      <textarea
        rows={3}
        value={comment}
        placeholder={`A few words for ${studentName}'s portfolio…`}
        onChange={(e) => setComment(e.target.value)}
      />

      <div className="row" style={{ marginTop: 12 }}>
        <input
          type="text"
          value={signature}
          placeholder="Type your full name as signature"
          style={{ maxWidth: 300 }}
          onChange={(e) => setSignature(e.target.value)}
        />
      </div>

      {error && <div className="note warn" style={{ marginTop: 12 }}>{error}</div>}

      <div className="note ok" style={{ marginTop: 12 }}>
        On sign-off this experience is marked <b>complete</b> and the outcomes you confirmed are
        added to {studentName}&rsquo;s record automatically.
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          className="btn pri"
          disabled={pending || ticked.length === 0 || !signature.trim()}
          onClick={() => {
            setError(null)
            start(async () => {
              try {
                await supervisorSignOff(token, {
                  confirmedOutcomes: ticked,
                  comment,
                  signature,
                })
                setDone(true)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Something went wrong.')
              }
            })
          }}
        >
          Confirm &amp; sign off
        </button>
      </div>
    </>
  )
}
