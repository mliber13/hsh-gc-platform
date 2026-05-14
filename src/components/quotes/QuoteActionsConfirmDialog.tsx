import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface QuoteActionsConfirmDialogProps {
  open: boolean
  mode: 'send' | 'accept' | 'decline'
  quoteNumber: string
  validityDays?: number
  /** When true, decline copy mentions the project will move to Lost. */
  isOnlyLiveQuote?: boolean
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export function QuoteActionsConfirmDialog({
  open,
  mode,
  quoteNumber,
  validityDays = 60,
  isOnlyLiveQuote,
  onConfirm,
  onCancel,
}: QuoteActionsConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'send'
      ? `Send ${quoteNumber}?`
      : mode === 'accept'
        ? 'Mark this quote as accepted?'
        : 'Mark this quote as declined?'

  const body =
    mode === 'send' ? (
      <p>
        This will freeze the PDF and start the {validityDays}-day validity window. The quote will become
        read-only — further edits require creating a revision.
      </p>
    ) : mode === 'accept' ? (
      <p>The project will move to In Progress.</p>
    ) : (
      <p>
        {isOnlyLiveQuote
          ? 'If this is the only live quote on the project, the project will be moved to Lost.'
          : 'Other live quotes remain on this project; the project status will not change to Lost.'}
      </p>
    )

  const confirmLabel =
    mode === 'send' ? 'Send quote' : mode === 'accept' ? 'Mark accepted' : 'Mark declined'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground [&_p]:leading-relaxed">{body}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void handleConfirm()}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
