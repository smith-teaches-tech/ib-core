// CAS module-owned entities.
//
// THE RULE THIS FILE EXISTS TO DEMONSTRATE (IB-CAS-Build-Plan.md §2):
//
//   A module may define its own entities. The spine does not know about them.
//   What the spine sees is a RequirementState, which the module either records
//   directly or DERIVES from these internals. Nothing outside CAS needs to know
//   which — and nothing outside CAS imports this file except the fixtures.
//
// CAS is the module that breaks "one requirement, one state": a student creates
// an unbounded number of experiences, each with its own lifecycle and its own
// dated thread. The resolution is that experiences stay in here and only their
// SUMMARY crosses into the spine. The nine spine objects stay nine.

import type { Id } from '../types'
import type { StoredRef } from '../storage'

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type Strand = 'C' | 'A' | 'S'

export const STRAND_LABEL: Record<Strand, string> = {
  C: 'Creativity',
  A: 'Activity',
  S: 'Service',
}

export type LoKey = 'lo1' | 'lo2' | 'lo3' | 'lo4' | 'lo5' | 'lo6' | 'lo7'

/**
 * Seven separate requirements, not one counter. Each outcome is genuinely
 * discrete, all seven are required, and modelling them separately is what makes
 * the derivation meaningful — seven dots on the track, seven columns on the board.
 */
export const LEARNING_OUTCOMES: { key: LoKey; short: string; label: string }[] = [
  { key: 'lo1', short: 'Strengths', label: 'Strengths & growth areas' },
  { key: 'lo2', short: 'Challenge', label: 'Challenge & new skills' },
  { key: 'lo3', short: 'Initiative', label: 'Initiate & plan' },
  { key: 'lo4', short: 'Commitment', label: 'Commitment & perseverance' },
  { key: 'lo5', short: 'Collaboration', label: 'Collaboration' },
  { key: 'lo6', short: 'Global', label: 'Global engagement' },
  { key: 'lo7', short: 'Ethics', label: 'Ethics of action' },
]

export const LO_LABEL = new Map(LEARNING_OUTCOMES.map((l) => [l.key, l]))

/**
 * draft → submitted → approved → awaiting_signoff → complete
 * with `returned` (back to the student with a note) and `rejected` (not a CAS
 * experience) as branches.
 *
 * Reflections and evidence can be added at ANY point, including before approval.
 * That is deliberate: a student who has just started should be writing, not
 * waiting for a queue.
 */
export type ExperienceStatus =
  | 'draft'
  | 'submitted'
  | 'returned'
  | 'approved'
  | 'awaiting_signoff'
  | 'complete'
  | 'rejected'

/** How this experience is being taken to completion. Changes the label only. */
export type CompletionRoute = 'digital' | 'paper'

export interface Experience {
  id: Id
  schoolId: Id
  studentId: Id
  cohortId: Id
  title: string
  description: string
  /** At least one. */
  strands: Strand[]
  isProject: boolean
  /** What the student SAYS it will evidence. Not what counts — see confirmed. */
  claimedOutcomes: LoKey[]
  status: ExperienceStatus
  completionRoute?: CompletionRoute
  createdAt: string
  approvedAt?: string
  completedAt?: string
  supervisorName?: string
  supervisorEmail?: string
}

export type ThreadEntryKind = 'reflection' | 'evidence' | 'signoff' | 'note' | 'system'
export type AuthorType = 'student' | 'staff' | 'supervisor' | 'system'

/** The dated thread, newest first. Append-only; edits keep the prior version. */
export interface ThreadEntry {
  id: Id
  experienceId: Id
  kind: ThreadEntryKind
  body?: string
  media?: StoredRef[]
  /** Only on sign-off entries. THESE are what the spine derivation counts. */
  confirmedOutcomes?: LoKey[]
  authorType: AuthorType
  authorName: string
  createdAt: string
  /** Set on the replacement entry; the original is kept — the authenticity trail. */
  /**
   * A SPOKEN REFLECTION'S TYPED ONE-LINER — required by the action whenever a
   * reflection carries audio, never asked for on a typed one.
   *
   * The asymmetry is the point: a coordinator can READ two hundred reflections
   * in an evening and cannot LISTEN to them, and IB-Media-and-Uploads.md §1
   * exists because reviewing a portfolio slowly is the problem this system was
   * built to fix. Audio-only would make the student's job easier and the
   * coordinator's materially worse.
   *
   * Named `transcript` rather than `summary` so real speech-to-text can fill it
   * later without a migration. Today it is one typed line.
   */
  transcript?: string
  /**
   * REFLECT LATER ON SOMETHING UPLOADED EARLIER — points at the entry this one
   * responds to. Upload the video from a phone on Saturday, write about it from
   * a laptop on Tuesday, see them together.
   *
   * A REPLY, NOT AN EDIT, and the reason is dates: editing would make it one
   * post dated Saturday, so the timeline and the consistency strip would report
   * one act of engagement where there were two, a week apart. The strip exists
   * to show turning up repeatedly — collapsing them undercounts precisely the
   * behaviour it was built to measure (§11.2 refused per-reflection counting
   * for the same family of reason).
   */
  inReplyTo?: Id
  editedFrom?: Id
  /** Superseded entries stay in the record but drop out of the visible thread. */
  supersededBy?: Id
}

/** A secure link, no account needed. Expires in 28 days. */
export interface SupervisorRequest {
  id: Id
  experienceId: Id
  email: string
  token: string
  sentAt: string
  expiresAt: string
  usedAt?: string
}

export type InterviewKind = 'initial' | 'interim' | 'final'

export const INTERVIEW_LABEL: Record<InterviewKind, string> = {
  initial: 'Initial interview',
  interim: 'Interim interview',
  final: 'Final interview',
}

