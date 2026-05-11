import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { AlertCircle, CheckCircle, Clock, PlayCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ConfirmationDot,
  confirmationStatusLabel,
} from '@/components/ConfirmationDot'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { updateScheduleItemQuickEdit } from '@/services/supabaseService'
import type { ConfirmationStatus, ScheduleItem } from '@/types'
import type { PortfolioItem } from '@/services/scheduleService'

type ScheduleStatus = PortfolioItem['status']

interface SubcontractorOption {
  id: string
  name: string
  is_internal: boolean
}

interface SchedulePortfolioItemModalProps {
  open: boolean
  onClose: () => void
  item: PortfolioItem | null
  projectName: string
  onItemUpdated: (patch: Partial<PortfolioItem>) => void
}

const STATUS_OPTIONS: Array<{ value: ScheduleStatus; label: string }> = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'delayed', label: 'Delayed' },
]

function statusLabel(status: ScheduleStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Not started'
}

function getStatusColor(status: ScheduleStatus): string {
  switch (status) {
    case 'complete':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
    case 'in-progress':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
    case 'delayed':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
    default:
      return 'bg-muted/40 text-muted-foreground border-border/60'
  }
}

function getStatusIcon(status: ScheduleStatus) {
  switch (status) {
    case 'complete':
      return <CheckCircle className="size-4" />
    case 'in-progress':
      return <PlayCircle className="size-4" />
    case 'delayed':
      return <AlertCircle className="size-4" />
    default:
      return <Clock className="size-4" />
  }
}

function toISODate(value: Date): string {
  return format(value, 'yyyy-MM-dd')
}

function syncPortfolioItem(
  current: PortfolioItem,
  updated: ScheduleItem,
  assignedCompanyName = current.assigned_company_name,
): PortfolioItem {
  return {
    ...current,
    schedule_id: updated.scheduleId,
    start_date: toISODate(updated.startDate),
    end_date: toISODate(updated.endDate),
    confirmation_status: updated.confirmation_status,
    confirmation_notes: updated.confirmation_notes ?? null,
    status: updated.status,
    assigned_company_id: updated.assignedCompanyId ?? null,
    assigned_company_name: assignedCompanyName,
    notes: updated.notes ?? null,
  }
}

