import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { PoSummaryCard } from '@/components/drywall/quote/PoSummaryCard'
import { hasRealDrywallV2QuoteData } from '@/lib/drywall/createEmptyDrywallQuote'
import {
  convertQuoteToV3,
  fetchDrywallProjectById,
  fetchDrywallQuoteV2V3,
  getIntakeSourceFromLegacy,
} from '@/services/drywallProjectsService'
import { isDrywallQuoteV3 } from '@/types/drywall'
import { QuoteStage } from './QuoteStage'
import { QuoteStageV3 } from './v3/QuoteStageV3'

/** Loads quote version and renders v2 or v3 stage, or PO summary for PO-intake projects. */
export function QuoteStageRoute() {
  const { projectId, setWideContent } = useOutletContext<DrywallProjectShellContext>()
  const [loading, setLoading] = useState(true)
  const [intakeSource, setIntakeSource] = useState<'po' | 'quote' | null>(null)
  const [isV3, setIsV3] = useState(false)

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

      if (hasRealDrywallV2QuoteData(quote)) {
        setIsV3(false)
        return
      }

      await convertQuoteToV3(projectId)
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

  if (intakeSource === 'po') {
    return <PoSummaryCard projectId={projectId} />
  }

  if (isV3) {
    return (
      <QuoteStageV3
        key={`v3-${projectId}`}
        onRevertToV2={() => void detectVersion()}
      />
    )
  }

  return <QuoteStage key={`v2-${projectId}`} onConverted={() => void detectVersion()} />
}