export const INTERVIEW_ORDER: InterviewKind[] = ['initial', 'interim', 'final']

export interface Interview {
  id: Id
  schoolId: Id
  studentId: Id
  kind: InterviewKind
  notes: string
  conductedOn: string
  /** Auto-set on save. Unlocking is capability-gated and leaves a trail. */
  lockedAt?: string
  conductedBy: string
}

/**
 * The coordinator's own judgement — A RECORD, NOT AN ALERT.
 *
 * Deliberately hand-set. The mockup's auto-flagging rule ("no project, 2/7
 * outcomes, no interviews") is Phase 2 per the build plan §7: a computed flag is
 * the nag verb, and the roster counts already show the same facts without
 * pretending to a judgement the system cannot make.
 */
export type IndicatorValue = 'excellent' | 'on_track' | 'at_risk'

export interface CasIndicator {
  studentId: Id
  schoolId: Id
  value: IndicatorValue | null
  setBy: string
  setAt: string
}

export const INDICATOR_META: Record<IndicatorValue, { emoji: string; label: string }> = {
  excellent: { emoji: '🏆', label: 'Excellent' },
  on_track: { emoji: '👍', label: 'On track' },
  at_risk: { emoji: '⚠️', label: 'At risk' },
}

/** Notes are messages TO the student. They can see them. */
export interface CasNote {
  id: Id
  schoolId: Id
  studentId: Id
  body: string
  authorName: string
  createdAt: string
}

/** The one CAS requirement recorded directly rather than derived. */
export interface CasCompletion {
  studentId: Id
  schoolId: Id
  confirmedBy: string
  confirmedAt: string
}

// ---------------------------------------------------------------------------
// The module's own store — everything above, in one bag
// ---------------------------------------------------------------------------

export interface CasData {
  experiences: Experience[]
  entries: ThreadEntry[]
  requests: SupervisorRequest[]
  interviews: Interview[]
  indicators: CasIndicator[]
  notes: CasNote[]
  completions: CasCompletion[]
}

// ---------------------------------------------------------------------------
// Derived shapes — computed on read, never stored
// ---------------------------------------------------------------------------

export type ProjectStatus = 'none' | 'in_progress' | 'complete'

/**
 * ONE OUTCOME, COUNTED — the consistency question, which `outcomes` cannot answer.
 *
 * CAS runs for eighteen months and the IB asks for engagement across it, not a
 * checklist ticked once. `outcomes` says LO6 happened; this says it happened
 * once while LO1 happened seven times, which is the thing worth looking at.
 *
 * `confirmed` counts EXPERIENCES, not reflections. Eight reflections on one
 * football season is not consistency, and counting them as if it were would
 * flatter exactly the student who needs the conversation (Michael's decision,
 * 17 Aug).
 *
 * Nothing here is a target. The IB requires each outcome evidenced at least
 * once; it has no view on how many times, and neither does this system. The bar
 * scales to the student's own highest count — it shows BALANCE, and asserts
 * no requirement that does not exist.
 */
export interface LoTally {
  key: LoKey
  /** Complete, signed-off experiences that confirmed this outcome. Green. */
  confirmed: number
  /**
   * Live experiences claiming it — draft through awaiting sign-off. Amber.
   *
   * Drafts count here and deliberately do NOT count towards the spine's amber
   * dot (`claimed`, non-draft only). The board is the record; this strip is the
   * working view, and on a working view a student's own draft is real.
   */
  open: number
}

/**
 * One dated post — the timeline's raw material. Reflections and evidence only:
 * sign-offs, notes and system entries are other people's marks on the record,
 * and a timeline of the student's engagement should not be padded by them.
 */
export interface CasPost {
  at: string
  kind: 'reflection' | 'evidence'
  experienceId: Id
  experienceTitle: string
}

export interface CasSummary {
  /** Strands touched by any non-draft, non-rejected experience. */
  strands: Strand[]
  /** Outcomes CONFIRMED by a sign-off on a complete experience. */
  outcomes: LoKey[]
  /** Outcomes merely claimed and not yet confirmed — shown dimmed, never counted. */
  claimed: LoKey[]
  /** The same seven outcomes with counts, in LEARNING_OUTCOMES order. Always seven. */
  tallies: LoTally[]
  /** Every reflection and evidence post, oldest first. The consistency timeline. */
  posts: CasPost[]
  project: ProjectStatus
  /** status === 'submitted' — the coordinator has not looked at it yet. */
  unapproved: number
  /** status === 'awaiting_signoff' — waiting on a supervisor or a paper form. */
  awaiting: number
  interviews: number
  indicator: IndicatorValue | null
  complete: boolean
}

/** An experience with its visible thread, ready to render. */
export interface ExperienceView {
  experience: Experience
  entries: ThreadEntry[]
  /** Confirmed at sign-off. Empty until someone signs. */
  confirmedOutcomes: LoKey[]
  /** The live secure link, if one has been generated and not yet used. */
  request: SupervisorRequest | null
}

export interface CasStudentView {
  studentId: Id
  studentName: string
  /**
   * When this student joined the cohort. Carried on the view because the
   * timeline needs it and only the repository knows it — see `casWindow`.
   */
  joinedAt: string
  summary: CasSummary
  experiences: ExperienceView[]
  interviews: Interview[]
  notes: CasNote[]
}

export interface CasRosterRow extends CasStudentView {
  sessionNumber: string | null
}

export interface CasCohortTotals {
  students: number
  atRisk: number
  avgOutcomes: number
  projectsComplete: number
}

/** What the supervisor sees behind the token link. No account, no spine access. */
export interface SupervisorView {
  request: SupervisorRequest
  experience: Experience
  entries: ThreadEntry[]
  studentName: string
  expired: boolean
  used: boolean
}
