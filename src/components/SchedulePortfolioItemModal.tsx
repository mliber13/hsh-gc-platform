import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
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
import { CascadePreviewModal } from '@/components/CascadePreviewModal'
import { cascadeSchedule } from '@/lib/scheduleDateMath'
import { fetchCascadeDateMathOptions } from '@/services/calendarConfigService'
import {
  classifySmsEligibility,
  computeCascadeDiff,
  type CascadeRowWithSmsContext,
} from '@/lib/scheduleCascadeDiff'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { fetchCommsForScheduleItem } from '@/services/communicationLogService'
import {
  fetchScheduleByProjectId,
  updateScheduleItemQuickEdit,
} from '@/services/supabaseService'
import { persistCascadeChanges } from '@/services/smsService'
import { AssignedPersonsPicker } from '@/components/schedule/AssignedPersonsPicker'
import type { CommunicationLogEntry } from '@/types/communicationLog'
import type { ConfirmationStatus, ScheduleItem } from '@/types'
import type { PortfolioItem } from '@/services/scheduleService'

type ScheduleStatus = PortfolioItem['status']

interface SubcontractorOption {
  id: string
  name: string
  is_internal: boolean
  phone: string | null
}

type RefreshedPortfolioItemRow = {
  id: string
  project_id: string
  schedule_id: string
  name: string
  start_date: string
  end_date: string
  confirmation_status: PortfolioItem['confirmation_status'] | null
  confirmation_notes: string | null
  status: PortfolioItem['status'] | null
  assigned_company_id: string | null
  assigned_persons?: string[] | null
  notes: string | null
  subcontractors?: { name: string | null } | Array<{ name: string | null }> | null
}

interface SchedulePortfolioItemModalProps {
  open: boolean
  onClose: () => void
  item: PortfolioItem | null
  projectName: string
  onItemUpdated: (patch: Partial<PortfolioItem>) => void
  onCascadeItemsUpdated?: (items: PortfolioItem[]) => void
  onOpenLog: () => void
  onLogEntry: () => void
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
    assigned_persons: updated.assignedPersons ?? [],
    notes: updated.notes ?? null,
  }
}

function joinedOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function portfolioItemFromRow(row: RefreshedPortfolioItemRow): PortfolioItem {
  return {
    id: row.id,
    project_id: row.project_id,
    schedule_id: row.schedule_id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    confirmation_status: row.confirmation_status ?? 'unsent',
    confirmation_notes: row.confirmation_notes,
    status: row.status ?? 'not-started',
    assigned_company_id: row.assigned_company_id,
    assigned_company_name: joinedOne(row.subcontractors)?.name ?? null,
    assigned_persons: row.assigned_persons ?? [],
    notes: row.notes,
  }
}

