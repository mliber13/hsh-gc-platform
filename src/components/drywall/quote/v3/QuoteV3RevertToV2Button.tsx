import { useState } from 'react'
import { Loader2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { v2SnapshotHasSubstantiveWork } from '@/lib/drywall/convertQuoteV2ToV3'

type Props = {
  legacyV2Snapshot: unknown
  v3LineCount: number
  disabled?: boolean
  reverting?: boolean
  onRevert: () => Promise<void>
}

export function QuoteV3RevertToV2Button({
  legacyV2Snapshot,
  v3LineCount,
  disabled,
  reverting,
  onRevert,
}: Props) {
  const [open, setOpen] = useState(false)
  const snapshotHasWork = v2SnapshotHasSubstantiveWork(legacyV2Snapshot)

  if (legacyV2Snapshot == null) return null

  const handleConfirm = async () => {
    await onRevert()
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || reverting}
        onClick={() => setOpen(true)}
      >
        {reverting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Undo2 className="mr-2 h-4 w-4" />
        )}
        Use v2 quote
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!reverting) setOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => reverting && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Switch back to v2 quote?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Your current v3 quote will be archived under{' '}
                  <span className="font-mono text-xs">metadata.legacy.quote_v3_archive_…</span>.
                  The page will reload the classic v2 quote editor (breakdowns, acoustic ceiling
                  panel, options, etc.).
                </p>
                {!snapshotHasWork ? (
                  <p className="text-amber-800 dark:text-amber-200">
                    <strong>Warning:</strong> the saved v2 snapshot is empty — you started on v3
                    with {v3LineCount} line{v3LineCount === 1 ? '' : 's'}. Restoring v2 gives a
                    blank v2 shell; your v3 work stays in the archive only.
                  </p>
                ) : (
                  <p>
                    The v2 snapshot from convert time will become active. Unsaved v3 edits are
                    not included — save first if you need them in the archive.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={reverting} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={reverting} onClick={() => void handleConfirm()}>
              {reverting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Restore v2 quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
