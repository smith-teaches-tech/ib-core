// FILES ON THE SPINE — the one place that knows how a file hangs off a
// RequirementState, so that no screen has to go rummaging in `artifacts`.
//
// Before 22 Aug a file artifact was a bare filename string and nothing read it
// (IB-Student-Work-Files.md §1). Now `Artifact.file` is a real StoredRef, and
// these three functions are the whole interface to it:
//
//   fileArtifact()  build one, on upload or in a fixture
//   fileOf()        read the CURRENT one off a state
//   supersede()     keep the old one and mark it replaced — never delete
//
// WHY NOT A SECOND TABLE. EE and TOK each keep a module row beside the state
// (EeFinal, TokFile) for their own facts — declared word count, who reopened it
// and why. The FILE is not one of those facts: it is the same file the board's
// green box is about and the export pack ships, so it lives on the state where
// every reader already looks. The module rows point at it rather than copying
// it, which is invariant #2 applied to bytes.

import type { Artifact, RequirementState, StoredRef } from './types'

/** What every file-showing surface needs, and nothing else. */
export interface FileView {
  ref: StoredRef
  /** The school day it arrived — the artifact's stamp, not the ref's. */
  addedAt: string
  addedBy: string | null
  /** Set when a later upload replaced it. A superseded file is still readable. */
  supersededAt: string | null
}

export function fileArtifact(
  id: string,
  ref: StoredRef,
  opts: { label?: string; addedAt?: string; addedBy?: string } = {},
): Artifact {
  return {
    id,
    kind: 'file',
    // The label stays the filename so that anything written before StoredRef
    // existed and anything written after it read the same on screen.
    label: opts.label ?? ref.name,
    file: ref,
    addedBy: opts.addedBy,
    addedAt: opts.addedAt ?? ref.addedAt,
  }
}

/**
 * The current file, or null.
 *
 * "Current" = the last file artifact that has not been superseded. A state may
 * carry several — a returned paper and its replacement — and the newest one is
 * the one the box on the board is about.
 */
export function fileOf(state: RequirementState | null | undefined): FileView | null {
  if (!state) return null
  const live = state.artifacts.filter((a) => a.kind === 'file' && a.supersededAt == null)
  const a = live[live.length - 1]
  if (!a) return null
  return {
    // A file artifact written before `file` existed has no ref. Rather than
    // hide it, mint the honest record we DO have: the name it was given, an
    // unknown type and no bytes. The viewer already says the right thing about
    // a file it cannot play, and that is better than a green box with nothing
    // behind it — which is exactly the state this work replaced.
    ref: a.file ?? {
      id: a.id, name: a.label, mime: 'application/octet-stream', bytes: 0,
      key: '', addedAt: a.addedAt,
    },
    addedAt: a.addedAt,
    addedBy: a.addedBy ?? null,
    supersededAt: null,
  }
}

/** Every file ever attached, newest last — including superseded ones. */
export function filesOf(state: RequirementState | null | undefined): FileView[] {
  if (!state) return []
  return state.artifacts
    .filter((a) => a.kind === 'file')
    .map((a) => ({
      ref: a.file ?? {
        id: a.id, name: a.label, mime: 'application/octet-stream', bytes: 0,
        key: '', addedAt: a.addedAt,
      },
      addedAt: a.addedAt,
      addedBy: a.addedBy ?? null,
      supersededAt: a.supersededAt ?? null,
    }))
}

/**
 * Replace the file, KEEPING the old one.
 *
 * IB-Student-Work-Files.md §8 left "deleted, superseded, or both" open and
 * IB-Reading-and-Marking-Papers.md §4 state 3 settled it: "Old file kept,
 * superseded, not deleted." A returned paper that vanishes takes the evidence of
 * what was returned with it.
 */
export function supersede(state: RequirementState, at: string, next: Artifact): void {
  for (const a of state.artifacts) {
    if (a.kind === 'file' && a.supersededAt == null) a.supersededAt = at
  }
  state.artifacts = [...state.artifacts, next]
}

/** Human size, the same rounding MediaViewer has always used. */
export function fileSize(bytes: number): string {
  if (!bytes) return '—'
  return bytes > 1_000_000 ? (bytes / 1_048_576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB'
}
