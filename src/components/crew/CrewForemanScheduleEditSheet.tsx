import { useEffect, useMemo, useRef, useState } from 'react'
import { parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { addWorkdays } from '@/lib/scheduleDateMath'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
import { cn } from '@/lib/utils'
import type { CrewProjectScheduleEntry } from '@/types/crew'
import {
  fetchScheduleItemsForDrywallProject,
  type DrywallProjectScheduleItem,
  type DrywallScheduleItemStatus,
  type ScheduleItemTask,
} from '@/services/scheduleService'
import {
  applyForemanScheduleEdit,
  fetchForemanTeamRoster,
  previewForemanScheduleEdit,
} from '@/services/foremanScheduleService'
import type { ForemanPredecessorConflict } from '@/lib/drywall/foremanScheduleEdit'

function formatDateRange(start: string, end: string): string {
  return start === end ? start : `${start} → ${end}`
}

const STATUS_OPTIONS: Array<{ value: DrywallScheduleItemStatus; label: string }> = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'delayed', label: 'Delayed' },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  entry: CrewProjectScheduleEntry | null
  onSaved: () => void
}

export function CrewForemanScheduleEditSheet({
  open,
  onOpenChange,
  projectId,
  entry,
  onSaved,
}: Props) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState<DrywallScheduleItemStatus>('not-started')
  const [assignedPersons, setAssignedPersons] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [roster, setRoster] = useState<AssignedPersonOption[]>([])
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<ForemanPredecessorConflict | null>(null)
  const [cascadeLines, setCascadeLines] = useState<string[]>([])
  const [siblings, setSiblings] = useState<DrywallProjectScheduleItem[]>([])
  const [predecessorIds, setPredecessorIds] = useState<string[]>([])
  const [lagWorkDays, setLagWorkDays] = useState(1)
  const [predOpen, setPredOpen] = useState(false)
  const [predSearch, setPredSearch] = useState('')
  const predsTouchedRef = useRef(false)
  const [tasks, setTasks] = useState<ScheduleItemTask[]>([])

  useEffect(() => {
    if (!open || !entry) return
    setStartDate(entry.startDate)
    setEndDate(entry.endDate)
    setStatus(
      (['not-started', 'in-progress', 'complete', 'delayed'] as const).includes(
        entry.status as DrywallScheduleItemStatus,
      )
        ? (entry.status as DrywallScheduleItemStatus)
        : 'not-started',
    )
    setAssignedPersons(entry.assignedPersons ?? [])
    setNotes(entry.notes ?? '')
    setConflict(null)
    setCascadeLines([])
    setPredOpen(false)
    setPredSearch('')
    predsTouchedRef.current = false
  }, [open, entry])

  // Load sibling items (for the predecessor picker) and seed the current item's links.
  useEffect(() => {
    if (!open || !entry) return
    let cancelled = false
    void fetchScheduleItemsForDrywallProject(projectId)
      .then((rows) => {
        if (cancelled) return
        setSiblings(rows)
        const current = rows.find((r) => r.id === entry.id)
        setPredecessorIds(current?.predecessor_ids ?? [])
        setLagWorkDays(current?.lag_work_days ?? 1)
        setTasks(current?.tasks ?? [])
      })
      .catch(() => {
        if (!cancelled) setSiblings([])
      })
    return () => {
      cancelled = true
    }
  }, [open, entry, projectId])

  const predecessorOptions = useMemo(
    () => siblings.filter((item) => item.id !== entry?.id),
    [siblings, entry?.id],
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

  const togglePredecessor = (id: string) => {
    predsTouchedRef.current = true
    setPredecessorIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    )
  }

  // Foreman edits checklist labels only; new tasks are plain check-off steps.
  // payLinked / progressMode / pieceKey on existing (office-set) tasks are preserved.
  const addTask = () => {
    setTasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: '', payLinked: false, progressMode: 'check' },
    ])
  }
  const updateTaskLabel = (id: string, label: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, label } : t)))
  }
  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  // When the foreman changes predecessors/lag, move this item to just after them
  // (same as the operator dialog) so it "just flows" instead of tripping the
  // Detach/Shift conflict prompt on save. Skips the initial seed on open.
  useEffect(() => {
    if (!open || !predsTouchedRef.current || predecessorIds.length === 0) return
    let maxStart: Date | null = null
    for (const predId of predecessorIds) {
      const pred = siblings.find((s) => s.id === predId)
      if (!pred) continue
      const candidate =
        lagWorkDays === 0
          ? parseISO(pred.end_date)
          : addWorkdays(parseISO(pred.end_date), lagWorkDays)
      if (!maxStart || candidate > maxStart) maxStart = candidate
    }
    if (!maxStart) return
    const duration = siblings.find((s) => s.id === entry?.id)?.duration ?? 1
    setStartDate(maxStart.toISOString().slice(0, 10))
    setEndDate(addWorkdays(maxStart, Math.max(0, duration - 1)).toISOString().slice(0, 10))
  }, [open, predecessorIds, lagWorkDays, siblings, entry?.id])

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

  const draft = () => ({
    startDate,
    endDate: endDate || startDate,
    status,
    assignedPersons,
    notes,
    predecessorIds,
    lagWorkDays,
    tasks: tasks
      .map((t) => ({ ...t, label: t.label.trim() }))
      .filter((t) => t.label.length > 0),
  })

  const runPreview = async (resolveConflict?: 'detach' | 'shift') => {
    if (!entry) return null
    const { preview } = await previewForemanScheduleEdit(
      projectId,
      entry.id,
      draft(),
      resolveConflict,
    )
    if (preview.conflict) {
      setConflict(preview.conflict)
      setCascadeLines([])
      return preview
    }
    setConflict(null)
    setCascadeLines(
      preview.changes
        .filter((c) => c.itemId !== entry.id)
        .map(
          (c) =>
            `${c.name}: ${c.oldStartDate} → ${c.newStartDate}`,
        ),
    )
    return preview
  }

  const handleSave = async () => {
    if (!entry || !startDate) {
      toast.error('Start date is required')
      return
    }
    setSaving(true)
    try {
      const preview = await runPreview()
      if (preview?.conflict) {
        return
      }
      const result = await applyForemanScheduleEdit(projectId, entry.id, draft())
      const moved = result.changes.filter((c) => c.itemId !== entry.id).length
      toast.success(
        moved > 0
          ? `Schedule updated — ${moved} dependent item${moved === 1 ? '' : 's'} shifted`
          : 'Schedule updated',
      )
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save schedule')
    } finally {
      setSaving(false)
    }
  }

  const handleDetach = async () => {
    if (!entry) return
    setSaving(true)
    try {
      await applyForemanScheduleEdit(projectId, entry.id, draft(), 'detach')
      toast.success('Detached predecessor and saved')
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const handleShift = async () => {
    if (!entry || !conflict?.predecessor) return
    setSaving(true)
    try {
      await applyForemanScheduleEdit(projectId, entry.id, draft(), 'shift')
      toast.success('Shifted predecessor and saved')
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto sm:max-w-lg sm:mx-auto">
        <SheetHeader>
          <SheetTitle>{entry?.name ?? 'Edit schedule item'}</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ff-start">Start date</Label>
            <Input
              id="ff-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ff-end">End date</Label>
            <Input
              id="ff-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
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

          <div className="grid gap-1.5">
            <Label>Depends on (predecessors)</Label>
            <Popover open={predOpen} onOpenChange={setPredOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate text-muted-foreground">
                    {predecessorIds.length === 0 ? 'None' : `${predecessorIds.length} selected`}
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
                      No other items on this job.
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
                            <span className="text-xs text-muted-foreground">
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

            {predecessorIds.length > 0 ? (
              <div className="space-y-2">
                {predecessorIds.map((id) => {
                  const pred = siblings.find((s) => s.id === id)
                  return (
                    <div
                      key={id}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-2',
                        pred ? 'bg-muted/30' : 'border-amber-500/40 bg-amber-500/10',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        {pred ? (
                          <>
                            <p className="truncate text-sm font-medium">{pred.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDateRange(pred.start_date, pred.end_date)}
                            </p>
                          </>
                        ) : (
                          <p className="truncate text-sm font-medium text-amber-800 dark:text-amber-200">
                            Removed item
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="rounded-full p-1 hover:bg-muted"
                        onClick={() => togglePredecessor(id)}
                        aria-label="Remove predecessor"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )
                })}
                <div className="grid gap-1.5">
                  <Label htmlFor="ff-lag">Lag (work days after predecessor ends)</Label>
                  <Input
                    id="ff-lag"
                    type="number"
                    min={0}
                    step={1}
                    value={lagWorkDays}
                    onChange={(e) => {
                      predsTouchedRef.current = true
                      setLagWorkDays(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <AssignedPersonsPicker
            value={assignedPersons}
            onChange={setAssignedPersons}
            options={roster}
            label="Assigned persons"
          />
          <div className="grid gap-1.5">
            <Label htmlFor="ff-edit-notes">Notes</Label>
            <Textarea
              id="ff-edit-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for the crew (e.g. top-out only, bring extra 5/8)"
            />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Checklist</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={addTask}
              >
                <Plus className="size-3.5" />
                Add task
              </Button>
            </div>
            {tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Optional steps the crew checks off (e.g. Tape, Bed, Skim).
              </p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2"
                  >
                    <Input
                      value={task.label}
                      placeholder="Task name"
                      onChange={(e) => updateTaskLabel(task.id, e.target.value)}
                      className="h-8 flex-1"
                    />
                    {task.payLinked ? (
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                        Pay
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-full p-1 hover:bg-muted"
                      onClick={() => removeTask(task.id)}
                      aria-label="Remove task"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cascadeLines.length > 0 ? (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
              <p className="font-semibold text-sky-900 dark:text-sky-100">
                Downstream items will move
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                {cascadeLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {conflict ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                Predecessor would override your date
              </p>
              <p className="mt-1 text-muted-foreground">
                You set start to <span className="font-medium">{conflict.draft.startDate}</span>,
                but the cascade would set it to{' '}
                <span className="font-medium">{conflict.predictedStart}</span>
                {conflict.predecessor
                  ? ` based on ${conflict.predecessor.name}.`
                  : ' based on its predecessors.'}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                <strong>Detach</strong> removes the predecessor link.{' '}
                <strong>Shift predecessor</strong> moves the predecessor earlier so this item
                lands on your date.
              </p>
            </div>
          ) : null}
        </div>
        <SheetFooter className="flex-col gap-2 sm:flex-col">
          {conflict ? (
            <>
              <Button type="button" variant="outline" onClick={() => setConflict(null)} disabled={saving}>
                Cancel conflict
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleDetach()} disabled={saving}>
                Detach
              </Button>
              <Button
                type="button"
                onClick={() => void handleShift()}
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
              <Button
                type="button"
                variant="outline"
                onClick={() => void runPreview().catch((e) => toast.error(e instanceof Error ? e.message : 'Preview failed'))}
                disabled={saving || !startDate}
              >
                Preview cascade
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving || !startDate}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
