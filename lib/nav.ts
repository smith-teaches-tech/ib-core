// What a coordinator's sidebar contains.
//
// A DELIBERATE DEPARTURE from IB-Home-and-Documents-Spec.md, which made "my
// spaces" uniform for everyone. Michael's call, and it is right: a coordinator
// is attached to the whole programme, so listing their courses lists all 33 of
// them — a wall of navigation that is no use to anybody. What they actually move
// between are JOBS, not courses.
//
// Students and teachers keep "my spaces", because for them the course list IS
// short and IS what they need. Same shell, two nav models, chosen by role.

export interface NavPage {
  href: string
  label: string
  hint: string
  /** Built and real, or a placeholder that says so. */
  ready: boolean
  capability?: string
}

export const COORDINATOR_PAGES: NavPage[] = [
  {
    href: '/courses',
    label: 'View all courses',
    hint: 'The catalogue and who teaches what',
    ready: true,
  },
  {
    href: '/setup',
    label: 'Add & assign',
    hint: 'Users, courses, permissions',
    ready: true,
  },
  {
    href: '/announcements',
    label: 'Send announcements',
    hint: 'Not built yet',
    ready: false,
    capability: 'announcements.post',
  },
  {
    href: '/documents',
    label: 'Information & documents',
    hint: 'Not built yet',
    ready: false,
    capability: 'documents.manage',
  },
  {
    href: '/',
    label: 'Check work',
    hint: 'The completeness board',
    ready: true,
  },
  {
    href: '/export',
    label: 'Download for IBIS',
    hint: 'Not built yet — the point of the product',
    ready: false,
    capability: 'pack.school',
  },
]
