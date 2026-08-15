// CAS fixture data — the module's own entities, entirely in memory.
//
// Layla Ahmed (st01) and Marcus Chen (st04) are written by hand to match
// mockups/cas-mockup.html exactly, so the built screens can be compared to the
// thing that was signed off. The other 22 candidates are generated
// deterministically into a realistic mid-programme spread: some students with
// nothing yet, some with a drawer full of confirmed outcomes.
//
// No import from ./fixtures — student ids are the contract, which keeps CAS
// genuinely module-owned and avoids a circular import.

import type { StoredRef } from '../storage'
import { pinned } from './pin'
import {
  completionGate,
  summarise,
} from '../cas/derive'
import type {
  CasData,
  CasIndicator,
  CasNote,
  CasCompletion,
  Experience,
  ExperienceStatus,
  IndicatorValue,
  Interview,
  InterviewKind,
  LoKey,
  Strand,
  SupervisorRequest,
  ThreadEntry,
} from '../cas/types'

const SCHOOL = 'dhahran'

/** Set before each generation block; every experience records the cohort it belongs to. */
let COHORT = 'c15'

const sid = (i: number) => 'st' + String(i).padStart(2, '0')
/** Class of 2028 — a fortnight in. */
const y1 = (i: number) => 'y1' + String(i).padStart(2, '0')

