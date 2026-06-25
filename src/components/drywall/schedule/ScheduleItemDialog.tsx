import { useEffect, useMemo, useRef, useState } from 'react'
import { parseISO } from 'date-fns'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { addWorkdays, cascadeSchedule, workdaysBetween } from '@/lib/scheduleDateMath'
import type { ScheduleItem } from '@/types'
import { cn } from '@/lib/utils'
import { AssignedPersonsPicker } from '@/components/schedule/AssignedPersonsPicker'
import {
  DrywallScheduleCascadeError,
  createScheduleItemForDrywallProject,
  updateScheduleItemForDrywallProject,
  type DrywallProjectScheduleItem,
  type DrywallScheduleItemStatus,
  type NewScheduleItemInput,
} from '@/services/scheduleService'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  siblingItems: DrywallProjectScheduleItem[]
  editing: DrywallProjectScheduleItem | null
  onSaved: () => void
}

const STATUS_OPTIONS: { value: DrywallScheduleItemStatus; label: string }[] = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'delayed', label: 'Delayed' },
]

function formatDateRange(start: string, end: string): string {
  if (start === end) return start
  return `${start} → ${end}`
}

export function ScheduleItemDialog({
  open,
  onOpenChange,
  projectId,
  siblingItems,
  editing,
  onSaved,
}: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'field' | 'office'>('field')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [workDays, setWorkDays] = useState(1)
  const [status, setStatus] = useState<DrywallScheduleItemStatus>('not-started')
  const [notes, setNotes] = useState('')
  const [assignedPersons, setAssignedPersons] = useState<string[]>([])
  const [predecessorIds, setPredecessorIds] = useState<string[]>([])
  const [lagWorkDays, setLagWorkDays] = useState(1)
  const [predOpen, setPredOpen] = useState(false)
  const [predSearch, setPredSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const hasUserEditedPredecessorsRef = useRef(false)
  // Conflict state — set when cascade prediction would override user's chosen start date.
  const [conflict, setConflict] = useState<{
    predictedStart: string
    predecessor: DrywallProjectScheduleItem | null  // null when multiple predecessors (shift disabled)
    payload: NewScheduleItemInput
  } | null>(null)

  const predecessorOptions = useMemo(
    () => siblingItems.filter((item) => item.id !== editing?.id),
    [siblingItems, editing?.id],
  )

  const filteredPredecessors = useMemo(() => {
    const q = predSearch.trim().toLowerCase()
    if (!q) return predecessorOptions
    return predecessorOptions.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.start_date.includes(q) ||
        item.end_date.includes(q),
    )
  }, [predecessorOptions, predSearch])

  useEffect(() => {
    if (!open) return
    hasUserEditedPredecessorsRef.current = false
    if (editing) {
      setName(editing.name)
      setType(editing.type)
      setStartDate(editing.start_date)
      setEndDate(editing.end_date)
      setWorkDays(
        Math.max(1, workdaysBetween(parseISO(editing.start_date), parseISO(editing.end_date))),
      )
      setStatus(editing.status)
      setNotes(editing.notes ?? '')
      setAssignedPersons(editing.assigned_persons)
      setPredecessorIds(editing.predecessor_ids)
      setLagWorkDays(editing.lag_work_days)
    } else {
      const today = new Date().toISOString().slice(0, 10)
      setName('')
      setType('field')
      setStartDate(today)
      setEndDate(today)
      setWorkDays(1)
      setStatus('not-started')
      setNotes('')
      setAssignedPersons([])
      setPredecessorIds([])
      setLagWorkDays(1)
    }
    setPredSearch('')
    setConflict(null)
  }, [open, editing])

  // Preview cascade only when the user changes predecessors/lag in-dialog — not on initial open of an
  // existing item (which would clobber the cascade-saved start_date). Match the service semantic:
  // lag=0 = same start day as predecessor; lag>=1 = N work days after predecessor end (no +1 gap).
  useEffect(() => {
    if (!open || predecessorIds.length === 0) return
    // Skip on initial open when editing an existing item — saved date is already correct.
    if (editing && !hasUserEditedPredecessorsRef.current) return

    let maxStart: Date | null = null
    for (const predId of predecessorIds) {
      const pred = siblingItems.find((item) => item.id === predId)
      if (!pred) continue
      const candidate =
        lagWorkDays === 0
          ? parseISO(pred.end_date)
          : addWorkdays(parseISO(pred.end_date), lagWorkDays)
      if (!maxStart || candidate > maxStart) maxStart = candidate
    }
    if (maxStart) {
      const iso = maxStart.toISOString().slice(0, 10)
      setStartDate(iso)
      // Preserve workDays — recompute end based on the cascaded start + current workDays.
      const newEnd = addWorkdays(maxStart, Math.max(0, workDays - 1))
      setEndDate(newEnd.toISOString().slice(0, 10))
    }
  }, [open, predecessorIds, lagWorkDays, siblingItems, editing, workDays])

  const togglePredecessor = (id: string) => {
    hasUserEditedPredecessorsRef.current = true
    setPredecessorIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    )
  }

  // Two-way binding: start + workDays → end; end + start → workDays; start change preserves workDays.
  const handleStartDateChange = (value: string) => {
    setStartDate(value)
    if (!value) return
    const start = parseISO(value)
    const newEnd = addWorkdays(start, Math.max(0, workDays - 1))
    setEndDate(newEnd.toISOString().slice(0, 10))
  }

  const handleWorkDaysChange = (value: number) => {
    setWorkDays(value)
    if (!startDate) return
    const start = parseISO(startDate)
    const newEnd = addWorkdays(start, Math.max(0, value - 1))
    setEndDate(newEnd.toISOString().slice(0, 10))
  }

  const handleEndDateChange = (value: string) => {
    setEndDate(value)
    if (!value || !startDate) return
    const start = parseISO(startDate)
    const end = parseISO(value)
    if (end < start) return
    setWorkDays(Math.max(1, workdaysBetween(start, end)))
  }

  const handleLagChange = (value: number) => {
    hasUserEditedPredecessorsRef.current = true
    setLagWorkDays(value)
  }

  /** Convert a sibling to the ScheduleItem model used by cascadeSchedule. */
  const toModel = (item: DrywallProjectScheduleItem): ScheduleItem => ({
    id: item.id,
    scheduleId: item.schedule_id,
    type: item.type,
    name: item.name,
    startDate: parseISO(item.start_date),
    endDate: parseISO(item.end_date),
    duration: item.duration,
    predecessorIds: item.predecessor_ids,
    predecessors: item.predecessor_ids.map((predecessorId) => ({
      predecessorId,
      lagDays: item.lag_work_days,
    })),
    status: item.status,
    percentComplete: item.status === 'complete' ? 100 : 0,
    confirmation_status: 'unsent',
    assignedPersons: item.assigned_persons,
    assignedCompanyId: item.assigned_company_id,
    assignedTo: [],
    notes: item.notes ?? undefined,
  })

  /**
   * Run cascade locally to predict what start date the system would assign,
   * given the draft + current siblings. Returns predicted ISO date string.
   */
  const predictCascadeStart = (payload: NewScheduleItemInput): string => {
    const draftId = editing?.id ?? '__DRAFT__'
    const draftDuration = Math.max(1, workDays)
    const draftPredecessorIds = payload.predecessorIds ?? []
    const draftLag = payload.lagWorkDays ?? 0
    const draftStatus = payload.status ?? 'not-started'
    const models: ScheduleItem[] = []

    for (const sibling of siblingItems) {
      if (sibling.id === draftId) continue
      models.push(toModel(sibling))
    }

    models.push({
      id: draftId,
      scheduleId: editing?.schedule_id ?? '',
      type: payload.type,
      name: payload.name,
      startDate: parseISO(payload.startDate),
      endDate: parseISO(payload.endDate),
      duration: draftDuration,
      predecessorIds: draftPredecessorIds,
      predecessors: draftPredecessorIds.map((id) => ({
        predecessorId: id,
        lagDays: draftLag,
      })),
      status: draftStatus,
      percentComplete: draftStatus === 'complete' ? 100 : 0,
      confirmation_status: 'unsent',
      assignedPersons: payload.assignedPersons ?? [],
      assignedCompanyId: null,
      assignedTo: [],
      notes: payload.notes ?? undefined,
    })

    const result = cascadeSchedule(models, { lagSemantic: 'parallel-zero' })
    const cascaded = result.items.find((i) => i.id === draftId)
    if (!cascaded) return payload.startDate
    return cascaded.startDate.toISOString().slice(0, 10)
  }

  const buildPayload = (): NewScheduleItemInput | null => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Name is required')
      return null
    }
    if (!startDate) {
      toast.error('Start date is required')
      return null
    }
    return {
      name: trimmed,
      type,
      startDate,
      endDate: endDate || startDate,
      status,
      notes,
      assignedPersons,
      predecessorIds,
      lagWorkDays,
    }
  }

  const persistPayload = async (payload: NewScheduleItemInput) => {
    if (editing) {
      await updateScheduleItemForDrywallProject(editing.id, payload)
      toast.success('Schedule item updated')
    } else {
      await createScheduleItemForDrywallProject(projectId, payload)
      toast.success('Schedule item added')
    }
    onSaved()
    onOpenChange(false)
  }

  const handleSave = async () => {
    const payload = buildPayload()
    if (!payload) return

    // Predict cascade — if it overrides the user's chosen start, surface conflict prompt.
    const draftPredecessorIds = payload.predecessorIds ?? []
    if (editing && draftPredecessorIds.length > 0) {
      const predicted = predictCascadeStart(payload)
      if (predicted !== payload.startDate) {
        const predOnly =
          draftPredecessorIds.length === 1
            ? siblingItems.find((s) => s.id === draftPredecessorIds[0]) ?? null
            : null
        setConflict({ predictedStart: predicted, predecessor: predOnly, payload })
        return
      }
    }

    setSaving(true)
    try {
      await persistPayload(payload)
    } catch (e) {
      if (e instanceof DrywallScheduleCascadeError) {
        toast.warning(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to save schedule item')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDetach = async () => {
    if (!conflict) return
    const detachedPayload: NewScheduleItemInput = {
      ...conflict.payload,
      predecessorIds: [],
    }
    setSaving(true)
    try {
      await persistPayload(detachedPayload)
      setConflict(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleShiftPredecessor = async () => {
    if (!conflict || !conflict.predecessor) return
    const pred = conflict.predecessor
    const userStart = parseISO(conflict.payload.startDate)

    // For lag=0: predecessor.endDate = userStart. For lag>0: predecessor.endDate = workdays-before(userStart, lag).
    const lag = conflict.payload.lagWorkDays ?? 0
    const newPredEnd = lag === 0 ? userStart : addWorkdays(userStart, -lag)
    const newPredStart = addWorkdays(newPredEnd, -(pred.duration - 1))

    const isoDate = (d: Date) => d.toISOString().slice(0, 10)
    const predPayload: NewScheduleItemInput = {
      name: pred.name,
      type: pred.type,
      startDate: isoDate(newPredStart),
      endDate: isoDate(newPredEnd),
      status: pred.status,
      notes: pred.notes ?? '',
      assignedPersons: pred.assigned_persons,
      predecessorIds: pred.predecessor_ids,
      lagWorkDays: pred.lag_work_days,
    }

    setSaving(true)
    try {
      // Shift the predecessor first — cascade fires, current item will move to the user's intended start.
      await updateScheduleItemForDrywallProject(pred.id, predPayload)
      // Then persist any non-date edits on the current item (dates will match cascade result).
      await persistPayload(conflict.payload)
      setConflict(null)
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Predecessor shifted but follow-up save failed: ${e.message}`
          : 'Failed to save',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleConflictCancel = () => setConflict(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit schedule item' : 'Add schedule item'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="schedule-item-name">Name</Label>
            <Input
              id="schedule-item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hang Main Floor"
            />
          </div>

          <div className="space-y-1.5">
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

          <div className="space-y-1.5">
            <Label>Predecessors</Label>
            <Popover open={predOpen} onOpenChange={setPredOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate text-muted-foreground">
                    {predecessorIds.length === 0
                      ? 'None'
                      : `${predecessorIds.length} selected`}
                  </span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(100vw-2rem,24rem)] p-0" align="start">
                <div className="border-b p-2">
                  <Input
                    placeholder="Search items…"
                    value={predSearch}
                    onChange={(e) => setPredSearch(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto p-1">
                  {filteredPredecessors.length === 0 ? (
                    <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No other items on this project.
                    </p>
                  ) : (
                    filteredPredecessors.map((item) => {
                      const selected = predecessorIds.includes(item.id)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={cn(
                            'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted',
                            selected && 'bg-muted/60',
                          )}
                          onClick={() => togglePredecessor(item.id)}
                        >
                          <Check
                            className={cn(
                              'mt-0.5 size-4 shrink-0',
                              selected ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{item.name}</span>
                            <span className="text-muted-foreground text-xs">
                              {formatDateRange(item.start_date, item.end_date)}
                            </span>
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schedule-lag">Lag (work days after predecessor end)</Label>
            <Input
              id="schedule-lag"
              type="number"
              min={0}
              step={1}
              value={lagWorkDays}
              onChange={(e) => handleLagChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-start">Start date</Label>
              <Input
                id="schedule-start"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-workdays">Work days</Label>
              <Input
                id="schedule-workdays"
                type="number"
                min={1}
                value={workDays}
                onChange={(e) =>
                  handleWorkDaysChange(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-end">End date</Label>
              <Input
                id="schedule-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
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

          <AssignedPersonsPicker value={assignedPersons} onChange={setAssignedPersons} />

          <div className="space-y-1.5">
            <Label htmlFor="schedule-notes">Notes</Label>
            <Textarea
              id="schedule-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for crew or office"
            />
          </div>
        </div>

        {conflict ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              Predecessor would override your date
            </p>
            <p className="mt-1 text-muted-foreground">
              You set start to <span className="font-medium">{conflict.payload.startDate}</span>,
              but the cascade would set it to{' '}
              <span className="font-medium">{conflict.predictedStart}</span>
              {conflict.predecessor
                ? ` based on ${conflict.predecessor.name} (lag ${conflict.payload.lagWorkDays ?? 0} work day${(conflict.payload.lagWorkDays ?? 0) === 1 ? '' : 's'}).`
                : ' based on its predecessors.'}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Detach</strong> removes the predecessor link.{' '}
              <strong>Shift predecessor</strong> moves the predecessor earlier so this item lands on your date.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          {conflict ? (
            <>
              <Button type="button" variant="outline" onClick={handleConflictCancel} disabled={saving}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDetach()}
                disabled={saving}
              >
                Detach
              </Button>
              <Button
                type="button"
                onClick={() => void handleShiftPredecessor()}
                disabled={saving || !conflict.predecessor}
                title={
                  conflict.predecessor
                    ? undefined
                    : 'Shift is only available with a single predecessor'
                }
              >
                {saving ? 'Saving…' : 'Shift predecessor'}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
