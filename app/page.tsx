import Link from 'next/link'
import Shell from '@/components/Shell'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import type { LibraryDocument, ModuleTile } from '@/lib/types'

// The page everyone lands on. Same structure for every role; different content.
//   · what I'm responsible for  (module / course tiles, with what's outstanding)
//   · what's coming up          (key dates)
//   · what I've been told       (announcements)
//   · where the guidance is     (documents library)

export const dynamic = 'force-dynamic'

const MODULE_LABEL: Record<string, string> = {
  cas: 'CAS', ee: 'Extended Essay', tok: 'TOK', ia: 'Internal assessment',
  core: 'Core', general: 'General', ib: 'IB',
}

function daysAway(iso: string) {
  const then = new Date(iso + 'T00:00:00Z').getTime()
  const now = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((then - now) / 86_400_000)
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

export default async function HomePage() {
  const session = await getSession()
  const { user, school } = session

  const student = await repo.getStudent(user.id)
  const cohortId = student?.cohortId ?? null

  const [tiles, dates, announcements, documents, cohorts] = await Promise.all([
    repo.listModuleTiles(school.id, user.id),
    repo.listKeyDates(school.id, cohortId),
    repo.listAnnouncements(school.id, user.id),
    repo.listDocuments(school.id, user.id),
    repo.listCohorts(school.id),
  ])

  const cohortLabel = cohorts.find((c) => c.id === cohortId)?.label
  const totalOutstanding = tiles.reduce((n, t) => n + t.outstanding, 0)

  const byModule = documents.reduce<Record<string, LibraryDocument[]>>((acc, d) => {
    ;(acc[d.module] ??= []).push(d)
    return acc
  }, {})

  return (
    <Shell session={session}>
      <h1>
        {user.name}
        {cohortLabel ? <span className="mut" style={{ fontWeight: 400 }}> · {cohortLabel}</span> : null}
      </h1>
      <p className="sub">
        {totalOutstanding > 0
          ? `${totalOutstanding} thing${totalOutstanding === 1 ? '' : 's'} need your attention.`
          : 'Nothing outstanding right now.'}
        {student?.personalCode
          ? ` · Candidate ${student.sessionNumber} / ${student.personalCode}`
          : ''}
      </p>

      {/* ---------------- modules & courses ---------------- */}
      <div className="panel">
        <div className="panel-h">
          <h2>My modules</h2>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            {student ? 'Your Core and your courses' : 'What you are responsible for'}
          </span>
        </div>
        <div className="panel-b">
          <div className="grid">
            {tiles.map((t: ModuleTile) => (
              <Link key={t.key} href={t.href} className={`tile${t.status === 'attention' ? ' attention' : ''}`}>
                <div className="k">{t.sublabel}</div>
                <div className="v">{t.label}</div>
                <div className="d">
                  {t.outstanding > 0
                    ? `${t.outstanding} outstanding`
                    : 'Up to date'}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="two">
        {/* ---------------- key dates ---------------- */}
        <div className="panel">
          <div className="panel-h">
            <h2>Key dates</h2>
            <span className="spacer" />
            {session.can('deadlines.set') && (
              <Link className="btn sm" href="/setup/deadlines">Edit deadlines</Link>
            )}
          </div>
          <div className="panel-b" style={{ paddingTop: 6 }}>
            {dates.length === 0 && <p className="mut">No dates set for this cohort yet.</p>}
            {dates.map((k) => {
              const away = daysAway(k.date)
              return (
                <div className="linkrow" key={k.id}>
                  <div className="lk">
                    <div className="datebar">
                      <b className="d">{formatDate(k.date)}</b>
                      <span>{k.label}</span>
                    </div>
                    <div className="mut" style={{ fontSize: 12 }}>
                      {MODULE_LABEL[k.module] ?? k.module}
                      {k.kind === 'ib' ? ' · IB deadline — immovable' : ' · school deadline'}
                    </div>
                  </div>
                  <span className={`pill ${away < 0 ? 'warn' : away < 30 ? 'gold' : 'grey'}`}>
                    {away < 0 ? `${-away}d ago` : `${away}d`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ---------------- announcements ---------------- */}
        <div className="panel">
          <div className="panel-h">
            <h2>Announcements</h2>
            <span className="spacer" />
            {/* Posting is a capability, so it can be granted to a school
                coordinator without granting anything else. */}
            {session.can('announcements.post') && (
              <Link className="btn pri sm" href="/announcements/new">+ Post</Link>
            )}
          </div>
          <div className="panel-b" style={{ paddingTop: 6 }}>
            {announcements.length === 0 && <p className="mut">Nothing posted yet.</p>}
            {announcements.map((a) => (
              <div className="linkrow" key={a.id}>
                <div className="lk">
                  <b>{a.title}</b>
                  <div style={{ fontSize: 12.5 }}>{a.body}</div>
                  <div className="mut" style={{ fontSize: 12 }}>
                    {a.postedBy} · {formatDate(a.postedAt)}
                    {a.audienceRoles.length > 0 && ' · staff only'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- documents ---------------- */}
      <div className="panel">
        <div className="panel-h">
          <h2>Information &amp; documents</h2>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>
            versioned by cohort — you see the guide for your year
          </span>
          {session.can('documents.manage') && (
            <Link className="btn sm" href="/documents/manage">Manage</Link>
          )}
        </div>
        <div className="panel-b">
          {Object.entries(byModule).map(([mod, docs]) => (
            <div key={mod} style={{ marginBottom: 14 }}>
              <div className="caps" style={{ marginBottom: 4 }}>{MODULE_LABEL[mod] ?? mod}</div>
              {docs.map((d) => (
                <div className="linkrow" key={d.id}>
                  <div className="lk">
                    <a href={d.href}><b>{d.title}</b></a>
                    <div className="mut" style={{ fontSize: 12.5 }}>{d.description}</div>
                  </div>
                  {d.audience === 'staff' && <span className="pill grey">Staff</span>}
                  <span className="pill info">v{d.version}</span>
                  <span className="mut" style={{ fontSize: 12 }}>{formatDate(d.updatedAt)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="note gold">
        <b>Scaffold.</b> Data comes from <code>lib/data/fixtures.ts</code>, sign-in is the
        dev switcher in the header, and permissions are already real — every button above is
        gated by <code>session.can(&hellip;)</code>. Switch to the student to watch the page change.
      </div>
    </Shell>
  )
}
