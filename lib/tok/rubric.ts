// THE TWO TOK ASSESSMENT INSTRUMENTS, AND HOW A TOK GRADE IS MADE.
//
// Read IB-TOK-research.md §2 before touching this file. Three things in it are
// load-bearing and easy to get wrong:
//
// 1. BOTH instruments are a SINGLE HOLISTIC JUDGEMENT out of 10. There are no
//    criteria. Do not invent a criterion split — the standing rule that also
//    governs unconfirmed IA families.
// 2. The band wording is reproduced, not read from behind MyIB. Any screen that
//    renders a band must render BAND_PROVENANCE with it, exactly as the EE
//    rubric does. A supervisor reading a reproduction and believing it to be the
//    markband is the specific failure this file exists to prevent.
// 3. THE BOUNDARIES ARE THE SCHOOL'S, NOT THE IB'S. No official A–E table could
//    be found for any session, and the sources that publish one disagree about
//    whether it moves. Michael, 21 Aug: "Let the teacher set the boundaries.
//    They DO change." So the table is data the teacher owns, per cohort, and it
//    arrives at a new year group UNCONFIRMED (lib/tok/types.ts).
//
// ⚠ There are TWO TOK essay rubrics in circulation. The pre-2022 one has two
// criteria columns, levels 1–5, and the phrases "ways of knowing" and
// "counterclaims". If you ever see either phrase here, someone has pasted the
// old instrument over the current one.

export interface Band {
  /** Inclusive. `from === to === 0` for the zero band. */
  from: number
  to: number
  /** The IB's own word for the level. Carries more meaning than the number. */
  level: string
  descriptor: string
}

export interface Instrument {
  key: 'exhibition' | 'essay'
  label: string
  max: number
  /** The single question the marker is answering. Both instruments have one. */
  question: string
  /** Highest band first, so a ladder renders in the order a marker reads it. */
  bands: Band[]
}

export const TOK_MARK_MAX = 10

export const EXHIBITION_INSTRUMENT: Instrument = {
  key: 'exhibition',
  label: 'TOK exhibition',
  max: TOK_MARK_MAX,
  question: 'Does the exhibition successfully show how TOK manifests in the world around us?',
  bands: [
    {
      from: 9, to: 10, level: 'Excellent',
      descriptor:
        'The exhibition clearly identifies three objects and their specific real-world contexts. ' +
        'Links between each of the three objects and the selected IA prompt are clearly made and ' +
        'well-explained. There is a strong justification of the particular contribution that each ' +
        'individual object makes to the exhibition. All, or nearly all, of the points are ' +
        'well-supported by appropriate evidence and explicit references to the selected IA prompt.',
    },
    {
      from: 7, to: 8, level: 'Good',
      descriptor:
        'The exhibition identifies three objects and their real-world contexts. Links between each ' +
        'of the three objects and the selected IA prompt are explained, although this explanation ' +
        'may lack precision and clarity in parts. There is a justification of the contribution that ' +
        'each individual object makes to the exhibition. Many of the points are supported by ' +
        'appropriate evidence and references to the selected IA prompt.',
    },
    {
      from: 5, to: 6, level: 'Satisfactory',
      descriptor:
        'The exhibition identifies three objects, although the real-world contexts of these objects ' +
        'may be vaguely or imprecisely stated. There is some explanation of the links between the ' +
        'three objects and the selected IA prompt. There is some justification for the inclusion of ' +
        'each object in the exhibition. Some of the points are supported by evidence and references ' +
        'to the selected IA prompt.',
    },
    {
      from: 3, to: 4, level: 'Basic',
      descriptor:
        'The exhibition identifies three objects, although the real-world contexts of the objects ' +
        'may be implied rather than explicitly stated. Basic links between the objects and the ' +
        'selected IA prompt are made, but the explanation of these links is unconvincing and/or ' +
        'unfocused. There is a superficial justification for the inclusion of each object. Reasons ' +
        'for the inclusion of the objects are offered, but these are not supported by appropriate ' +
        'evidence and/or lack relevance to the selected IA prompt. There may be significant ' +
        'repetition across the justifications of the different objects.',
    },
    {
      from: 1, to: 2, level: 'Rudimentary',
      descriptor:
        'The exhibition presents three objects, but the real-world contexts of these objects are ' +
        'not stated, or the images presented may be highly generic images of types of object rather ' +
        'than of specific real-world objects. Links between the objects and the selected IA prompt ' +
        'are made, but these are minimal, tenuous, or it is not clear what the student is trying to ' +
        'convey. There is very little justification offered for the inclusion of each object. The ' +
        'commentary on the objects is highly descriptive or consists only of unsupported assertions.',
    },
    {
      from: 0, to: 0, level: '—',
      descriptor:
        'The exhibition does not reach the standard described by the other levels or does not use ' +
        'one of the IA prompts provided.',
    },
  ],
}

