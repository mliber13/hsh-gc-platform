import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { FieldTakeoff } from '@/types/drywall'

function formatReviewTimestamp(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  try {
    return format(parseISO(iso), 'MMM d, yyyy h:mm a')
  } catch {
    return iso
  }
}

export interface FieldTakeoffReviewBannerProps {
  takeoff: FieldTakeoff
  /** Owner + office_drywall — approve/reject actions. */
  canReview: boolean
  busy?: boolean
  onApprove: () => void | Promise<void>
  onReject: (notes: string) => void | Promise<void>
}

export function FieldTakeoffReviewBanner({
  takeoff,
  canReview,
  busy = false,
  onApprove,
  onReject,
}: FieldTakeoffReviewBannerProps) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')

  const status = takeoff.reviewStatus

  useEffect(() => {
    if (rejectOpen) {
      setRejectNotes(takeoff.rejectionNotes?.trim() ?? '')
    }
  }, [rejectOpen, takeoff.rejectionNotes])

  if (status !== 'pending_review' && status !== 'approved' && status !== 'rejected') {
    return null
  }

  const submittedLabel = formatReviewTimestamp(takeoff.submittedForReviewAt)
  const approvedLabel = formatReviewTimestamp(takeoff.approvedAt)
  const rejectedLabel = formatReviewTimestamp(takeoff.rejectedAt)

  const bannerClass =
    status === 'pending_review'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
      : status === 'approved'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100'
        : 'border-red-500/40 bg-red-500/10 text-red-950 dark:text-red-100'

  return (
    <>
      <div className={cn('rounded-lg border px-4 py-4 space-y-3', bannerClass)}>
        {status === 'pending_review' ? (
          <>
            <p className="text-sm font-medium">
              Submitted for review
              {submittedLabel ? ` · ${submittedLabel}` : ''}
            </p>
            {canReview ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy} onClick={() => void onApprove()}>
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRejectOpen(true)}
                >
                  Reject
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {status === 'approved' ? (
          <p className="text-sm font-medium">
            Approved{approvedLabel ? ` · ${approvedLabel}` : ''}
          </p>
        ) : null}

        {status === 'rejected' ? (
          <>
            <p className="text-sm font-medium">
              Sent back for changes{rejectedLabel ? ` · ${rejectedLabel}` : ''}
            </p>
            {takeoff.rejectionNotes?.trim() ? (
              <p className="text-sm whitespace-pre-wrap">{takeoff.rejectionNotes.trim()}</p>
            ) : null}
            {canReview ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onApprove()}>
                Mark approved
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send back for changes</DialogTitle>
            <DialogDescription>
              Tell the field measurer what needs to be revised. Notes are required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="field-reject-notes">Notes for measurer</Label>
            <Textarea
              id="field-reject-notes"
              rows={4}
              value={rejectNotes}
              disabled={busy}
              placeholder="Describe what needs to change…"
              onChange={(e) => setRejectNotes(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !rejectNotes.trim()}
              onClick={() => {
                void (async () => {
                  await onReject(rejectNotes.trim())
                  setRejectOpen(false)
                })()
              }}
            >
              Send back for changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export { formatReviewTimestamp }
