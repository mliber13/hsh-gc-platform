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
  revertDrywallProjectComplete,
} from '@/services/drywallProjectsService'

interface ReopenProjectConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onReopened?: () => void | Promise<void>
}

export function ReopenProjectConfirmDialog({
  open,
  onOpenChange,
  projectId,
  onReopened,
}: ReopenProjectConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  const handleReopen = async () => {
    setBusy(true)
    try {
      await revertDrywallProjectComplete(projectId)
      toast.success('Project reopened')
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
            Reopen this project? It will return to the Order stage and reappear in the active list.
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
