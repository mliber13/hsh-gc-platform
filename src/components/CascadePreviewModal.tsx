import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  CascadeRowWithSmsContext,
  SmsEligibilityReason,
} from '@/lib/scheduleCascadeDiff'

interface CascadePreviewModalProps {
  open: boolean
  onClose: () => void
  rows: CascadeRowWithSmsContext[]
  projectName: string
  onCommit: (selectedSmsItemIds: Set<string>) => Promise<void>
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

function formatDateRange(start: Date, end: Date): string {
  const startText = dateFormatter.format(start)
  const endText = dateFormatter.format(end)
  return startText === endText ? startText : `${startText} - ${endText}`
}

function ineligibleLabel(reason: SmsEligibilityReason): string {
  switch (reason) {
    case 'unassigned':
      return 'in-app only - unassigned'
    case 'no_phone':
      return 'in-app only - no phone on file'
    case 'never_published':
      return 'in-app only - never published'
    case 'beyond_horizon':
      return 'in-app only - beyond 2 wk'
    default:
      return ''
  }
}

export function CascadePreviewModal({
  open,
  onClose,
  rows,
  projectName,
  onCommit,
}: CascadePreviewModalProps) {
  const eligibleIds = useMemo(
    () =>
      rows
        .filter((row) => row.sms_eligibility === 'eligible')
        .map((row) => row.item_id),
    [rows],
  )
  const [selectedSmsItemIds, setSelectedSmsItemIds] = useState<Set<string>>(
    () => new Set(eligibleIds),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedSmsItemIds(new Set(eligibleIds))
  }, [eligibleIds])

  const selectedCount = selectedSmsItemIds.size
  const inAppOnlyCount = rows.length - selectedCount

  const toggleSelected = (itemId: string) => {
    setSelectedSmsItemIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  const handleCommit = async () => {
    setSaving(true)
    try {
      await onCommit(selectedSmsItemIds)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !saving) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border/60 bg-card text-foreground sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Schedule change preview</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {rows.length} items will move on {projectName}. Review SMS opt-out below.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border/60">
            {rows.map((row) => {
              const eligible = row.sms_eligibility === 'eligible'
              return (
                <div
                  key={row.item_id}
                  className="grid gap-3 border-b border-border/60 p-3 last:border-b-0 md:grid-cols-[1.2fr_1.2fr_1fr]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.item_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{projectName}</p>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">
                      {formatDateRange(row.old_start, row.old_end)}
                    </span>
                    <span className="px-2 text-muted-foreground">-&gt;</span>
                    <span className="font-medium">
                      {formatDateRange(row.new_start, row.new_end)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs">
                      <p className="truncate text-foreground">
                        {row.recipient_company_name ?? 'Unassigned'}
                      </p>
                      {row.recipient_phone && (
                        <p className="text-muted-foreground">{row.recipient_phone}</p>
                      )}
                    </div>
                    {eligible ? (
                      <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={selectedSmsItemIds.has(row.item_id)}
                          onChange={() => toggleSelected(row.item_id)}
                          disabled={saving}
                        />
                        SMS
                      </label>
                    ) : (
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        {ineligibleLabel(row.sms_eligibility)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-sm text-muted-foreground">
            {selectedCount} SMS will be sent (+ {inAppOnlyCount} in-app only).
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleCommit()} disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Send and commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
