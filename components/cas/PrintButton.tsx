'use client'

export default function PrintButton() {
  return (
    <button className="btn pri noprint" onClick={() => window.print()}>
      🖨 Print this form
    </button>
  )
}
