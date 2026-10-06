import { useEffect, useMemo, useRef, useState } from 'react'
import { parseISO } from 'date-fns'
import { Bell, Check, ChevronDown, ChevronsUpDown, MapPin, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { requestPushNotify } from '@/services/pushService'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScheduleItemRenameWarning } from '@/components/drywall/schedule/ScheduleItemRenameWarning'
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
import { toDateKey, todayKey } from '@/lib/dateFormat'
import { addWorkdays, cascadeSchedule, endDateForDuration, workdaysBetween } from '@/lib/scheduleDateMath'
import { mapsUrl } from '@/lib/mapsUrl'
import type { ScheduleItem } from '@/types'
import { cn } from '@/lib/utils'
import {
  AssignedPersonsPicker,
  buildAssignedPersonOptions,
  type AssignedPersonOption,
} from '@/components/schedule/AssignedPersonsPicker'
import { fetchTeam } from '@/services/hrTeamService'
import { TimeOffConflictWarning } from '@/components/schedule/TimeOffConflictWarning'
import {
  DrywallScheduleCascadeError,
  createScheduleItemForProject,
  deleteScheduleItemForProject,
  fetchActiveSubcontractors,
  updateScheduleItemForProject,
  type ActiveSubcontractor,
  type DrywallProjectScheduleItem,
  type DrywallScheduleItemStatus,
  type NewScheduleItemInput,
  type ScheduleDivision,
  type ScheduleItemTask,
} from '@/services/scheduleService'
import { ScheduleItemOrderSheet } from './ScheduleItemOrderSheet'
import { SubConfirmationRequest } from './SubConfirmationRequest'
import type { ConfirmationStatus } from '@/types'
import { CrewScheduleItemPhotos } from '@/components/crew/CrewScheduleItemPhotos'
import { fetchSuppliers } from '@/services/partnerDirectoryService'
import type { Supplier } from '@/types/partners'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  siblingItems: DrywallProjectScheduleItem[]
  editing: DrywallProjectScheduleItem | null
  onSaved: () => void
  /** Job name shown under the dialog title (cross-project schedule doesn't say which job). */
  projectName?: string
  /** Job address shown under the title with an "open in maps" link — saves a trip to Project Info. */
  projectAddress?: string
  /** Lens that created/edits this item. Stamps division on create; orders assignee pickers. */
  division: ScheduleDivision
}


const STATUS_OPTIONS: { value: DrywallScheduleItemStatus; label: string }[] = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'delayed', label: 'Delayed' },
]

/**
 * Tints for the form's zones.
 *
 * Only the two zones that were being confused for each other carry a colour — the people and
 * the material ones. The work and the record zones are neutral panels: four tinted blocks
 * stacked in one dialog reads as decoration and stops separating anything, which is the
 * failure mode a heading-only version already had in the other direction.
 *
 * Amber for material matches the Order stage badge, so the colour means the same thing in
 * both places rather than being picked per screen.
 */
const ZONE_TONE = {
  neutral: 'border-border bg-muted/30',
  people: 'border-sky-500/30 bg-sky-500/[0.06]',
  material: 'border-amber-500/30 bg-amber-500/[0.06]',
} as const

/**
 * One zone of the item form. Headings alone did not separate the fields enough (Mark,
 * 2026-10-05: "it still is a little tricky to read through"), so each group is a panel.
 */
