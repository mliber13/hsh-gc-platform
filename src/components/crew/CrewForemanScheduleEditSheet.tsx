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
import type { CrewProjectScheduleEntry } from '@/types/crew'
import type { DrywallScheduleItemStatus } from '@/services/scheduleService'
import {
  applyForemanScheduleEdit,
  fetchForemanTeamRoster,
  previewForemanScheduleEdit,
} from '@/services/foremanScheduleService'
import type { ForemanPredecessorConflict } from '@/lib/drywall/foremanScheduleEdit'

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
  const [roster, setRoster] = useState<AssignedPersonOption[]>([])
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<ForemanPredecessorConflict | null>(null)
  const [cascadeLines, setCascadeLines] = useState<string[]>([])

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
    setConflict(null)
    setCascadeLines([])
  }, [open, entry])

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
          <AssignedPersonsPicker
            value={assignedPersons}
            onChange={setAssignedPersons}
            options={roster}
            label="Assigned persons"
          />

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
