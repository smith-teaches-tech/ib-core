// Download for IBIS — the export module's own view shapes, module-owned like
// CAS's and IA marks'. The board reads nothing new: every row here is a
// projection over RequirementDef.exportTarget, RequirementState, and the
// SampleRequests the IA module already records. Nothing below is stored.
//
// The three sections mirror how work actually leaves the building
// (IB-Export-and-Samples.md §3):
//
//   whole cohort   uploaded to eCoursework for EVERY candidate
//                  (EE essay · EE RPPF · TOK essay · TK/PPF · Group 6 portfolios)
//   samples        uploaded only for the candidates IBIS names, after marks go in
//   typed by hand  IA totals and predicted grades — no files, just transcription

/**
 * One candidate's slot in one upload pack.
 *
 * `source` is the forms decision (Michael, 16 Aug): a `generated` row's PDF is
 * the OFFICIAL IB form (EE/RPPF, TK/PPF), filled programmatically from what was
 * typed into the app — the ManageBac-established route. Nobody downloads a
 * blank form, types into it, and re-uploads it. An `uploaded` row is a file a
 * candidate submitted as-is.
 */
export interface PackRow {
  studentId: string
  name: string
  sessionNumber: string | null
  /** The generated name: sessionNo_Component.pdf — for the school's sanity; moderators never see it. */
  fileName: string
  /** The school holds everything this slot needs (file uploaded / all text typed). */
  present: boolean
  /** Every contributing state carries exportStatus 'submitted' — it went to eCoursework. */
  submitted: boolean
  source: 'uploaded' | 'generated'
  /** Progress worth showing when not present — e.g. "2 of 3 interactions typed". */
  detail: string | null
}

/** A whole-cohort upload job — one row of the board's first section. */
export interface CohortJob {
  /** Stable job key: 'ee.essay' | 'ee.rppf' | 'tok.essay' | 'tok.tkppf' | 'g6:<courseId>'. */
  key: string
  label: string
  covers: string
  kind: 'files' | 'forms'
  /** Set on `forms` jobs: where the content comes from and which official form receives it. */
  formNote: string | null
  ready: number
  total: number
  /** Every ready slot has been marked submitted in eCoursework. */
  submitted: boolean
  zipName: string
  csvName: string
  /** Session-number order — IBIS candidate order. */
  rows: PackRow[]
}

/** A moderation-sample job — one per course (subject AND level), plus the exhibition. */
export interface SampleJob {
  courseId: string
  courseName: string
  kind: 'ia' | 'tok_exhibition'
  enrolled: number
  /** Candidates whose total (or exhibition mark) is in — what unblocks IBIS's sampling. */
  marksIn: number
  /** The recorded SampleRequest, projected — null until the coordinator records one. */
  sample: {
    size: number
    filesReady: number
    status: 'draft' | 'submitted'
    recordedAt: string
    submittedAt: string | null
  } | null
  /** Where the paste-and-pack panel lives. Null while a module has no picker yet (TOK). */
  pickerHref: string | null
}

/** Hand-typed into IBIS — counts only; the buttons jump to the module that owns the values. */
export interface TypedJob {
  key: 'ia_marks' | 'predicted'
  label: string
  detail: string
  done: number
  total: number
  href: string
}

/** Per-course IA file lists, for the secondary "all IAs" / archive downloads. */
export interface IaFileGroup {
  courseId: string
  courseName: string
  /** The course name with everything non-alphanumeric squeezed out — the filename fragment. */
  compact: string
  rows: PackRow[]
}

export interface UploadBoardView {
  cohortId: string
  /** "M27" — the exam session the packs are named for. */
  sessionLabel: string
  candidates: number
  cohortJobs: CohortJob[]
  sampleJobs: SampleJob[]
  typedJobs: TypedJob[]
  iaFiles: IaFileGroup[]
}
