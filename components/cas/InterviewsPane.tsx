'use client'

// The three interviews. Auto-lock on save, because an interview record that can
// be quietly rewritten six months later is not a record of the interview.
//
// Unlocking is a SEPARATE capability (items.unlock) from managing CAS, and it
// always writes a reason into the student's notes. Both of those are the
// authenticity trail doing its job rather than a UI nicety.

import { useState, useTransition } from 'react'
import * as cas from '@/lib/cas/actions'
import {
  INTERVIEW_LABEL, INTERVIEW_ORDER,
  type Interview, type InterviewKind,
} from '@/lib/cas/types'
import { prettyDate } from './parts'

const QUESTION_BANK: Record<InterviewKind, string[]> = {
  initial: [
    'What experiences are you most looking forward to this year?',
    'Which learning outcomes feel most natural to you, and which will stretch you?',
    'Do you have an idea for your CAS project yet? Who might you collaborate with?',
    'How will you balance CAS with your academic workload?',
    'What does a successful CAS year look like to you?',
  ],
  interim: [
    'Which strands are you strongest in so far, and which need attention?',
    'Talk me through one experience that did not go the way you expected.',
    'Where is your CAS project up to? What is the next obstacle?',
    'Which outcomes are still unevidenced, and what would evidence them?',
    'Is anything getting in the way — time, a supervisor, a group?',
  ],
  final: [
    'Looking across the whole portfolio, what changed about you?',
    'Which experience mattered most, and why that one?',
    'Where did you show initiative rather than participation?',
    'What would you tell a DP1 student starting CAS next month?',
    'Is there anything in the record that does not reflect what actually happened?',
  ],
}

export default function InterviewsPane({
  studentId,
  interviews,
  canManage,
  canUnlock,
}: {
  studentId: string
  interviews: Interview[]
  canManage: boolean
  canUnlock: boolean
}) {
  const [bank, setBank] = useState<InterviewKind | null>(null)

  return (
    <>
      {INTERVIEW_ORDER.map((kind) => (
        <InterviewCard
          key={kind}
          kind={kind}
          studentId={studentId}
          interview={interviews.find((i) => i.kind === kind) ?? null}
          canManage={canManage}
          canUnlock={canUnlock}
          onOpenBank={() => setBank(kind)}
        />
      ))}

      {bank && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setBank(null)}>
          <div className="modal">
            <div className="modal-h">
              <b>Question bank — {INTERVIEW_LABEL[bank].toLowerCase()}</b>
              <span className="spacer" />
              <button className="btn sm ghost" onClick={() => setBank(null)}>✕</button>
            </div>
            <div className="modal-b">
              <p className="mut">Suggested prompts you can work through during the interview.</p>
              <ol className="qs">
                {QUESTION_BANK[bank].map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function InterviewCard({
  kind,
  studentId,
  interview,
  canManage,
  canUnlock,
  onOpenBank,
}: {
  kind: InterviewKind
  studentId: string
  interview: Interview | null
  canManage: boolean
  canUnlock: boolean
  onOpenBank: () => void
}) {
  const [notes, setNotes] = useState(interview?.notes ?? '')
  const [date, setDate] = useState(
    interview?.conductedOn ?? new Date().toISOString().slice(0, 10),
  )
  const [unlocking, setUnlocking] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const locked = Boolean(interview?.lockedAt)

  const run = (fn: () => Promise<unknown>) => {
    setError(null)
    start(async () => {
      try {
        await fn()
        setUnlocking(false)
        setReason('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  return (
    <div className="exp">
      <div className="cardhead">
        <b>{INTERVIEW_LABEL[kind]}</b>
        {locked && <span className="lock">🔒 locked</span>}
        {!interview && <span className="pill grey">Not recorded</span>}
        <span className="spacer" />
        {locked && canUnlock && (
          <button className="btn sm" onClick={() => setUnlocking(!unlocking)}>
            🔓 Unlock to edit
          </button>
        )}
        <button className="btn sm ghost" onClick={onOpenBank}>❓ Question bank</button>
      </div>

      {interview && (
        <p className="exp-meta">
          Conducted {prettyDate(interview.conductedOn)} by {interview.conductedBy}
        </p>
      )}

      {error && <div className="note warn" style={{ marginTop: 8 }}>{error}</div>}

      {unlocking && (
        <div className="cob">
          <label className="fld">Reason for unlocking (required)</label>
          <input
            type="text"
            value={reason}
            style={{ width: '100%' }}
            placeholder="e.g. Recorded against the wrong interview"
            onChange={(e) => setReason(e.target.value)}
          />
          <div style={{ marginTop: 8 }}>
            <button
              className="btn danger sm"
              disabled={pending || !reason.trim()}
              onClick={() => run(() => cas.unlockInterview(interview!.id, reason))}
            >
              Unlock — this is recorded
            </button>
          </div>
        </div>
      )}

      {locked ? (
        <p className="mut" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{interview!.notes}</p>
      ) : canManage ? (
        <>
          <label className="fld">
            Interview notes <span className="wc">Auto-locks on save</span>
          </label>
          <textarea
            rows={5}
            value={notes}
            placeholder={`Notes from the ${INTERVIEW_LABEL[kind].toLowerCase()}…`}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <input
              type="text"
              value={date}
              style={{ maxWidth: 150 }}
              placeholder="YYYY-MM-DD"
              onChange={(e) => setDate(e.target.value)}
            />
            <button
              className="btn pri sm"
              disabled={pending || !notes.trim()}
              onClick={() => run(() => cas.saveInterview(studentId, kind, notes, date))}
            >
              Save &amp; lock
            </button>
          </div>
        </>
      ) : (
        <p className="mut" style={{ marginBottom: 0 }}>Not recorded.</p>
      )}
    </div>
  )
}
