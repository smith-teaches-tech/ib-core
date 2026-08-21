// THE 35 IA PROMPTS FOR THE TOK EXHIBITION.
//
// Fixed by the IB and unchanged between sessions — unlike the six essay titles,
// which change every session and are therefore typed in per cohort
// (lib/tok/types.ts). These are the one part of TOK that is genuinely constant.
//
// THEY ARE READ-ONLY STRINGS AND THE UI MUST NOT LET ANYONE EDIT ONE.
// The guide: "The chosen IA prompt must be used exactly as given; it must not be
// altered in any way." A text field would invite exactly the thing that is
// forbidden, so the student picks from this list and nothing else.
//
// PROVENANCE: corroborated character-for-character across five independent
// reproductions of the guide's list; seven of the 35 appear verbatim on ibo.org
// itself. The guide PDF is behind MyIB and 403s to automated fetching, so this
// wears PROMPT_PROVENANCE until somebody eyeballs page 40 with a login.
// IB-TOK-research.md §6.1.

export const IA_PROMPTS: readonly string[] = [
  'What counts as knowledge?',
  'Are some types of knowledge more useful than others?',
  'What features of knowledge have an impact on its reliability?',
  'On what grounds might we doubt a claim?',
  'What counts as good evidence for a claim?',
  'How does the way that we organize or classify knowledge affect what we know?',
  'What are the implications of having, or not having, knowledge?',
  'To what extent is certainty attainable?',
  'Are some types of knowledge less open to interpretation than others?',
  'What challenges are raised by the dissemination and/or communication of knowledge?',
  'Can new knowledge change established values or beliefs?',
  'Is bias inevitable in the production of knowledge?',
  'How can we know that current knowledge is an improvement upon past knowledge?',
  'Does some knowledge belong only to particular communities of knowers?',
  'What constraints are there on the pursuit of knowledge?',
  'Should some knowledge not be sought on ethical grounds?',
  'Why do we seek knowledge?',
  'Are some things unknowable?',
  'What counts as a good justification for a claim?',
  'What is the relationship between personal experience and knowledge?',
  'What is the relationship between knowledge and culture?',
  'What role do experts play in influencing our consumption or acquisition of knowledge?',
  'How important are material tools in the production or acquisition of knowledge?',
  'How might the context in which knowledge is presented influence whether it is accepted or rejected?',
  'How can we distinguish between knowledge, belief and opinion?',
  'Does our knowledge depend on our interactions with other knowers?',
  'Does all knowledge impose ethical obligations on those who know it?',
  'To what extent is objectivity possible in the production or acquisition of knowledge?',
  'Who owns knowledge?',
  'What role does imagination play in producing knowledge about the world?',
  'How can we judge when evidence is adequate?',
  'What makes a good explanation?',
  'How is current knowledge shaped by its historical development?',
  'In what ways do our values affect our acquisition of knowledge?',
  'In what ways do values affect the production of knowledge?',
] as const

export const PROMPT_PROVENANCE =
  'Reproduced from the TOK guide’s fixed list of 35 IA prompts. Corroborated across five ' +
  'independent sources; not yet read from the guide itself, which sits behind MyIB. ' +
  'Confirm before a cohort commits to them.'

/** 1-based, because every human and every IB document numbers them from 1. */
export function promptText(number: number): string | null {
  return IA_PROMPTS[number - 1] ?? null
}

/** "3. What features of knowledge have an impact on its reliability?" */
export function promptLabel(number: number): string | null {
  const text = promptText(number)
  return text ? `${number}. ${text}` : null
}

export const PROMPT_COUNT = IA_PROMPTS.length
