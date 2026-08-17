import Placeholder from '@/components/Placeholder'
import Shell from '@/components/Shell'
import { repo } from '@/lib/data'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await getSession()
  // Everyone gets their spaces looked up, not just teachers: a person can hold
  // a coordinator job AND teach (see Shell). A pure coordinator is attached to
  // no courses, so this returns [] for them and costs nothing.
  const spaces = await repo.mySpaces(session.school.id, session.user.id)
  return (
    <Shell session={session} spaces={spaces} current="/documents">
      <Placeholder
        title="Information & documents"
        what="Manage the library that already sits behind the button in the top bar: upload a guide, set which cohort it applies to and who can see it, and version it so a 2027 candidate sees the 2027 rules."
        waitingOn="File storage. The documents drawer reads real data today, but adding a document means somewhere to put it — the same cloud project the CAS evidence uploads are waiting on."
        spec="IB-Home-and-Documents-Spec.md"
      />
    </Shell>
  )
}
