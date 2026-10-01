import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { PoSummaryCard } from '@/components/drywall/quote/PoSummaryCard'
import { shouldUseV2QuoteStage } from '@/lib/drywall/createEmptyDrywallQuote'
import {
  convertQuoteToV3,
  fetchDrywallProjectById,
  fetchDrywallQuoteV2V3,
  getIntakeSourceFromLegacy,
} from '@/services/drywallProjectsService'
import { isDrywallQuoteV3 } from '@/types/drywall'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { ProjectChangeOrdersCard } from './ProjectChangeOrdersCard'
import { QuoteStage } from './QuoteStage'
import { QuoteStageV3 } from './v3/QuoteStageV3'

/** Loads quote version and renders v2 or v3 stage, or PO summary for PO-intake projects. */
export function QuoteStageRoute() {
  const { projectId, setWideContent } = useOutletContext<DrywallProjectShellContext>()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)
  const [loading, setLoading] = useState(true)
  const [intakeSource, setIntakeSource] = useState<'po' | 'quote' | null>(null)
  const [isV3, setIsV3] = useState(false)
  /** Last row timestamp written by the change-order card, relayed to the quote stage. */
  const [externalUpdatedAt, setExternalUpdatedAt] = useState<string | null>(null)

  const detectVersion = useCallback(async () => {
    setLoading(true)
    try {
      const project = await fetchDrywallProjectById(projectId)
      if (!project) {
        toast.error('Project not found')
        setIntakeSource('quote')
        setIsV3(false)
        return
      }

      const source = getIntakeSourceFromLegacy(project.legacy)
      if (source === 'po') {
        setIntakeSource('po')
        return
      }

      setIntakeSource('quote')
      const quote = await fetchDrywallQuoteV2V3(projectId)

      if (isDrywallQuoteV3(quote)) {
        setIsV3(true)
        return
      }

      if (shouldUseV2QuoteStage(quote)) {
        setIsV3(false)
        return
      }

      await convertQuoteToV3(projectId, project.updatedAtRaw)
      setIsV3(true)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load quote')
      setIntakeSource('quote')
      setIsV3(false)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void detectVersion()
  }, [detectVersion])

  useEffect(() => {
    setWideContent?.(intakeSource !== 'po' && isV3)
    return () => setWideContent?.(false)
  }, [intakeSource, isV3, setWideContent])

  if (loading) {
    return <p className="text-muted-foreground p-6">Loading quote…</p>
  }

  // Change orders sit under whichever quote surface this project uses — including a PO
  // intake, because a PO job still gets change orders and they still restate the contract.
  //
  // `externalUpdatedAt` is how the two siblings stay in step. They both write
  // `projects.metadata` and the guard is on the whole row, so a change-order save moves the
  // timestamp out from under the quote stage; without this the next outcome action is
  // refused as "changed somewhere else", by the page you are standing on.
  const stage =
    intakeSource === 'po' ? (
      <PoSummaryCard projectId={projectId} />
    ) : isV3 ? (
      <QuoteStageV3
        key={`v3-${projectId}`}
        externalUpdatedAt={externalUpdatedAt}
        onProjectWritten={setExternalUpdatedAt}
        onRevertToV2={() => void detectVersion()}
      />
    ) : (
      <QuoteStage
        key={`v2-${projectId}`}
        externalUpdatedAt={externalUpdatedAt}
        onProjectWritten={setExternalUpdatedAt}
        onConverted={() => void detectVersion()}
      />
    )

  return (
    <div className="space-y-6">
      {stage}
      <ProjectChangeOrdersCard
        projectId={projectId}
        readOnly={readOnly}
        externalUpdatedAt={externalUpdatedAt}
        onProjectWritten={setExternalUpdatedAt}
      />
    </div>
  )
}
