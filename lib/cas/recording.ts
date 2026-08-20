// VOICE REFLECTIONS — the cap, and the format negotiation.
//
// Not in lib/cas/actions.ts because that file is `'use server'`, and a server
// module may only export async functions. Not in types.ts because this is
// behaviour rather than shape.

/**
 * THE RECORDING CAP — three minutes (Michael, 20 Aug: "a few minutes for a
 * reflection?").
 *
 * Not to discipline anyone: to stop a forty-minute accidental recording
 * becoming a file nobody can review, that the school stores for years, and that
 * the retention rule then has to sweep.
 *
 * THE RECORDER STOPS AND KEEPS WHAT IT HAS. A cap that discarded a student's
 * reflection at the three-minute mark would be worse than no cap at all.
 */
export const MAX_RECORDING_SECONDS = 180

/**
 * WHAT THIS BROWSER CAN ACTUALLY RECORD.
 *
 * The direct analogue of the `.heic` / `.mov` problem IB-Media-and-Uploads.md
 * §3 calls "the common case, not the edge case": Android Chrome and iOS Safari
 * produce DIFFERENT containers from the same API. Chrome gives webm/opus;
 * Safari gives mp4/aac and refuses webm outright.
 *
 * So ask, in preference order, and hand back what the browser admits to. The
 * list is ordered by how widely the RESULT plays back, not by how nice it is to
 * record — a student records once and a coordinator plays it on whatever they
 * happen to be using.
 */
const PREFERRED = [
  'audio/mp4',              // Safari, and plays everywhere
  'audio/mpeg',
  'audio/webm;codecs=opus', // Chrome / Firefox / Edge
  'audio/webm',
  'audio/ogg;codecs=opus',
]

export function bestRecordingMime(): string | null {
  if (typeof window === 'undefined') return null
  const MR = (window as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } })
    .MediaRecorder
  if (!MR) return null
  // No isTypeSupported means an old implementation: let the browser choose its
  // own default rather than forcing one it will reject.
  if (typeof MR.isTypeSupported !== 'function') return ''
  return PREFERRED.find((t) => MR.isTypeSupported!(t)) ?? ''
}

/** Can this browser record at all? Used to explain, not merely to disable. */
export function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    'MediaRecorder' in window
  )
}

/** A file extension that matches what was actually recorded. */
export function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

export const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
