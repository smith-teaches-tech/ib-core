'use client'

// THE FILE CHIP — one component, everywhere a file hangs.
//
// IB-Reading-and-Marking-Papers.md §6 step 2: "the file chip with real metadata,
// everywhere a file hangs." Before it, the only thing any screen said about an
// uploaded paper was that a box had gone green.
//
// It shows exactly what §2 says the teacher needs in order to catch a wrong file
// WITHOUT opening it half the time: the name the student gave it, what type it
// is, how big, who uploaded it and when — and whether it has been superseded.
//
// THREE WAYS TO USE IT, and the difference matters:
//
//   href     the chip is a link — used where the chip is THE DOOR to the reader
//            (the IA grid's File cell). Server-navigated, so the back button
//            works and the URL is the state.
//   onOpen   the chip is a button — used inside a screen that is already the
//            reader and just wants to swap the pane.
//   neither  the chip opens the file in the MediaViewer lightbox itself, which
//            is what the candidate panel and the student's own track want:
//            there is no marking to morph into, just "let me look at it".
//
// AN EMPTY CHIP IS STILL A CHIP. §4 state 1: "The file cell is still the door —
// an empty box opens the same reader." So `file: null` renders a muted chip that
// still links, rather than rendering nothing and leaving the row dead.

import { useState } from 'react'
import MediaViewer from './MediaViewer'
import { fileSize, type FileView } from '@/lib/files'
import { thumbLabel } from '@/lib/storage'

export default function FileChip({
  file,
  href,
  onOpen,
  canDownload = false,
  emptyLabel = 'No file yet',
  title,
}: {
  file: FileView | null
  href?: string
  onOpen?: () => void
  /** Download is a capability everywhere else in the product; it is one here. */
  canDownload?: boolean
  emptyLabel?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)

  const inner = file ? (
    <>
      <i className={`filec-t ${file.ref.mime === 'application/pdf' ? 'pdf' : ''}`}>
        {thumbLabel(file.ref)}
      </i>
      <span className="filec-n">{file.ref.name}</span>
      <span className="filec-m">
        {file.ref.bytes ? fileSize(file.ref.bytes) + ' · ' : ''}
        {file.addedAt}
        {file.addedBy ? ' · ' + file.addedBy : ''}
      </span>
      {file.supersededAt && (
        <span className="pill gold" style={{ fontSize: 10 }} title={`Replaced ${file.supersededAt}`}>
          superseded
        </span>
      )}
    </>
  ) : (
    <>
      <i className="filec-t empty">—</i>
      <span className="filec-n mut">{emptyLabel}</span>
    </>
  )

  const cls = `filec ${file ? '' : 'none'}`
  const hint =
    title ?? (file ? `${file.ref.name} — ${file.ref.mime}, ${fileSize(file.ref.bytes)}` : emptyLabel)

  if (href) {
    return <a className={cls} href={href} title={hint}>{inner}</a>
  }
  if (onOpen) {
    return <button type="button" className={cls} title={hint} onClick={onOpen}>{inner}</button>
  }
  return (
    <>
      <button
        type="button"
        className={cls}
        title={hint}
        disabled={!file}
        onClick={() => setOpen(true)}
      >
        {inner}
      </button>
      {open && file && (
        <MediaViewer
          media={[file.ref]}
          startAt={0}
          canDownload={canDownload}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
