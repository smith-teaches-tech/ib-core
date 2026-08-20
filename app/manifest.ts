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
    name: 'IB Core · CAS',
    short_name: 'CAS',
    description: 'Add reflections and evidence to your CAS portfolio, wherever you are.',
    start_url: '/courses/cas',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#1a365d',
    icons: [
      { src: '/icons/cas-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/cas-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
