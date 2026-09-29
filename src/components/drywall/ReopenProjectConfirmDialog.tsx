import { useState } from 'react'
import { toast } from 'sonner'
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
  DrywallProjectPermissionError,
  revertCloseoutToProductionComplete,
} from '@/services/drywallProjectsService'

interface ReopenProjectConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  loadedAt: string
  onReopened?: () => void | Promise<void>
}

export function ReopenProjectConfirmDialog({
  open,
  onOpenChange,
  projectId,
  loadedAt,
  onReopened,
}: ReopenProjectConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  const handleReopen = async () => {
    setBusy(true)
    try {
      // closed → production-complete, the one step back the lifecycle allows. The old
      // shortcut jumped all the way to order and stripped the closeout timestamps with it.
      await revertCloseoutToProductionComplete(projectId, loadedAt)
      toast.success('Reopened to production complete')
      onOpenChange(false)
      await onReopened?.()
    } catch (e) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to reopen project')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen project?</DialogTitle>
          <DialogDescription>
            It returns to Production Complete and reappears in the active list. The
            production dates are kept; only the closeout is undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleReopen()} disabled={busy}>
            {busy ? 'Reopening…' : 'Reopen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
