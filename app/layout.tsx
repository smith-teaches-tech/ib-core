import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'IB Central',
  description: 'IB Diploma Programme core dashboard for ISG',
  // iOS Safari fires no install event and ignores the manifest's icons — Add to
  // Home Screen reads these instead. Without them an installed CAS shows a
  // screenshot of the page as its icon.
  appleWebApp: { capable: true, title: 'CAS', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png', icon: '/icons/cas-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#1a365d',
  // `maximumScale` is deliberately NOT set. Locking zoom is the standard
  // phone-app reflex and it is an accessibility failure: a student who needs to
  // pinch to read their own reflection must be able to.
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
