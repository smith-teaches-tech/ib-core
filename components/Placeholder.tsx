// An honest placeholder.
//
// The buttons exist because a coordinator needs to see the shape of the whole
// job — but a page that pretends to work is worse than one that says it does
// not. Each of these names what it will do and what it is waiting on, so nobody
// demos a screen that is scenery.

export default function Placeholder({
  title,
  what,
  waitingOn,
  spec,
}: {
  title: string
  what: string
  waitingOn: string
  spec?: string
}) {
  return (
    <>
      <h1>{title}</h1>
      <p className="sub">Not built yet.</p>
      <div className="panel">
        <div className="panel-b">
          <div className="note gold">
            <b>This page is a placeholder.</b> It is in the navigation so the shape of the
            coordinator&rsquo;s job is visible, not because it does anything.
          </div>
          <h3 style={{ marginBottom: 4 }}>What it will do</h3>
          <p style={{ marginTop: 0 }}>{what}</p>
          <h3 style={{ marginBottom: 4 }}>What it is waiting on</h3>
          <p style={{ marginTop: 0 }}>{waitingOn}</p>
          {spec && (
            <p className="mut" style={{ fontSize: 12.5, marginBottom: 0 }}>
              Specified in <b>{spec}</b>.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
