import { useEffect, useMemo, useState } from 'react'
import { addDays, format, isBefore, parseISO, startOfDay } from 'date-fns'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import {
  convertParkingLotToActionItem,
  createMeetingActionItem,
  createParkingLotItem,
  deferParkingLotItem,
  deleteMeetingActionItem,
  deleteParkingLotItem,
  dropParkingLotItem,
  getDeferredFromPriorMeetings,
  getMeetingActionItems,
  getMeetingViewData,
  getParkingLotForMeeting,
  markParkingLotDiscussed,
  startSidebar,
  subscribeMeetingActionItems,
  subscribeParkingLot,
  ensureMeeting,
  updateMeetingActionItemStatus,
  updateSubmissionLiveDiscuss,
} from '@/services/meetingService'
import type {
  ActionItemStatus,
  MeetingActionItem,
  MeetingParkingLotItem,
  MeetingViewData,
  ParkingLotStatus,
} from '@/types/meeting'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface MeetingViewProps {
  meetingDate: string
  weekOf: string
}

function displayAnswer(value: string | null): string {
  if (!value || value.trim().length === 0) return '—'
  return value
}

function statusPillClass(status: ParkingLotStatus): string {
  switch (status) {
    case 'open':
      return 'rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground'
    case 'discussed':
      return 'rounded-md bg-green-500/15 px-2 py-0.5 text-xs text-green-700 dark:text-green-300'
    case 'dropped':
      return 'rounded-md bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground line-through'
    case 'deferred':
      return 'rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300'
    case 'converted':
      return 'rounded-md bg-blue-500/15 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300'
    case 'sidebar':
      return 'rounded-md bg-violet-500/15 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300'
    case 'sidebar_resolved':
      return 'rounded-md bg-green-500/15 px-2 py-0.5 text-xs text-green-700 dark:text-green-300'
    default:
      return 'rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground'
  }
}

function statusLabel(status: ParkingLotStatus): string {
  switch (status) {
    case 'open': return 'Open'
    case 'discussed': return 'Discussed'
    case 'dropped': return 'Dropped'
    case 'deferred': return 'Deferred'
    case 'converted': return 'Converted'
    case 'sidebar': return 'Sidebar'
    case 'sidebar_resolved': return 'Sidebar resolved'
    default: return status
  }
}