/** Deterministic pseudo-randomness — no Math.random, so the data never shifts. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

const media = (name: string, mime: string, bytes: number, addedAt: string): StoredRef => ({
  id: 'sr_' + name.replace(/\W+/g, '_'),
  name,
  mime,
  bytes,
  key: `${SCHOOL}/fixture/${name}`,
  addedAt,
})

const EXPERIENCES: Experience[] = []
const ENTRIES: ThreadEntry[] = []
const REQUESTS: SupervisorRequest[] = []
const INTERVIEWS: Interview[] = []
const INDICATORS: CasIndicator[] = []
const NOTES: CasNote[] = []
const COMPLETIONS: CasCompletion[] = []

let eN = 0
let tN = 0

function exp(e: Omit<Experience, 'id' | 'schoolId' | 'cohortId'>): Experience {
  eN += 1
  const out: Experience = { ...e, id: 'ex' + eN, schoolId: SCHOOL, cohortId: COHORT }
  EXPERIENCES.push(out)
  return out
}

function entry(e: Omit<ThreadEntry, 'id'>): ThreadEntry {
  tN += 1
  const out: ThreadEntry = { ...e, id: 'te' + tN }
  ENTRIES.push(out)
  return out
}

// ===========================================================================
// st01 — Layla Ahmed. The mockup, verbatim, plus the two further completed
// experiences her 7/7 actually requires. (The mockup shows 7/7 next to three
// experiences confirming three outcomes; the code has to be consistent.)
// ===========================================================================

const mural = exp({
  studentId: sid(1),
  title: 'Community mural project',
  description:
    'Designed and painted a mural at the community centre with six volunteers, from pitching the idea to the final unveiling.',
  strands: ['C', 'S'],
  isProject: true,
  claimedOutcomes: ['lo1', 'lo3', 'lo5'],
  status: 'complete',
  completionRoute: 'digital',
  createdAt: '2026-03-12',
  approvedAt: '2026-03-15',
  completedAt: '2026-05-02',
  supervisorName: 'Ms. Okafor',
  supervisorEmail: 'okafor@brightwood.org',
})

entry({
  experienceId: mural.id,
  kind: 'system',
  body: 'Experience created; strands C, S; outcomes LO1, LO3, LO5.',
  authorType: 'system',
  authorName: 'Layla Ahmed',
  createdAt: '2026-03-12',
})
entry({
  experienceId: mural.id,
  kind: 'reflection',
  body: 'Starting point — I pitched the idea to the community centre this morning and they approved it. I was more nervous than I expected about asking for the wall.',
  authorType: 'student',
  authorName: 'Layla Ahmed',
  createdAt: '2026-03-12',
})
entry({
  experienceId: mural.id,
  kind: 'system',
  body: 'Approved by the CAS coordinator.',
  authorType: 'staff',
  authorName: 'H. Adeyemi',
  createdAt: '2026-03-15',
})
entry({
  experienceId: mural.id,
  kind: 'reflection',
  body: 'Coordinating the volunteer schedule was harder than painting. I learned to delegate — I had been trying to be present for every session and it was making me a bottleneck rather than a leader.',
  authorType: 'student',
  authorName: 'Layla Ahmed',
  createdAt: '2026-04-15',
})
entry({
  experienceId: mural.id,
  kind: 'evidence',
  body: 'Finished mural and volunteer group photos.',
  media: [
    media('mural-finished.jpg', 'image/jpeg', 2_400_000, '2026-04-28'),
    media('volunteers.jpg', 'image/jpeg', 1_900_000, '2026-04-28'),
    media('timelapse.mp4', 'video/mp4', 18_000_000, '2026-04-28'),
  ],
  authorType: 'student',
  authorName: 'Layla Ahmed',
  createdAt: '2026-04-28',
})
entry({
  experienceId: mural.id,
  kind: 'signoff',
  body: 'Layla led the design and coordinated six volunteers — excellent initiative throughout.',
  confirmedOutcomes: ['lo1', 'lo3', 'lo5'],
  authorType: 'supervisor',
  authorName: 'Ms. Okafor',
  createdAt: '2026-05-02',
})
REQUESTS.push({
  id: 'sq1',
  experienceId: mural.id,
  email: 'okafor@brightwood.org',
  token: 'mural-9c1f27d4',
  sentAt: '2026-04-29',
  expiresAt: '2026-05-27',
  usedAt: '2026-05-02',
})

const tutoring = exp({
  studentId: sid(1),
  title: 'Tutoring younger students',
  description: 'Weekly maths tutoring for two MYP4 students through the school peer programme.',
  strands: ['S'],
  isProject: false,
  claimedOutcomes: ['lo2', 'lo4', 'lo5'],
  status: 'approved',
  createdAt: '2026-02-10',
  approvedAt: '2026-02-18',
  supervisorName: 'Mr. Haddad',
  supervisorEmail: 'haddad.tutoring@isg.edu.sa',
})

entry({
  experienceId: tutoring.id,
  kind: 'reflection',
  body: 'My student went from failing to a 5. Consistency mattered most — turning up every Tuesday, even the weeks I had three deadlines, was the thing that actually moved him.',
  authorType: 'student',
  authorName: 'Layla Ahmed',
  createdAt: '2026-05-20',
})
entry({
  experienceId: tutoring.id,
  kind: 'evidence',
  body: 'Session log and thank-you note.',
  media: [media('session-log.pdf', 'application/pdf', 420_000, '2026-06-02')],
  authorType: 'student',
  authorName: 'Layla Ahmed',
  createdAt: '2026-06-02',
})
REQUESTS.push({
  id: 'sq2',
  experienceId: tutoring.id,
  email: 'haddad.tutoring@isg.edu.sa',
  token: 'tutoring-2f9c41ab',
  sentAt: '2026-08-10',
  expiresAt: '2026-09-07',
})

const football = exp({
  studentId: sid(1),
  title: 'Varsity football — season',
  description: 'Full varsity season, five practices a week plus fixtures.',
  strands: ['A'],
  isProject: false,
  claimedOutcomes: ['lo2', 'lo4'],
  status: 'submitted',
  createdAt: '2025-09-20',
})

entry({
  experienceId: football.id,
  kind: 'reflection',
  body: 'Committing to five practices a week around IB deadlines will be my challenge this year.',
  authorType: 'student',
  authorName: 'Layla Ahmed',
  createdAt: '2025-09-22',
})

const foodDrive = exp({
  studentId: sid(1),
  title: 'Ramadan food drive',
  description: 'Organised collection and distribution of food parcels with the student council.',
  strands: ['S'],
  isProject: false,
  claimedOutcomes: ['lo6', 'lo7'],
  status: 'complete',
  completionRoute: 'digital',
  createdAt: '2026-02-20',
  approvedAt: '2026-02-24',
  completedAt: '2026-04-10',
  supervisorName: 'Mrs. Al-Turki',
})
entry({
  experienceId: foodDrive.id,
  kind: 'reflection',
  body: 'We had to decide who received parcels when there were more families than boxes. Nobody warns you that the ethical part of service is the arithmetic.',
  authorType: 'student',
  authorName: 'Layla Ahmed',
  createdAt: '2026-03-30',
})
entry({
  experienceId: foodDrive.id,
  kind: 'signoff',
  body: 'Layla handled a genuinely difficult allocation decision thoughtfully and involved the whole council in it.',
  confirmedOutcomes: ['lo6', 'lo7'],
  authorType: 'supervisor',
  authorName: 'Mrs. Al-Turki',
  createdAt: '2026-04-10',
})

const swim = exp({
  studentId: sid(1),
  title: 'Swim squad — distance training',
  description: 'Joined the distance squad having never swum competitively.',
  strands: ['A'],
  isProject: false,
  claimedOutcomes: ['lo2', 'lo4'],
  status: 'complete',
  completionRoute: 'paper',
  createdAt: '2025-10-02',
  approvedAt: '2025-10-06',
  completedAt: '2026-01-22',
  supervisorName: 'Coach Berger',
})
entry({
  experienceId: swim.id,
  kind: 'reflection',
  body: 'Three months in I still finish last in the set. I have stopped minding, which is not the same as improving, but it is something.',
  authorType: 'student',
  authorName: 'Layla Ahmed',
  createdAt: '2025-12-01',
})
entry({
  experienceId: swim.id,
  kind: 'evidence',
  body: 'Signed paper completion form.',
  media: [media('swim-form-signed.jpg', 'image/jpeg', 1_100_000, '2026-01-18')],
  authorType: 'student',
  authorName: 'Layla Ahmed',
  createdAt: '2026-01-18',
})
entry({
  experienceId: swim.id,
  kind: 'signoff',
  body: 'Paper form verified against the squad register. Coach Berger confirmed both outcomes.',
  confirmedOutcomes: ['lo2', 'lo4'],
  authorType: 'staff',
  authorName: 'H. Adeyemi',
  createdAt: '2026-01-22',
})

INTERVIEWS.push(
  {
    id: 'iv1', schoolId: SCHOOL, studentId: sid(1), kind: 'initial',
    notes:
      'Discussed goals for the year. Layla wants a service-heavy portfolio and one substantial project. Warned her about spreading across too many one-off events.',
    conductedOn: '2025-10-03', lockedAt: '2025-10-03', conductedBy: 'H. Adeyemi',
  },
  {
    id: 'iv2', schoolId: SCHOOL, studentId: sid(1), kind: 'interim',
    notes:
      'On track across all three strands. Mural project underway and clearly hers rather than the community centre’s. Nudged her to write reflections closer to the events.',
    conductedOn: '2026-02-04', lockedAt: '2026-02-04', conductedBy: 'H. Adeyemi',
  },
  {
    id: 'iv3', schoolId: SCHOOL, studentId: sid(1), kind: 'final',
    notes:
      'All seven outcomes evidenced and the project complete. Talked through what she would tell a DP1 student: start the reflection the same week, not the same term.',
    conductedOn: '2026-06-11', lockedAt: '2026-06-11', conductedBy: 'H. Adeyemi',
  },
)

INDICATORS.push({
  studentId: sid(1), schoolId: SCHOOL, value: 'excellent',
  setBy: 'H. Adeyemi', setAt: '2026-06-11',
})

// ===========================================================================
// st04 — Marcus Chen. The paper-form route, waiting on verification.
// ===========================================================================

const beach = exp({
  studentId: sid(4),
  title: 'Beach cleanup',
  description: 'Monthly cleanup on the Half Moon Bay shoreline with the environment club.',
  strands: ['A', 'S'],
  isProject: false,
  claimedOutcomes: ['lo6', 'lo7'],
  status: 'awaiting_signoff',
  completionRoute: 'paper',
  createdAt: '2026-04-02',
  approvedAt: '2026-04-08',
  supervisorName: 'Mr. Diaz',
})
entry({
  experienceId: beach.id,
  kind: 'reflection',
  body: 'Collected 40kg of waste with the class. Most of it was single-use plastic from the corniche stalls rather than from the sea, which changed how I think about where the problem starts.',
  authorType: 'student',
  authorName: 'Marcus Chen',
  createdAt: '2026-06-01',
})
entry({
  experienceId: beach.id,
  kind: 'evidence',
  body: 'Signed paper completion form.',
  media: [media('beach-form.jpg', 'image/jpeg', 980_000, '2026-06-08')],
  authorType: 'student',
  authorName: 'Marcus Chen',
  createdAt: '2026-06-08',
})

const orchestra = exp({
  studentId: sid(4),
  title: 'School orchestra — second violin',
  description: 'Weekly rehearsals and two concerts.',
  strands: ['C'],
  isProject: false,
  claimedOutcomes: ['lo2', 'lo4', 'lo5'],
  status: 'complete',
  completionRoute: 'digital',
  createdAt: '2025-09-14',
  approvedAt: '2025-09-18',
  completedAt: '2026-03-05',
  supervisorName: 'Ms. Petrova',
})
entry({
  experienceId: orchestra.id,
  kind: 'reflection',
  body: 'Sitting second violin means being audible only when you are wrong. It taught me more about listening than about playing.',
  authorType: 'student',
  authorName: 'Marcus Chen',
  createdAt: '2026-01-20',
})
entry({
  experienceId: orchestra.id,
  kind: 'signoff',
  body: 'Marcus rarely missed a rehearsal and mentored a new player in the section.',
  confirmedOutcomes: ['lo2', 'lo4', 'lo5'],
  authorType: 'supervisor',
  authorName: 'Ms. Petrova',
  createdAt: '2026-03-05',
})

const robotics = exp({
  studentId: sid(4),
  title: 'Robotics club — regional competition',
  description: 'Built and programmed the drive train for the regional entry.',
  strands: ['C', 'A'],
  isProject: true,
  claimedOutcomes: ['lo1', 'lo3'],
  status: 'submitted',
  createdAt: '2026-08-02',
})
entry({
  experienceId: robotics.id,
  kind: 'reflection',
  body: 'Signing up for the drive train rather than the code was deliberate — I want to find out what I am bad at while it still costs nothing.',
  authorType: 'student',
  authorName: 'Marcus Chen',
  createdAt: '2026-08-04',
})

const climate = exp({
  studentId: sid(4),
  title: 'Climate podcast',
  description: 'A four-episode podcast on regional water use.',
  strands: ['C'],
  isProject: false,
  claimedOutcomes: ['lo6'],
  status: 'submitted',
  createdAt: '2026-08-09',
})

INTERVIEWS.push({
  id: 'iv4', schoolId: SCHOOL, studentId: sid(4), kind: 'initial',
  notes:
    'Strong creativity portfolio already; almost no service. Agreed he would find one sustained service commitment rather than three short ones.',
  conductedOn: '2025-10-09', lockedAt: '2025-10-09', conductedBy: 'H. Adeyemi',
})

INDICATORS.push({
  studentId: sid(4), schoolId: SCHOOL, value: 'on_track',
  setBy: 'H. Adeyemi', setAt: '2026-06-02',
})

NOTES.push({
  id: 'n1', schoolId: SCHOOL, studentId: sid(4),
  body: 'Marcus — bring the signed beach cleanup form to me in person if the photo is hard to read. Also let us book your interim interview before term gets going.',
  authorName: 'H. Adeyemi', createdAt: '2026-06-10',
})

// ===========================================================================
// st22 — Zara Uddin. Barely started. The row that used to trip the auto-flag.
// ===========================================================================

const debate = exp({
  studentId: sid(22),
  title: 'Debate society',
  description: 'Weekly debate club, two inter-school fixtures.',
  strands: ['A'],
  isProject: false,
  claimedOutcomes: ['lo1', 'lo5'],
  status: 'complete',
  completionRoute: 'digital',
  createdAt: '2025-11-05',
  approvedAt: '2025-11-12',
  completedAt: '2026-03-18',
  supervisorName: 'Mr. Novak',
})
entry({
  experienceId: debate.id,
  kind: 'reflection',
  body: 'I lost the first two rounds badly. The second time I lost, I knew why, which felt like progress.',
  authorType: 'student',
  authorName: 'Zara Uddin',
  createdAt: '2026-02-02',
})
entry({
  experienceId: debate.id,
  kind: 'signoff',
  body: 'Zara improved markedly and supported a younger debater through her first fixture.',
  confirmedOutcomes: ['lo1', 'lo5'],
  authorType: 'supervisor',
  authorName: 'Mr. Novak',
  createdAt: '2026-03-18',
})

INDICATORS.push({
  studentId: sid(22), schoolId: SCHOOL, value: 'at_risk',
  setBy: 'H. Adeyemi', setAt: '2026-06-14',
})

// ===========================================================================
// st18 — Ana Quintero. The returned-with-a-note branch.
// ===========================================================================

const returned = exp({
  studentId: sid(18),
  title: 'Food drive — one afternoon',
  description: 'Helped at the school food drive for an afternoon.',
  strands: ['S'],
  isProject: false,
  claimedOutcomes: ['lo3', 'lo6'],
  status: 'returned',
  createdAt: '2026-07-28',
})
entry({
  experienceId: returned.id,
  kind: 'note',
  body: 'Returned: the evidence does not yet show LO3 — you joined an existing drive rather than initiating one. Either add what you planned yourself, or drop LO3 and keep LO6.',
  authorType: 'staff',
  authorName: 'H. Adeyemi',
  createdAt: '2026-08-01',
})

// ===========================================================================
// Everyone else — a deterministic, deliberately uneven spread
// ===========================================================================

const HANDWRITTEN = new Set([1, 4, 18, 22])

const POOL: { title: string; strands: Strand[]; los: LoKey[]; project?: boolean }[] = [
  { title: 'Model United Nations', strands: ['C', 'S'], los: ['lo3', 'lo5', 'lo6'] },
  { title: 'School orchestra', strands: ['C'], los: ['lo2', 'lo4'] },
  { title: 'Swim squad training', strands: ['A'], los: ['lo2', 'lo4'] },
  { title: 'Ramadan food drive', strands: ['S'], los: ['lo5', 'lo6', 'lo7'] },
  { title: 'Robotics club', strands: ['C', 'A'], los: ['lo2', 'lo3', 'lo5'], project: true },
  { title: 'Coastal cleanup', strands: ['A', 'S'], los: ['lo6', 'lo7'] },
  { title: 'Peer tutoring — mathematics', strands: ['S'], los: ['lo2', 'lo4', 'lo5'] },
  { title: 'Photography portfolio', strands: ['C'], los: ['lo1', 'lo2'] },
  { title: 'Basketball — varsity season', strands: ['A'], los: ['lo2', 'lo4'] },
  { title: 'Coding club for the community centre', strands: ['C', 'S'], los: ['lo3', 'lo5', 'lo6'], project: true },
  { title: 'Arabic calligraphy workshop', strands: ['C'], los: ['lo1', 'lo2'] },
  { title: 'Hospital volunteering', strands: ['S'], los: ['lo4', 'lo6', 'lo7'] },
  { title: 'Duke of Edinburgh expedition', strands: ['A', 'S'], los: ['lo2', 'lo4', 'lo5'] },
  { title: 'School recycling initiative', strands: ['C', 'A', 'S'], los: ['lo3', 'lo6', 'lo7'], project: true },
  { title: 'Yoga and wellbeing sessions', strands: ['A'], los: ['lo1', 'lo2'] },
  { title: 'Community library refurbishment', strands: ['C', 'S'], los: ['lo3', 'lo4', 'lo5'], project: true },
]

const REFLECTIONS = [
  'The part I expected to be hardest turned out to be the easy half. Planning around everyone else’s timetable was the real work.',
  'I said yes to this because it sounded impressive and stayed because it stopped being about that.',
  'We got it wrong the first two sessions and had to start over. I am glad nobody rescued us.',
  'What surprised me was how much of it was administration. Nobody tells you that service is mostly email.',
  'I would do the same thing again but start six weeks earlier and ask for help sooner.',
  'Working with people I would never otherwise have spoken to was the whole point, and I nearly missed it.',
]

const STATUS_LADDER: ExperienceStatus[] = ['draft', 'submitted', 'approved', 'awaiting_signoff', 'complete']

const r = rng(1509)

/**
 * Weighted rather than uniform. A cohort entering DP2 has done most of DP1: the
 * common case is a completed experience, not a blank one, and fixtures that
 * under-report make every screen look emptier than the real thing will.
 */
