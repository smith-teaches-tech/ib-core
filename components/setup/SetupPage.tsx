'use client'

// Setup & people. Four tabs, one job: make it possible to record anything at all.
//
// Nothing else in the product works without this screen — you cannot record
// against a roster that does not exist, and you cannot export a candidate the
// system has never heard of. It is listed fourth in the philosophy doc's build
// order for that reason and is the last piece before real data can go in.

import { useState } from 'react'
import type { CourseRow, PersonRow } from '@/lib/setup/types'
import type { PickerOption } from './Picker'
import CandidatesTab from './CandidatesTab'
import CoursesTab from './CoursesTab'
import PermissionsTab from './PermissionsTab'
import StudentsTab from './StudentsTab'
import TeachersTab from './TeachersTab'

type Tab = 'students' | 'candidates' | 'courses' | 'teachers' | 'permissions'

export default function SetupPage({
  courseRows,
  people,
  cohortId,
  cohortLabel,
  schoolName,
  can,
  myCapabilities,
  myUserId,
  districtTier,
}: {
  courseRows: CourseRow[]
  people: PersonRow[]
  cohortId: string
  cohortLabel: string
  schoolName: string
  can: {
    students: boolean
    teachers: boolean
    catalogue: boolean
    sections: boolean
    enrolment: boolean
    roles: boolean
    identifiers: boolean
    distribute: boolean
  }
  myCapabilities: string[]
  myUserId: string
  /** District-tier granter — the only tier that may hand out the district preset. */
  districtTier: boolean
}) {
  const [tab, setTab] = useState<Tab>('students')

  // The courses this cohort runs, as picker options. Each carries its
  // (invisible, exactly-one) section id — the write key the actions expect;
  // the label is the course name and nothing else.
  const sectionOptions: PickerOption[] = courseRows.flatMap((r) =>
    r.sections.map((s) => ({
      id: s.section.id,
      label: r.course.name,
      sub: `${r.course.subjectGroup} · ${s.students} enrolled`,
    })),
  )

  const students = people.filter((p) => p.isStudent)
  const unenrolled = students.filter((p) => p.enrolled.length === 0).length

  const needIdentifiers = students.filter((p) => p.candidate?.state !== 'confirmed').length

  const TABS: [Tab, string][] = [
    ['students', `Students (${students.length})`],
    ['candidates', `IB identifiers${needIdentifiers ? ` (${needIdentifiers})` : ''}`],
    ['courses', `Courses (${courseRows.filter((r) => r.sections.length > 0).length})`],
    ['teachers', `Teachers (${people.filter((p) => !p.isStudent).length})`],
    ['permissions', 'Permissions'],
  ]

  return (
    <>
      <h1>Add &amp; assign — users, courses, permissions</h1>
      <p className="sub">
        {schoolName} · {cohortLabel}. Everything else in IB Core reads what is set up here.
      </p>

      {unenrolled > 0 && (
        <div className="note gold" style={{ marginBottom: 14 }}>
          <b>{unenrolled} student{unenrolled === 1 ? ' is' : 's are'} not enrolled in anything.</b>{' '}
          They have no requirements at all until they are, so they will show as empty rows on the
          completeness board rather than as a problem.
        </div>
      )}

      <div className="tabs">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-b">
          {tab === 'students' && (
            <StudentsTab
              people={people}
              sectionOptions={sectionOptions}
              cohortId={cohortId}
              cohortLabel={cohortLabel}
              canImport={can.students}
              canEnrol={can.enrolment}
            />
          )}
          {tab === 'candidates' && (
            <CandidatesTab
              people={people}
              canManage={can.identifiers}
              canDistribute={can.distribute}
            />
          )}
          {tab === 'courses' && (
            <CoursesTab
              rows={courseRows}
              cohortId={cohortId}
              cohortLabel={cohortLabel}
              canCatalogue={can.catalogue}
              canSections={can.sections}
            />
          )}
          {tab === 'teachers' && (
            <TeachersTab
              people={people}
              sectionOptions={sectionOptions}
              canInvite={can.teachers}
              canAssign={can.sections}
            />
          )}
          {tab === 'permissions' && (
            <PermissionsTab
              people={people}
              myCapabilities={myCapabilities}
              canAssign={can.roles}
              myUserId={myUserId}
              districtTier={districtTier}
            />
          )}
        </div>
      </div>
    </>
  )
}
