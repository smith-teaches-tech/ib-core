'use client'

// The catalogue, and which of it this cohort actually runs.
//
// The distinction the screen has to make clear, because it is the model: a
// COURSE belongs to the school and outlives cohorts; a SECTION is a group within
// it for one cohort. So "we offer Chem HL this year" is a section, not a course,
// and dropping a course next year deletes nothing.

import { useState, useTransition } from 'react'
import * as setup from '@/lib/setup/actions'
import { SUBJECT_GROUPS } from '@/lib/data/catalogue'
import { templateOf, templatesForGroup } from '@/lib/templates'
import type { CourseRow } from '@/lib/setup/types'
import Picker from './Picker'

export default function CoursesTab({
  rows,
  cohortId,
  cohortLabel,
  canCatalogue,
  canSections,
}: {
  rows: CourseRow[]
  cohortId: string
  cohortLabel: string
  canCatalogue: boolean
  canSections: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [newCourse, setNewCourse] = useState<string | null>(null)
  const [group, setGroup] = useState<string>(SUBJECT_GROUPS[1])
  const [level, setLevel] = useState<'HL' | 'SL' | ''>('')
  // The IA template family — defaults to the group's own family the moment the
  // group is picked, so the common case is zero extra clicks.
  const [tpl, setTpl] = useState<string>(templatesForGroup(SUBJECT_GROUPS[1])[0].key)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<unknown>) => {
    setError(null)
    start(async () => {
      try {
        await fn()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const running = rows.filter((r) => r.sections.length > 0)
  const dormant = rows.filter((r) => r.sections.length === 0)

  return (
    <>
      <div className="note">
        A <b>course</b> belongs to the school. A <b>section</b> is a group within it for one cohort.
        Adding a course to {cohortLabel} creates its first section — the catalogue itself does not
        change, so a course you skip this year is still there next year.
      </div>

      {canSections && (
        <div className="row exptools" style={{ marginTop: 12 }}>
          <span className="caps" style={{ minWidth: 130 }}>Run in {cohortLabel}</span>
          <Picker
            placeholder="Type to search the catalogue…"
            options={dormant.map((r) => ({
              id: r.course.id,
              label: r.course.name,
              sub: r.course.subjectGroup,
            }))}
            onPick={(id) => run(() => setup.addSection(id, cohortId, 'A'))}
            allowCreate={canCatalogue}
            createLabel="Add a new course"
            onCreate={(typed) => setNewCourse(typed)}
          />
          <span className="mut" style={{ fontSize: 12 }}>
            {dormant.length} in the catalogue not yet running this year.
          </span>
        </div>
      )}

      {newCourse != null && (
        <div className="cob">
          <b>New course: {newCourse}</b>
          <p className="mut" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>
            HL and SL are separate courses — that is what lets them carry different requirements
            with no conditional logic anywhere. Add them one at a time.
          </p>
          <div className="row">
            <select
              value={group}
              onChange={(e) => {
                setGroup(e.target.value)
                // Re-default the family to the new group's own — a Sciences
                // course should never accidentally keep a Language A rubric.
                setTpl(templatesForGroup(e.target.value)[0].key)
              }}
            >
              {SUBJECT_GROUPS.filter((g) => g !== 'Core').map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value as 'HL' | 'SL' | '')}>
              <option value="">No level</option>
              <option value="HL">HL</option>
              <option value="SL">SL</option>
            </select>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="caps" style={{ minWidth: 130 }}>IA template</span>
            <select value={tpl} onChange={(e) => setTpl(e.target.value)}>
              <optgroup label="This group's families">
                {templatesForGroup(group)
                  .filter((t) => t.key !== 'generic' && t.groups.includes(group))
                  .map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
              </optgroup>
              <optgroup label="Other families">
                {templatesForGroup(group)
                  .filter((t) => t.key === 'generic' || !t.groups.includes(group))
                  .map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
              </optgroup>
            </select>
          </div>
          <p className="mut" style={{ fontSize: 12, margin: '6px 0 10px' }}>
            {templateOf(tpl).component} · marked /{templateOf(tpl).markMax}
            {templateOf(tpl).criteria.length > 0
              ? ` over ${templateOf(tpl).criteria.length} criteria`
              : ' as a single total'}
            {' — '}{templateOf(tpl).guide}
            {templateOf(tpl).verify && (
              <span className="pill gold" style={{ marginLeft: 6 }}>verify against the guide</span>
            )}
          </p>
          <div className="row">
            <button
              className="btn pri sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await setup.addCourse(cohortId, {
                    name: newCourse,
                    subjectGroup: group,
                    level: level || null,
                    iaTemplateKey: tpl,
                  })
                  setNewCourse(null)
                })
              }
            >
              Create &amp; run this year
            </button>
            <button className="btn sm ghost" onClick={() => setNewCourse(null)}>Cancel</button>
          </div>
          <p className="mut" style={{ fontSize: 12, marginBottom: 0 }}>
            It arrives with its family&rsquo;s IA requirements — the {templateOf(tpl).component.toLowerCase()},
            the mark /{templateOf(tpl).markMax} and the teacher comment — so it reaches the board and the
            marks screen immediately, with the right denominator.
          </p>
        </div>
      )}

      {error && <div className="note warn" style={{ marginTop: 12 }}>{error}</div>}

      <div className="tableshell" style={{ marginTop: 14 }}>
        <table className="casroster">
          <thead>
            <tr>
              <th>Course</th>
              <th>Group</th>
              <th>Level</th>
              <th>IA rubric</th>
              <th>Sections</th>
              <th>Students</th>
              <th>Teachers</th>
              {canSections && <th />}
            </tr>
          </thead>
          <tbody>
            {running.map((r) => (
              <tr key={r.course.id}>
                <td className="name">{r.course.name}</td>
                <td className="mut">{r.course.subjectGroup}</td>
                <td>{r.course.level ? <span className="pill info">{r.course.level}</span> : <span className="mut">—</span>}</td>
                <td>
                  {r.course.type === 'subject' ? (
                    <span
                      className={`pill ${templateOf(r.course.iaTemplateKey).verify ? 'gold' : 'grey'}`}
                      title={`${templateOf(r.course.iaTemplateKey).component} — ${templateOf(r.course.iaTemplateKey).guide}${templateOf(r.course.iaTemplateKey).verify ? ' · ' + templateOf(r.course.iaTemplateKey).verify : ''}`}
                    >
                      /{templateOf(r.course.iaTemplateKey).markMax}
                      {templateOf(r.course.iaTemplateKey).criteria.length > 0
                        ? ` · ${templateOf(r.course.iaTemplateKey).criteria.length} crit.`
                        : ' · total only'}
                    </span>
                  ) : (
                    <span className="mut">—</span>
                  )}
                </td>
                <td>
                  {r.sections.map((s) => (
                    <span key={s.section.id} className="pill grey" style={{ marginRight: 4 }}>
                      {s.section.label} · {s.students}
                    </span>
                  ))}
                </td>
                <td><b>{r.students}</b></td>
                <td>
                  {r.sections.every((s) => s.teachers.length === 0) ? (
                    <span className="pill warn">None assigned</span>
                  ) : (
                    // Per teacher PER SECTION — see the note in app/courses/page.tsx.
                    r.sections.flatMap((s) =>
                      s.teachers.map((t) => (
                        <span
                          key={s.section.id + ':' + t.userId}
                          className="pill ok"
                          style={{ marginRight: 4 }}
                          title={t.isDesignatedMarker ? 'Designated marker' : 'Teaches this section'}
                        >
                          {t.name}
                          {r.sections.length > 1 && ` ${s.section.label}`}
                          {t.isDesignatedMarker ? ' ★' : ''}
                        </span>
                      )),
                    )
                  )}
                </td>
                {canSections && (
                  <td>
                    <button
                      className="btn sm ghost"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          setup.addSection(
                            r.course.id,
                            cohortId,
                            String.fromCharCode(65 + r.sections.length),
                          ),
                        )
                      }
                    >
                      + section
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mut" style={{ fontSize: 12, marginTop: 10 }}>
        ★ marks the designated marker — the teacher the IB holds responsible for that section&rsquo;s
        marks. Set it on the Teachers tab.
      </p>
    </>
  )
}
