'use client'

// Play evidence in the app. No download required to look at it.
//
// LIFTED OUT OF components/cas/ ON 22 AUG, unchanged in behaviour. It was never
// CAS-specific — its only import is lib/storage — and CAS was simply the first
// module with a file attached (IB-Student-Work-Files.md §4: "Do not write a
// second viewer"). The IA/EE/TOK reader shows papers through the same code.
//
// TWO SHAPES, ONE BODY. `MediaViewer` is the lightbox CAS has always used;
// `MediaBody` is the same pane with no modal chrome, which is what the reader
// puts the paper in. They share every branch below — including the honest
// no-bytes message — so there is exactly one place that decides what a file
// looks like when storage is not connected.
//
// WHAT THIS TAKES, since it sounds like it should be hard: nothing. No VLC, no
// player library, no plugin. Browsers already decode images, video, audio and
// PDF natively — <img>, <video controls>, <audio controls>, <iframe>. That is
// the whole implementation, and it is why this works where ManageBac's
// download-to-open does not.
//
// THE ONE REAL TRAP, and it is a real one: a browser plays the FORMATS IT
// KNOWS, not whatever a phone produced. An iPhone shoots .mov/HEVC and .heic,
// both of which Safari plays and Chrome and Firefox do not. So this component
// asks the browser up front whether it can play the file and says so plainly
// instead of showing a black rectangle. The fix is a transcode step at upload —
// HEVC → H.264, HEIC → JPEG — which belongs with the storage adapter, not here.
// Flagged in the build plan.

import { useEffect, useState } from 'react'
import { kindOf, mediaUrl, type StoredRef } from '@/lib/storage'

type Support = 'yes' | 'maybe' | 'no'

const PLAYABLE_IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml']

/** Ask the browser itself rather than keeping a list that goes stale. */
function browserSupport(mime: string): Support {
  if (mime === 'application/pdf') return 'yes'
  if (mime.startsWith('image/')) {
    if (PLAYABLE_IMAGES.includes(mime)) return 'yes'
    if (mime === 'image/heic' || mime === 'image/heif') return 'no'
    return 'maybe'
  }
  if (mime.startsWith('video/') || mime.startsWith('audio/')) {
    const el = document.createElement(mime.startsWith('video/') ? 'video' : 'audio')
    const answer = el.canPlayType(mime)
    return answer === 'probably' ? 'yes' : answer === 'maybe' ? 'maybe' : 'no'
  }
  return 'no'
}

const kb = (n: number) => (n > 1_000_000 ? (n / 1_048_576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB')

/**
 * ONE FILE, NO CHROME — the pane the reader puts a paper in, and the body of
 * the lightbox below. Everything that decides what a file looks like lives
 * here: the no-bytes message, the unplayable-format message, and the four
 * elements a browser already knows how to render.
 */
export function MediaBody({
  file: media,
  canDownload,
  className,
}: {
  /**
   * Deliberately NOT called `ref`: in React 19 `ref` is an ordinary prop on a
   * function component, so a prop of that name would be swallowed by React
   * before this component ever saw it.
   */
  file: StoredRef
  canDownload: boolean
  className?: string
}) {
  const [support, setSupport] = useState<Support | null>(null)
  useEffect(() => {
    setSupport(browserSupport(media.mime))
  }, [media.mime])

  const url = mediaUrl(media)
  const kind = kindOf(media)

  return (
    <div className={className}>
      {url == null ? (
        <div className="note gold">
          <b>Nothing to show yet — storage is not connected.</b>
          <div style={{ marginTop: 6 }}>
            The record of this file is real: <b>{media.name}</b>
            {media.mime && media.mime !== 'application/octet-stream' ? `, ${media.mime}` : ''}
            {media.bytes ? `, ${kb(media.bytes)}` : ''}, added {media.addedAt}. The bytes are not
            kept until the cloud project exists. When it does, this same window plays it — nothing
            here changes.
          </div>
        </div>
      ) : support === 'no' ? (
        <div className="note warn">
          <b>Your browser cannot play this format.</b> {media.mime} is not something{' '}
          {kind === 'image' ? 'browsers render' : 'this browser can decode'} — the usual culprit is
          footage or photos straight off an iPhone. It needs converting on upload.
          {canDownload && ' You can still download it and open it locally.'}
        </div>
      ) : kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="viewer-media" src={url} alt={media.name} />
      ) : kind === 'video' ? (
        <video className="viewer-media" src={url} controls playsInline controlsList={canDownload ? undefined : 'nodownload'} />
      ) : media.mime.startsWith('audio/') ? (
        <audio src={url} controls style={{ width: '100%' }} controlsList={canDownload ? undefined : 'nodownload'} />
      ) : (
        <iframe className="viewer-media" src={url} title={media.name} />
      )}

      {support === 'maybe' && url != null && (
        <p className="mut" style={{ fontSize: 12, marginBottom: 0 }}>
          This browser reports only partial support for {media.mime}. If it does not play, it needs
          converting on upload.
        </p>
      )}
    </div>
  )
}

export default function MediaViewer({
  media,
  startAt,
  onClose,
  canDownload,
}: {
  media: StoredRef[]
  startAt: number
  onClose: () => void
  canDownload: boolean
}) {
  const [i, setI] = useState(startAt)
  const ref = media[i]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((n) => (n + 1) % media.length)
      if (e.key === 'ArrowLeft') setI((n) => (n - 1 + media.length) % media.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [media.length, onClose])

  const url = mediaUrl(ref)

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal viewer">
        <div className="modal-h">
          <b>{ref.name}</b>
          <span className="pill grey" style={{ marginLeft: 8 }}>{ref.mime}</span>
          <span className="mut" style={{ marginLeft: 8, fontSize: 12 }}>{kb(ref.bytes)}</span>
          <span className="spacer" />
          {media.length > 1 && (
            <>
              <button className="btn sm ghost" onClick={() => setI((n) => (n - 1 + media.length) % media.length)}>‹</button>
              <span className="mut" style={{ fontSize: 12 }}>{i + 1} / {media.length}</span>
              <button className="btn sm ghost" onClick={() => setI((n) => (n + 1) % media.length)}>›</button>
            </>
          )}
          {canDownload && url && (
            <a className="btn sm" href={url} download={ref.name}>⤓ Download</a>
          )}
          <button className="btn sm ghost" onClick={onClose}>✕</button>
        </div>

        <div className="modal-b viewer-b">
          <MediaBody file={ref} canDownload={canDownload} />
        </div>
      </div>
    </div>
  )
}
