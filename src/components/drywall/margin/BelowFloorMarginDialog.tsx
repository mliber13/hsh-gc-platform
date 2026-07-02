import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/components/hr/payroll/payrollFormat'
import {
  formatMarginFloorPct,
  type MarginFloorEvaluation,
} from '@/lib/drywall/marginFloor'

interface BelowFloorMarginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  evaluation: MarginFloorEvaluation | null
  variant: 'quote_send' | 'field_measurement_to_order'
  reason: string
  onReasonChange: (value: string) => void
  busy: boolean
  onConfirm: () => void
  children?: React.ReactNode
}

export function BelowFloorMarginDialog({
  open,
  onOpenChange,
  evaluation,
  variant,
  reason,
  onReasonChange,
  busy,
  onConfirm,
  children,
}: BelowFloorMarginDialogProps) {
  const title =
    variant === 'quote_send' ? 'Send below target margin?' : 'Continue below target margin?'
  const confirmLabel =
    variant === 'quote_send' ? 'Mark Sent (below floor)' : 'Continue to order (below floor)'

  const floorPct = `${(evaluation?.floorTarget ?? 0.3) * 100}%`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {evaluation && (
                <>
                  <p>
                    Projected margin is{' '}
                    <strong className="text-foreground">
                      {formatMarginFloorPct(evaluation.marginPct)}
                    </strong>{' '}
                    (floor: {floorPct}).
                  </p>
                  <p>
                    Bid {formatCurrency(evaluation.bidTotal)} · Estimated cost{' '}
                    {formatCurrency(evaluation.estimatedCost)}
                  </p>
                </>
              )}
              <p>A reason is required to proceed below the org margin floor.</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Reason for proceeding below floor"
          rows={3}
          disabled={busy}
        />
        {children}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={busy || !reason.trim()}
          >
            {busy ? 'Saving…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