function FieldZone({
  label,
  tone = 'neutral',
  collapsible = false,
  defaultOpen = true,
  summary,
  children,
}: {
  label: string
  tone?: keyof typeof ZONE_TONE
  /** Collapses to its heading when it has nothing in it. */
  collapsible?: boolean
  defaultOpen?: boolean
  /** Shown beside the heading while collapsed — says what is inside, so nothing is hidden. */
  summary?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={cn('space-y-3 rounded-xl border p-3.5', ZONE_TONE[tone])}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 text-left"
        >
          <p className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <div className="h-px flex-1 bg-border" />
          {!open && summary ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">{summary}</span>
          ) : null}
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <p className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}
      {/*
        Unmounted while shut, not hidden. Everything in these zones is either bound to dialog
        state or re-fetches on open, so nothing is lost — and the order sheet reads the whole
        project row when it mounts, which was happening on every open for a panel most items
        keep closed. Material defaults open whenever a supplier is set, which covers every
        order in the live data, so no attached order can hide behind this.
      */}
      {open ? <div className="space-y-4">{children}</div> : null}
    </section>
  )
}

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
  projectName,
  projectAddress,
  division,
}: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'field' | 'office'>('field')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [workDays, setWorkDays] = useState(1)
  const [status, setStatus] = useState<DrywallScheduleItemStatus>('not-started')
  const [notes, setNotes] = useState('')
  const [assignedPersons, setAssignedPersons] = useState<string[]>([])
  const [assignedCompanyId, setAssignedCompanyId] = useState<string | null>(null)
  const [companies, setCompanies] = useState<ActiveSubcontractor[]>([])
  // Fetched once here and handed to both pickers below. Each would otherwise pull the whole
  // org_team payload itself, so opening this dialog read the team twice.
  const [personOptions, setPersonOptions] = useState<AssignedPersonOption[] | undefined>(
    undefined,
  )
  const [showJobInfoPersonIds, setShowJobInfoPersonIds] = useState<string[]>([])
  const [shareMaterialList, setShareMaterialList] = useState(false)
  const [predecessorIds, setPredecessorIds] = useState<string[]>([])
  const [lagWorkDays, setLagWorkDays] = useState(1)
  const [tasks, setTasks] = useState<ScheduleItemTask[]>([])
  const [leadPersonIds, setLeadPersonIds] = useState<string[]>([])
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [predOpen, setPredOpen] = useState(false)
  const [predSearch, setPredSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  // An order can be attached without the item carrying a supplier_id, so the Material zone
  // asks the order sheet rather than inferring emptiness from supplierId alone.
  const [confirmation, setConfirmation] = useState<{
    status: ConfirmationStatus
    lastSentAt: string | null | undefined
  }>({ status: 'unsent', lastSentAt: null })
  const [notifyMessage, setNotifyMessage] = useState('')
  const [notifying, setNotifying] = useState(false)
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

  const siblingIdSet = useMemo(
    () => new Set(siblingItems.map((item) => item.id)),
    [siblingItems],
  )

  /** Predecessor ids stored on the item that no longer exist among siblings (ghost links). */
  const danglingPredecessorIds = useMemo(() => {
    if (!editing) return [] as string[]
    return editing.predecessor_ids.filter((id) => !siblingIdSet.has(id))
  }, [editing, siblingIdSet])

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
      setAssignedCompanyId(editing.assigned_company_id)
      setShowJobInfoPersonIds(editing.show_job_info_person_ids)
      setShareMaterialList(editing.share_material_list === true)
      setPredecessorIds(editing.predecessor_ids)
      setLagWorkDays(editing.lag_work_days)
      setTasks(editing.tasks ?? [])
      setLeadPersonIds(editing.lead_person_ids ?? [])
      setSupplierId(editing.supplier_id ?? null)
      // Seed from the row, or an item already asked would read "Not asked yet".
      setConfirmation({
        status: editing.confirmation_status ?? 'unsent',
        lastSentAt: editing.confirmation_last_sent_at ?? null,
      })
    } else {
      const today = todayKey()
      setName('')
      setType('field')
      setStartDate(today)
      setEndDate(today)
      setWorkDays(1)
      setStatus('not-started')
      setNotes('')
      setAssignedPersons([])
      setAssignedCompanyId(null)
      setShowJobInfoPersonIds([])
      setShareMaterialList(false)
      setPredecessorIds([])
      setLagWorkDays(1)
      setTasks([])
      setLeadPersonIds([])
      setSupplierId(null)
    }
    setPredSearch('')
    setConflict(null)
    setNotifyOpen(false)
    setNotifyMessage('')
  }, [open, editing])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetchTeam()
      .then((team) => setPersonOptions(buildAssignedPersonOptions(team)))
      .catch(() => setPersonOptions([]))
    void Promise.all([fetchSuppliers(), fetchActiveSubcontractors()])
      .then(([s, c]) => {
        if (cancelled) return
        setSuppliers(s)
        setCompanies(c)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open])

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
      const iso = toDateKey(maxStart)
      setStartDate(iso)
      // Preserve workDays — recompute end based on the cascaded start + current workDays.
      const newEnd = endDateForDuration(maxStart, workDays)
      setEndDate(toDateKey(newEnd))
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
    const newEnd = endDateForDuration(start, workDays)
    setEndDate(toDateKey(newEnd))
  }

  const handleWorkDaysChange = (value: number) => {
    setWorkDays(value)
    if (!startDate) return
    const start = parseISO(startDate)
    const newEnd = endDateForDuration(start, value)
    setEndDate(toDateKey(newEnd))
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
      assignedCompanyId: payload.assignedCompanyId ?? null,
      assignedTo: [],
      notes: payload.notes ?? undefined,
    })

    const result = cascadeSchedule(models, { lagSemantic: 'parallel-zero' })
    const cascaded = result.items.find((i) => i.id === draftId)
    if (!cascaded) return payload.startDate
    return toDateKey(cascaded.startDate)
  }

  const addTask = () => {
    setTasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: '', payLinked: false, progressMode: 'check' },
    ])
  }
  const updateTask = (id: string, patch: Partial<ScheduleItemTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
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
    // Drop dangling ghost ids so save self-heals deleted-predecessor refs — but only
    // when there are siblings to check against. An empty siblingItems means the
    // schedule failed to load (ScheduleEditor clears it on error), not that every
    // predecessor vanished, and filtering against it would silently sever them all.
    const validPredecessorIds =
      siblingItems.length === 0
        ? predecessorIds
        : predecessorIds.filter((id) => siblingIdSet.has(id))
    return {
      name: trimmed,
      type,
      startDate,
      endDate: endDate || startDate,
      status,
      notes,
      assignedPersons,
      assignedCompanyId,
      showJobInfoPersonIds,
      shareMaterialList,
      predecessorIds: validPredecessorIds,
      lagWorkDays,
      tasks: tasks
        .map((t) => ({ ...t, label: t.label.trim() }))
        .filter((t) => t.label.length > 0),
      leadPersonIds,
      supplierId,
    }
  }

  const persistPayload = async (payload: NewScheduleItemInput) => {
    if (editing) {
      await updateScheduleItemForProject(editing.id, payload)
      toast.success('Schedule item updated')
    } else {
      await createScheduleItemForProject(projectId, payload, division)
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

    const isoDate = (d: Date) => toDateKey(d)
    const predPayload: NewScheduleItemInput = {
      name: pred.name,
      type: pred.type,
      startDate: isoDate(newPredStart),
      endDate: isoDate(newPredEnd),
      status: pred.status,
      notes: pred.notes ?? '',
      assignedPersons: pred.assigned_persons,
      assignedCompanyId: pred.assigned_company_id,
      predecessorIds: pred.predecessor_ids,
      lagWorkDays: pred.lag_work_days,
    }

    setSaving(true)
    try {
      // Shift the predecessor first — cascade fires, current item will move to the user's intended start.
      await updateScheduleItemForProject(pred.id, predPayload)
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

  const handleNotify = async () => {
    if (!editing || assignedPersons.length === 0) return
    setNotifying(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Not signed in')
        return
      }
      const result = await requestPushNotify({
        kind: 'schedule',
        projectId,
        authorUserId: user.id,
        assignedPersonIds: assignedPersons,
        itemName: name.trim() || editing.name,
        message: notifyMessage.trim() || undefined,
      })
      if (!result.ok) {
        toast.error(`Could not send notification: ${result.reason}`)
        return
      }
      const { recipients, sent, failed } = result
      if (recipients === 0) {
        toast.info('No assigned person is linked to an app account yet.')
      } else if (sent > 0) {
        toast.success(
          `Sent to ${sent} device${sent === 1 ? '' : 's'}` +
            (failed > 0 ? ` (${failed} failed)` : ''),
        )
      } else if (failed > 0) {
        toast.warning(
          `Reached ${failed} device${failed === 1 ? '' : 's'} but delivery failed — likely a push config issue, not the crew.`,
        )
      } else {
        toast.warning(
          `Matched ${recipients} ${recipients === 1 ? 'person' : 'people'}, but none have notifications turned on yet. Ask them to tap the bell and Enable.`,
        )
      }
      setNotifyMessage('')
      setNotifyOpen(false)
    } catch {
      toast.error('Could not send notification')
    } finally {
      setNotifying(false)
    }
  }

  const handleDelete = async () => {
    if (!editing) return
    if (!window.confirm(`Delete "${editing.name}" from the schedule?`)) return
    setDeleting(true)
    try {
      await deleteScheduleItemForProject(editing.id)
      toast.success('Schedule item deleted')
      onSaved()
      onOpenChange(false)
    } catch (e) {
      if (e instanceof DrywallScheduleCascadeError) {
        toast.warning(e.message)
        onSaved()
        onOpenChange(false)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to delete item')
      }
    } finally {
      setDeleting(false)
    }
  }

  const busy = saving || deleting

  const companyPicker = (
    <div className="space-y-1.5">
      <Label>Assigned company</Label>
      <Select
        value={assignedCompanyId ?? 'none'}
        onValueChange={(value) => setAssignedCompanyId(value === 'none' ? null : value)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.name}
              {company.is_internal ? ' (internal)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {/*
          Four groups, because this form asks for FOUR different parties — our crew, a lead
          within that crew, a sub company, and a material supplier — and until now they sat in
          one flat column with Notes and a checkbox between them. Mark, 2026-10-05: "it's hard
          to delineate between some of the fields. Especially assign company and assigned
          person. Then supplier is its own field also." A heading makes a field's KIND legible
          before its label is read.

          Rendered as siblings rather than wrappers: the parent already spaces its children, so
          this groups the form visually without re-nesting every block.
        */}
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit schedule item' : 'Add schedule item'}</DialogTitle>
          {(projectName || projectAddress) && (
            <div className="space-y-0.5 pt-0.5 text-left">
              {projectName && (
                <p className="text-sm font-medium text-foreground">{projectName}</p>
              )}
              {projectAddress && (
                <a
                  href={mapsUrl(projectAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                  title="Open in Google Maps"
                >
                  <MapPin className="size-3.5 shrink-0" />
                  {projectAddress}
                </a>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="space-y-3 py-2">
          <FieldZone label="The work" tone="neutral">

          <div className="space-y-1.5">
            <Label htmlFor="schedule-item-name">Name</Label>
            <Input
              id="schedule-item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hang Main Floor"
            />
            {editing ? (
              <ScheduleItemRenameWarning
                originalName={editing.name}
                draftName={name}
                type={type}
              />
            ) : null}
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

          {/*
            Dates before predecessors: the dates are what gets set on almost every item, and
            predecessors are the occasional refinement. The cascade still drives the dates
            regardless of which reads first.
          */}
          {/*
            Work days takes a fixed narrow column rather than an equal third. Three equal
            columns left each date input about 137px once the zone panel's padding came off
            the width, and a native date input needs room for dd/mm/yyyy AND the browser's
            calendar button — which clipped (Mark, screenshot 2026-10-06). Work days only ever
            holds one or two digits, so the space belongs to the dates.
          */}
          <div className="grid gap-3 sm:grid-cols-[1fr_5rem_1fr]">
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

          {danglingPredecessorIds.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              This item links to a predecessor that no longer exists. Re-select its
              predecessors below to restore the connection.
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
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
              {predecessorIds.length > 0 ? (
                <div className="space-y-2">
                  {predecessorIds.map((id) => {
                    const pred = siblingItems.find((s) => s.id === id)
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
                              Removed item (no longer exists)
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
                </div>
              ) : null}
            </div>

            <div className="w-28 shrink-0 space-y-1.5">
              <Label htmlFor="schedule-lag">Lag (days)</Label>
              <Input
                id="schedule-lag"
                type="number"
                min={0}
                step={1}
                value={lagWorkDays}
                onChange={(e) => handleLagChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
              <p className="text-[11px] leading-tight text-muted-foreground">
                work days after predecessor ends
              </p>
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

          </FieldZone>

          <FieldZone label={'Who\u2019s doing it'} tone="people">

          {/*
            The sub company reads first on a GC item and after the crew on a drywall one,
            because that is which party usually does the work in each division. The picker
            itself does NOT move between positions any more — it used to render in two
            different places depending on the lens, so the form's layout changed between
            divisions and the control had to be hunted for twice. Order within one group is
            enough emphasis.
          */}
          {division === 'gc' ? companyPicker : null}

          <AssignedPersonsPicker
            value={assignedPersons}
            onChange={setAssignedPersons}
            showJobInfoPersonIds={showJobInfoPersonIds}
            onShowJobInfoPersonIdsChange={setShowJobInfoPersonIds}
            options={personOptions}
          />

          <TimeOffConflictWarning
            assignedPersonIds={assignedPersons}
            startDate={startDate}
            endDate={endDate}
          />

          {/*
            Directly under the crew picker, because a lead is one OF the people above — its own
            help text says "A lead doesn't need to be assigned above". It used to sit after the
            company picker and the notify button, which put two unrelated controls between a
            field and the field it refers to.
          */}
          <div className="space-y-1.5 border-l-2 border-muted pl-3">
            <AssignedPersonsPicker
              value={leadPersonIds}
              onChange={setLeadPersonIds}
              label="Lead(s) — piece owner"
              options={personOptions}
            />
            <p className="text-[11px] text-muted-foreground">
              The journeyman(s) doing the piece here. Day-rate helpers on this item split their
              day rate out of the lead(s)&apos; piece. A lead doesn&apos;t need to be assigned above.
            </p>
          </div>

          {division !== 'gc' ? companyPicker : null}

          {/*
            Separate from "Notify assigned crew" above on purpose — an item can carry both a
            sub and our own people, and Mark may want to text one without pushing the other.
            Saved items only: the SMS payload needs the item id.
          */}
          {/*
            Gated on the SAVED company, and the message is built from SAVED values.

            It used to read the draft, which let a request go out naming a sub the row did not
            yet carry: the operator picked a company, the button appeared on local state, the
            text sent, and the reply had nothing to match against — `receive-sms` looks items
            up by `assigned_company_id`, so it logged "Sub has no schedule items" and dropped
            a real confirmation on the floor. That is exactly what happened on the first live
            test (2026-10-06): sent 17:15:50, replied 17:16:24, row not saved until 17:23:29.

            The sub is being asked about the schedule as it stands, so unsaved edits must not
            change what they are told.
          */}
          {editing?.assigned_company_id ? (
            <SubConfirmationRequest
              scheduleItemId={editing.id}
              projectId={projectId}
              projectName={projectName ?? ''}
              itemName={editing.name}
              startDate={editing.start_date}
              companyId={editing.assigned_company_id}
              companyName={
                companies.find((c) => c.id === editing.assigned_company_id)?.name ?? 'this sub'
              }
              companyPhone={
                companies.find((c) => c.id === editing.assigned_company_id)?.phone ?? null
              }
              status={confirmation.status}
              lastSentAt={confirmation.lastSentAt}
              unsavedEdits={
                assignedCompanyId !== editing.assigned_company_id ||
                name !== editing.name ||
                startDate !== editing.start_date
              }
              onStatusChange={(status, sentAt) => setConfirmation({ status, lastSentAt: sentAt })}
            />
          ) : null}
          <label className="flex items-start gap-2.5 rounded-md border p-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={shareMaterialList}
              onChange={(e) => setShareMaterialList(e.target.checked)}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">Share the material list</span>
              <span className="block text-xs text-muted-foreground">
                Everyone assigned to this item sees the job&rsquo;s material list in the
                crew app, whatever their trade — for a delivery or a one-off run.
                Materials only; it does not show sqft or pay.
              </span>
            </span>
          </label>


          {editing && assignedPersons.length > 0 && (
            <Popover open={notifyOpen} onOpenChange={setNotifyOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1.5">
                  <Bell className="size-3.5" />
                  Notify assigned crew
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(100vw-2rem,22rem)] space-y-2">
                <p className="text-sm font-medium">
                  Push a heads-up to the {assignedPersons.length} assigned
                </p>
                <Textarea
                  rows={2}
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  placeholder="Optional message (blank = default schedule alert)"
                />
                <p className="text-[11px] text-muted-foreground">
                  Only people with notifications turned on will receive it.
                </p>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={notifying}
                    onClick={() => void handleNotify()}
                  >
                    {notifying ? 'Sending…' : 'Send push'}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          </FieldZone>

          <FieldZone
            key={`material-${editing?.id ?? 'new'}`}
            label="Material"
            tone="material"
            collapsible
            defaultOpen={Boolean(supplierId)}
            summary="No supplier"
          >

          {/*
            Supplier is not a work assignee — it is who DELIVERS. It used to sit below Notes,
            at the end of a run of four assignee-shaped fields, which is how it got read as a
            fifth kind of assignment. It belongs next to the order sheet it feeds.
          */}
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Select
              value={supplierId ?? '__none__'}
              onValueChange={(v) => setSupplierId(v === '__none__' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="No supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              For stock/delivery items — assign the supplier (e.g. L&amp;W) so this shows on their
              upcoming board before an order exists.
            </p>
          </div>

          {/* Attach a supplier order sheet (stock deliveries) — saved items only. */}
          {editing && (
            <ScheduleItemOrderSheet
              projectId={projectId}
              scheduleItemId={editing.id}
              scheduleItemDate={editing.start_date}
              readOnly={false}
            />
          )}

          </FieldZone>

          <FieldZone
            key={`record-${editing?.id ?? 'new'}`}
            label="Record"
            tone="neutral"
            collapsible
            defaultOpen={notes.trim() !== '' || tasks.length > 0}
            summary="Notes, photos, tasks"
          >

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

          {/* Progress photos — saved items only (need the item id). */}
          {editing && (
            <div className="space-y-1.5">
              <Label>Photos</Label>
              <CrewScheduleItemPhotos projectId={projectId} itemId={editing.id} />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Tasks</Label>
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
                Optional. Add the steps for this item (e.g. Tape, Bed, Skim) and mark the ones that
                drive piece pay. Crew check these off as they complete them.
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
                      onChange={(e) => updateTask(task.id, { label: e.target.value })}
                      className="h-8 flex-1"
                    />
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={task.payLinked}
                        onChange={(e) =>
                          updateTask(task.id, {
                            payLinked: e.target.checked,
                            progressMode: e.target.checked ? 'percent' : 'check',
                          })
                        }
                      />
                      Drives pay
                    </label>
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
          </FieldZone>
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

        <DialogFooter className="sm:justify-between">
          {conflict ? (
            <>
              <div />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={handleConflictCancel} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDetach()}
                  disabled={busy}
                >
                  Detach
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleShiftPredecessor()}
                  disabled={busy || !conflict.predecessor}
                  title={
                    conflict.predecessor
                      ? undefined
                      : 'Shift is only available with a single predecessor'
                  }
                >
                  {saving ? 'Saving…' : 'Shift predecessor'}
                </Button>
              </div>
            </>
          ) : (
            <>
              {editing ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleDelete()}
                  disabled={busy}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              ) : (
                <div />
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleSave()} disabled={busy}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
