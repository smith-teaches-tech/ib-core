'use client'

// Play evidence in the app. No download required to look at it.
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
import { kindOf, mediaUrl, STORAGE_IS_STUB, type StoredRef } from '@/lib/storage'

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
  const [support, setSupport] = useState<Support | null>(null)
  const ref = media[i]

  useEffect(() => {
    setSupport(browserSupport(ref.mime))
  }, [ref.mime])

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
  const kind = kindOf(ref)

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
          {url == null ? (
            <div className="note gold">
              <b>Nothing to play yet — storage is not connected.</b>
              <div style={{ marginTop: 6 }}>
                The record of this file is real: <b>{ref.name}</b>, {ref.mime}, {kb(ref.bytes)},
                added {ref.addedAt}. The bytes are not kept until the cloud project exists. When it
                does, this same window plays it — nothing here changes.
              </div>
            </div>
          ) : support === 'no' ? (
            <div className="note warn">
              <b>Your browser cannot play this format.</b> {ref.mime} is not something{' '}
              {kind === 'image' ? 'browsers render' : 'this browser can decode'} — the usual culprit
              is footage or photos straight off an iPhone. It needs converting on upload.
              {canDownload && ' You can still download it and open it locally.'}
            </div>
          ) : kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="viewer-media" src={url} alt={ref.name} />
          ) : kind === 'video' ? (
            <video className="viewer-media" src={url} controls playsInline controlsList={canDownload ? undefined : 'nodownload'} />
          ) : ref.mime.startsWith('audio/') ? (
            <audio src={url} controls style={{ width: '100%' }} controlsList={canDownload ? undefined : 'nodownload'} />
          ) : (
            <iframe className="viewer-media" src={url} title={ref.name} />
          )}

          {support === 'maybe' && url != null && (
            <p className="mut" style={{ fontSize: 12, marginBottom: 0 }}>
              This browser reports only partial support for {ref.mime}. If it does not play, it
              needs converting on upload.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
