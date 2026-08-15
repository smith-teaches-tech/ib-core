// THE SECOND SWAP POINT — the storage sibling of lib/data/index.ts.
//
// Every upload screen in CAS is built as though storage is real. It isn't yet:
// there is no cloud project, so the bytes go nowhere. What IS real — and what the
// record actually depends on — is the FACT of the upload: who added what, when,
// of what type, against which experience. That is recorded honestly either way,
// which is why the thread is trustworthy today and will not need rewriting later.
//
// When cloud storage arrives, ONE implementation changes here and every upload in
// the product starts working. No screen changes.

export interface StoredRef {
  id: string
  name: string
  mime: string
  bytes: number
  /** Opaque to the app. A local path today is a bucket key tomorrow. */
  key: string
  addedAt: string
}

export interface StorageAdapter {
  put(
    file: { name: string; mime: string; bytes: number },
    meta: { schoolId: string; studentId: string },
  ): Promise<StoredRef>
  url(ref: StoredRef): string
}

let counter = 0

/** Records the metadata, discards the bytes, and says so. */
export const stubStorage: StorageAdapter = {
  async put(file, meta) {
    counter += 1
    return {
      id: 'sr' + counter,
      name: file.name,
      mime: file.mime,
      bytes: file.bytes,
      key: `${meta.schoolId}/${meta.studentId}/${counter}-${file.name}`,
      addedAt: new Date().toISOString().slice(0, 10),
    }
  },
  url() {
    return '#stub-storage'
  },
}

export const storage: StorageAdapter = stubStorage

/**
 * True while the bytes go nowhere. The viewer reads this to say so out loud
 * rather than showing a broken <img> and letting people guess.
 *
 * Flip to false when a real adapter lands in this file; nothing else changes.
 */
export const STORAGE_IS_STUB = true

/**
 * Where a browser should point to play this. Safe to call on the client, which
 * is the point — the viewer is an ordinary <img>/<video>/<audio>/<iframe> and
 * needs no player library, no plugin and no server round trip.
 *
 * Returns null while storage is stubbed.
 */
export function mediaUrl(ref: StoredRef): string | null {
  return STORAGE_IS_STUB ? null : '/media/' + encodeURIComponent(ref.key)
}

export type MediaKind = 'image' | 'video' | 'pdf' | 'file'

export function kindOf(ref: StoredRef): MediaKind {
  if (ref.mime.startsWith('image/')) return 'image'
  if (ref.mime.startsWith('video/')) return 'video'
  if (ref.mime === 'application/pdf') return 'pdf'
  return 'file'
}

/** The four-letter tile the mockup draws in the thread. */
export function thumbLabel(ref: StoredRef): string {
  const k = kindOf(ref)
  return k === 'image' ? 'IMG' : k === 'video' ? 'VID' : k === 'pdf' ? 'PDF' : 'FILE'
}