export function SchedulePortfolioItemModal({
  open,
  onClose,
  item,
  projectName,
  onItemUpdated,
}: SchedulePortfolioItemModalProps) {
  const navigate = useNavigate()
  const [localItem, setLocalItem] = useState<PortfolioItem | null>(item)
  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([])

  useEffect(() => {
    setLocalItem(item)
  }, [item?.id, item])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    const loadSubcontractors = async () => {
      try {
        const { data, error } = await supabase
          .from('subcontractors')
          .select('id, name, is_internal')
          .eq('is_active', true)
          .order('is_internal', { ascending: false })
          .order('name', { ascending: true })
        if (error) throw error
        if (!cancelled) setSubcontractors((data ?? []) as SubcontractorOption[])
      } catch (error) {
        console.error('Could not load subcontractors', error)
        if (!cancelled) toast.error('Could not load subcontractors.')
      }
    }

    void loadSubcontractors()
    return () => {
      cancelled = true
    }
  }, [open])

  const subcontractorNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const subcontractor of subcontractors) {
      map.set(subcontractor.id, subcontractor.name)
    }
    return map
  }, [subcontractors])

  if (!localItem) return null

  const start = format(parseISO(localItem.start_date), 'MMM d, yyyy')
  const end = format(parseISO(localItem.end_date), 'MMM d, yyyy')

  const applySyncedItem = (
    previous: PortfolioItem,
    updated: ScheduleItem,
    assignedCompanyName?: string | null,
  ) => {
    const synced = syncPortfolioItem(previous, updated, assignedCompanyName)
    setLocalItem(synced)
    onItemUpdated(synced)
    return synced
  }

  const handleSaveConfirmation = async (next: ConfirmationStatus) => {
    const previous = localItem
    const optimistic = { ...previous, confirmation_status: next }
    setLocalItem(optimistic)
    onItemUpdated(optimistic)

    try {
      const updated = await updateScheduleItemQuickEdit(previous.id, {
        confirmation_status: next,
      })
      applySyncedItem(previous, updated)
    } catch (error) {
      setLocalItem(previous)
      onItemUpdated(previous)
      console.error('Could not update confirmation', error)
      toast.error('Could not update confirmation.')
    }
  }

  const handleSaveStatus = async (next: ScheduleStatus) => {
    const previous = localItem
    const optimistic = { ...previous, status: next }
    setLocalItem(optimistic)
    onItemUpdated(optimistic)

    try {
      const updated = await updateScheduleItemQuickEdit(previous.id, {
        status: next,
      })
      applySyncedItem(previous, updated)
    } catch (error) {
      setLocalItem(previous)
      onItemUpdated(previous)
      console.error('Could not update item status', error)
      toast.error('Could not update item status.')
    }
  }

  const handleSaveDates = async (
    nextStartDate: string,
    nextEndDate: string,
  ) => {
    const previous = localItem
    const optimistic = {
      ...previous,
      start_date: nextStartDate,
      end_date: nextEndDate,
    }
    setLocalItem(optimistic)
    onItemUpdated(optimistic)

    if (!nextStartDate || !nextEndDate) return
    if (nextEndDate < nextStartDate) {
      toast.warning('End date must be on or after start date.')
      return
    }
    if (
      nextStartDate === previous.start_date &&
      nextEndDate === previous.end_date
    ) {
      return
    }

    try {
      const updated = await updateScheduleItemQuickEdit(previous.id, {
        start_date: nextStartDate,
        end_date: nextEndDate,
      })
      applySyncedItem(previous, updated)
    } catch (error) {
      setLocalItem(previous)
      onItemUpdated(previous)
      console.error('Could not update item dates', error)
      toast.error('Could not update item dates.')
    }
  }

  const handleSaveAssignedCompany = async (value: string) => {
    const previous = localItem
    const assignedCompanyId = value === 'none' ? null : value
    const assignedCompanyName = assignedCompanyId
      ? subcontractorNameById.get(assignedCompanyId) ?? null
      : null
    const optimistic = {
      ...previous,
      assigned_company_id: assignedCompanyId,
      assigned_company_name: assignedCompanyName,
    }
    setLocalItem(optimistic)
    onItemUpdated(optimistic)

    try {
      const updated = await updateScheduleItemQuickEdit(previous.id, {
        assigned_company_id: assignedCompanyId,
      })
      applySyncedItem(previous, updated, assignedCompanyName)
    } catch (error) {
      setLocalItem(previous)
      onItemUpdated(previous)
      console.error('Could not update assigned company', error)
      toast.error('Could not update assigned company.')
    }
  }

  const handleSaveTextField = async (
    field: 'confirmation_notes' | 'notes',
    rawValue: string,
  ) => {
    const previous = localItem
    const nextValue = rawValue.trim().length > 0 ? rawValue : null
    if ((previous[field] ?? null) === nextValue) return

    const optimistic = { ...previous, [field]: nextValue }
    setLocalItem(optimistic)
    onItemUpdated(optimistic)

    try {
      const updated = await updateScheduleItemQuickEdit(previous.id, {
        [field]: nextValue,
      })
      applySyncedItem(previous, updated)
      toast.success(field === 'notes' ? 'Notes updated' : 'Confirmation notes updated')
    } catch (error) {
      setLocalItem(previous)
      onItemUpdated(previous)
      console.error(`Could not update ${field}`, error)
      toast.error(field === 'notes' ? 'Could not update notes.' : 'Could not update confirmation notes.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{localItem.name}</DialogTitle>
          <DialogDescription>{projectName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-sm">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <ConfirmationDot
                status={localItem.confirmation_status}
                size="md"
                onChange={handleSaveConfirmation}
              />
              <span className="text-foreground">
                {confirmationStatusLabel(localItem.confirmation_status)}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`confirmation-notes-${localItem.id}`}>
                Confirmation notes
              </Label>
              <Textarea
                key={`confirmation-notes-${localItem.id}`}
                id={`confirmation-notes-${localItem.id}`}
                defaultValue={localItem.confirmation_notes ?? ''}
                onBlur={(event) =>
                  void handleSaveTextField(
                    'confirmation_notes',
                    event.currentTarget.value,
                  )
                }
                placeholder="Add confirmation notes..."
                className="min-h-20"
              />
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`status-${localItem.id}`}>Status</Label>
              <Select
                value={localItem.status}
                onValueChange={(value) => void handleSaveStatus(value as ScheduleStatus)}
              >
                <SelectTrigger id={`status-${localItem.id}`}>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                      getStatusColor(localItem.status),
                    )}
                  >
                    {getStatusIcon(localItem.status)}
                    {statusLabel(localItem.status)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`assigned-company-${localItem.id}`}>
                Assigned company
              </Label>
              <Select
                value={localItem.assigned_company_id ?? 'none'}
                onValueChange={(value) => void handleSaveAssignedCompany(value)}
              >
                <SelectTrigger id={`assigned-company-${localItem.id}`}>
                  <span className="truncate">
                    {localItem.assigned_company_name ?? 'Unassigned'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {subcontractors.map((subcontractor) => (
                    <SelectItem key={subcontractor.id} value={subcontractor.id}>
                      {subcontractor.name}
                      {subcontractor.is_internal ? ' (internal)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dates
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`start-date-${localItem.id}`}>Start</Label>
                <Input
                  id={`start-date-${localItem.id}`}
                  type="date"
                  value={localItem.start_date}
                  onChange={(event) =>
                    void handleSaveDates(event.target.value, localItem.end_date)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`end-date-${localItem.id}`}>End</Label>
                <Input
                  id={`end-date-${localItem.id}`}
                  type="date"
                  value={localItem.end_date}
                  onChange={(event) =>
                    void handleSaveDates(localItem.start_date, event.target.value)
                  }
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {start} – {end}
            </div>
          </section>

          <div className="space-y-1.5">
            <Label htmlFor={`notes-${localItem.id}`}>Item notes</Label>
            <Textarea
              key={`notes-${localItem.id}`}
              id={`notes-${localItem.id}`}
              defaultValue={localItem.notes ?? ''}
              onBlur={(event) =>
                void handleSaveTextField('notes', event.currentTarget.value)
              }
              placeholder="Add item notes..."
              className="min-h-24"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              onClose()
              navigate(`/projects/${localItem.project_id}/schedule`)
            }}
          >
            Open in project schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