function pickStatus(roll: number): ExperienceStatus {
  if (roll < 0.52) return 'complete'
  if (roll < 0.68) return 'approved'
  if (roll < 0.78) return 'awaiting_signoff'
  if (roll < 0.9) return 'submitted'
  if (roll < 0.96) return 'returned'
  return 'draft'
}

for (let i = 1; i <= 24; i += 1) {
  if (HANDWRITTEN.has(i)) continue
  const student = sid(i)
  // 2–5 experiences, except for two students who genuinely have very little —
  // they are the reason the coordinator opens this screen at all.
  const count = i % 11 === 0 ? Math.floor(r() * 2) : 2 + Math.floor(r() * 4)
  const used = new Set<string>()

  for (let j = 0; j < count; j += 1) {
    let pick = POOL[Math.floor(r() * POOL.length)]
    let guard = 0
    while (used.has(pick.title) && guard++ < 8) pick = POOL[Math.floor(r() * POOL.length)]
    used.add(pick.title)

    const status = pickStatus(r())
    const created = `2025-${String(9 + (j % 4)).padStart(2, '0')}-${String(3 + Math.floor(r() * 24)).padStart(2, '0')}`
    const approved =
      status === 'draft' || status === 'submitted' || status === 'returned'
        ? undefined
        : '2026-01-' + String(6 + j * 3).padStart(2, '0')
    const completed = status === 'complete' ? '2026-0' + (3 + (j % 4)) + '-1' + (j % 9) : undefined
    const route = status === 'complete' || status === 'awaiting_signoff'
      ? (r() > 0.65 ? 'paper' : 'digital')
      : undefined

    const e = exp({
      studentId: student,
      title: pick.title,
      description: `${pick.title} — recorded in DP1.`,
      strands: pick.strands,
      isProject: Boolean(pick.project) && !EXPERIENCES.some((x) => x.studentId === student && x.isProject),
      claimedOutcomes: pick.los,
      status,
      completionRoute: route,
      createdAt: created,
      approvedAt: approved,
      completedAt: completed,
      supervisorName: status === 'draft' ? undefined : 'Supervisor ' + (1 + Math.floor(r() * 9)),
      supervisorEmail: status === 'draft' ? undefined : `supervisor${i}${j}@example.org`,
    })

    if (status !== 'draft') {
      entry({
        experienceId: e.id,
        kind: 'reflection',
        body: REFLECTIONS[Math.floor(r() * REFLECTIONS.length)],
        authorType: 'student',
        authorName: student,
        createdAt: approved ?? created,
      })
    }
    if (status === 'returned') {
      entry({
        experienceId: e.id,
        kind: 'note',
        body: 'Returned: connect this more explicitly to each outcome you have chosen before resubmitting.',
        authorType: 'staff',
        authorName: 'H. Adeyemi',
        createdAt: '2026-08-03',
      })
    }
    if (status === 'awaiting_signoff' || status === 'complete') {
      entry({
        experienceId: e.id,
        kind: 'evidence',
        body: route === 'paper' ? 'Signed paper completion form.' : 'Photographs from the sessions.',
        media: [
          route === 'paper'
            ? media(`form-${e.id}.jpg`, 'image/jpeg', 900_000, completed ?? '2026-05-01')
            : media(`evidence-${e.id}.jpg`, 'image/jpeg', 1_500_000, completed ?? '2026-05-01'),
        ],
        authorType: 'student',
        authorName: student,
        createdAt: completed ?? '2026-05-01',
      })
    }
    if (status === 'awaiting_signoff' && route === 'digital') {
      REQUESTS.push({
        id: 'sq_' + e.id,
        experienceId: e.id,
        email: e.supervisorEmail ?? 'supervisor@example.org',
        token: 'link-' + e.id,
        sentAt: '2026-08-05',
        expiresAt: '2026-09-02',
      })
    }
    if (status === 'complete') {
      // Supervisors confirm what they actually saw, which is sometimes less than
      // what was claimed. That gap is the honest part of the record.
      const confirmed = pick.los.filter(() => r() > 0.15)
      entry({
        experienceId: e.id,
        kind: 'signoff',
        body: 'Confirmed the outcomes I saw evidence of.',
        confirmedOutcomes: confirmed.length > 0 ? confirmed : [pick.los[0]],
        authorType: route === 'paper' ? 'staff' : 'supervisor',
        authorName: route === 'paper' ? 'H. Adeyemi' : (e.supervisorName ?? 'Supervisor'),
        createdAt: completed ?? '2026-05-01',
      })
    }
  }

  // Interviews: nearly everyone has had the initial one by now, fewer the
  // interim, and the final belongs to the end of DP2.
  const rolls = [r(), r(), r()]
  const ivCount = rolls[0] < 0.88 ? (rolls[1] < 0.6 ? (rolls[2] < 0.25 ? 3 : 2) : 1) : 0
  const kinds: InterviewKind[] = ['initial', 'interim', 'final']
  for (let k = 0; k < ivCount; k += 1) {
    INTERVIEWS.push({
      id: `iv_${i}_${k}`,
      schoolId: SCHOOL,
      studentId: student,
      kind: kinds[k],
      notes:
        k === 0
          ? 'Talked through the year ahead and what a balanced portfolio would look like for them.'
          : k === 1
            ? 'Reviewed progress across the three strands and agreed what to prioritise next.'
            : 'Closing conversation; reviewed the portfolio and the outcomes still to confirm.',
      conductedOn: ['2025-10-14', '2026-02-11', '2026-06-09'][k],
      lockedAt: ['2025-10-14', '2026-02-11', '2026-06-09'][k],
      conductedBy: 'H. Adeyemi',
    })
  }
}