export function SchedulePortfolioItemModal({
  open,
  onClose,
  item,
  projectName,
  onItemUpdated,
  onCascadeItemsUpdated,
  onOpenLog,
  onLogEntry,
}: SchedulePortfolioItemModalProps) {
  const navigate = useNavigate()
  const [localItem, setLocalItem] = useState<PortfolioItem | null>(item)
  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([])
  const [commsEntries, setCommsEntries] = useState<CommunicationLogEntry[]>([])
  const [commsLoading, setCommsLoading] = useState(false)
  const [profileNames, setProfileNames] = useState<Record<string, string>>({})
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({})
  const [cascadePreviewRows, setCascadePreviewRows] = useState<CascadeRowWithSmsContext[] | null>(null)
  const [committingCascade, setCommittingCascade] = useState(false)

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
          .select('id, name, is_internal, phone')
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

  useEffect(() => {
    if (!open || !item?.id) {
      setCommsEntries([])
      setCommsLoading(false)
      return
    }

    let cancelled = false
    setCommsLoading(true)

    ;(async () => {
      try {
        const nextEntries = await fetchCommsForScheduleItem(item.id)
        if (cancelled) return
        setCommsEntries(nextEntries)

        const profileIds = Array.from(
          new Set(nextEntries.map((entry) => entry.author_user_id).filter(Boolean)),
        ) as string[]
        const companyIds = Array.from(
          new Set(nextEntries.map((entry) => entry.author_company_id).filter(Boolean)),
        ) as string[]

        const [profilesResult, companiesResult] = await Promise.all([
          profileIds.length > 0
            ? supabase
              .from('profiles')
              .select('id, full_name, email')
              .in('id', profileIds)
            : Promise.resolve({ data: [], error: null }),
          companyIds.length > 0
            ? supabase
              .from('subcontractors')
              .select('id, name')
              .in('id', companyIds)
            : Promise.resolve({ data: [], error: null }),
        ])

        if (profilesResult.error) throw profilesResult.error
        if (companiesResult.error) throw companiesResult.error
        if (cancelled) return

        setProfileNames(
          Object.fromEntries(
            (profilesResult.data ?? []).map((profile: any) => [
              profile.id,
              profile.full_name || profile.email || 'User',
            ]),
          ),
        )
        setCompanyNames(
          Object.fromEntries(
            (companiesResult.data ?? []).map((company: any) => [
              company.id,
              company.name || 'Company',
            ]),
          ),
        )
      } catch (error) {
        console.error('Could not load item communications', error)
        if (!cancelled) {
          setCommsEntries([])
          toast.error('Could not load item communications.')
        }
      } finally {
        if (!cancelled) setCommsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, item?.id])

  const subcontractorNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const subcontractor of subcontractors) {
      map.set(subcontractor.id, subcontractor.name)
    }
    return map
  }, [subcontractors])

  const authorLabel = (entry: CommunicationLogEntry) => {
    if (entry.author_company_id && companyNames[entry.author_company_id]) {
      return companyNames[entry.author_company_id]
    }
    if (entry.author_user_id && profileNames[entry.author_user_id]) {
      return profileNames[entry.author_user_id]
    }
    return entry.author_label || 'System'
  }

  const datesDirty = useMemo(() => {
    if (!localItem || !item) return false
    return (
      localItem.start_date !== item.start_date ||
      localItem.end_date !== item.end_date
    )
  }, [localItem?.start_date, localItem?.end_date, item?.start_date, item?.end_date])

  if (!localItem) return null

  const start = format(parseISO(localItem.start_date), 'MMM d, yyyy')
  const end = format(parseISO(localItem.end_date), 'MMM d, yyyy')

  const toParentUpdate = (next: PortfolioItem): PortfolioItem => {
    if (!item) return next
    return {
      ...next,
      start_date: item.start_date,
      end_date: item.end_date,
    }
  }

  const applySyncedItem = (
    previous: PortfolioItem,
    updated: ScheduleItem,
    assignedCompanyName?: string | null,
  ) => {
    const synced = syncPortfolioItem(previous, updated, assignedCompanyName)
    const nextLocal = item && (
      previous.start_date !== item.start_date ||
      previous.end_date !== item.end_date
    )
      ? {
        ...synced,
        start_date: previous.start_date,
        end_date: previous.end_date,
      }
      : synced
    setLocalItem(nextLocal)
    onItemUpdated(toParentUpdate(synced))
    return nextLocal
  }

  const handleSaveConfirmation = async (next: ConfirmationStatus) => {
    const previous = localItem
    const optimistic = { ...previous, confirmation_status: next }
    setLocalItem(optimistic)
    onItemUpdated(toParentUpdate(optimistic))

    try {
      const updated = await updateScheduleItemQuickEdit(previous.id, {
        confirmation_status: next,
      })
      applySyncedItem(previous, updated)
    } catch (error) {
      setLocalItem(previous)
      onItemUpdated(toParentUpdate(previous))
      console.error('Could not update confirmation', error)
      toast.error('Could not update confirmation.')
    }
  }

  const handleSaveStatus = async (next: ScheduleStatus) => {
    const previous = localItem
    const optimistic = { ...previous, status: next }
    setLocalItem(optimistic)
    onItemUpdated(toParentUpdate(optimistic))

    try {
      const updated = await updateScheduleItemQuickEdit(previous.id, {
        status: next,
      })
      applySyncedItem(previous, updated)
    } catch (error) {
      setLocalItem(previous)
      onItemUpdated(toParentUpdate(previous))
      console.error('Could not update item status', error)
      toast.error('Could not update item status.')
    }
  }

  const handleSaveDates = (
    nextStartDate: string,
    nextEndDate: string,
  ) => {
    if (!nextStartDate || !nextEndDate) return
    if (nextEndDate < nextStartDate) {
      toast.warning('End date must be on or after start date.')
      return
    }

    setLocalItem({
      ...localItem,
      start_date: nextStartDate,
      end_date: nextEndDate,
    })
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
    onItemUpdated(toParentUpdate(optimistic))

    try {
      const updated = await updateScheduleItemQuickEdit(previous.id, {
        assigned_company_id: assignedCompanyId,
      })
      applySyncedItem(previous, updated, assignedCompanyName)
    } catch (error) {
      setLocalItem(previous)
      onItemUpdated(toParentUpdate(previous))
      console.error('Could not update assigned company', error)
      toast.error('Could not update assigned company.')
    }
  }

  const handleSaveAssignedPersons = async (personIds: string[]) => {
    const previous = localItem
    const optimistic = {
      ...previous,
      assigned_persons: personIds,
    }
    setLocalItem(optimistic)
    onItemUpdated(toParentUpdate(optimistic))

    try {
      const updated = await updateScheduleItemQuickEdit(previous.id, {
        assigned_persons: personIds,
      })
      applySyncedItem(previous, updated)
    } catch (error) {
      setLocalItem(previous)
      onItemUpdated(toParentUpdate(previous))
      console.error('Could not update assigned persons', error)
      toast.error('Could not update assigned persons.')
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
    onItemUpdated(toParentUpdate(optimistic))

    try {
      const updated = await updateScheduleItemQuickEdit(previous.id, {
        [field]: nextValue,
      })
      applySyncedItem(previous, updated)
      toast.success(field === 'notes' ? 'Notes updated' : 'Confirmation notes updated')
    } catch (error) {
      setLocalItem(previous)
      onItemUpdated(toParentUpdate(previous))
      console.error(`Could not update ${field}`, error)
      toast.error(field === 'notes' ? 'Could not update notes.' : 'Could not update confirmation notes.')
    }
  }

  const handleOpenCascadePreview = async () => {
    if (!localItem || !item) return

    setCommittingCascade(true)
    try {
      const schedule = await fetchScheduleByProjectId(localItem.project_id)
      if (!schedule?.items) {
        throw new Error('Could not load project schedule for cascade math.')
      }

      const nextStart = parseISO(localItem.start_date)
      const nextEnd = parseISO(localItem.end_date)
      const proposedDuration = Math.max(
        1,
        differenceInCalendarDays(nextEnd, nextStart) + 1,
      )
      const proposedItems = schedule.items.map((scheduleItem) =>
        scheduleItem.id === localItem.id
          ? {
            ...scheduleItem,
            startDate: nextStart,
            endDate: nextEnd,
            duration: proposedDuration,
          }
          : scheduleItem,
      )

      const mathOptions = await fetchCascadeDateMathOptions(proposedItems)
      const cascadeResult = cascadeSchedule(proposedItems, mathOptions)
      if (cascadeResult.cycle) {
        toast.error('Could not preview schedule changes: dependency cycle detected.')
        return
      }

      const originalDatesById = new Map(
        schedule.items.map((scheduleItem) => [
          scheduleItem.id,
          {
            startDate: scheduleItem.startDate,
            endDate: scheduleItem.endDate,
          },
        ]),
      )
      const diff = computeCascadeDiff(cascadeResult.items, originalDatesById)

      const subMap = new Map(
        subcontractors.map((subcontractor) => [
          subcontractor.id,
          { name: subcontractor.name, phone: subcontractor.phone ?? null },
        ]),
      )
      const assignedIds = Array.from(
        new Set(
          cascadeResult.items
            .map((scheduleItem) => scheduleItem.assignedCompanyId)
            .filter((id): id is string => Boolean(id)),
        ),
      )
      const missingIds = assignedIds.filter((id) => !subMap.has(id))
      if (missingIds.length > 0) {
        const { data, error } = await supabase
          .from('subcontractors')
          .select('id, name, phone')
          .in('id', missingIds)
        if (error) throw error
        for (const subcontractor of data ?? []) {
          subMap.set(subcontractor.id, {
            name: subcontractor.name,
            phone: subcontractor.phone ?? null,
          })
        }
      }

      const classified = diff.map((row) => classifySmsEligibility(row, subMap))
      if (classified.length === 0) {
        toast.info('No schedule changes to preview.')
        return
      }
      setCascadePreviewRows(classified)
    } catch (error) {
      console.error('Could not build cascade preview', error)
      toast.error('Could not build cascade preview.')
    } finally {
      setCommittingCascade(false)
    }
  }

  const handleCascadeCancel = () => {
    if (item && localItem) {
      setLocalItem({
        ...localItem,
        start_date: item.start_date,
        end_date: item.end_date,
      })
    }
    setCascadePreviewRows(null)
  }

  const handleCascadeCommit = async (selectedSmsItemIds: Set<string>) => {
    if (!cascadePreviewRows || !localItem) return

    setCommittingCascade(true)
    try {
      const result = await persistCascadeChanges({
        projectId: localItem.project_id,
        projectName,
        rows: cascadePreviewRows,
        selectedSmsItemIds,
      })

      const ids = cascadePreviewRows.map((row) => row.item_id)
      const { data: refreshedRows, error } = await supabase
        .from('schedule_items')
        .select('id, project_id, schedule_id, name, start_date, end_date, confirmation_status, confirmation_notes, status, assigned_company_id, assigned_persons, notes, subcontractors:assigned_company_id(name)')
        .in('id', ids)
      if (error) throw error

      const refreshedItems = ((refreshedRows ?? []) as RefreshedPortfolioItemRow[])
        .map(portfolioItemFromRow)
      const refreshedCurrent = refreshedItems.find((updatedItem) => updatedItem.id === localItem.id)

      if (refreshedCurrent) {
        setLocalItem(refreshedCurrent)
        onItemUpdated(refreshedCurrent)
      }
      onCascadeItemsUpdated?.(refreshedItems)

      setCascadePreviewRows(null)
      toast.success(
        `${result.total} items updated. ${result.smsSuccess} SMS sent${result.smsFailed > 0 ? `, ${result.smsFailed} failed` : ''}.`,
      )
    } catch (error) {
      console.error('Cascade commit failed', error)
      toast.error('Could not commit cascade changes.')
    } finally {
      setCommittingCascade(false)
    }
  }

  return (
    <>
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

            <AssignedPersonsPicker
              value={localItem.assigned_persons ?? []}
              onChange={(ids) => void handleSaveAssignedPersons(ids)}
            />
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
            {datesDirty && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Pending — click "Save schedule changes" below to preview impact.
              </p>
            )}
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

          <section className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">
                Comms ({commsEntries.length})
              </h4>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onOpenLog}>
                  View full log
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onLogEntry}>
                  + Log entry
                </Button>
              </div>
            </div>
            {commsLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : commsEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No comms logged yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {commsEntries.slice(0, 5).map((entry) => (
                  <li key={entry.id} className="text-xs">
                    <span className="text-muted-foreground">
                      {format(parseISO(entry.created_at), 'MMM d, h:mm a')} ·{' '}
                      {entry.direction === 'inbound'
                        ? '←'
                        : entry.direction === 'outbound'
                          ? '→'
                          : '·'}{' '}
                      {authorLabel(entry)}
                    </span>
                    <p className="line-clamp-2 text-foreground">{entry.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter>
          {datesDirty && (
            <Button onClick={() => void handleOpenCascadePreview()} disabled={committingCascade}>
              Save schedule changes
            </Button>
          )}
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
    {cascadePreviewRows && (
      <CascadePreviewModal
        open
        onClose={handleCascadeCancel}
        rows={cascadePreviewRows}
        projectName={projectName}
        onCommit={handleCascadeCommit}
      />
    )}
    </>
  )
}
