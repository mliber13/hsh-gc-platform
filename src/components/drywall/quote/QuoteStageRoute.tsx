import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { Button } from '@/components/ui/button'
import { PoSummaryCard } from '@/components/drywall/quote/PoSummaryCard'
import { shouldUseV2QuoteStage } from '@/lib/drywall/createEmptyDrywallQuote'
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
  const [loadError, setLoadError] = useState<string | null>(null)

  const detectVersion = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const project = await fetchDrywallProjectById(projectId)
      if (!project) {
        setIntakeSource('quote')
        setLoadError('Project not found')
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
      // Never fall back to the v2 editor here. A failure used to render it, so a project
      // whose quote was already version 3 on the row looked like it had "defaulted to v2" —
      // with the real error gone by the time anyone looked. Say what went wrong instead.
      const message = e instanceof Error ? e.message : 'Failed to load quote'
      toast.error(message)
      setIntakeSource('quote')
      setLoadError(message)
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

  if (loadError) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm font-medium">Could not open the quote</p>
        <p className="text-muted-foreground text-sm">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => void detectVersion()}>
          Try again
        </Button>
      </div>
    )
  }

  // Change orders moved to their own stage. They shared this route for a day, which needed a
  // timestamp relay between siblings because both write the same project row — one writer per
  // page makes that unnecessary rather than handled.
  if (intakeSource === 'po') {
    return <PoSummaryCard projectId={projectId} />
  }

  if (isV3) {
    return <QuoteStageV3 key={`v3-${projectId}`} onRevertToV2={() => void detectVersion()} />
  }

  return <QuoteStage key={`v2-${projectId}`} onConverted={() => void detectVersion()} />
}
