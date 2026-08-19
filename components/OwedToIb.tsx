import type { Checkpoint } from '@/lib/types'
import { warningLevel } from '@/lib/deadlines'

/**
 * THE WARNING THAT DOES NOT GO AWAY — Michael, 19 Aug.
 *
 * It is not the alert engine the standing cautions forbid, and the difference is
 * worth stating: an alert engine decides what matters, ranks it, pushes it, and
 * can be dismissed. This decides nothing and cannot be dismissed, because it is
 * not a message — it is the state of the record, derived on every read, and the
 * only way to clear it is to do the work.
 *
 * ONE warning, aggregated, never one per item: a DP1 student owes six IAs plus
 * an EE plus a TOK essay, and nine permanent banners is a screen that teaches
 * you to scroll past it.
 *
 * Presence never changes while something is owed. WEIGHT does — quiet while
 * nothing has a date, amber inside the last fortnight, red once a date has
 * passed. That is what stops it becoming wallpaper.
 *
 * The consequence line is FACTUAL on purpose. "You will fail" invites an
 * argument with a parent; "the IB receives nothing for a component that isn't
 * here" is true, and lands harder.
 */
export default function OwedToIb({ owed }: { owed: Checkpoint[] }) {
  const level = warningLevel(owed)
  if (level === 'none') return null

  const n = owed.length
  const late = owed.filter((c) => c.due?.late)

  return (
    <section className={`owed ${level}`} aria-live="polite">
      <h2>
        {n} piece{n === 1 ? '' : 's'} of work the IB needs {n === 1 ? 'is' : 'are'} not uploaded
      </h2>
      <div style={{ fontSize: 12.5 }}>
        The IB receives nothing for a component that is not here. Uploading is yours to do.
      </div>
      <ul>
        {owed.map((c) => (
          <li key={c.def.id}>
            <b>{c.def.label}</b>
            {c.due
              ? c.due.late
                ? ` — due ${fmt(c.due.dueAt)}, ${-c.due.daysAway} day${c.due.daysAway === -1 ? '' : 's'} ago`
                : ` — due ${fmt(c.due.dueAt)}`
              : ' — no date set yet'}
          </li>
        ))}
      </ul>
      {late.length > 0 && (
        <div className="why">
          {late.length === n
            ? 'Every one of these is past its date.'
            : `${late.length} of these ${late.length === 1 ? 'is' : 'are'} past its date.`}{' '}
          Talk to your teacher if something is stopping you.
        </div>
      )}
    </section>
  )
}

const fmt = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
