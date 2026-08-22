// WHAT A COMPONENT ACCEPTS, and the refusal when it does not.
//
// IB-Reading-and-Marking-Papers.md §4, state 4: "Accepted formats come off the
// course template next to the rubric, so a Language B oral asks for audio and an
// IA asks for a PDF with nobody maintaining a list."
//
// This file is that list's ONLY implementation. Every upload path asks these
// functions rather than testing for '.pdf' itself — which four screens were
// separately doing on 22 Aug, in four slightly different ways.
//
// THE RULE, from §6 step 3: REFUSE a non-PDF where the IB receives a PDF. A
// .docx in an eCoursework pack is a non-submission, not a formatting nit, and
// the coordinator finds it in April while building the pack — the worst possible
// week. So the refusal is at the moment of upload and it names the fix.
//
// Pure string logic on purpose: no storage, no session, no repo. It runs in the
// checkpoint and on both sides of the client boundary.

/** The IB takes a PDF for everything written. */
export const PDF_ONLY = ['application/pdf']

/** Individual orals are recordings. The IB takes the audio, not a transcript. */
export const AUDIO_ONLY = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm']

/** The `accept` attribute for a file input. Empty when anything goes. */
export function acceptAttr(accepts: string[] | undefined): string | undefined {
  if (!accepts || accepts.length === 0) return undefined
  // The extension hints matter: a browser file picker filters far better on
  // '.pdf' than on the mime alone, and some systems report an empty mime for a
  // file they otherwise open happily.
  const extras = accepts.includes('application/pdf') ? ['.pdf'] : []
  const audio = accepts.some((a) => a.startsWith('audio/')) ? ['.mp3', '.m4a', '.wav'] : []
  return [...accepts, ...extras, ...audio].join(',')
}

/** "a PDF" · "an audio recording" · "a PDF or an audio recording". */
export function describeAccepts(accepts: string[] | undefined): string {
  if (!accepts || accepts.length === 0) return 'any file'
  const kinds: string[] = []
  if (accepts.includes('application/pdf')) kinds.push('a PDF')
  if (accepts.some((a) => a.startsWith('audio/'))) kinds.push('an audio recording')
  if (accepts.some((a) => a.startsWith('video/'))) kinds.push('a video')
  if (accepts.some((a) => a.startsWith('image/'))) kinds.push('an image')
  if (kinds.length === 0) return accepts.join(' or ')
  return kinds.length === 1 ? kinds[0] : kinds.slice(0, -1).join(', ') + ' or ' + kinds.slice(-1)
}

/**
 * Does this file match? Mime FIRST, extension as the fallback — a browser that
 * reports '' or 'application/octet-stream' for a perfectly good PDF is common
 * enough that refusing on mime alone would refuse real work.
 */
export function accepted(
  accepts: string[] | undefined,
  file: { name: string; mime: string },
): boolean {
  if (!accepts || accepts.length === 0) return true
  if (accepts.includes(file.mime)) return true
  // Family match, so 'audio/x-m4a' from one browser and 'audio/mp4' from
  // another are the same answer.
  //
  // MEDIA FAMILIES ONLY, and this is not a nicety: 'application' is not a
  // family, it is a bucket, and matching on it would accept a .docx against a
  // PDF-only component — the exact non-submission this file exists to refuse.
  // The checkpoint caught it, which is why the assertion is there.
  const family = file.mime.split('/')[0]
  if (
    ['audio', 'video', 'image'].includes(family) &&
    accepts.some((a) => a.startsWith(family + '/'))
  ) {
    return true
  }
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (accepts.includes('application/pdf') && ext === 'pdf') return true
  if (accepts.some((a) => a.startsWith('audio/')) && ['mp3', 'm4a', 'wav', 'ogg'].includes(ext)) {
    return true
  }
  return false
}

/**
 * The refusal a student reads, or null if the file is fine.
 *
 * It names the file, says what the IB takes, and — for the case that actually
 * happens, a Word document — says the four clicks that fix it. A refusal that
 * only says "wrong format" makes the student ask someone.
 */
export function formatRefusal(
  accepts: string[] | undefined,
  file: { name: string; mime: string },
): string | null {
  if (accepted(accepts, file)) return null
  const wants = describeAccepts(accepts)
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const docx = ext === 'doc' || ext === 'docx' || ext === 'pages' || ext === 'odt'
  return (
    `${file.name} can’t be accepted — this component goes to the IB as ${wants}.` +
    (docx && accepts?.includes('application/pdf')
      ? ' In Google Docs: File → Download → PDF, then upload that.'
      : '')
  )
}

/**
 * The accepted list for one requirement of one candidate, off the track that
 * both upload actions already fetch for the anonymity pre-flight.
 *
 * READ FROM THE DEF, never from the calling screen: `accepts` is versioned with
 * the cohort's definitions, so a family whose format changed between sessions
 * keeps refusing and accepting the right things for work already filed.
 */
export function acceptsIn(
  track: { lanes: { checkpoints: { def: { key: string; accepts?: string[] } }[] }[] } | null,
  key: string,
): string[] | undefined {
  if (!track) return undefined
  for (const lane of track.lanes) {
    for (const cp of lane.checkpoints) {
      if (cp.def.key === key) return cp.def.accepts
    }
  }
  return undefined
}
