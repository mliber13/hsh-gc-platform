import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  converting: boolean
  onConfirm: () => void
}

export function QuoteConvertV3Dialog({ open, onOpenChange, converting, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Convert to line-item quote?</DialogTitle>
          <DialogDescription className="text-left leading-relaxed">
            Convert this project to the new line-item quote model? Your current quote data will be
            preserved as a rollback snapshot. You&apos;ll start with empty line items and build up
            the quote from scratch using the new model. This is the recommended path while we
            validate the new model on real quotes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={converting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={converting} onClick={onConfirm}>
            {converting ? 'Converting…' : 'Convert'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