export function MeetingView({ meetingDate, weekOf }: MeetingViewProps) {
  usePageTitle('Meeting')
  const { user } = useAuth()
  const { canManageMeetingPrompts } = usePermissions()
  const isOperator = canManageMeetingPrompts

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MeetingViewData | null>(null)

  // Action items state
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>([])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [isSavingActionItem, setIsSavingActionItem] = useState(false)
  const [isDeletingActionItem, setIsDeletingActionItem] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [newOwnerLeadId, setNewOwnerLeadId] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [convertingFromParkingItemId, setConvertingFromParkingItemId] = useState<string | null>(null)

  // Parking lot state
  const [parkingItems, setParkingItems] = useState<MeetingParkingLotItem[]>([])
  const [deferredItems, setDeferredItems] = useState<MeetingParkingLotItem[]>([])

  // Park it dialog
  const [isParkItDialogOpen, setIsParkItDialogOpen] = useState(false)
  const [parkTopic, setParkTopic] = useState('')
  const [parkRaisedByLeadId, setParkRaisedByLeadId] = useState('__unspecified__')
  const [isSavingParkItem, setIsSavingParkItem] = useState(false)

  // Sidebar dialog
  const [isSidebarDialogOpen, setIsSidebarDialogOpen] = useState(false)
  const [sidebarTargetItemId, setSidebarTargetItemId] = useState<string | null>(null)
  const [sidebarParticipants, setSidebarParticipants] = useState<string[]>([])
  const [sidebarNote, setSidebarNote] = useState('')
  const [isSavingSidebar, setIsSavingSidebar] = useState(false)

  // Drop dialog
  const [isDropDialogOpen, setIsDropDialogOpen] = useState(false)
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null)
  const [dropReason, setDropReason] = useState('')
  const [isDroppingItem, setIsDroppingItem] = useState(false)

  const statusOptions: ActionItemStatus[] = ['Open', 'In Progress', 'Done', 'Dropped']

  const formattedMeetingDate = useMemo(() => {
    const parsed = parseISO(meetingDate)
    if (Number.isNaN(parsed.getTime())) return meetingDate
    return format(parsed, 'EEEE, MMMM d, yyyy')
  }, [meetingDate])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const nextData = await getMeetingViewData(meetingDate, weekOf)
        const [nextActionItems, nextParkingItems, nextDeferredItems] = await Promise.all([
          getMeetingActionItems(nextData.meeting_id),
          getParkingLotForMeeting(nextData.meeting_id),
          getDeferredFromPriorMeetings(nextData.meeting_id),
        ])
        if (!cancelled) {
          setData(nextData)
          setActionItems(nextActionItems)
          setParkingItems(nextParkingItems)
          setDeferredItems(nextDeferredItems)
        }
      } catch (error) {
        console.error('Failed to load meeting view', error)
        toast.error('Could not load meeting view.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [meetingDate, weekOf])

  const handleToggleLiveDiscuss = async (
    leadId: string,
    promptId: string,
    currentValue: boolean,
  ) => {
    if (!data) return
    const previous = data
    const next = !currentValue
    setData({
      ...data,
      sections: data.sections.map((section) =>
        section.lead_id !== leadId
          ? section
          : {
              ...section,
              prompts: section.prompts.map((p) =>
                p.prompt_id !== promptId ? p : { ...p, is_live_discuss: next },
              ),
            },
      ),
    })
    try {
      await updateSubmissionLiveDiscuss({ leadId, promptId, weekOf, isLiveDiscuss: next })
    } catch (error) {
      console.error('Failed to update live-discuss flag', error)
      setData(previous)
      toast.error('Could not update live-discuss flag.')
    }
  }

  useEffect(() => {
    if (!data?.meeting_id) return undefined

    const unsubscribe = subscribeMeetingActionItems(data.meeting_id, {
      onInsert: (row) => {
        setActionItems((current) => {
          if (current.some((item) => item.id === row.id)) return current
          return [row, ...current]
        })
      },
      onUpdate: (row) => {
        setActionItems((current) =>
          current.map((item) => (item.id === row.id ? row : item)),
        )
      },
      onDelete: (id) => {
        setActionItems((current) => current.filter((item) => item.id !== id))
      },
    })

    return () => {
      unsubscribe()
    }
  }, [data?.meeting_id])

  useEffect(() => {
    if (!data?.meeting_id) return undefined

    const unsubscribe = subscribeParkingLot(data.meeting_id, {
      onInsert: (row) => {
        setParkingItems((current) => {
          if (current.some((item) => item.id === row.id)) return current
          return [...current, row]
        })
      },
      onUpdate: (row) => {
        setParkingItems((current) =>
          current.map((item) => (item.id === row.id ? row : item)),
        )
        setDeferredItems((current) =>
          current.map((item) => (item.id === row.id ? row : item)),
        )
      },
      onDelete: (id) => {
        setParkingItems((current) => current.filter((item) => item.id !== id))
        setDeferredItems((current) => current.filter((item) => item.id !== id))
      },
    })

    return () => {
      unsubscribe()
    }
  }, [data?.meeting_id])

  const ownerNameByLeadId = useMemo(() => {
    const map = new Map<string, string>()
    for (const section of data?.sections ?? []) {
      map.set(section.lead_id, section.display_name)
    }
    return map
  }, [data?.sections])

  const meetingLeads = useMemo(
    () =>
      (data?.sections ?? []).map((section) => ({
        lead_id: section.lead_id,
        display_name: section.display_name,
      })),
    [data?.sections],
  )

  const sortedActionItems = useMemo(
    () =>
      [...actionItems].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [actionItems],
  )

  const thisMeetingParkingItems = useMemo(
    () =>
      parkingItems.filter(
        (item) => item.origin_meeting_id === data?.meeting_id,
      ),
    [parkingItems, data?.meeting_id],
  )

  const canAddActionItem = newTask.trim().length > 0 && newOwnerLeadId !== ''

  const resetActionItemForm = () => {
    setNewTask('')
    setNewOwnerLeadId('')
    setNewDueDate('')
    setNewNotes('')
    setConvertingFromParkingItemId(null)
  }

  const handleAddActionItem = async () => {
    if (!data?.meeting_id || !canAddActionItem || isSavingActionItem) return

    setIsSavingActionItem(true)
    try {
      if (convertingFromParkingItemId) {
        const newActionItemId = await convertParkingLotToActionItem({
          parkingItemId: convertingFromParkingItemId,
          task: newTask.trim(),
          ownerLeadId: newOwnerLeadId,
          dueDate: newDueDate || null,
          notes: newNotes.trim() ? newNotes.trim() : null,
        })
        const created = await getMeetingActionItems(data.meeting_id)
        setActionItems(created)
        setParkingItems((current) =>
          current.map((item) =>
            item.id === convertingFromParkingItemId
              ? { ...item, status: 'converted', action_item_id: newActionItemId }
              : item,
          ),
        )
        toast.success('Converted to action item.')
      } else {
        const created = await createMeetingActionItem({
          meetingId: data.meeting_id,
          task: newTask.trim(),
          ownerLeadId: newOwnerLeadId,
          dueDate: newDueDate || null,
          notes: newNotes.trim() ? newNotes.trim() : null,
        })
        setActionItems((current) =>
          current.some((item) => item.id === created.id)
            ? current
            : [created, ...current],
        )
        toast.success('Action item added.')
      }
      setIsAddDialogOpen(false)
      resetActionItemForm()
    } catch (error) {
      console.error('Failed to add action item', error)
      toast.error('Could not add action item.')
    } finally {
      setIsSavingActionItem(false)
    }
  }

  const handleStatusChange = async (id: string, nextStatus: ActionItemStatus) => {
    const previous = actionItems.find((item) => item.id === id)
    if (!previous || previous.status === nextStatus) return

    setActionItems((current) =>
      current.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)),
    )
    try {
      const updated = await updateMeetingActionItemStatus(id, nextStatus)
      setActionItems((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      )
    } catch (error) {
      console.error('Failed to update action item status', error)
      setActionItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: previous.status } : item,
        ),
      )
      toast.error('Could not update action item status.')
    }
  }

  const handleDeleteRequest = (id: string) => {
    setDeletingItemId(id)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingItemId || isDeletingActionItem) return
    const target = actionItems.find((item) => item.id === deletingItemId)
    if (!target) {
      setIsDeleteDialogOpen(false)
      setDeletingItemId(null)
      return
    }

    setIsDeletingActionItem(true)
    setActionItems((current) => current.filter((item) => item.id !== deletingItemId))
    setIsDeleteDialogOpen(false)

    try {
      await deleteMeetingActionItem(deletingItemId)
    } catch (error) {
      console.error('Failed deleting action item', error)
      setActionItems((current) => [target, ...current])
      toast.error('Could not delete action item.')
    } finally {
      setDeletingItemId(null)
      setIsDeletingActionItem(false)
    }
  }

  const isOverdue = (item: MeetingActionItem): boolean => {
    if (!item.due_date) return false
    if (!(item.status === 'Open' || item.status === 'In Progress')) return false
    return isBefore(parseISO(item.due_date), startOfDay(new Date()))
  }

  // Parking lot handlers
  const handleParkItSave = async () => {
    if (!data?.meeting_id || !parkTopic.trim() || isSavingParkItem) return
    setIsSavingParkItem(true)
    try {
      const created = await createParkingLotItem({
        meetingId: data.meeting_id,
        topic: parkTopic,
        raisedByLeadId:
          parkRaisedByLeadId === '__unspecified__' ? null : parkRaisedByLeadId,
      })
      setParkingItems((current) => {
        if (current.some((item) => item.id === created.id)) return current
        return [...current, created]
      })
      setIsParkItDialogOpen(false)
      setParkTopic('')
      setParkRaisedByLeadId('__unspecified__')
      toast.success('Topic parked.')
    } catch (error) {
      console.error('Failed to park item', error)
      toast.error('Could not park topic.')
    } finally {
      setIsSavingParkItem(false)
    }
  }

  const handleDiscuss = async (id: string) => {
    try {
      const updated = await markParkingLotDiscussed(id)
      setParkingItems((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      )
    } catch (error) {
      console.error('Failed to mark discussed', error)
      toast.error('Could not update item.')
    }
  }

  const handleDefer = async (id: string) => {
    if (!data?.meeting_id) return
    try {
      const nextTuesdayDate = format(
        addDays(parseISO(meetingDate), 7),
        'yyyy-MM-dd',
      )
      const toMeetingId = await ensureMeeting(nextTuesdayDate)
      const updated = await deferParkingLotItem(id, toMeetingId)
      setParkingItems((current) => current.filter((item) => item.id !== updated.id))
      toast.success('Deferred to next meeting.')
    } catch (error) {
      console.error('Failed to defer item', error)
      toast.error('Could not defer item.')
    }
  }

  const handleOpenConvertDialog = (item: MeetingParkingLotItem) => {
    setNewTask(item.topic)
    setNewOwnerLeadId(item.raised_by_lead_id ?? '')
    setNewDueDate('')
    setNewNotes(item.sidebar_note ?? '')
    setConvertingFromParkingItemId(item.id)
    setIsAddDialogOpen(true)
  }

  const handleOpenSidebarDialog = (id: string) => {
    setSidebarTargetItemId(id)
    setSidebarParticipants([])
    setSidebarNote('')
    setIsSidebarDialogOpen(true)
  }

  const handleSidebarSave = async () => {
    if (!sidebarTargetItemId || sidebarParticipants.length === 0 || isSavingSidebar) return
    setIsSavingSidebar(true)
    try {
      const updated = await startSidebar({
        id: sidebarTargetItemId,
        participantLeadIds: sidebarParticipants,
        note: sidebarNote.trim() || null,
      })
      setParkingItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      setIsSidebarDialogOpen(false)
      setSidebarTargetItemId(null)
      toast.success('Sidebar started.')
    } catch (error) {
      console.error('Failed to start sidebar', error)
      toast.error('Could not start sidebar.')
    } finally {
      setIsSavingSidebar(false)
    }
  }

  const handleOpenDropDialog = (id: string) => {
    setDropTargetItemId(id)
    setDropReason('')
    setIsDropDialogOpen(true)
  }

  const handleDropConfirm = async () => {
    if (!dropTargetItemId || isDroppingItem) return
    setIsDroppingItem(true)
    try {
      const updated = await dropParkingLotItem(
        dropTargetItemId,
        dropReason.trim() || null,
      )
      setParkingItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      setIsDropDialogOpen(false)
      setDropTargetItemId(null)
      toast.success('Item dropped.')
    } catch (error) {
      console.error('Failed to drop item', error)
      toast.error('Could not drop item.')
    } finally {
      setIsDroppingItem(false)
    }
  }

  const handleDeleteParkingItem = async (id: string) => {
    const target = parkingItems.find((item) => item.id === id)
    if (!target) return
    setParkingItems((current) => current.filter((item) => item.id !== id))
    try {
      await deleteParkingLotItem(id)
    } catch (error) {
      console.error('Failed to delete parking item', error)
      setParkingItems((current) => [...current, target])
      toast.error('Could not delete item.')
    }
  }

  const toggleSidebarParticipant = (leadId: string) => {
    setSidebarParticipants((current) =>
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId],
    )
  }

  const renderParkingRow = (item: MeetingParkingLotItem) => {
    const raisedByName = item.raised_by_lead_id
      ? ownerNameByLeadId.get(item.raised_by_lead_id)
      : null
    const resolverName = item.sidebar_resolved_by_lead_id
      ? ownerNameByLeadId.get(item.sidebar_resolved_by_lead_id)
      : null
    const participantNames = item.sidebar_participants
      .map((pid) => ownerNameByLeadId.get(pid) ?? pid)
      .join(', ')

    return (
      <div
        key={item.id}
        className="rounded-lg border border-border/60 bg-card/50 p-3 space-y-2"
      >
        <div className="flex flex-wrap items-start gap-2">
          <p className="flex-1 text-sm font-medium">{item.topic}</p>
          <span className={statusPillClass(item.status)}>{statusLabel(item.status)}</span>
          {isOperator && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => void handleDeleteParkingItem(item.id)}
            >
              <Trash2 className="size-3.5" />
              <span className="sr-only">Delete</span>
            </Button>
          )}
        </div>

        {raisedByName && (
          <p className="text-xs text-muted-foreground">Raised by: {raisedByName}</p>
        )}

        {item.status === 'sidebar' && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Sidebar — {participantNames}
            </p>
            {item.sidebar_note && (
              <p className="text-xs text-muted-foreground">Note: {item.sidebar_note}</p>
            )}
          </div>
        )}

        {item.status === 'sidebar_resolved' && (
          <div className="space-y-0.5">
            {resolverName && (
              <p className="text-xs text-muted-foreground">
                Resolved by {resolverName}
                {item.sidebar_resolved_at
                  ? ` · ${format(parseISO(item.sidebar_resolved_at), 'MMM d')}`
                  : ''}
              </p>
            )}
            {item.sidebar_note && (
              <p className="text-xs text-muted-foreground">Note: {item.sidebar_note}</p>
            )}
          </div>
        )}

        {item.status === 'converted' && item.action_item_id && (
          <p className="text-xs text-blue-700 dark:text-blue-300">
            → Action item created
          </p>
        )}

        {item.status === 'dropped' && item.drop_reason && (
          <p className="text-xs text-muted-foreground">Reason: {item.drop_reason}</p>
        )}

        {isOperator && item.status === 'open' && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void handleDiscuss(item.id)}
            >
              Discuss now
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void handleDefer(item.id)}
            >
              Defer
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleOpenConvertDialog(item)}
            >
              Convert
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleOpenSidebarDialog(item.id)}
            >
              Sidebar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleOpenDropDialog(item.id)}
            >
              Drop
            </Button>
          </div>
        )}

        {isOperator && item.status === 'sidebar' && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleOpenConvertDialog(item)}
            >
              Convert
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card className="border-border/60 bg-card/50">
          <CardContent className="py-12 text-center">
            <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Loading meeting...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card className="border-border/60 bg-card/50">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Meeting data is unavailable right now.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="mx-auto w-full max-w-4xl space-y-10">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-2xl">Meeting — {formattedMeetingDate}</CardTitle>
          </CardHeader>
        </Card>

        <div className="space-y-12">
          {data.sections.map((section) => {
            const hasNoPrompts = section.prompts.length === 0
            const showNotSubmitted = !section.has_submission

            return (
              <section key={section.lead_id} className="space-y-6">
                <header className="space-y-1">
                  <h2 className="text-2xl font-semibold">{section.display_name}</h2>
                  <p className="text-sm text-muted-foreground">{section.area_label}</p>
                </header>

                {hasNoPrompts ? (
                  <p className="text-base text-muted-foreground">(no prompts configured)</p>
                ) : showNotSubmitted ? (
                  <div className="space-y-3">
                    <p className="text-base text-muted-foreground">
                      — not submitted; topics for verbal review —
                    </p>
                    <div className="space-y-2">
                      {section.prompts.map((prompt, index) => (
                        <p key={prompt.prompt_id} className="text-base text-muted-foreground">
                          {index + 1}. {prompt.question_text}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {section.prompts.map((prompt) => (
                      <article key={prompt.prompt_id} className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">{prompt.question_text}</h3>
                          {canManageMeetingPrompts ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleToggleLiveDiscuss(
                                  section.lead_id,
                                  prompt.prompt_id,
                                  prompt.is_live_discuss,
                                )
                              }
                              className={
                                prompt.is_live_discuss
                                  ? 'rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-300'
                                  : 'rounded-md border border-dashed border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-amber-500/60 hover:text-amber-700 dark:hover:text-amber-300'
                              }
                              title={
                                prompt.is_live_discuss
                                  ? 'Click to unmark live discussion'
                                  : 'Click to mark for live discussion'
                              }
                            >
                              {prompt.is_live_discuss ? 'Discuss live' : 'Mark live'}
                            </button>
                          ) : (
                            prompt.is_live_discuss && (
                              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                                Discuss live
                              </span>
                            )
                          )}
                        </div>
                        <p
                          className={
                            prompt.is_live_discuss
                              ? 'text-base leading-relaxed text-amber-600 dark:text-amber-400'
                              : displayAnswer(prompt.answer_text) === '—'
                                ? 'text-base leading-relaxed text-muted-foreground'
                                : 'text-base leading-relaxed text-muted-foreground'
                          }
                        >
                          {displayAnswer(prompt.answer_text)}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )
          })}

          {/* Action Items section */}
          <section className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold">Action Items</h2>
              <Button type="button" onClick={() => setIsAddDialogOpen(true)}>
                Add Action Item
              </Button>
            </div>

            {sortedActionItems.length === 0 ? (
              <p className="text-base text-muted-foreground">No action items yet.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {sortedActionItems.length} items
                </p>
                <div className="overflow-x-auto rounded-lg border border-border/60 bg-card/50">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                        <th className="px-3 py-2">Task</th>
                        <th className="px-3 py-2">Owner</th>
                        <th className="px-3 py-2">Due</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="w-12 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedActionItems.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <td className="px-3 py-2 align-top">
                            <div className="space-y-1">
                              <p className="text-sm">{item.task}</p>
                              {item.notes && (
                                <p className="text-xs text-muted-foreground">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top text-sm">
                            {ownerNameByLeadId.get(item.owner_lead_id) ?? 'Unknown'}
                          </td>
                          <td
                            className={
                              isOverdue(item)
                                ? 'px-3 py-2 align-top text-sm text-destructive'
                                : item.due_date
                                  ? 'px-3 py-2 align-top text-sm'
                                  : 'px-3 py-2 align-top text-sm text-muted-foreground'
                            }
                          >
                            {item.due_date
                              ? format(parseISO(item.due_date), 'MMM d')
                              : '—'}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Select
                              value={item.status}
                              onValueChange={(value) =>
                                void handleStatusChange(item.id, value as ActionItemStatus)
                              }
                            >
                              <SelectTrigger className="h-8 w-[150px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDeleteRequest(item.id)}
                            >
                              <Trash2 className="size-4" />
                              <span className="sr-only">Delete action item</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Parking Lot section */}
          <section className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold">Parking Lot</h2>
              {isOperator && (
                <Button
                  type="button"
                  onClick={() => {
                    setParkTopic('')
                    setParkRaisedByLeadId('__unspecified__')
                    setIsParkItDialogOpen(true)
                  }}
                >
                  Park it
                </Button>
              )}
            </div>

            {deferredItems.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Deferred from prior meetings ({deferredItems.length})
                </p>
                <div className="space-y-2">
                  {deferredItems.map((item) => renderParkingRow(item))}
                </div>
              </div>
            )}

            {thisMeetingParkingItems.length === 0 && deferredItems.length === 0 ? (
              <p className="text-base text-muted-foreground">No parked topics yet.</p>
            ) : thisMeetingParkingItems.length > 0 ? (
              <div className="space-y-3">
                {deferredItems.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Parked this meeting ({thisMeetingParkingItems.length})
                  </p>
                )}
                <div className="space-y-2">
                  {thisMeetingParkingItems.map((item) => renderParkingRow(item))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {/* Add / Convert Action Item Dialog */}
      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open)
          if (!open) resetActionItemForm()
        }}
      >
        <DialogContent className="sm:max-w-xl border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>
              {convertingFromParkingItemId ? 'Convert to Action Item' : 'Add Action Item'}
            </DialogTitle>
            <DialogDescription>
              {convertingFromParkingItemId
                ? 'Create an action item from this parked topic.'
                : 'Add a task to this meeting\'s action items list.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meeting-action-item-task">Task</Label>
              <Input
                id="meeting-action-item-task"
                value={newTask}
                onChange={(event) => setNewTask(event.target.value)}
                placeholder="Enter task..."
              />
            </div>
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={newOwnerLeadId} onValueChange={setNewOwnerLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select owner..." />
                </SelectTrigger>
                <SelectContent>
                  {meetingLeads.map((lead) => (
                    <SelectItem key={lead.lead_id} value={lead.lead_id}>
                      {lead.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-action-item-due-date">Due Date</Label>
              <Input
                id="meeting-action-item-due-date"
                type="date"
                value={newDueDate}
                onChange={(event) => setNewDueDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-action-item-notes">Notes</Label>
              <Textarea
                id="meeting-action-item-notes"
                value={newNotes}
                onChange={(event) => setNewNotes(event.target.value)}
                className="min-h-[80px]"
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false)
                resetActionItemForm()
              }}
              disabled={isSavingActionItem}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleAddActionItem()}
              disabled={!canAddActionItem || isSavingActionItem}
            >
              {isSavingActionItem
                ? convertingFromParkingItemId
                  ? 'Converting...'
                  : 'Adding...'
                : convertingFromParkingItemId
                  ? 'Convert'
                  : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Action Item Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Delete this action item?</DialogTitle>
            <DialogDescription>
              This removes the action item from this meeting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeletingActionItem}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={isDeletingActionItem}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Park It Dialog */}
      <Dialog open={isParkItDialogOpen} onOpenChange={setIsParkItDialogOpen}>
        <DialogContent className="sm:max-w-lg border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Park a topic</DialogTitle>
            <DialogDescription>
              Capture an off-topic item to review after lead sections.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="park-topic">Topic</Label>
              <Input
                id="park-topic"
                value={parkTopic}
                onChange={(event) => setParkTopic(event.target.value.slice(0, 200))}
                placeholder="Briefly describe the topic..."
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>Raised by</Label>
              <Select value={parkRaisedByLeadId} onValueChange={setParkRaisedByLeadId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unspecified__">(unspecified)</SelectItem>
                  {meetingLeads.map((lead) => (
                    <SelectItem key={lead.lead_id} value={lead.lead_id}>
                      {lead.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsParkItDialogOpen(false)}
              disabled={isSavingParkItem}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleParkItSave()}
              disabled={!parkTopic.trim() || isSavingParkItem}
            >
              {isSavingParkItem ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sidebar Dialog */}
      <Dialog open={isSidebarDialogOpen} onOpenChange={setIsSidebarDialogOpen}>
        <DialogContent className="sm:max-w-lg border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Start a sidebar</DialogTitle>
            <DialogDescription>
              Assign this topic to a small group to hash out offline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Participants</Label>
              <div className="rounded-md border border-border/60 bg-background p-3 space-y-2 max-h-48 overflow-y-auto">
                {meetingLeads.map((lead) => (
                  <label
                    key={lead.lead_id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={sidebarParticipants.includes(lead.lead_id)}
                      onChange={() => toggleSidebarParticipant(lead.lead_id)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    {lead.display_name}
                  </label>
                ))}
              </div>
              {sidebarParticipants.length === 0 && (
                <p className="text-xs text-muted-foreground">Select at least one participant.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sidebar-note">Note (optional)</Label>
              <Textarea
                id="sidebar-note"
                value={sidebarNote}
                onChange={(event) => setSidebarNote(event.target.value)}
                className="min-h-[80px]"
                placeholder="Context or goal for the sidebar..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSidebarDialogOpen(false)}
              disabled={isSavingSidebar}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSidebarSave()}
              disabled={sidebarParticipants.length === 0 || isSavingSidebar}
            >
              {isSavingSidebar ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drop Dialog */}
      <Dialog open={isDropDialogOpen} onOpenChange={setIsDropDialogOpen}>
        <DialogContent className="sm:max-w-md border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Drop this topic?</DialogTitle>
            <DialogDescription>
              The item will be marked as dropped. Optionally note why.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="drop-reason">Reason (optional)</Label>
            <Input
              id="drop-reason"
              value={dropReason}
              onChange={(event) => setDropReason(event.target.value)}
              placeholder="Why is this being dropped?"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDropDialogOpen(false)}
              disabled={isDroppingItem}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDropConfirm()}
              disabled={isDroppingItem}
            >
              {isDroppingItem ? 'Dropping...' : 'Drop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
