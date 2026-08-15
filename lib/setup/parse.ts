// Parsing a pasted roster.
//
// Pure, so it can be reasoned about and tested without a browser, a database or
// a session. The screen previews exactly what this returns and commits exactly
// the rows it marked `new` — nothing is guessed at commit time.
//
// WHY EMAIL IS THE KEY. The spreadsheets this replaces have no student
// identifier at all — Michael's cohort sheet has Last Name and First Name and
// nothing else, and its name pairs are already dirty: one row has lost its
// surname, one student appears in two cohorts, two pairs share a surname. Names
// cannot be a key. Email can, and it is what Google OAuth will sign them in
// with, so importing on it now means no re-matching when auth arrives.
//
// The Skyward student number is carried too, because it is the join back to the
// SIS and it is the one identifier the school controls.

import type { ImportPreview, ImportRow, RowVerdict } from './types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CANON: Record<string, 'lastName' | 'firstName' | 'email' | 'studentNumber'> = {
  last: 'lastName', lastname: 'lastName', surname: 'lastName', family: 'lastName',
  first: 'firstName', firstname: 'firstName', given: 'firstName', forename: 'firstName',
  email: 'email', mail: 'email', address: 'email',
  student: 'studentNumber', studentnumber: 'studentNumber', number: 'studentNumber',
  id: 'studentNumber', skyward: 'studentNumber', sis: 'studentNumber',
}

const DEFAULT_ORDER: ('lastName' | 'firstName' | 'email' | 'studentNumber')[] = [
  'lastName', 'firstName', 'email', 'studentNumber',
]

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

/** Tab first, because that is what a spreadsheet copy actually produces. */
function splitCells(line: string): string[] {
  const cells = line.includes('\t') ? line.split('\t') : line.split(',')
  return cells.map((c) => c.trim().replace(/^"|"$/g, '').trim())
}

/**
 * A header row is only honoured if it genuinely looks like one. Guessing wrong
 * silently eats a real student, so the preview reports whether it skipped one.
 */
function readHeader(cells: string[]) {
  const mapped = cells.map((c) => CANON[key(c)])
  const hits = mapped.filter(Boolean).length
  if (hits < 2 || cells.some((c) => EMAIL_RE.test(c))) return null
  return mapped
}

export function parseRoster(text: string, existingEmails: Iterable<string>): ImportPreview {
  const taken = new Set([...existingEmails].map((e) => e.toLowerCase()))
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== '')

  let order = DEFAULT_ORDER as (('lastName' | 'firstName' | 'email' | 'studentNumber') | undefined)[]
  let headerSkipped = false
  if (lines.length > 0) {
    const header = readHeader(splitCells(lines[0]))
    if (header) {
      order = header
      headerSkipped = true
      lines.shift()
    }
  }

  const seen = new Set<string>()
  const rows: ImportRow[] = lines.map((line, i) => {
    const cells = splitCells(line)
    const get = (want: string) => {
      const at = order.indexOf(want as never)
      return at >= 0 ? (cells[at] ?? '') : ''
    }

    const row: ImportRow = {
      line: i + 1 + (headerSkipped ? 1 : 0),
      lastName: get('lastName'),
      firstName: get('firstName'),
      email: get('email').toLowerCase(),
      studentNumber: get('studentNumber'),
      verdict: 'new',
    }

    let verdict: RowVerdict = 'new'
    let message: string | undefined

    if (!row.lastName && !row.firstName) {
      verdict = 'error'
      message = 'No name in this row.'
    } else if (!row.email) {
      verdict = 'error'
      message = 'No email. Email is the key this roster is built on — add one.'
    } else if (!EMAIL_RE.test(row.email)) {
      verdict = 'error'
      message = `"${row.email}" is not an email address.`
    } else if (seen.has(row.email)) {
      verdict = 'duplicate_in_paste'
      message = 'This email appears more than once in what you pasted.'
    } else if (taken.has(row.email)) {
      verdict = 'already_here'
      message = 'Already in this school — left untouched.'
    } else if (!row.lastName || !row.firstName) {
      message = 'Only one name given. Importing anyway; fix it afterwards.'
    } else if (!row.studentNumber) {
      message = 'No Skyward number. Importing anyway; it is the link back to the SIS.'
    }

    if (verdict === 'new') seen.add(row.email)
    return { ...row, verdict, message }
  })

  return {
    rows,
    headerSkipped,
    columnOrder: order.map((o) => o ?? '—'),
    newCount: rows.filter((r) => r.verdict === 'new').length,
    skipCount: rows.filter((r) => r.verdict === 'already_here' || r.verdict === 'duplicate_in_paste').length,
    errorCount: rows.filter((r) => r.verdict === 'error').length,
  }
}
