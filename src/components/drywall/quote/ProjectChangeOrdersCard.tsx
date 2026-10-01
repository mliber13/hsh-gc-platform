// ============================================================================
// Change orders — attached to the quote, not to purchasing
// ============================================================================
//
// These lived on the Order page because that is where they were first built. They do not
// belong there: a change order restates what the CUSTOMER owes. Same parties as the quote,
// same document trail, same argument three months later. Keeping them next to purchasing
// meant the person checking what to buy walked past the contract every time, and the person
// amending the contract opened a purchasing screen to do it (docs/DRYWALL_PROJECT_IA.md §3).
//
// The block owns its own load and save so it does not depend on whichever page renders it.
// That also closes a real hazard: change orders and orders used to be written together by
// `saveOrderStageSnapshot`, so two surfaces holding one snapshot would each overwrite the
// other's half.

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ChangeOrdersSection } from '@/components/drywall/order/ChangeOrdersSection'
import { downloadDrywallChangeOrderPdf } from '@/lib/drywallChangeOrderPdf'
import {
  fetchChangeOrders,
  fetchDrywallProjectById,
  fetchDrywallQuoteV2V3,
  saveChangeOrders,
  transitionDrywallChangeOrder,
} from '@/services/drywallProjectsService'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import { projectV3QuoteToV2Shape } from '@/lib/drywall/projectV3QuoteToV2Shape'
import { isDrywallQuoteV3 } from '@/types/drywall'
import type { DrywallChangeOrder, DrywallProject, DrywallQuote } from '@/types/drywall'

interface Props {
  projectId: string
  readOnly: boolean
  /**
   * Called with the new row timestamp after every write.
   *
   * This card and the quote stage are siblings that both write `projects.metadata`, and the
   * guard is on the whole row. Without telling the sibling what the row moved to, saving a
   * change order leaves the quote stage holding a stale stamp and the next outcome action —
   * Mark approved, say — is refused as "changed somewhere else". Which it was: by the page
   * it is standing on.
   */
  onProjectWritten?: (updatedAtRaw: string) => void
  /** Row timestamp written by the quote stage; adopted so this card does not go stale. */
  externalUpdatedAt?: string | null
}

