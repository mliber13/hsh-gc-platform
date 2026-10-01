// ============================================================================
// Change orders — their own stage
// ============================================================================
//
// These have now lived in three places, and the data settled it. 16 change orders across 12
// projects, and EVERY ONE of those projects is `production` or `production-complete` — not a
// single one written while the job was still at quote. They are a build-time activity.
//
// The Order page was wrong because a change order is not a purchase. The quote was wrong for
// a subtler reason: it is the right KIND of document — same parties, same contract, same
// argument three months later — but the wrong MOMENT. By the time one gets written the quote
// is months old.
//
// Mark, 2026-10-01: "someone that doesn't know the system wouldn't have a clue where to
// look." A thing worth $26k of accepted changes across a dozen jobs should not be a drawer
// inside another screen.
//
// The second reason is structural. `persistLegacyMetadata` guards the whole project row, so
// any two writers on one page collide — that bug surfaced twice in two days while this block
// shared the quote route, and had to be patched with a timestamp relay between siblings.
// Owning a route means one writer, and the collision cannot happen rather than being
// handled.

import { useOutletContext } from 'react-router-dom'
import { ProjectChangeOrdersCard } from './ProjectChangeOrdersCard'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'

export function ChangeOrdersStagePage() {
  const { projectId } = useOutletContext<DrywallProjectShellContext>()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Change orders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Work added or removed after the quote was agreed. An accepted change order moves the
          contract value, which is what the margin on Financials is measured against.
        </p>
      </div>

      <ProjectChangeOrdersCard projectId={projectId} readOnly={readOnly} />
    </div>
  )
}
