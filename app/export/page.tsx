import Placeholder from '@/components/Placeholder'
import Shell from '@/components/Shell'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await getSession()
  return (
    <Shell session={session} spaces={[]} current="/export">
      <Placeholder
        title="Download for IBIS"
        what="Build the upload packs: filter every RequirementState by its exportTarget, check the candidates are complete, and produce the files eCoursework and IBIS want. This is the point of the product, not a finale."
        waitingOn="Nothing external — this one is buildable now. It is a filter over data that already exists (RequirementDef.exportTarget), and it needs the modules to have recorded enough to be worth exporting."
        spec="IB-Coordinator-Module-Spec.md"
      />
    </Shell>
  )
}