// ===========================================================================
// Class of 2028 — two weeks into DP1.
//
// Deliberately almost empty. A cohort in its first August has had the initial
// interview at most and a few keen students have logged something. Fixtures that
// showed them half-finished would make every screen lie about what the start of
// the programme looks like.
// ===========================================================================

COHORT = 'c16'
const ry1 = rng(3105)

for (let i = 1; i <= 20; i += 1) {
  const student = y1(i)
  const roll = ry1()
  const count = roll > 0.75 ? 2 : roll > 0.4 ? 1 : 0

  for (let j = 0; j < count; j += 1) {
    const pick = POOL[Math.floor(ry1() * POOL.length)]
    const status: ExperienceStatus = ry1() > 0.55 ? 'submitted' : 'draft'
    const e = exp({
      studentId: student,
      title: pick.title,
      description: `${pick.title} — just getting started.`,
      strands: pick.strands,
      isProject: false,
      claimedOutcomes: pick.los.slice(0, 2),
      status,
      createdAt: '2026-08-1' + (1 + (j % 4)),
    })
    if (status === 'submitted') {
      entry({
        experienceId: e.id,
        kind: 'reflection',
        body: 'Signing up for this because I want to find out whether I am any good at it.',
        authorType: 'student',
        authorName: student,
        createdAt: '2026-08-1' + (2 + (j % 3)),
      })
    }
  }

  // The initial interview is the one thing a coordinator does get done early.
  if (ry1() > 0.45) {
    INTERVIEWS.push({
      id: `iv_y1_${i}`,
      schoolId: SCHOOL,
      studentId: student,
      kind: 'initial',
      notes: 'First conversation of DP1 — talked through what a balanced portfolio looks like and what the three strands actually mean.',
      conductedOn: '2026-08-12',
      lockedAt: '2026-08-12',
      conductedBy: 'H. Adeyemi',
    })
  }
}