export function ProjectChangeOrdersCard({
  projectId,
  readOnly,
  onProjectWritten,
  externalUpdatedAt,
}: Props) {
  const [project, setProject] = useState<DrywallProject | null>(null)
  const [changeOrders, setChangeOrders] = useState<DrywallChangeOrder[]>([])
  /** v2 shape, because that is what the change-order PDF reads. */
  const [quote, setQuote] = useState<DrywallQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  /** Latest row timestamp. A ref, because a chained save must read it after the fact. */
  const updatedAtRef = useRef<string | null>(null)
  const pendingRef = useRef<DrywallChangeOrder[] | null>(null)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const timerRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, cos, qRaw, catalogs] = await Promise.all([
        fetchDrywallProjectById(projectId),
        fetchChangeOrders(projectId),
        fetchDrywallQuoteV2V3(projectId),
        fetchOrgDrywallCatalogs(),
      ])
      setProject(p)
      updatedAtRef.current = p?.updatedAtRaw ?? null
      setChangeOrders(cos)
      setQuote(isDrywallQuoteV3(qRaw) ? projectV3QuoteToV2Shape(qRaw, catalogs) : qRaw)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load change orders')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  // The quote stage writes the same row. Adopt its timestamp instead of letting the next
  // change-order save be refused as a conflict with the page it is sitting on.
  useEffect(() => {
    if (externalUpdatedAt) updatedAtRef.current = externalUpdatedAt
  }, [externalUpdatedAt])

  /**
   * Edits save immediately rather than waiting for a page-level Save button.
   *
   * On the Order page these rode along with that page's explicit save, which is why a change
   * order could be typed and lost by navigating away. Nothing else on the quote route has a
   * save button for them to share.
   */
  /**
   * Autosave, debounced and serialised.
   *
   * Saving straight from onChange fired a write per keystroke, and every blob write is
   * guarded on `updated_at`: the second keystroke still held the timestamp the first had
   * already replaced, so the guard refused it and the page threw "changed somewhere else
   * while you were editing" as Mark typed an amount. The guard was right; the caller was
   * wrong.
   *
   * Two things fix it, and both are needed. The debounce collapses a burst of typing into
   * one write. The promise chain guarantees only one write is ever in flight, so the next
   * one reads the timestamp the previous one returned rather than a stale copy — a
   * debounce alone still races whenever a save is slower than the pause between bursts.
   *
   * The timestamp lives in a ref, not state: a chained callback closes over whatever state
   * held when it was created, which is exactly the stale value being avoided.
   */
  const flush = useCallback(async () => {
    const next = pendingRef.current
    if (!next || !updatedAtRef.current) return
    pendingRef.current = null

    chainRef.current = chainRef.current.then(async () => {
      try {
        updatedAtRef.current = await saveChangeOrders(projectId, next, updatedAtRef.current!)
        onProjectWritten?.(updatedAtRef.current)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save the change order')
        await load()
      }
    })
    await chainRef.current
  }, [projectId, load, onProjectWritten])

  const persist = (next: DrywallChangeOrder[]) => {
    setChangeOrders(next)
    pendingRef.current = next
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void flush(), 700)
  }

  // Leaving the page must not drop what is pending — losing a typed change order by
  // navigating away is the failure this block was built to end.
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      void flush()
    }
  }, [flush])

  const handleTransition = async (
    changeOrder: DrywallChangeOrder,
    transition:
      | { action: 'submit' }
      | { action: 'accept'; acceptedAmount: string; acceptanceReference: string }
      | { action: 'reject'; rejectionNotes: string },
  ) => {
    if (readOnly || !updatedAtRef.current) return
    setBusyId(changeOrder.id)
    try {
      // Land any debounced edit before transitioning, and wait for whatever is already in
      // flight. Submitting while a keystroke save was still running would send the
      // transition with a timestamp that save was about to replace — the same race that
      // made typing an amount throw.
      if (timerRef.current) window.clearTimeout(timerRef.current)
      await flush()
      await chainRef.current

      const after = await saveChangeOrders(projectId, changeOrders, updatedAtRef.current)
      updatedAtRef.current = after
      onProjectWritten?.(after)
      const afterTransition = await transitionDrywallChangeOrder(projectId, changeOrder.id, transition, after)
      if (typeof afterTransition === 'string') onProjectWritten?.(afterTransition)
      toast.success(
        transition.action === 'submit'
          ? 'Change order submitted'
          : transition.action === 'accept'
            ? 'Change order accepted'
            : 'Change order rejected',
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update change order')
      throw e
    } finally {
      setBusyId(null)
    }
  }

  const handlePdf = async (changeOrder: DrywallChangeOrder) => {
    if (!project) return
    try {
      await downloadDrywallChangeOrderPdf({
        project: { name: project.name, address: project.address, client: project.client },
        quote,
        po: project.legacy.poData ?? project.legacy.po,
        changeOrder,
        changeOrders,
      })
      toast.success('Change order PDF downloaded')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate change order PDF')
      throw e
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading change orders…</p>
  }

  return (
    <ChangeOrdersSection
      changeOrders={changeOrders}
      readOnly={readOnly}
      onChange={(next) => void persist(next)}
      busyId={busyId}
      onSubmit={(co) => handleTransition(co, { action: 'submit' })}
      onAccept={(co, acceptedAmount, acceptanceReference) =>
        handleTransition(co, { action: 'accept', acceptedAmount, acceptanceReference })
      }
      onReject={(co, rejectionNotes) => handleTransition(co, { action: 'reject', rejectionNotes })}
      onDownloadPdf={handlePdf}
    />
  )
}