export const ESSAY_INSTRUMENT: Instrument = {
  key: 'essay',
  label: 'TOK essay',
  max: TOK_MARK_MAX,
  question: 'Does the student provide a clear, coherent and critical exploration of the essay title?',
  bands: [
    {
      from: 9, to: 10, level: 'Excellent',
      descriptor:
        'The discussion has a sustained focus on the title and is linked effectively to areas of ' +
        'knowledge. Arguments are clear, coherent and effectively supported by specific examples. ' +
        'The implications of arguments are considered. There is clear awareness and evaluation of ' +
        'different points of view.',
    },
    {
      from: 7, to: 8, level: 'Good',
      descriptor:
        'The discussion is focused on the title and is linked effectively to areas of knowledge. ' +
        'Arguments are clear, coherent and supported by examples. There is awareness and some ' +
        'evaluation of different points of view.',
    },
    {
      from: 5, to: 6, level: 'Satisfactory',
      descriptor:
        'The discussion is focused on the title and is developed with some links to areas of ' +
        'knowledge. Arguments are offered and are supported by examples. There is some awareness of ' +
        'different points of view.',
    },
    {
      from: 3, to: 4, level: 'Basic',
      descriptor:
        'The discussion is connected to the title and makes superficial or limited links to areas ' +
        'of knowledge. The discussion is largely descriptive. Limited arguments are offered but ' +
        'they are unclear and are not supported by effective examples.',
    },
    {
      from: 1, to: 2, level: 'Rudimentary',
      descriptor:
        'The discussion is weakly connected to the title. While there may be links to the areas of ' +
        'knowledge, any relevant points are descriptive or consist only of unsupported assertions.',
    },
    {
      from: 0, to: 0, level: '—',
      descriptor:
        'The discussion does not reach the standard described by the other levels or is not a ' +
        'response to one of the prescribed titles for the correct examination session.',
    },
  ],
}

export const INSTRUMENTS = [EXHIBITION_INSTRUMENT, ESSAY_INSTRUMENT] as const

/**
 * ON SCREEN WITH EVERY BAND, until somebody confirms the wording against the
 * guide on MyIB. Same discipline as lib/ee/rubric.ts BAND_PROVENANCE.
 */
export const BAND_PROVENANCE =
  'Band wording reproduced from the published assessment instrument and corroborated across two ' +
  'independent sources — but not read from the guide itself, which sits behind MyIB. Confirm ' +
  'before marks go to the IB.'

/** Which band a mark falls in. Returns null for a mark outside 0..max. */
export function bandFor(instrument: Instrument, mark: number | null | undefined): Band | null {
  if (mark == null || !Number.isInteger(mark) || mark < 0 || mark > instrument.max) return null
  return instrument.bands.find((b) => mark >= b.from && mark <= b.to) ?? null
}

// ---------------------------------------------------------------------------
// The /30
// ---------------------------------------------------------------------------

/**
 * THE IB WEIGHTS THE ESSAY 2/3 AND THE EXHIBITION 1/3 — that ratio is official
 * (ibo.org subject brief). Doubling the essay and adding the exhibition
 * reproduces it exactly.
 *
 * "Out of 30" is OUR arithmetic, not an IB-published scale. Never label it as
 * the IB's on screen.
 */
export const ESSAY_WEIGHT = 2
export const EXHIBITION_WEIGHT = 1
export const TOK_TOTAL_MAX = TOK_MARK_MAX * (ESSAY_WEIGHT + EXHIBITION_WEIGHT)

/** null unless BOTH marks are in — a half-built total is worse than none. */
export function tokTotal(
  exhibition: number | null | undefined,
  essay: number | null | undefined,
): number | null {
  if (exhibition == null || essay == null) return null
  return exhibition * EXHIBITION_WEIGHT + essay * ESSAY_WEIGHT
}
