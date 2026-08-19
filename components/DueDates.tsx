import type { DueItem } from '@/lib/data/repository'

/**
 * SOMEBODY'S DUE DATES, in order. No ranking, no scoring, no triage.
 *
 * A date that has passed reads as passed — quietly. Michael, 19 Aug: *"Don't
 * tell teachers things are overdue."* So there is no red bar and no count of
 * failures here; the list is the information, and a teacher can see for
 * themselves that the 8th was last week. The one place lateness is loud is the
 * student's own warning about work the IB will not receive.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function tone(item: DueItem): { cls: string; text: string } {
  const allIn = item.total > 0 && item.done === item.total
  if (allIn) return { cls: 'allin', text: 'all in' }
  if (item.daysAway < 0) {
    const n = -item.daysAway
    return { cls: 'past', text: `${n} day${n === 1 ? '' : 's'} ago` }
  }
  if (item.daysAway === 0) return { cls: 'soon', text: 'today' }
  if (item.daysAway === 1) return { cls: 'soon', text: 'tomorrow' }
  if (item.daysAway <= 14) return { cls: 'soon', text: `in ${item.daysAway} days` }
  return { cls: '', text: `in ${item.daysAway} days` }
}

export default function DueDates({
  items,
  title = 'Due dates',
  note,
  limit,
}: {
  items: DueItem[]
  title?: string
  note?: string
  /** Show only the next N. The rest are still on the due-dates screen. */
  limit?: number
}) {
  const shown = limit ? items.slice(0, limit) : items
  const hidden = items.length - shown.length

  return (
    <div className="panel">
      <div className="panel-h">
        <h2>{title}</h2>
        <span className="pill grey">{items.length}</span>
        <span className="spacer" />
        {note && <span className="mut" style={{ fontSize: 12 }}>{note}</span>}
      </div>
      <div className="panel-b" style={{ paddingTop: 4 }}>
        {items.length === 0 ? (
          <p className="mut" style={{ fontSize: 12.5, margin: '6px 0' }}>
            No dates set for your courses yet.
          </p>
        ) : (
          <>
            {shown.map((item) => {
              const t = tone(item)
              const d = new Date(item.deadline.dueAt + 'T00:00:00Z')
              return (
                <div className={`due ${t.cls}`} key={item.deadline.id}>
                  <div className="due-d">
                    <span className="dm">{MON[d.getUTCMonth()]}</span>
                    <span className="dd">{d.getUTCDate()}</span>
                  </div>
                  <div className="due-b">
                    <div className="due-t">{item.label}</div>
                    <div className="due-m">
                      {item.courseName}
                      {item.total > 1 && ` · ${item.done}/${item.total} in`}
                      {item.deadline.isMajor && ' · major'}
                    </div>
                  </div>
                  <div className="due-r">
                    {item.toIb && (
                      <span className="tag ib" title="The IB receives this.">to the IB</span>
                    )}
                    <span className="mut" style={{ fontSize: 11.5 }}>{t.text}</span>
                  </div>
                </div>
              )
            })}
            {hidden > 0 && (
              <div className="mut" style={{ fontSize: 11.5, paddingTop: 9 }}>
                and {hidden} more later in the year.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
