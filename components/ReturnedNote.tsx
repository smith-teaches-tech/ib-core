// THE NOTE, ON THE STUDENT'S OWN SCREEN.
//
// Written once and used by every screen a returned component can appear on,
// because the wording is the deliverable here. A return that reads differently
// on the EE page and the TOK page is two policies.
//
// Michael settled the shape on 22 Aug: return-with-note is an EVENT, not a
// thread — so this is one block with one sentence in it, not a conversation the
// student is invited to answer. If they want to reply they talk to the teacher;
// what this screen owes them is what is wrong and that it is theirs again.
//
// NOTHING WAS SENT. No email exists yet, so the screen does not imply one went
// out. Saying "your teacher has been in touch" when nobody has is the kind of
// small lie that costs a system its credibility the first time it is caught.

import type { ReturnView } from '@/lib/returns'

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', dateStyle: 'medium',
  }).format(new Date(iso))

export default function ReturnedNote({
  view,
  what,
}: {
  view: ReturnView | null | undefined
  /** "essay", "exhibition" — what the student calls it on this page. */
  what: string
}) {
  if (!view) return null
  return (
    <div className="note warn" style={{ marginBottom: 10 }}>
      <b>Your {what} was returned on {when(view.at)} by {view.byName}.</b>
      <div style={{ margin: '6px 0' }}>{view.note}</div>
      <p className="mut" style={{ fontSize: 11.5, margin: 0 }}>
        {view.fileName} is no longer filed — upload the corrected version below. Nothing was
        emailed to you: this page is where it is recorded.
      </p>
    </div>
  )
}
