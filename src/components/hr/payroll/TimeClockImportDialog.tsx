import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PayrollTimeImportRow } from '@/types/hr'

interface TimeClockImportDialogProps {
  open: boolean
  defaultStart: string
  defaultEnd: string
  loading: boolean
  rows: PayrollTimeImportRow[]
  onOpenChange: (open: boolean) => void
  onLoadPreview: (start: string, end: string) => void
  onConfirm: (start: string, end: string) => void
}

export function TimeClockImportDialog({
  open,
  defaultStart,
  defaultEnd,
  loading,
  rows,
  onOpenChange,
  onLoadPreview,
  onConfirm,
}: TimeClockImportDialogProps) {
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)

  useEffect(() => {
    if (!open) return
    setStart(defaultStart)
    setEnd(defaultEnd)
  }, [open, defaultStart, defaultEnd])

  const totalHours = useMemo(
    () => rows.reduce((sum, row) => sum + row.hours, 0),
    [rows],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from TimeClock</DialogTitle>
          <DialogDescription>
            Preview aggregated hours by person and project, then import into this payroll run.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44">
            <Label htmlFor="import-start">Start date</Label>
            <Input
              id="import-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="min-w-44">
            <Label htmlFor="import-end">End date</Label>
            <Input
              id="import-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            disabled={loading || !start || !end || start > end}
            onClick={() => onLoadPreview(start, end)}
          >
            {loading ? 'Loading…' : 'Refresh preview'}
          </Button>
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2">
          {rows.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No closed hours in this date range.</p>
          ) : (
            rows.map((row, idx) => (
              <div
                key={`${row.personType}-${row.personId}-${row.projectId ?? 'none'}-${idx}`}
                className="flex items-center justify-between rounded border p-2 text-sm"
              >
                <div>
                  <p className="font-medium">{row.personName}</p>
                  <p className="text-xs text-muted-foreground">{row.projectName || 'Unassigned'}</p>
                </div>
                <p className="font-medium tabular-nums">{row.hours.toFixed(2)} hrs</p>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground">Preview total: {totalHours.toFixed(2)} hrs</p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(start, end)}
            disabled={loading || rows.length === 0 || !start || !end || start > end}
          >
            Import hours
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
