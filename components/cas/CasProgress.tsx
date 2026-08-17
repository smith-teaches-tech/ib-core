// THE CONSISTENCY STRIP — seven outcomes counted, and eighteen months of dots.
//
// Why this exists (Michael, 17 Aug): CAS is not complete when each outcome has
// been met once. It runs for a year and a half and the student is meant to keep
// showing up. A tick per outcome hides the two failures that matter — the
// student who met six outcomes in one term and nothing since, and the student
// who has one experience carrying all seven.
//
// So: counts, not ticks; and a timeline, not a total.
//
// THREE THINGS THIS DELIBERATELY DOES NOT DO
//
//   1. It sets no target. The IB requires each outcome evidenced at least once
//      and has no view on how many times. Bars scale to the student's OWN
//      highest count, so the picture is balance — LO1 at seven next to LO6 at
//      one — and no number on this screen is a requirement anybody invented.
//
//   2. It does not nag. The prompt line under the timeline is a derived
//      sentence on the student's own screen, computed at render, stored
//      nowhere, and shown to nobody else. No notification, no coordinator flag,
//      no to-do list — the "What's next for you" list was cut from My CAS for
//      exactly this reason (IB-CAS-Build-Plan.md §7) and this must not become
//      it by another route. `showPrompt` is off for staff.
//
//   3. It computes nothing new. Every number here comes off CasSummary, which
//      the module already derived from its own entities. No new store, no
//      cached total — invariant #2 holds.

import { LEARNING_OUTCOMES, type CasPost, type CasSummary } from '@/lib/cas/types'
import { todayRiyadh } from '@/lib/data/dates'

/**
 * The programme window: August of DP1 to the end of the April in which CAS must
 * be finished. Derived from the cohort's graduation year — never hardcoded, and
 * never inferred from the student's own posts (a late starter would get a
 * compressed line and look busy).
 */
