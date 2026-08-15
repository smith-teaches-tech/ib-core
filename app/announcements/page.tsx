import Placeholder from '@/components/Placeholder'
import Shell from '@/components/Shell'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await getSession()
  return (
    <Shell session={session} spaces={[]} current="/announcements">
      <Placeholder
        title="Send announcements"
        what="Post a message to a cohort, a course or the whole programme, with a record of who was told what and when. The capability already exists in the permission model; only the screen is missing."
        waitingOn="Nothing technical. Announcements are communication rather than record-keeping, so the philosophy doc puts them in Phase 2 — they are behind EE, the export builder and the remaining modules."
        spec="IB-Home-and-Documents-Spec.md"
      />
    </Shell>
  )
}
