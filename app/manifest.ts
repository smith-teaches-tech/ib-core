// THE PWA MANIFEST — Next's typed route, so it is code rather than a JSON file
// nobody remembers to update.
//
// `start_url` is /courses/cas deliberately: an installed icon on a student's
// home screen should open the thing it is named after, not the app's front
// door. Anyone who is not a student lands on their own home from there anyway.
//
// Distribution matters more here than usual — ISG restricts phones and has no
// MDM push, so a student installing this themselves from a browser is the ONLY
// route it reaches a home screen. See IB-CAS-Phone-Build-Plan.md §1.1.

import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'IB Core',
    short_name: 'IB Core',
    description: 'CAS, Extended Essay and TOK for the IB Diploma Programme.',
    // '/' RATHER THAN '/courses/cas', and the reason is that a manifest is
    // per-SITE, not per-page. Pointing it at CAS would mean a coordinator who
    // installs this on their laptop — which they will, because an installed PWA
    // is a perfectly good desktop app — opens on a student module every time.
    // `landingFor()` already routes each person to the right place from '/',
    // so one start_url serves everybody and the icon's 'IB' stays honest.
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#2f6f6a',
    icons: [
      { src: '/icons/cas-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/cas-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android crops icons to whatever shape the launcher uses. A `maskable`
      // variant is full-bleed with the mark inside the 80% safe zone, so the
      // arcs survive a circle mask instead of being sliced.
      { src: '/icons/cas-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
