import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { fetchForemanTeamRoster } from '@/services/foremanScheduleService'
import type { AssignedPersonOption } from '@/components/schedule/AssignedPersonsPicker'
import {
  addPersonUnavailability,
  deletePersonUnavailability,
  fetchPersonUnavailability,
  type ScheduleUnavailability,
} from '@/services/personUnavailabilityService'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after any add/delete so the calendar can refresh. */
  onChanged: () => void
}

export function TimeOffManagerSheet({ open, onOpenChange, onChanged }: Props) {
  const [roster, setRoster] = useState<AssignedPersonOption[]>([])
  const [entries, setEntries] = useState<ScheduleUnavailability[]>([])
  const [personId, setPersonId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [people, timeOff] = await Promise.all([
      fetchForemanTeamRoster().catch(() => []),
      fetchPersonUnavailability().catch(() => []),
    ])
    setRoster(people)
    setEntries(timeOff)
  }

  useEffect(() => {
    if (!open) return
    const today = new Date().toISOString().slice(0, 10)
    setPersonId('')
    setStartDate(today)
    setEndDate(today)
    setReason('')
    void load()
  }, [open])

  const handleStartChange = (value: string) => {
    setStartDate(value)
    if (value && (!endDate || endDate < value)) setEndDate(value)
  }

  const handleAdd = async () => {
    if (!personId) {
      toast.error('Pick a person')
      return
    }
    if (!startDate || !endDate) {
      toast.error('Pick a date range')
      return
    }
    const person = roster.find((r) => r.id === personId)
    setSaving(true)
    try {
      await addPersonUnavailability({
        personId,
        personName: person?.name ?? 'Crew member',
        startDate,
        endDate,
        reason,
      })
      toast.success('Time off added')
      setPersonId('')
      setReason('')
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add time off')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deletePersonUnavailability(id)
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  const fmt = (d: string) => {
    const parsed = new Date(`${d}T00:00:00`)
    return Number.isNaN(parsed.getTime())
      ? d
      : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Team time off</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-1.5">
              <Label>Person</Label>
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a person…" />
                </SelectTrigger>
                <SelectContent>
                  {roster.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="to-start">Start</Label>
                <Input
                  id="to-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartChange(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="to-end">End</Label>
                <Input
                  id="to-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to-reason">Reason (optional)</Label>
              <Input
                id="to-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Vacation, PTO, Sick…"
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={saving || !personId || !startDate}
              onClick={() => void handleAdd()}
            >
              {saving ? 'Adding…' : 'Add time off'}
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Scheduled time off</p>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              entries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.personName}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(e.startDate)} – {fmt(e.endDate)}
                      {e.reason ? ` · ${e.reason}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                    aria-label="Delete time off"
                    onClick={() => void handleDelete(e.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
