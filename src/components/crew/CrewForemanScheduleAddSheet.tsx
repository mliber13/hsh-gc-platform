import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AssignedPersonsPicker,
  type AssignedPersonOption,
} from '@/components/schedule/AssignedPersonsPicker'
import { TimeOffConflictWarning } from '@/components/schedule/TimeOffConflictWarning'
import type { DrywallScheduleItemStatus } from '@/services/scheduleService'
import {
  createForemanScheduleItem,
  fetchForemanTeamRoster,
} from '@/services/foremanScheduleService'
import { addWorkdays } from '@/lib/scheduleDateMath'
import { parseISO } from 'date-fns'

const STATUS_OPTIONS: Array<{ value: DrywallScheduleItemStatus; label: string }> = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'delayed', label: 'Delayed' },
]

export type ForemanAddSheetProject = { id: string; name: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fixed project (opened from inside a job). Omit to show a job picker. */
  projectId?: string
  /** Job options for the picker (used when projectId is omitted). */
  projects?: ForemanAddSheetProject[]
  onSaved: () => void
}

export function CrewForemanScheduleAddSheet({
  open,
  onOpenChange,
  projectId,
  projects,
  onSaved,
}: Props) {
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<'field' | 'office'>('field')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState<DrywallScheduleItemStatus>('not-started')
  const [assignedPersons, setAssignedPersons] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [roster, setRoster] = useState<AssignedPersonOption[]>([])
  const [saving, setSaving] = useState(false)

  const showJobPicker = !projectId
  const resolvedProjectId = projectId ?? selectedProjectId

  useEffect(() => {
    if (!open) return
    const today = new Date().toISOString().slice(0, 10)
    // Preselect when the picker has exactly one job; otherwise force a choice.
    setSelectedProjectId(projectId ?? (projects?.length === 1 ? projects[0].id : ''))
    setName('')
    setType('field')
    setStartDate(today)
    setEndDate(today)
    setStatus('not-started')
    setAssignedPersons([])
    setNotes('')
  }, [open, projectId, projects])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetchForemanTeamRoster()
      .then((people) => {
        if (!cancelled) setRoster(people)
      })
      .catch(() => {
        if (!cancelled) setRoster([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Keep end >= start; when start moves ahead of end, snap end to start.
  const handleStartChange = (value: string) => {
    setStartDate(value)
    if (value && (!endDate || endDate < value)) setEndDate(value)
  }

  const handleSave = async () => {
    if (!resolvedProjectId) {
      toast.error('Pick a job first')
      return
    }
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    if (!startDate) {
      toast.error('Start date is required')
      return
    }
    setSaving(true)
    try {
      await createForemanScheduleItem(resolvedProjectId, {
        name,
        type,
        startDate,
        endDate: endDate || startDate,
        status,
        assignedPersons,
        notes,
      })
      toast.success('Schedule item added')
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add schedule item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto sm:mx-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Add schedule item</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4 px-4 py-4">
          {showJobPicker ? (
            <div className="grid gap-1.5">
              <Label>Job</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a job…" />
                </SelectTrigger>
                <SelectContent>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="ff-add-name">Name</Label>
            <Input
              id="ff-add-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hang Main Floor"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'field' | 'office')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="field">Field</SelectItem>
                <SelectItem value="office">Office</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ff-add-start">Start date</Label>
              <Input
                id="ff-add-start"
                type="date"
                value={startDate}
                onChange={(e) => handleStartChange(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ff-add-end">End date</Label>
              <Input
                id="ff-add-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 5].map((days) => (
              <Button
                key={days}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={!startDate}
                onClick={() => {
                  if (!startDate) return
                  const end = addWorkdays(parseISO(startDate), days - 1)
                  setEndDate(end.toISOString().slice(0, 10))
                }}
              >
                {days} {days === 1 ? 'day' : 'days'}
              </Button>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as DrywallScheduleItemStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AssignedPersonsPicker
            value={assignedPersons}
            onChange={setAssignedPersons}
            options={roster}
            label="Assigned persons"
          />
          <TimeOffConflictWarning
            assignedPersonIds={assignedPersons}
            startDate={startDate}
            endDate={endDate}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="ff-add-notes">Notes</Label>
            <Textarea
              id="ff-add-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for the crew (e.g. top-out only, bring extra 5/8)"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            New items are standalone. To link it to another item (predecessors), ask the office —
            or set the dates directly here.
          </p>
        </div>
        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !resolvedProjectId || !name.trim() || !startDate}
          >
            {saving ? 'Adding…' : 'Add item'}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