// ---------------------------------------------------------------------------
// One store, shared across module instances
// ---------------------------------------------------------------------------

/**
 * Pinned for the reason set out in ./pin.ts: a Next production build evaluates
 * this module twice, and without the pin a student's reflection is appended to
 * an array no page ever reads.
 */
const built: CasData = {
  experiences: EXPERIENCES,
  entries: ENTRIES,
  requests: REQUESTS,
  interviews: INTERVIEWS,
  indicators: INDICATORS,
  notes: NOTES,
  completions: COMPLETIONS,
}

export const CAS_DATA: CasData = pinned('ibCasData', () => built)

/**
 * Indicators, set last and on purpose.
 *
 * The indicator is a HUMAN judgement, so the fixture generates it from what the
 * coordinator would actually be looking at rather than from a separate dice
 * roll. A trophy next to a 0/7 row would be a defensible thing for a real
 * coordinator to do and an indefensible thing for fixture data to show — it
 * makes the screen look broken when it is working.
 *
 * Plenty stay unset. Most students, most of the time, are simply fine.
 */
const ALL_STUDENTS = [
  ...Array.from({ length: 24 }, (_, i) => sid(i + 1)),
  ...Array.from({ length: 20 }, (_, i) => y1(i + 1)),
]

const ri = rng(88)
for (const student of ALL_STUDENTS) {
  if (CAS_DATA.indicators.some((x) => x.studentId === student)) continue
  // The new cohort has barely started; forming a judgement about them now would
  // be theatre, so almost none of them carry one.
  if (ri() < (student.startsWith('y1') ? 0.85 : 0.35)) continue
  const s = summarise(student, CAS_DATA)
  const weight =
    s.outcomes.length +
    (s.project === 'complete' ? 2 : s.project === 'in_progress' ? 1 : 0) +
    s.interviews
  // At risk is a deliberate act, not a default. Where the record is merely
  // ordinary the honest answer is that nobody has formed a view yet.
  if (weight >= 4 && weight < 8 && ri() < 0.35) continue
  const value: IndicatorValue = weight >= 8 ? 'excellent' : weight >= 4 ? 'on_track' : 'at_risk'
  CAS_DATA.indicators.push({
    studentId: student, schoolId: SCHOOL, value,
    setBy: 'H. Adeyemi', setAt: '2026-06-0' + (1 + Math.floor(ri() * 8)),
  })
}

// CAS complete is RECORDED, not derived — but a fixture that records it for a
// student who has not met the gate would be lying about the one thing this
// product exists to get right. So: only where the gate actually passes, and
// only for some of those, because confirming it is a job someone has to do.
let confirmedSoFar = 0
for (const student of ALL_STUDENTS) {
  if (CAS_DATA.completions.some((c) => c.studentId === student)) continue
  if (!completionGate(summarise(student, CAS_DATA)).ready) continue
  confirmedSoFar += 1
  if (confirmedSoFar % 2 === 0) continue // left for the coordinator to confirm
  CAS_DATA.completions.push({
    studentId: student,
    schoolId: SCHOOL,
    confirmedBy: 'H. Adeyemi',
    confirmedAt: '2026-06-20',
  })
}

/**
 * Next ids, so runtime writes carry on where the fixtures left off — pinned for
 * the same reason as the store above. Two module instances handing out `ex61`
 * twice would be a much harder bug to see than a save that does nothing.
 */
const counters = pinned('ibCasCounters', () => ({ experiences: eN, entries: tN }))

export const casCounters = {
  nextExperienceId: () => 'ex' + ++counters.experiences,
  nextEntryId: () => 'te' + ++counters.entries,
}
