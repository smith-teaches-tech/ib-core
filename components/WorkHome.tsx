import Link from 'next/link'
import type { ModuleTile, Student, WorkItem } from '@/lib/types'

/**
 * The home page for anyone whose job is doing work rather than overseeing it —
 * students and teachers. Same question in both cases: what is waiting on me?
 */
export default function WorkHome({
  name,
  subtitle,
  work,
  tiles,
  student,
}: {
  name: string
  subtitle: string
  work: WorkItem[]
  tiles: ModuleTile[]
  student: Student | null
}) {
  const overdue = work.filter((w) => w.tone === 'overdue')

  return (
    <>
      <h1>{name}</h1>
      <p className="sub">
        {subtitle}
        {student?.personalCode &&
          ` · Candidate ${student.sessionNumber} / ${student.personalCode}`}
      </p>

      <div className="panel" style={overdue.length ? { borderColor: '#f0cccc' } : undefined}>
        <div className="panel-h">
          <h2>{overdue.length ? '⚠ Waiting on you' : 'Waiting on you'}</h2>
          <span className="spacer" />
          <span className={`pill ${overdue.length ? 'warn' : work.length ? 'gold' : 'ok'}`}>
            {work.length === 0 ? 'All clear' : `${work.length} item${work.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="panel-b" style={{ paddingTop: 6 }}>
          {work.length === 0 && <p className="mut">Nothing outstanding. Enjoy it.</p>}
          {work.map((w) => (
            <div className="linkrow" key={w.id}>
              <div className="lk">
                <b>{w.title}</b>
                <div className="mut" style={{ fontSize: 12.5 }}>{w.detail}</div>
              </div>
              {w.overdueDays != null && (
                <span className="pill warn">{w.overdueDays} days overdue</span>
              )}
              <Link className="btn sm" href={w.href}>Open</Link>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>{student ? 'My Core and my courses' : 'My classes'}</h2>
        </div>
        <div className="panel-b">
          <div className="grid">
            {tiles.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={`tile${t.status === 'attention' ? ' attention' : ''}`}
              >
                <div className="k">{t.sublabel}</div>
                <div className="v">{t.label}</div>
                <div className="d">
                  {t.outstanding > 0 ? `${t.outstanding} outstanding` : 'Up to date'}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
