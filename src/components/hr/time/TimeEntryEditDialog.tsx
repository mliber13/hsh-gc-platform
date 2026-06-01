import { useEffect, useState } from 'react'
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
import type { TimeEntry } from '@/types/hr'

interface TimeEntryEditDialogProps {
  open: boolean
  entry: TimeEntry | null
  onOpenChange: (open: boolean) => void
  onSave: (patch: { clock_in: string; clock_out: string | null }) => void
  saving: boolean
}

function localDateTime(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIsoLocal(value: string): string {
  if (!value) return ''
  return new Date(value).toISOString()
}

export function TimeEntryEditDialog({
  open,
  entry,
  onOpenChange,
  onSave,
  saving,
}: TimeEntryEditDialogProps) {
  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')

  useEffect(() => {
    if (!open || !entry) return
    setClockIn(localDateTime(entry.clock_in))
    setClockOut(localDateTime(entry.clock_out))
  }, [open, entry])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit time entry</DialogTitle>
          <DialogDescription>
            Correct missed punches or adjust times. Save applies immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="clock-in-time">Clock in</Label>
            <Input
              id="clock-in-time"
              type="datetime-local"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clock-out-time">Clock out (optional)</Label>
            <Input
              id="clock-out-time"
              type="datetime-local"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({
                clock_in: toIsoLocal(clockIn),
                clock_out: clockOut ? toIsoLocal(clockOut) : null,
              })
            }
            disabled={saving || !clockIn}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
