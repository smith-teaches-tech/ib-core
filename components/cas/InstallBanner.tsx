'use client'

// "ADD CAS TO YOUR HOME SCREEN" — the whole distribution story.
//
// ISG restricts phones and has no MDM push or managed app catalogue, so a
// student installing this themselves from a browser is the ONLY way it reaches
// a home screen (IB-CAS-Phone-Build-Plan.md §1.1). That is also why the phone
// permission rule is said HERE: the moment somebody decides to put this on
// their phone is the moment to say it. It is said once more, quietly, under the
// header — and nowhere else, because a rule repeated at every action becomes
// noise, and noise is what people learn to skip.

import { useEffect, useState } from 'react'

/** The Chrome/Edge install event. Not in lib.dom yet. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED = 'ibcore.install.dismissed'

export default function InstallBanner() {
  const [event, setEvent] = useState<InstallPrompt | null>(null)
  const [hidden, setHidden] = useState(true)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    // Already installed: nothing to offer.
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (sessionStorage.getItem(DISMISSED)) return

    // iOS Safari fires no install event at all — Add to Home Screen is a manual
    // gesture in the share sheet. Saying so beats a button that cannot work.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = 'standalone' in navigator && (navigator as { standalone?: boolean }).standalone
    if (isIos && !standalone) {
      setIos(true)
      setHidden(false)
      return
    }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as InstallPrompt)
      setHidden(false)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (hidden) return null

  const dismiss = () => {
    // The SESSION, not forever — a student who dismisses it in September
    // should be offered it again, once, rather than never.
    sessionStorage.setItem(DISMISSED, '1')
    setHidden(true)
  }

  return (
    <div className="pwabar">
      <span style={{ fontSize: 20, lineHeight: 1 }}>📱</span>
      <div className="pwabar-b">
        <div className="pwabar-t">Add IB Core to your Home Screen</div>
        <div className="pwabar-d">
          Add CAS evidence and reflections wherever you are — no App Store needed. It works on a
          laptop too.
        </div>
        <div className="pwabar-d" style={{ marginTop: 4 }}>
          <b>Phones are not allowed at school without permission.</b> Use this outside school, or
          when a teacher has said you may.
        </div>
        {ios ? (
          <div className="pwabar-d" style={{ marginTop: 6 }}>
            On iPhone: tap <b>Share</b> then <b>Add to Home Screen</b>.
          </div>
        ) : (
          <button
            className="btn pri sm"
            style={{ marginTop: 8 }}
            onClick={async () => {
              if (!event) return
              await event.prompt()
              await event.userChoice
              setHidden(true)
            }}
          >
            Install
          </button>
        )}
      </div>
      <button className="pwabar-x" onClick={dismiss} aria-label="Dismiss">×</button>
    </div>
  )
}
