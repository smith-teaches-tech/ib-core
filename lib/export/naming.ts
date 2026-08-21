// WHAT A FILE IN AN EXPORT PACK IS CALLED.
//
// ─────────────────────────────────────────────────────────────────────────────
// DECIDED 21 Aug 2026 (Michael), after checking MyIB: **the IB publishes no
// filename rule at all.** Its eCoursework guide says only that "the filename
// can contain the candidates code, only the work itself needs to be anonymous",
// and that "the marker will not see the file name". So the name is entirely for
// the school, and the only question worth asking is which moment it serves.
//
// THE MOMENT IT SERVES: eCoursework binds a file to a candidate BY THE UPLOAD
// SLOT the coordinator selects — never by anything written in or on the file.
// So the coordinator's loop is: IBIS puts them on candidate 0007, and they then
// have to find 0007's files. Everything below follows from that one sentence.
//
//     {sessionNumber}_{Last}_{First}_{component}[_{subject}].{ext}
//
//     0004_Chen_Marcus_tok_essay.pdf
//     0004_Chen_Marcus_tok_tkppf.pdf
//     0004_Chen_Marcus_ee_biology.pdf
//     0004_Chen_Marcus_ee_rppf.pdf
//     0004_Chen_Marcus_biology-hl_ia.pdf
//
// Why the session number leads:
//   · it is the identifier IBIS has just put on screen, so matching needs no
//     reading — and it disambiguates two candidates who share a surname;
//   · every file for one candidate sorts together, so the moment you are in
//     0007's slot, 0007's files are adjacent on disk;
//   · session numbers are assigned in registration order, which is usually
//     alphabetical anyway — so leading with it costs nothing in readability.
//
// Why the name is still there: a number alone is unreadable to a human, and
// the school's existing archive is organised by surname. Both, in that order,
// serve both readers.
//
// GROUP LIVES IN THE FOLDER, SUBJECT IN THE FILENAME. The group is navigation;
// the subject is identity. This mirrors the Drive layout ISG already uses.
//
// AND THE APP GENERATES IT — never a student, and never by hand. Last session's
// archive is the argument: ten TOK essays arrived in eight different formats
// and twelve extended essays in five, including "Tittle 4", ".pdf.pdf" and
// "Buisness Managemnt". Every one of those is a defect this file makes
// structurally impossible. See IB-Uploads-Stamping-and-Naming.md §2.
// ─────────────────────────────────────────────────────────────────────────────

/** The documented pattern, for the export board to show beside a live example. */
export const NAMING_PATTERN = '{sessionNo}_{Last}_{First}_{component}.{ext}'

/**
 * One safe path segment. Diacritics folded, apostrophes dropped, everything
 * else that is not a letter or a digit becomes a single hyphen.
 *
 * Hyphenated and multi-word surnames survive as one readable token —
 * "Al-Rashid" stays "Al-Rashid", "Tan, Wei Ling" gives "Wei-Ling", and
 * "O'Brien" gives "OBrien" rather than "O-Brien".
 */
export function slug(part: string): string {
  return part
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Fixtures and rosters store "Ahmed, Layla". A pasted roster might not, so a
 * name without a comma is read as "first … last" and the LAST token is the
 * surname — wrong for some naming traditions, but it is a fallback rather than
 * the path, and it never silently drops a part of the name.
 */
export function splitName(name: string): { last: string; first: string } {
  const raw = name.trim()
  if (raw.includes(',')) {
    const [last, ...rest] = raw.split(',')
    return { last: last.trim(), first: rest.join(',').trim() }
  }
  const parts = raw.split(/\s+/)
  if (parts.length === 1) return { last: parts[0], first: '' }
  return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(' ') }
}

export interface PackNameInput {
  /** Zero-padded, as IBIS issues it. Null for a candidate not yet registered. */
  sessionNumber: string | null
  /** "Ahmed, Layla" or "Layla Ahmed". */
  name: string
  /**
   * Component parts, in order, already in the school's vocabulary:
   * ['tok','essay'] · ['ee','rppf'] · ['ee','biology'] · ['biology-hl','ia'].
   * Lowercased on the way out; the name keeps its capitals.
   */
  parts: string[]
  ext?: string
}

/**
 * A candidate with NO SESSION NUMBER still gets a usable name rather than
 * "no-session-number" in the middle of it. They cannot be uploaded at all until
 * registration completes, so the missing prefix is a fact for the manifest to
 * report — not a string to bury in a filename bound for the IB.
 */
export function packFileName(input: PackNameInput): string {
  const { last, first } = splitName(input.name)
  const segments = [
    ...(input.sessionNumber ? [input.sessionNumber] : []),
    slug(last),
    ...(first ? [slug(first)] : []),
    ...input.parts.filter(Boolean).map((p) => slug(p).toLowerCase()),
  ].filter(Boolean)
  return `${segments.join('_')}.${input.ext ?? 'pdf'}`
}

/** True when the name is missing the prefix the coordinator uploads by. */
export const needsSessionNumber = (input: PackNameInput): boolean =>
  input.sessionNumber == null

/** Group → subject → component, as the whole-cohort archive is organised. */
export function packFolderPath(input: {
  subjectGroup: string | null
  courseName: string | null
  component: string
}): string {
  const core = input.subjectGroup == null
  return core
    ? `Core/${input.component}`
    : `${input.subjectGroup}/${input.courseName}/${input.component}`
}
