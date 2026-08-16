import { notFound } from 'next/navigation'
import SignOffForm from '@/components/cas/SignOffForm'
import { Thread, prettyDate } from '@/components/cas/parts'
import { repo } from '@/lib/data'
import { STRAND_LABEL } from '@/lib/cas/types'

// The public sign-off page. No account, no session, no shell.
//
// The token IS the scope: one experience, 28 days, single use. That is the whole
// security model and it is deliberately small — a supervisor is a volunteer at a
// community centre, and any flow that starts with "create an account" ends with
// a student chasing a paper form instead.

export const dynamic = 'force-dynamic'

export default async function SignOffPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const view = await repo.cas.getSupervisorView(token)
  if (!view) notFound()

  const { experience: e, entries, studentName, expired, used } = view
  const firstName = studentName.includes(',')
    ? studentName.split(',')[1].trim()
    : studentName.split(' ')[0]

  return (
    <div className="standalone">
      <div className="panel">
        <div className="panel-h">
          <h2>CAS experience — sign-off</h2>
          <span className="spacer" />
          <span className="lock">🔗 Secure link · expires {prettyDate(view.request.expiresAt)}</span>
        </div>
        <div className="panel-b">
          {/* A dead link shows its status and NOTHING else — the student's
              reflections are not readable through a used or expired token. */}
          {used ? (
            <div className="note ok">
              This link is no longer active
              {view.request.usedAt ? ` (closed on ${prettyDate(view.request.usedAt)})` : ''}. Nothing
              further is needed — thank you.
            </div>
          ) : expired ? (
            <div className="note warn">
              This link expired on {prettyDate(view.request.expiresAt)}. Please ask {firstName} to
              send a fresh one.
            </div>
          ) : (
            <>
              <div className="note">
                {firstName} has asked you to review a CAS experience and confirm which learning
                outcomes you saw evidence of. You do <b>not</b> need to confirm every outcome — only
                the ones you actually observed. Please read the reflections and look at the evidence
                first. No account needed.
              </div>

              <h3 style={{ margin: '16px 0 2px' }}>{e.title}</h3>
              <p className="mut" style={{ margin: '0 0 8px' }}>
                {e.strands.map((s) => STRAND_LABEL[s]).join(' · ')} · submitted by {firstName}
                {e.isProject && ' · CAS project'}
              </p>
              {e.description && <p>{e.description}</p>}

              <div className="caps" style={{ marginTop: 12 }}>
                Reflections &amp; evidence — view only, nothing is downloadable
              </div>
              <Thread entries={entries} />

              <SignOffForm
                token={token}
                claimed={e.claimedOutcomes}
                studentName={firstName}
              />
            </>
          )}
        </div>
      </div>
      <p className="mut" style={{ fontSize: 12, textAlign: 'center', marginTop: 14 }}>
        IB Core · this link shows one experience and nothing else about {firstName} or the school.
      </p>
    </div>
  )
}
