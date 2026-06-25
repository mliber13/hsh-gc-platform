import { useState } from 'react'

import { Loader2, RefreshCw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import {
  getV2QuoteGrandTotal,
  v2QuoteFromV3Snapshot,
} from '@/lib/drywall/convertQuoteV2ToV3'

import { formatQuoteMoney } from '@/lib/drywall/quoteV3Math'

const dismissKey = (projectId: string) => `hsh.drywall.v3ConvertBanner.${projectId}`

type Props = {
  projectId: string
  legacyV2Snapshot: unknown
  showRefresh?: boolean
  refreshing?: boolean
  onRefresh?: () => Promise<void>
}

export function QuoteV3ConvertBanner({
  projectId,
  legacyV2Snapshot,
  showRefresh = false,
  refreshing = false,
  onRefresh,
}: Props) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(dismissKey(projectId)) === '1',
  )
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (dismissed || !legacyV2Snapshot) return null

  const v2 = v2QuoteFromV3Snapshot(legacyV2Snapshot)
  const v2Total = getV2QuoteGrandTotal(v2)
  const totalLabel =
    v2Total != null ? formatQuoteMoney(v2Total) : 'see v2 snapshot'

  const dismiss = () => {
    localStorage.setItem(dismissKey(projectId), '1')
    setDismissed(true)
  }

  const handleConfirmRefresh = async () => {
    if (!onRefresh) return
    await onRefresh()
    setConfirmOpen(false)
  }

  return (
    <>
      <div
        role="status"
        className="flex gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium">Converted from v2</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
            Your previous data is preserved as a rollback snapshot. Review the carried-over lines,
            board picks, and rates before finalizing. The original v2 quote total was{' '}
            <span className="font-semibold tabular-nums">{totalLabel}</span>.
          </p>
          {showRefresh && onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 border-amber-400/70 bg-white/80 text-amber-950 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-50 dark:hover:bg-amber-900/40"
              disabled={refreshing}
              onClick={() => setConfirmOpen(true)}
            >
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh from v2 snapshot
            </Button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
          onClick={dismiss}
          aria-label="Dismiss conversion notice"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!refreshing) setConfirmOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => refreshing && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Refresh from v2 snapshot?</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  Re-run the convert flow using the latest engine. Your current v3 work on this
                  project will be archived under{' '}
                  <span className="font-mono text-xs">metadata.legacy.quote_v3_archive_…</span>.
                </p>
                <p>Continue?</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={refreshing}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={refreshing} onClick={() => void handleConfirmRefresh()}>
              {refreshing && <Loader2 className="mr-2 size-4 animate-spin" />}
              Refresh quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