export function casWindow(gradYear: number) {
  return { start: `${gradYear - 2}-08-01`, end: `${gradYear}-04-30` }
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Whole months between two YYYY-MM-DD stamps — no Date maths, no timezone. */
function monthIndex(ymd: string) {
  const [y, m] = ymd.split('-').map(Number)
  return y * 12 + (m - 1)
}

/** Where a date sits in the window, 0–1. Clamped: nothing falls off the line. */
function position(at: string, start: string, end: string) {
  const a = monthIndex(at) + (Number(at.slice(8, 10)) - 1) / 31
  const s = monthIndex(start)
  const e = monthIndex(end)
  if (e <= s) return 0
  return Math.min(1, Math.max(0, (a - s) / (e - s)))
}

function weeksBetween(from: string, to: string) {
  const days =
    (Date.parse(to + 'T00:00:00Z') - Date.parse(from.slice(0, 10) + 'T00:00:00Z')) / 86_400_000
  return Math.max(0, Math.round(days / 7))
}

/**
 * The quiet line. One sentence, present tense, no imperative — it reports the
 * record, it does not issue instructions. "Your last reflection was 9 weeks
 * ago" is a fact; "You should write a reflection" is the nag verb.
 */
function prompt(summary: CasSummary, today: string): string | null {
  if (summary.complete) return null
  const last = summary.posts[summary.posts.length - 1]
  const open = summary.tallies.some((t) => t.open > 0)
  if (!last) {
    return open
      ? 'Nothing written yet on the experiences you have started.'
      : 'No experiences yet — CAS starts with one.'
  }
  const weeks = weeksBetween(last.at, today)
  const since =
    weeks < 1 ? 'this week' : weeks === 1 ? 'a week ago' : `${weeks} weeks ago`
  const tail = open
    ? ''
    : ' Nothing is open at the moment.'
  return `Your last post was ${since}, on ${last.experienceTitle}.${tail}`
}

export default function CasProgress({
  summary,
  gradYear,
  showPrompt = false,
}: {
  summary: CasSummary
  gradYear: number
  /** Student's own screen only. See note 2 in the file header. */
  showPrompt?: boolean
}) {
  const { start, end } = casWindow(gradYear)
  const today = todayRiyadh()
  const scale = Math.max(1, ...summary.tallies.map((t) => t.confirmed + t.open))

  // Month ticks across the window, with the January of each year labelled — a
  // full month scale under a 700px strip is unreadable, and the year boundary
  // is the only landmark anyone actually navigates by.
  const s = monthIndex(start)
  const e = monthIndex(end)
  const ticks: { at: number; label: string | null }[] = []
  for (let m = s; m <= e; m++) {
    const month = m % 12
    ticks.push({
      at: (m - s) / (e - s),
      // Label August (programme start) and January — enough to place a dot in
      // time without turning the axis into a wall of letters.
      label: month === 0 || month === 7 ? MONTHS[month] : null,
    })
  }

  const byKind = (k: CasPost['kind']) => summary.posts.filter((p) => p.kind === k).length

  return (
    <div className="casprog">
      <div className="cpcols">
        {/* ---- the seven outcomes ------------------------------------------ */}
        <div className="cpblock">
          <div className="cphead">
            <span className="caps">Learning outcomes</span>
            <span className="spacer" />
            <span className="cpkey">
              <i className="cpsw done" /> confirmed
              <i className="cpsw open" /> in an open experience
            </span>
          </div>

          {LEARNING_OUTCOMES.map((lo) => {
            const t = summary.tallies.find((x) => x.key === lo.key)
            const confirmed = t?.confirmed ?? 0
            const open = t?.open ?? 0
            return (
              <div key={lo.key} className="cprow" title={lo.label}>
                <span className="cplab">{lo.short}</span>
                <span className="cpbar">
                  {confirmed > 0 && (
                    <span
                      className="cpseg done"
                      style={{ width: `${(confirmed / scale) * 100}%` }}
                      title={`Confirmed on ${confirmed} completed experience${confirmed === 1 ? '' : 's'}`}
                    >
                      {confirmed}
                    </span>
                  )}
                  {open > 0 && (
                    <span
                      className="cpseg open"
                      style={{ width: `${(open / scale) * 100}%` }}
                      title={`Claimed on ${open} experience${open === 1 ? '' : 's'} not yet signed off`}
                    >
                      {open}
                    </span>
                  )}
                  {confirmed === 0 && open === 0 && <span className="cpnone">not yet</span>}
                </span>
              </div>
            )
          })}
        </div>

        {/* ---- the timeline ------------------------------------------------ */}
        <div className="cpblock">
          <div className="cphead">
            <span className="caps">Over the programme</span>
            <span className="spacer" />
            <span className="cpkey">
              {byKind('reflection')} reflection{byKind('reflection') === 1 ? '' : 's'} ·{' '}
              {byKind('evidence')} evidence
            </span>
          </div>

          <div className="cpline">
            <div className="cpaxis">
              {ticks.map((t, i) => (
                <i
                  key={i}
                  className={`cptick ${t.label ? 'major' : ''}`}
                  style={{ left: `${t.at * 100}%` }}
                />
              ))}
              {/* Today, only while it is inside the window — after April of the
                  exam year the marker would pin to the end and lie. */}
              {today >= start && today <= end && (
                <i
                  className="cpnow"
                  style={{ left: `${position(today, start, end) * 100}%` }}
                  title={`Today — ${today}`}
                />
              )}
              {summary.posts.map((p, i) => (
                <i
                  key={i}
                  className={`cpdot ${p.kind}`}
                  style={{ left: `${position(p.at, start, end) * 100}%` }}
                  title={`${p.at} — ${p.kind === 'evidence' ? 'evidence' : 'reflection'} on ${p.experienceTitle}`}
                />
              ))}
            </div>
            <div className="cpmonths">
              {ticks
                .filter((t) => t.label)
                .map((t, i) => (
                  <span key={i} style={{ left: `${t.at * 100}%` }}>
                    {t.label}
                  </span>
                ))}
            </div>
          </div>

          {showPrompt && (() => {
            const line = prompt(summary, today)
            return line ? <p className="cpsay">{line}</p> : null
          })()}
        </div>
      </div>
    </div>
  )
}
