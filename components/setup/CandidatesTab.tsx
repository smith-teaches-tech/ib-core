'use client'

// IB candidate identifiers. Coordinator-entered, deliberately.
//
// WHY NOT STUDENTS, having considered letting them: a transposed digit in a
// candidate code invalidates an entire eCoursework upload, and these values are
// also stamped onto the title pages of uploaded coursework. That is too much
// riding on twenty-four people typing carefully once a year. Michael's call.
//
// WHY THE PIN IS DIFFERENT: it is a login credential, not an identifier — the
// candidate uses it with their personal code to get their results, and three bad
// attempts locks them out for half an hour. The IB does not auto-populate it for
// that reason. It is never rendered on a student's page; it goes out by email.

import { useState, useTransition } from 'react'
import * as setup from '@/lib/setup/actions'
import type { IdentifierPreview, PersonRow } from '@/lib/setup/types'

const SAMPLE = `Name\tCandidate session number\tPersonal code\tPIN
Ahmed, Layla\t0001\thjk123\t48120000
Al-Rashid, Noor\t0002\thjk124\t48120977`

export default function CandidatesTab({
  people,
  canManage,
  canDistribute,
}: {
  people: PersonRow[]
  canManage: boolean
  canDistribute: boolean
}) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<IdentifierPreview | null>(null)
  const [showPins, setShowPins] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<unknown>) => {
    setError(null)
    start(async () => {
      try {
        await fn()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const students = people.filter((p) => p.isStudent)
  const missing = students.filter((p) => p.candidate?.state === 'missing').length
  const unconfirmed = students.filter((p) => p.candidate?.state === 'unconfirmed').length
  const noPin = students.filter((p) => !p.candidate?.hasPin).length

  if (!canManage) {
    return (
      <div className="note warn">
        <b>You cannot manage candidate identifiers at this school.</b> That needs the{' '}
        <code>identifiers.manage</code> capability, granted under <b>Permissions</b>.
      </div>
    )
  }

  // A cell starting with = + - @ is a formula to a spreadsheet; defang it.
  const defang = (s: string) => (/^[=+\-@]/.test(s) ? "'" + s : s)
  const pinList = students
    .filter((p) => p.candidate?.resultsPin)
    .map((p) =>
      [
        defang(p.user.email),
        defang(p.candidate!.personalCode ?? ''),
        defang(p.candidate!.resultsPin!),
      ].join('\t'),
    )
    .join('\n')

  return (
    <>
      <div className="note">
        <b>Three values, and they are not the same kind of thing.</b> The{' '}
        <b>session number</b> (4 digits, restarts at 0001 each school) and the{' '}
        <b>personal code</b> come down from IBIS once registration succeeds — those two get stamped
        on coursework title pages. The <b>PIN</b> is a login credential the IB deliberately does not
        auto-populate; it never appears on a student&rsquo;s page here and goes out by email.
      </div>

      <div className="row" style={{ margin: '12px 0' }}>
        <span className={`pill ${missing ? 'warn' : 'ok'}`}>{missing} with no identifiers</span>
        <span className={`pill ${unconfirmed ? 'gold' : 'grey'}`}>{unconfirmed} unconfirmed</span>
        <span className={`pill ${noPin ? 'grey' : 'ok'}`}>{noPin} with no PIN</span>
        {canDistribute && pinList && (
          <button
            className="btn sm"
            onClick={() => navigator.clipboard?.writeText('email\tpersonal code\tpin\n' + pinList)}
            title="Copies email, personal code and PIN — paste into a mail merge"
          >
            ⧉ Copy PIN list for email
          </button>
        )}
      </div>

      <details className="cob" style={{ marginBottom: 14 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          Paste identifiers from IBIS
        </summary>
        <p className="mut" style={{ fontSize: 12.5 }}>
          Rows are matched back to students by <b>email</b>, then <b>student number</b>, then{' '}
          <b>name</b> — whichever columns you have. Anything that matches nothing is reported rather
          than dropped.
        </p>
        <textarea
          className="big mono"
          rows={6}
          value={text}
          placeholder={SAMPLE}
          onChange={(e) => {
            setText(e.target.value)
            setPreview(null)
            setDone(null)
          }}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="btn"
            disabled={pending || !text.trim()}
            onClick={() => run(async () => setPreview(await setup.previewIdentifiers(text)))}
          >
            Check
          </button>
          {preview && preview.matched > 0 && (
            <button
              className="btn pri"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const n = await setup.importIdentifiers(text)
                  setDone(n)
                  setPreview(null)
                  setText('')
                })
              }
            >
              Apply to {preview.matched} candidate{preview.matched === 1 ? '' : 's'}
            </button>
          )}
        </div>

        {preview && (
          <div className="tableshell" style={{ marginTop: 10 }}>
            <table className="casroster">
              <thead>
                <tr>
                  <th>#</th><th>Row</th><th>Matched on</th>
                  <th>Session</th><th>Personal</th><th>PIN</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="mut">{r.line}</td>
                    <td className="name">
                      {r.who}
                      {r.message && (
                        <div className="mut" style={{ fontSize: 12, fontWeight: 400 }}>{r.message}</div>
                      )}
                    </td>
                    <td>
                      {r.matchedOn ? (
                        <span className={`pill ${r.matchedOn === 'name' ? 'gold' : 'ok'}`}>{r.matchedOn}</span>
                      ) : (
                        <span className="pill warn">no match</span>
                      )}
                    </td>
                    <td className="mono">{r.sessionNumber || '—'}</td>
                    <td className="mono">{r.personalCode || '—'}</td>
                    <td className="mono">{r.resultsPin ? '••••' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      {done != null && (
        <div className="note ok" style={{ marginBottom: 12 }}>
          <b>{done} candidate{done === 1 ? '' : 's'} updated.</b> They are marked unconfirmed until
          you tick them off against the IBIS download.
        </div>
      )}
      {error && <div className="note warn" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="row" style={{ marginBottom: 8 }}>
        <span className="caps">Candidates</span>
        <span className="spacer" />
        {canDistribute && (
          <label className="chk" style={{ margin: 0 }}>
            <input type="checkbox" checked={showPins} onChange={() => setShowPins(!showPins)} />
            Show PINs
          </label>
        )}
      </div>

      <div className="tableshell">
        <table className="casroster">
          <thead>
            <tr>
              <th style={{ width: 165 }}>Candidate</th>
              <th style={{ width: 110 }}>Session no.</th>
              <th style={{ width: 130 }}>Personal code</th>
              <th style={{ width: 130 }}>PIN</th>
              <th>Checked against IBIS</th>
            </tr>
          </thead>
          <tbody>
            {students.map((p) => (
              <tr key={p.user.id}>
                <td className="name">{p.user.name}</td>
                <td>
                  <input
                    className="mono cell"
                    defaultValue={p.candidate?.sessionNumber ?? ''}
                    placeholder="0001"
                    onBlur={(e) =>
                      e.target.value !== (p.candidate?.sessionNumber ?? '') &&
                      run(() => setup.setIdentifiers(p.user.id, { sessionNumber: e.target.value }))
                    }
                  />
                </td>
                <td>
                  <input
                    className="mono cell"
                    defaultValue={p.candidate?.personalCode ?? ''}
                    placeholder="hjk123"
                    onBlur={(e) =>
                      e.target.value !== (p.candidate?.personalCode ?? '') &&
                      run(() => setup.setIdentifiers(p.user.id, { personalCode: e.target.value }))
                    }
                  />
                </td>
                <td>
                  {showPins ? (
                    <input
                      className="mono cell"
                      defaultValue={p.candidate?.resultsPin ?? ''}
                      placeholder="not issued"
                      onBlur={(e) =>
                        e.target.value !== (p.candidate?.resultsPin ?? '') &&
                        run(() => setup.setIdentifiers(p.user.id, { resultsPin: e.target.value }))
                      }
                    />
                  ) : (
                    <span className={`pill ${p.candidate?.hasPin ? 'ok' : 'grey'}`}>
                      {p.candidate?.hasPin ? '•••• held' : 'none'}
                    </span>
                  )}
                </td>
                <td>
                  <label className="capbox">
                    <input
                      type="checkbox"
                      checked={p.candidate?.state === 'confirmed'}
                      disabled={pending || !p.candidate?.personalCode}
                      onChange={() =>
                        run(() =>
                          setup.setIdentifiers(p.user.id, {
                            confirmed: p.candidate?.state !== 'confirmed',
                          }),
                        )
                      }
                    />
                    <span className="mut" style={{ fontSize: 12 }}>
                      {p.candidate?.state === 'confirmed'
                        ? 'confirmed'
                        : p.candidate?.state === 'unconfirmed'
                          ? 'entered, not checked'
                          : 'nothing recorded'}
                    </span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mut" style={{ fontSize: 12, marginTop: 10 }}>
        Students see their session number and personal code on their own page. They never see the
        PIN — <b>[TODO at export]</b> the session number and personal code also need stamping onto
        coursework title pages, which belongs with the pack builder.
      </p>
    </>
  )
}
