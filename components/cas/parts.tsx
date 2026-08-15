// Small shared pieces of the CAS UI. No state, no actions — just the vocabulary
// of the mockup expressed once so the student, the coordinator and the
// supervisor all see the same experience described the same way.

import { kindOf, thumbLabel, type StoredRef } from '@/lib/storage'
import {
  INDICATOR_META, LO_LABEL, STRAND_LABEL,
  type ExperienceStatus, type IndicatorValue, type LoKey, type Strand, type ThreadEntry,
} from '@/lib/cas/types'

const ALL_STRANDS: Strand[] = ['C', 'A', 'S']

/** Touched strands in colour, untouched greyed — the mockup's `.strand.off`. */
export function StrandChips({ strands, showAll = false }: { strands: Strand[]; showAll?: boolean }) {
  const shown = showAll ? ALL_STRANDS : strands
  return (
    <>
      {shown.map((s) => (
        <span
          key={s}
          className={`strand ${s} ${strands.includes(s) ? '' : 'off'}`}
          title={STRAND_LABEL[s]}
        >
          {s}
        </span>
      ))}
    </>
  )
}

const STATUS_UI: Record<ExperienceStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'grey' },
  submitted: { label: 'Submitted', cls: 'info' },
  returned: { label: 'Returned', cls: 'warn' },
  approved: { label: 'Approved', cls: 'ok' },
  awaiting_signoff: { label: 'Awaiting sign-off', cls: 'grey' },
  complete: { label: 'Complete', cls: 'ok' },
  rejected: { label: 'Not a CAS experience', cls: 'warn' },
}

export function StatusPill({
  status,
  route,
}: {
  status: ExperienceStatus
  route?: 'digital' | 'paper'
}) {
  const ui = STATUS_UI[status]
  const label =
    status === 'awaiting_signoff' && route === 'paper' ? 'Signed form uploaded' : ui.label
  return <span className={`pill ${ui.cls}`}>{label}</span>
}

/** Confirmed outcomes read solid; merely claimed ones read as a dashed outline. */
export function LoChips({ los, claimed = false }: { los: LoKey[]; claimed?: boolean }) {
  return (
    <>
      {los.map((l) => (
        <span key={l} className={`lo ${claimed ? 'claimed' : ''}`}>
          LO{l.slice(2)} {LO_LABEL.get(l)?.short}
        </span>
      ))}
    </>
  )
}

export function Thumbs({ media }: { media: StoredRef[] }) {
  if (media.length === 0) return null
  return (
    <div className="thumbs">
      {media.map((m) => (
        <div key={m.id} className="thumb" title={`${m.name} · ${Math.round(m.bytes / 1024)} KB`}>
          {kindOf(m) === 'video' ? '▶ VID' : thumbLabel(m)}
        </div>
      ))}
    </div>
  )
}

const ENTRY_UI: Record<ThreadEntry['kind'], { cls: string; label: string }> = {
  reflection: { cls: 'refl', label: 'Reflection' },
  evidence: { cls: 'evid', label: 'Evidence' },
  signoff: { cls: 'sup', label: 'Sign-off' },
  note: { cls: 'note', label: 'Note' },
  system: { cls: 'sys', label: 'Record' },
}

const LONG = { day: 'numeric', month: 'short', year: 'numeric' } as const
export const prettyDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { ...LONG, timeZone: 'UTC' })

/**
 * The dated thread, newest first.
 *
 * `system` entries are the authenticity trail and are hidden by default: the
 * student's own reading of their portfolio should not be interrupted by
 * "approved by coordinator" lines. `showSystem` is what the History toggle sets.
 */
export function Thread({
  entries,
  showSystem = false,
}: {
  entries: ThreadEntry[]
  showSystem?: boolean
}) {
  const shown = showSystem ? entries : entries.filter((e) => e.kind !== 'system')
  if (shown.length === 0) {
    return <p className="mut" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Nothing recorded yet.</p>
  }
  return (
    <div className="thread">
      {shown.map((e) => {
        const ui = ENTRY_UI[e.kind]
        return (
          <div className="tentry" key={e.id}>
            <span className="tdate">{prettyDate(e.createdAt)}</span>
            <span className={`ttype ${ui.cls}`}>{ui.label}</span>
            {e.editedFrom && <span className="ttype sys">Edited</span>}
            <div className="tbody">
              {e.body}
              {e.confirmedOutcomes && e.confirmedOutcomes.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <LoChips los={e.confirmedOutcomes} />
                </div>
              )}
              <Thumbs media={e.media ?? []} />
              <div className="who">
                {e.authorName}
                {e.authorType === 'supervisor' && ' · supervisor'}
                {e.authorType === 'staff' && ' · staff'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function IndicatorGlyph({ value }: { value: IndicatorValue | null }) {
  if (!value) return <span className="ind dim" title="Not yet assessed">⚪</span>
  const m = INDICATOR_META[value]
  return <span className="ind" title={m.label}>{m.emoji}</span>
}
