'use client'

// "My CAS" — the student's own record.
//
// What is deliberately NOT here: the mockup's "What's next for you" to-do list.
// It was cut with the rest of the nag verb (IB-CAS-Build-Plan.md §7). The
// summary strip and the status on each card say the same things without turning
// a portfolio into a list of debts.

import { useState, useTransition } from 'react'
import * as cas from '@/lib/cas/actions'
import {
  INDICATOR_META, LEARNING_OUTCOMES,
  type CasStudentView, type LoKey, type Strand,
} from '@/lib/cas/types'
import CasProgress from './CasProgress'
import InstallBanner from './InstallBanner'
import ExperienceCard from './ExperienceCard'
import { IndicatorGlyph, StrandChips, prettyDate } from './parts'

const STRANDS: { key: Strand; label: string }[] = [
  { key: 'C', label: 'Creativity' },
  { key: 'A', label: 'Activity' },
  { key: 'S', label: 'Service' },
]

export default function StudentCas({
  view,
  gradYear,
}: {
  view: CasStudentView
  /** The cohort's graduation year — sets the timeline window. */
  gradYear: number
}) {
  const { summary, experiences, notes } = view
  const [adding, setAdding] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [strands, setStrands] = useState<Strand[]>([])
  const [outcomes, setOutcomes] = useState<LoKey[]>([])
  const [isProject, setIsProject] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const toggleStrand = (s: Strand) =>
    setStrands((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))
  const toggleLo = (l: LoKey) =>
    setOutcomes((v) => (v.includes(l) ? v.filter((x) => x !== l) : [...v, l]))

  const submit = (submitForApproval: boolean) => {
    setError(null)
    start(async () => {
      try {
        await cas.createExperience({
          title,
          description,
          strands,
          isProject,
          claimedOutcomes: outcomes,
          submit: submitForApproval,
        })
        setTitle('')
        setDescription('')
        setStrands([])
        setOutcomes([])
        setIsProject(false)
        setAdding(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const indicator = summary.indicator ? INDICATOR_META[summary.indicator] : null

  // The project is one experience among many and sinks with the rest once it is
  // finished, so it gets a way back to it that does not involve scrolling.
  const projectId = experiences.find((v) => v.experience.isProject)?.experience.id ?? null

  const jumpTo = (id: string) => {
    setFocus(id)
    requestAnimationFrame(() =>
      document.getElementById('exp-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
  }

  return (
    <>
      <InstallBanner />
      <h1>My CAS</h1>
      <p className="sub">
        Your own record of creativity, activity and service. Only you and your CAS coordinator
        can see it.
      </p>

      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="tile stat">
          <div className="k">Strands</div>
          <div className="v" style={{ marginTop: 6 }}>
            <StrandChips strands={summary.strands} showAll />
          </div>
        </div>
        <div className="tile stat">
          <div className="k">Learning outcomes</div>
          <div className="v">
            {summary.outcomes.length}
            <small>/7 confirmed</small>
          </div>
        </div>
        <div className="tile stat">
          <div className="k">CAS project</div>
          <div className="v" style={{ fontSize: 15, paddingTop: 8 }}>
            <span
              className={`pill ${summary.project === 'complete' ? 'ok' : summary.project === 'in_progress' ? 'info' : 'grey'}`}
            >
              {summary.project === 'complete'
                ? 'Complete'
                : summary.project === 'in_progress'
                  ? 'In progress'
                  : 'Not started'}
            </span>
          </div>
        </div>
        <div className="tile stat">
          <div className="k">Coordinator status</div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            <IndicatorGlyph value={summary.indicator} />{' '}
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {indicator ? indicator.label : 'Not set'}
            </span>
          </div>
        </div>
      </div>

      {/* The consistency strip. CAS runs eighteen months; seven ticks cannot
          say whether a student kept showing up. `showPrompt` is on here and
          ONLY here — see CasProgress's file header. */}
      <CasProgress summary={summary} gradYear={gradYear} joinedAt={view.joinedAt} showPrompt />
      {/* Said here and on the install banner. Nowhere else: a rule repeated at
          every action becomes noise, and noise is what people learn to skip. */}
      <p className="phonerule">
        Phones are not allowed at school without a teacher&rsquo;s permission — add to CAS outside
        school, or when you have been told you may.
      </p>

      {summary.complete && (
        <div className="note ok" style={{ marginBottom: 16 }}>
          <b>CAS is complete.</b> Your coordinator confirmed this on your record — nothing further
          is required from you, and the record is now closed to edits. If something needs to
          change, speak to them and they can reopen it.
        </div>
      )}

      {summary.claimed.length > 0 && (
        <div className="note" style={{ marginBottom: 16 }}>
          You have claimed{' '}
          <b>
            LO{summary.claimed.map((l) => l.slice(2)).join(', LO')}
          </b>{' '}
          on experiences that are not finished. Claimed outcomes only count once a supervisor —
          or your coordinator — confirms they saw them.
        </div>
      )}

      {notes.length > 0 && (
        <div className="panel">
          <div className="panel-h">
            <h2>Notes from your coordinator</h2>
          </div>
          <div className="panel-b">
            {notes.map((n) => (
              <div className="linkrow" key={n.id}>
                <div className="lk">
                  {n.body}
                  <div className="mut" style={{ fontSize: 12 }}>
                    {n.authorName} · {prettyDate(n.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Above the list on purpose: a student with thirty experiences should never
          scroll to reach the button that adds the thirty-first. */}
      <div className="row exptools">
        {/* Hidden once the portfolio is confirmed complete. Courtesy, not
            security — the server refuses either way (actions.ts, `open`). */}
        {!summary.complete && (
          <button className="btn pri" onClick={() => setAdding(!adding)}>
            {adding ? 'Close' : '+ Add experience'}
          </button>
        )}
        <button
          className="btn"
          disabled={!projectId}
          title={
            projectId
              ? 'Jump to your CAS project'
              : 'Nothing is flagged as your CAS project yet — tick the box when you add one'
          }
          onClick={() => projectId && jumpTo(projectId)}
        >
          🏆 {projectId ? 'My CAS project' : 'No CAS project yet'}
        </button>
        <span className="mut" style={{ marginLeft: 'auto', fontSize: 12 }}>
          Live experiences first, finished ones at the bottom.
        </span>
      </div>

      {adding && (
        <div className="panel">
          <div className="panel-h">
            <h2>Add an experience</h2>
          </div>
          <div className="panel-b">
            <label className="fld">This experience is (choose one or more)</label>
            <div className="badgerow">
              {STRANDS.map((s) => (
                <label key={s.key} className={`chk ${strands.includes(s.key) ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={strands.includes(s.key)}
                    onChange={() => toggleStrand(s.key)}
                  />
                  <span className={`strand ${s.key}`}>{s.key}</span> {s.label}
                </label>
              ))}
              <label className={`chk ${isProject ? 'on' : ''}`} style={{ marginLeft: 6 }}>
                <input
                  type="checkbox"
                  checked={isProject}
                  onChange={() => setIsProject(!isProject)}
                />
                🏆 This is my CAS project
              </label>
            </div>

            <label className="fld">Title</label>
            <input
              type="text"
              value={title}
              style={{ width: '100%' }}
              placeholder="e.g. Community mural project"
              onChange={(ev) => setTitle(ev.target.value)}
            />

            <label className="fld">
              Description — explain <i>how</i> this experience will satisfy <b>each</b> learning
              outcome you choose
            </label>
            <textarea
              rows={4}
              value={description}
              placeholder="Describe the experience and connect it to each outcome…"
              onChange={(ev) => setDescription(ev.target.value)}
            />

            <label className="fld">Learning outcomes (choose one or more)</label>
            <div className="badgerow">
              {LEARNING_OUTCOMES.map((l, i) => (
                <label key={l.key} className={`chk ${outcomes.includes(l.key) ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={outcomes.includes(l.key)}
                    onChange={() => toggleLo(l.key)}
                  />
                  LO{i + 1} — {l.label}
                </label>
              ))}
            </div>

            {error && <div className="note warn" style={{ marginTop: 10 }}>{error}</div>}

            <div className="row" style={{ marginTop: 14 }}>
              <button
                className="btn pri"
                disabled={pending || !title.trim() || strands.length === 0}
                onClick={() => submit(true)}
              >
                Submit for approval
              </button>
              <button
                className="btn"
                disabled={pending || !title.trim() || strands.length === 0}
                onClick={() => submit(false)}
              >
                Save draft
              </button>
              <span className="mut" style={{ marginLeft: 'auto', fontSize: 12 }}>
                You can add reflections and evidence at any time — even before approval.
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-h">
          <h2>My experiences</h2>
          <span className="mut" style={{ fontSize: 12 }}>
            {experiences.length} recorded
          </span>
        </div>
        <div className="panel-b">
          {experiences.length === 0 && (
            <p className="mut">
              Nothing recorded yet. Add your first experience — you can save it as a draft and
              come back to it.
            </p>
          )}
          {experiences.map((v) => (
            <ExperienceCard
              // Remounting on focus is what forces the card open when you jump to it.
              key={v.experience.id + (focus === v.experience.id ? ':open' : '')}
              view={v}
              mode="student"
              defaultOpen={focus === v.experience.id}
              frozen={summary.complete}
            />
          ))}
        </div>
      </div>
    </>
  )
}
