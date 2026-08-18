import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'IB Central',
  description: 'IB Diploma Programme core dashboard for ISG',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
