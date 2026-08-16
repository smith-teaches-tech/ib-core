// Permissions live in DATA, not in code.
//
// Nothing anywhere in this app should ever check a role name directly.
// Always go through can(). That is what makes granting a permission later
// a tick in a box instead of a developer ticket.
//
// See claude/IB-Permissions-and-Delegation.md in the project docs.

import type { CapabilityKey, Membership, PresetKey } from './types'

export interface Capability {
  key: CapabilityKey
  group: string
  label: string
  privileged?: boolean
}

export const CAPABILITIES: Capability[] = [
  // Setup & people
  { key: 'cohorts.manage', group: 'Setup & people', label: 'Create and edit cohorts' },
  { key: 'students.add', group: 'Setup & people', label: 'Add / import students' },
  { key: 'teachers.invite', group: 'Setup & people', label: 'Invite teachers' },
  { key: 'catalogue.manage', group: 'Setup & people', label: 'Manage the course catalogue' },
  { key: 'sections.manage', group: 'Setup & people', label: 'Create and edit sections' },
  { key: 'enrolment.manage', group: 'Setup & people', label: 'Enrol students' },
  { key: 'deadlines.set', group: 'Setup & people', label: 'Set milestone deadlines' },
  { key: 'roles.assign', group: 'Setup & people', label: 'Assign roles and permissions', privileged: true },

  // Communication
  { key: 'announcements.post', group: 'Communication', label: 'Post announcements' },
  { key: 'documents.manage', group: 'Communication', label: 'Manage the documents library' },
  { key: 'summaries.print', group: 'Communication', label: 'Print status summaries' },

  // Core modules
  { key: 'cas.manage', group: 'Core modules', label: 'CAS — approve, complete, interview' },
  { key: 'ee.manage', group: 'Core modules', label: 'EE — supervise, score, release' },
  { key: 'tok.manage', group: 'Core modules', label: 'TOK — mark, post titles, release' },
  { key: 'ia.manage', group: 'Core modules', label: 'IA — enter and release marks' },
  { key: 'pg.manage', group: 'Core modules', label: 'Predicted grades — enter and lock' },

  // IB submission
  { key: 'identifiers.manage', group: 'IB submission', label: 'Manage candidate identifiers' },
  { key: 'identifiers.distribute', group: 'IB submission', label: 'Distribute identifiers to students' },
  { key: 'marks.transcribe', group: 'IB submission', label: 'Run the mark transcription companion' },
  { key: 'marks.override', group: 'IB submission', label: 'Unlock IA mark editing (reason required)' },
  { key: 'sample.import', group: 'IB submission', label: 'Import the moderation sample' },
  { key: 'ecoursework.status', group: 'IB submission', label: 'Record eCoursework submission status' },
  { key: 'pack.school', group: 'IB submission', label: 'Build school packs' },
  { key: 'pack.ib', group: 'IB submission', label: 'Build IB packs (anonymised)', privileged: true },
  { key: 'session.configure', group: 'IB submission', label: 'Configure the session & IB deadlines', privileged: true },

  // Oversight & risk — off in every preset by default
  { key: 'items.unlock', group: 'Oversight & risk', label: 'Unlock locked items' },
  { key: 'preflight.override', group: 'Oversight & risk', label: 'Override pre-flight failures' },
  { key: 'scores.revoke', group: 'Oversight & risk', label: 'Edit or revoke a released score' },
  { key: 'media.delete', group: 'Oversight & risk', label: 'Delete student media' },
  { key: 'cohort.archive', group: 'Oversight & risk', label: 'Archive a cohort' },
  { key: 'trail.view', group: 'Oversight & risk', label: 'View the authenticity trail' },
  { key: 'viewas', group: 'Oversight & risk', label: 'View as another user', privileged: true },
]

const ALL = CAPABILITIES.map((c) => c.key)

const SETUP: CapabilityKey[] = [
  'cohorts.manage', 'students.add', 'teachers.invite', 'catalogue.manage',
  'sections.manage', 'enrolment.manage', 'deadlines.set',
]
const MODULES: CapabilityKey[] = ['cas.manage', 'ee.manage', 'tok.manage', 'ia.manage', 'pg.manage']
const SUBMISSION: CapabilityKey[] = [
  'identifiers.manage', 'identifiers.distribute', 'marks.transcribe', 'marks.override',
  'sample.import', 'ecoursework.status', 'pack.school', 'pack.ib',
]
const COMMS: CapabilityKey[] = ['announcements.post', 'documents.manage', 'summaries.print']

export const PRESETS: Record<PresetKey, { label: string; capabilities: CapabilityKey[] }> = {
  // The district coordinator holds everything, always. Not reducible.
  district: { label: 'District IB Coordinator', capabilities: ALL },
  school_full: {
    label: 'School coordinator — full',
    capabilities: [...SETUP, 'roles.assign', ...COMMS, ...MODULES, ...SUBMISSION, 'session.configure', 'trail.view'],
  },
  // Recommended default: can do the whole job, cannot do the irreversible parts alone.
  school_standard: {
    label: 'School coordinator — standard',
    capabilities: [...SETUP, ...COMMS, ...MODULES, ...SUBMISSION],
  },
  setup_only: { label: 'Setup only', capabilities: [...SETUP, 'summaries.print'] },
  observer: { label: 'Observer', capabilities: ['summaries.print'] },
  teacher: {
    label: 'Teacher',
    capabilities: ['summaries.print', 'enrolment.manage', 'cas.manage', 'ee.manage', 'tok.manage', 'ia.manage', 'pg.manage'],
  },
  student: { label: 'Student', capabilities: [] },
}

/** preset ∪ added − removed. Deviations are stored; the resolved set never is. */
export function resolveCapabilities(m: Membership): Set<CapabilityKey> {
  const set = new Set(PRESETS[m.presetKey].capabilities)
  for (const c of m.addedCapabilities) set.add(c)
  for (const c of m.removedCapabilities) set.delete(c)
  return set
}

/**
 * The one gate every privileged action passes through.
 *
 * Scope is a boundary, not a capability: a capability is always evaluated as
 * (capability, school). There is no cross-school capability below the district
 * tier, and no toggle that creates one.
 *
 * NOTE: this is the client/server-side check. When a real database arrives the
 * SAME rule must also be enforced in RLS / Security Rules. A permission system
 * that only hides buttons is a suggestion, not a permission system.
 */
export function can(
  memberships: Membership[],
  capability: CapabilityKey,
  schoolId: string,
): boolean {
  const m = memberships.find((x) => x.schoolId === schoolId)
  if (!m) return false
  return resolveCapabilities(m).has(capability)
}

/** No privilege escalation: you cannot grant what you do not hold. */
export function canGrant(
  granter: Membership[],
  capability: CapabilityKey,
  schoolId: string,
): boolean {
  return can(granter, 'roles.assign', schoolId) && can(granter, capability, schoolId)
}
