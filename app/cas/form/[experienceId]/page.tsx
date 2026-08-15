import { notFound } from 'next/navigation'
import PrintButton from '@/components/cas/PrintButton'
import { prettyDate } from '@/components/cas/parts'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'
import { LEARNING_OUTCOMES, STRAND_LABEL } from '@/lib/cas/types'

// Route 2 to completion: the paper form.
//
// Not a fallback to apologise for. Plenty of supervisors are a coach, a
// grandmother, or a shopkeeper who will sign a piece of paper and will not click
// a link, and a system that only supports the digital route quietly pushes those
// experiences out of the record.

export const dynamic = 'force-dynamic'

export default async function PrintableFormPage({
  params,
}: {
  params: Promise<{ experienceId: string }>
}) {
  const { experienceId } = await params
  const session = await getSession()
  const view = await repo.cas.getStudentView(session.school.id, session.user.id)
  const found = view?.experiences.find((v) => v.experience.id === experienceId)
  if (!found || !view) notFound()

  const e = found.experience
  const line = { borderBottom: '1px solid #9aa3ad', height: 28, marginTop: 6 }

  return (
    <div className="standalone">
      <div className="row noprint" style={{ marginBottom: 14 }}>
        <PrintButton />
        <span className="mut" style={{ fontSize: 12 }}>
          Print it, get it signed, then photograph it and add it as evidence. Your coordinator
          verifies the signature and marks the experience complete.
        </span>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>CAS experience — supervisor confirmation</h2>
          <span className="spacer" />
          <span className="mut" style={{ fontSize: 12 }}>{session.school.name}</span>
        </div>
        <div className="panel-b">
          <p className="mut" style={{ marginTop: 0 }}>
            <b>Student:</b> {view.studentName} &nbsp;·&nbsp; <b>Experience:</b> {e.title}
            <br />
            <b>Strands:</b> {e.strands.map((s) => STRAND_LABEL[s]).join(', ')}
            {e.isProject && ' · CAS project'} &nbsp;·&nbsp; <b>Started:</b>{' '}
            {prettyDate(e.createdAt)}
          </p>

          {e.description && (
            <>
              <div className="caps">What the student did</div>
              <p>{e.description}</p>
            </>
          )}

          <div className="divider" />

          <div className="caps">
            Learning outcomes claimed — please tick only the ones you personally saw evidence of
          </div>
          <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}>
            <tbody>
              {e.claimedOutcomes.map((lo) => (
                <tr key={lo}>
                  <td style={{ width: 34, padding: '7px 0' }}>
                    <span
                      style={{
                        display: 'inline-block', width: 18, height: 18,
                        border: '1.5px solid #6b7683', borderRadius: 4,
                      }}
                    />
                  </td>
                  <td style={{ padding: '7px 0' }}>
                    <b>LO{lo.slice(2)}</b> — {LEARNING_OUTCOMES.find((l) => l.key === lo)?.label}
                  </td>
                </tr>
              ))}
              {e.claimedOutcomes.length === 0 && (
                <tr>
                  <td className="mut">
                    No outcomes were claimed on this experience — add them before printing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="divider" />

          <label className="fld">Supervisor&rsquo;s comment</label>
          <div style={line} />
          <div style={line} />
          <div style={line} />

          <div className="two" style={{ marginTop: 18 }}>
            <div>
              <label className="fld">Supervisor&rsquo;s name</label>
              <div style={line} />
              <label className="fld">Role / organisation</label>
              <div style={line} />
            </div>
            <div>
              <label className="fld">Signature</label>
              <div style={line} />
              <label className="fld">Date</label>
              <div style={line} />
            </div>
          </div>

          <p className="mut" style={{ fontSize: 11.5, marginTop: 18, marginBottom: 0 }}>
            By signing you confirm you supervised this student and saw evidence of the outcomes
            ticked above. This form is kept in the student&rsquo;s CAS portfolio at{' '}
            {session.school.name}.
          </p>
        </div>
      </div>
    </div>
  )
}
