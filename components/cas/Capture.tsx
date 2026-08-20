'use client'

// THE CAPTURE PANEL — three buttons and a composer, from the phone mockup.
//
//   📷 Take photo / video   evidence, straight off the OS camera
//   🖼 Upload from phone     evidence, from the gallery
//   🎤 Voice reflection      A REFLECTION — see the note in addVoiceReflection
//
// The mockup's fourth button, 🎥 Video reflection, is deliberately absent:
// Michael, 20 Aug — "no video reflection… instead, kids can upload videos as
// evidence of engagement in CAS." That makes the rule one line:
//
//     Reflection   typed text, OR audio + a typed one-liner
//     Evidence     photos · video · PDFs · links
//
// RECORDING IS PHONE-ONLY (§3.2). The phone is where speaking instead of typing
// makes sense; at a laptop there is a keyboard. Playback is everywhere.

import { useEffect, useRef, useState, useTransition } from 'react'
import * as cas from '@/lib/cas/actions'
import {
  MAX_RECORDING_SECONDS, bestRecordingMime, canRecord, clock, extensionFor,
} from '@/lib/cas/recording'

type Pending = { blob: Blob; mime: string; seconds: number } | null

export default function Capture({
  experienceId,
  /** Set when this is a reply to an earlier entry — reflect later on an upload. */
  inReplyTo,
  replyLabel,
  onDone,
}: {
  experienceId: string
  inReplyTo?: string
  replyLabel?: string
  onDone?: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [text, setText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // ---- recording ---------------------------------------------------------
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [clip, setClip] = useState<Pending>(null)
  const [clipTitle, setClipTitle] = useState('')
  const [oneLiner, setOneLiner] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)

  // Phone-only, and it is a viewport question rather than a user-agent one:
  // a small screen is where thumb-and-voice beats keyboard, whatever the device
  // claims to be. Sniffing user agents is how you end up wrong about a tablet.
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)')
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => () => { if (ticker.current) clearInterval(ticker.current) }, [])

  const stop = () => {
    recorder.current?.state === 'recording' && recorder.current.stop()
    if (ticker.current) clearInterval(ticker.current)
    ticker.current = null
    setRecording(false)
  }

  const begin = async () => {
    setMessage(null)
    if (!canRecord()) {
      setMessage('This browser will not let a page record audio. You can still type a reflection.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = bestRecordingMime()
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunks.current = []
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      mr.onstop = () => {
        const type = mr.mimeType || mime || 'audio/webm'
        setClip({ blob: new Blob(chunks.current, { type }), mime: type, seconds })
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.current = mr
      mr.start()
      setSeconds(0)
      setRecording(true)
      ticker.current = setInterval(() => {
        setSeconds((s) => {
          // THE CAP KEEPS WHAT IT HAS. Stopping at three minutes and throwing
          // the recording away would be worse than no cap at all.
          if (s + 1 >= MAX_RECORDING_SECONDS) { stop(); return MAX_RECORDING_SECONDS }
          return s + 1
        })
      }, 1000)
    } catch {
      setMessage('Microphone permission was refused. You can still type a reflection.')
    }
  }

  const postVoice = () =>
    start(async () => {
      if (!clip) return
      const r = await cas.addVoiceReflection(
        experienceId,
        {
          name: `reflection.${extensionFor(clip.mime)}`,
          mime: clip.mime,
          bytes: clip.blob.size,
          seconds: clip.seconds,
        },
        oneLiner,
        clipTitle,
        { inReplyTo },
      )
      setMessage(r.message)
      if (r.ok) { setClip(null); setClipTitle(''); setOneLiner(''); onDone?.() }
    })

  const postTyped = () =>
    start(async () => {
      if (files.length > 0) {
        const r = await cas.addEvidence(
          experienceId,
          files.map((f) => ({
            name: f.name,
            mime: f.type || 'application/octet-stream',
            bytes: f.size,
            title: titles[f.name],
          })),
          text,
          { inReplyTo },
        )
        setMessage(r?.message ?? null)
        if (r?.ok === false) return
      } else {
        await cas.addReflection(experienceId, text, { inReplyTo })
      }
      setFiles([]); setTitles({}); setText('')
      onDone?.()
    })

  const needsTitle = (f: File) => f.type.startsWith('video/')

  return (
    <div className="cob">
      {replyLabel && <div className="replyline">Replying to {replyLabel}</div>}

      <div className="capgrid">
        <label className="capbtn">
          📷 Take photo / video
          <input
            type="file" accept="image/*,video/*" capture="environment" hidden
            onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])}
          />
        </label>
        <label className="capbtn">
          🖼 Upload from phone
          <input
            type="file" multiple accept="image/*,video/*,audio/*,application/pdf" hidden
            onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])}
          />
        </label>
        {phone && !clip && (
          <button
            type="button"
            className={`capbtn ${recording ? 'rec' : ''}`}
            onClick={recording ? stop : begin}
            disabled={pending}
          >
            {recording ? '■ Stop' : '🎤 Voice reflection'}
          </button>
        )}
      </div>

      {!phone && (
        <p className="mut" style={{ fontSize: 11.5, margin: '0 0 8px' }}>
          Voice reflections are recorded on your phone — install CAS on your home screen. You can
          play them back anywhere.
        </p>
      )}

      {recording && (
        <div className="reccard">
          <span className="recdot" />
          <span className="rectime">{clock(seconds)}</span>
          <span className="mut" style={{ fontSize: 12, marginLeft: 8 }}>
            up to {MAX_RECORDING_SECONDS / 60} minutes — it stops and keeps what you have said
          </span>
          <div className="recbar">
            <i style={{ width: `${(seconds / MAX_RECORDING_SECONDS) * 100}%` }} />
          </div>
        </div>
      )}

      {clip && (
        <div className="reccard" style={{ background: '#fff' }}>
          <b>Recorded {clock(clip.seconds)}</b>
          <audio controls src={URL.createObjectURL(clip.blob)} style={{ width: '100%', marginTop: 8 }} />
          <label className="fld" style={{ marginTop: 8 }}>Title</label>
          <input
            type="text" value={clipTitle} placeholder="e.g. After the last match"
            onChange={(e) => setClipTitle(e.target.value)}
          />
          <label className="fld" style={{ marginTop: 8 }}>
            One line — what is this reflection about?
          </label>
          <input
            type="text" value={oneLiner}
            placeholder="e.g. Realised I had been organising rather than coaching"
            onChange={(e) => setOneLiner(e.target.value)}
          />
          <p className="mut" style={{ fontSize: 11.5, margin: '4px 0 0' }}>
            Your coordinator reads this line rather than listening to every recording — it is how
            your portfolio stays readable.
          </p>
          <div className="row" style={{ marginTop: 9 }}>
            <button className="btn pri sm" disabled={pending} onClick={postVoice}>
              {pending ? 'Posting…' : 'Post reflection'}
            </button>
            <button
              className="btn sm ghost"
              disabled={pending}
              onClick={() => { setClip(null); setClipTitle(''); setOneLiner('') }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {files.map((f) => (
        <div key={f.name} className="mediatitle">
          <div className="mut" style={{ fontSize: 12 }}>
            {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
          </div>
          <input
            type="text"
            value={titles[f.name] ?? ''}
            placeholder={needsTitle(f) ? 'Title (required for video)' : 'Title (optional)'}
            onChange={(e) => setTitles({ ...titles, [f.name]: e.target.value })}
          />
        </div>
      ))}

      {!clip && (
        <>
          <label className="fld" style={{ marginTop: 8 }}>
            {files.length ? 'A note about this evidence' : 'Write a reflection'}
          </label>
          <textarea
            rows={3}
            value={text}
            placeholder="What surprised you? What would you do differently?"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn pri sm"
              disabled={pending || (files.length === 0 && !text.trim())}
              onClick={postTyped}
            >
              {files.length ? 'Post evidence' : 'Post reflection'}
            </button>
            {files.length === 0 && (
              <span className="mut" style={{ fontSize: 11.5 }}>↕ Drag to expand — write as much as you like</span>
            )}
          </div>
        </>
      )}

      {message && <div className="note warn" style={{ marginTop: 8 }}>{message}</div>}

      <div className="note" style={{ marginTop: 9 }}>
        Cloud storage is not connected yet, so files and recordings are not kept. What you added,
        when, and of what type is real and permanent.
      </div>
    </div>
  )
}
