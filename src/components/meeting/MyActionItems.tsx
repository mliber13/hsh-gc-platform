import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
} from 'lucide-react'
import {
  format,
  formatDistanceToNow,
  parseISO,
} from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { usePageTitle } from '@/contexts/PageTitleContext'
import {
  convertParkingLotItemAsParticipant,
  getAllMeetingLeads,
  getCurrentUserMeetingLead,
  getMyActionItems,
  getSidebarsForLead,
  resolveSidebar,
  updateMeetingActionItemNotes,
  updateMeetingActionItemStatus,
} from '@/services/meetingService'
import type {
  ActionItemStatus,
  MeetingActionItem,
  MeetingLead,
  MeetingParkingLotItem,
} from '@/types/meeting'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const statusOptions: ActionItemStatus[] = [
  'Open',
  'In Progress',
  'Done',
  'Dropped',
]

function dueDateText(item: MeetingActionItem): string {
  if (!item.due_date) return '—'
  return format(parseISO(item.due_date), 'MMM d')
}

export function MyActionItems() {
  usePageTitle('My Action Items')
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [lead, setLead] = useState<MeetingLead | null>(null)
  const [items, setItems] = useState<MeetingActionItem[]>([])
  const [sidebars, setSidebars] = useState<MeetingParkingLotItem[]>([])
  const [leadNameById, setLeadNameById] = useState<Map<string, string>>(new Map())
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [draftNotes, setDraftNotes] = useState('')
  const [completedOpen, setCompletedOpen] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  // Sidebar convert dialog
  const [isSidebarConvertDialogOpen, setIsSidebarConvertDialogOpen] = useState(false)
  const [convertTargetSidebar, setConvertTargetSidebar] = useState<MeetingParkingLotItem | null>(null)
  const [convertTask, setConvertTask] = useState('')
  const [convertOwnerLeadId, setConvertOwnerLeadId] = useState('')
  const [convertDueDate, setConvertDueDate] = useState('')
  const [convertNotes, setConvertNotes] = useState('')
  const [isConvertingSidebar, setIsConvertingSidebar] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const resolvedLead = await getCurrentUserMeetingLead(user.id)
      setLead(resolvedLead)

      if (!resolvedLead) {
        setItems([])
        setSidebars([])
        return
      }

      const [myItems, mySidebars, allLeads] = await Promise.all([
        getMyActionItems(resolvedLead.id),
        getSidebarsForLead(resolvedLead.id),
        getAllMeetingLeads(),
      ])
      setItems(myItems)
      setSidebars(mySidebars)
      setLeadNameById(new Map(allLeads.filter((l) => l.is_active).map((l) => [l.id, l.display_name])))
    } catch (error) {
      console.error('Failed to load my action items', error)
      toast.error('Could not load your action items.')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void load()
  }, [load])

  const todayYmd = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])

  const overdueItems = useMemo(
    () =>
      items
        .filter(
          (item) =>
            (item.status === 'Open' || item.status === 'In Progress') &&
            item.due_date !== null &&
            item.due_date < todayYmd,
        )
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
    [items, todayYmd],
  )

  const upcomingUndatedItems = useMemo(
    () =>
      items
        .filter((item) => {
          if (!(item.status === 'Open' || item.status === 'In Progress')) return false
          if (!item.due_date) return true
          return item.due_date >= todayYmd
        })
        .sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return a.due_date.localeCompare(b.due_date)
        }),
    [items, todayYmd],
  )

  const completedItems = useMemo(
    () =>
      items
        .filter((item) => item.status === 'Done' || item.status === 'Dropped')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [items],
  )

  const activeItems = useMemo(
    () => [...overdueItems, ...upcomingUndatedItems],
    [overdueItems, upcomingUndatedItems],
  )

  const activeCount = activeItems.length

  const handleStatusChange = async (id: string, nextStatus: ActionItemStatus) => {
    const previous = items.find((item) => item.id === id)
    if (!previous || previous.status === nextStatus) return

    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: nextStatus } : item,
      ),
    )

    try {
      const updated = await updateMeetingActionItemStatus(id, nextStatus)
      setItems((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      )
      toast.success('Status updated.')
    } catch (error) {
      console.error('Failed updating action item status', error)
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: previous.status } : item,
        ),
      )
      toast.error('Could not update action item status.')
    }
  }

  const handleToggleExpand = (item: MeetingActionItem) => {
    setExpandedItemId((current) => {
      const next = current === item.id ? null : item.id
      setDraftNotes(next ? item.notes ?? '' : '')
      return next
    })
  }

  const handleCancelNotes = () => {
    setExpandedItemId(null)
    setDraftNotes('')
  }

  const handleSaveNotes = async () => {
    if (!expandedItemId || savingNotes) return

    const normalizedNotes = draftNotes.trim().length === 0 ? null : draftNotes.trim()
    setSavingNotes(true)

    try {
      const updated = await updateMeetingActionItemNotes(expandedItemId, normalizedNotes)
      setItems((current) =>
        current.map((item) => (item.id === expandedItemId ? updated : item)),
      )
      setExpandedItemId(null)
      setDraftNotes('')
      toast.success('Notes saved.')
    } catch (error) {
      console.error('Failed updating notes', error)
      toast.error('Could not save notes.')
    } finally {
      setSavingNotes(false)
    }
  }

  const handleSidebarResolve = async (item: MeetingParkingLotItem) => {
    if (!lead) return
    setSidebars((current) => current.filter((s) => s.id !== item.id))
    try {
      await resolveSidebar(item.id, lead.id)
      toast.success('Sidebar marked as resolved.')
    } catch (error) {
      console.error('Failed to resolve sidebar', error)
      setSidebars((current) => [...current, item])
      toast.error('Could not resolve sidebar.')
    }
  }

  const handleOpenSidebarConvert = (item: MeetingParkingLotItem) => {
    setConvertTargetSidebar(item)
    setConvertTask(item.topic)
    setConvertOwnerLeadId(lead?.id ?? '')
    setConvertDueDate('')
    setConvertNotes(item.sidebar_note ?? '')
    setIsSidebarConvertDialogOpen(true)
  }

  const handleSidebarConvertSave = async () => {
    if (!convertTargetSidebar || !convertTask.trim() || !convertOwnerLeadId || isConvertingSidebar) return
    setIsConvertingSidebar(true)
    try {
      await convertParkingLotItemAsParticipant({
        parkingItem: convertTargetSidebar,
        task: convertTask.trim(),
        ownerLeadId: convertOwnerLeadId,
        dueDate: convertDueDate || null,
        notes: convertNotes.trim() || null,
      })
      setSidebars((current) => current.filter((s) => s.id !== convertTargetSidebar.id))
      const myItems = await getMyActionItems(lead!.id)
      setItems(myItems)
      setIsSidebarConvertDialogOpen(false)
      setConvertTargetSidebar(null)
      toast.success('Converted to action item.')
    } catch (error) {
      console.error('Failed to convert sidebar', error)
      toast.error('Could not convert sidebar.')
    } finally {
      setIsConvertingSidebar(false)
    }
  }

  const renderRow = (item: MeetingActionItem, overdue: boolean) => {
    const expanded = expandedItemId === item.id

    return (
      <div
        key={item.id}
        className="rounded-lg border border-border/60 bg-card/50 p-3"
      >
        <div className="grid grid-cols-[auto,1fr,auto,180px] items-center gap-3">
          <button
            type="button"
            onClick={() => handleToggleExpand(item)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted/40"
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
          <p className="truncate text-sm">{item.task}</p>
          <p
            className={
              overdue
                ? 'text-sm text-destructive'
                : item.due_date
                  ? 'text-sm'
                  : 'text-sm text-muted-foreground'
            }
          >
            {dueDateText(item)}
          </p>
          <Select
            value={item.status}
            onValueChange={(value) =>
              void handleStatusChange(item.id, value as ActionItemStatus)
            }
          >
            <SelectTrigger className="h-9">
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
        </div>

        {expanded && (
          <div className="ml-11 mt-3 space-y-3">
            <p className="text-base">{item.task}</p>
            <Textarea
              value={draftNotes}
              onChange={(event) => setDraftNotes(event.target.value)}
              className="min-h-[100px] bg-background"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => void handleSaveNotes()}
                disabled={savingNotes}
              >
                {savingNotes ? 'Saving...' : 'Save'}
              </Button>
              <Button type="button" variant="outline" onClick={handleCancelNotes}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Created{' '}
              {formatDistanceToNow(parseISO(item.created_at), {
                addSuffix: true,
              })}
            </p>
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
            <p className="mt-4 text-sm text-muted-foreground">
              Loading action items...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg">My Action Items</CardTitle>
            <CardDescription>
              Your account is signed in, but it is not linked to a meeting lead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ask Mark to link your account, then refresh this page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (items.length === 0 && sidebars.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          <h1 className="text-2xl font-semibold">My Action Items</h1>
          <p className="text-sm text-muted-foreground">
            {lead.display_name} · {activeCount} open
          </p>
          <p className="pt-4 text-sm text-muted-foreground">
            No action items assigned to you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">My Action Items</h1>
          <p className="text-sm text-muted-foreground">
            {lead.display_name} · {activeCount} open
          </p>
        </div>

        {sidebars.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Sidebars you're in</h2>
            <div className="space-y-3">
              {sidebars.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-2"
                >
                  <p className="text-sm font-medium">{item.topic}</p>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">
                      Parked{' '}
                      {formatDistanceToNow(parseISO(item.created_at), { addSuffix: true })}
                    </p>
                    {item.sidebar_note && (
                      <p className="text-xs text-muted-foreground">
                        Note: {item.sidebar_note}
                      </p>
                    )}
                    {item.sidebar_participants.filter((pid) => pid !== lead.id).length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Other participants:{' '}
                        {item.sidebar_participants
                          .filter((pid) => pid !== lead.id)
                          .map((pid) => leadNameById.get(pid) ?? '(unknown lead)')
                          .join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => void handleSidebarResolve(item)}
                    >
                      Mark resolved
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleOpenSidebarConvert(item)}
                    >
                      Convert to action item
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Active</h2>
          {activeItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active action items.</p>
          ) : (
            activeItems.map((item) => renderRow(item, overdueItems.some((x) => x.id === item.id)))
          )}
        </section>

        {completedItems.length > 0 && (
          <Collapsible
            open={completedOpen}
            onOpenChange={setCompletedOpen}
            className="space-y-3"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronsUpDown className="size-4" />
                Completed ({completedItems.length})
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3">
              {completedItems.map((item) => renderRow(item, false))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* Sidebar Convert to Action Item Dialog */}
      <Dialog
        open={isSidebarConvertDialogOpen}
        onOpenChange={(open) => {
          setIsSidebarConvertDialogOpen(open)
          if (!open) setConvertTargetSidebar(null)
        }}
      >
        <DialogContent className="sm:max-w-xl border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Convert to Action Item</DialogTitle>
            <DialogDescription>
              Create an action item from this sidebar topic.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sidebar-convert-task">Task</Label>
              <Input
                id="sidebar-convert-task"
                value={convertTask}
                onChange={(event) => setConvertTask(event.target.value)}
                placeholder="Enter task..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sidebar-convert-due-date">Due Date</Label>
              <Input
                id="sidebar-convert-due-date"
                type="date"
                value={convertDueDate}
                onChange={(event) => setConvertDueDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sidebar-convert-notes">Notes</Label>
              <Textarea
                id="sidebar-convert-notes"
                value={convertNotes}
                onChange={(event) => setConvertNotes(event.target.value)}
                className="min-h-[80px]"
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSidebarConvertDialogOpen(false)}
              disabled={isConvertingSidebar}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSidebarConvertSave()}
              disabled={!convertTask.trim() || isConvertingSidebar}
            >
              {isConvertingSidebar ? 'Converting...' : 'Convert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
