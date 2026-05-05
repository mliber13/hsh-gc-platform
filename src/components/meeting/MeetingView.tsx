import { useEffect, useMemo, useState } from 'react'
import { format, isBefore, parseISO, startOfDay } from 'date-fns'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { usePageTitle } from '@/contexts/PageTitleContext'
import {
  createMeetingActionItem,
  deleteMeetingActionItem,
  getMeetingActionItems,
  getMeetingViewData,
  subscribeMeetingActionItems,
  updateMeetingActionItemStatus,
} from '@/services/meetingService'
import type {
  ActionItemStatus,
  MeetingActionItem,
  MeetingViewData,
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

export function MeetingView({ meetingDate, weekOf }: MeetingViewProps) {
  usePageTitle('Meeting')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MeetingViewData | null>(null)
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

  const statusOptions: ActionItemStatus[] = [
    'Open',
    'In Progress',
    'Done',
    'Dropped',
  ]

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
        const nextActionItems = await getMeetingActionItems(nextData.meeting_id)
        if (!cancelled) {
          setData(nextData)
          setActionItems(nextActionItems)
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
      [...actionItems].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [actionItems],
  )

  const canAddActionItem = newTask.trim().length > 0 && newOwnerLeadId !== ''

  const resetActionItemForm = () => {
    setNewTask('')
    setNewOwnerLeadId('')
    setNewDueDate('')
    setNewNotes('')
  }

  const handleAddActionItem = async () => {
    if (!data?.meeting_id || !canAddActionItem || isSavingActionItem) return

    setIsSavingActionItem(true)
    try {
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
      setIsAddDialogOpen(false)
      resetActionItemForm()
      toast.success('Action item added.')
    } catch (error) {
      console.error('Failed to add action item', error)
      toast.error('Could not add action item.')
    } finally {
      setIsSavingActionItem(false)
    }
  }

  const handleStatusChange = async (
    id: string,
    nextStatus: ActionItemStatus,
  ) => {
    const previous = actionItems.find((item) => item.id === id)
    if (!previous || previous.status === nextStatus) return

    setActionItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: nextStatus } : item,
      ),
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
    setActionItems((current) =>
      current.filter((item) => item.id !== deletingItemId),
    )
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
                  <p className="text-base text-muted-foreground">— not submitted —</p>
                ) : (
                  <div className="space-y-6">
                    {section.prompts.map((prompt) => (
                      <article key={prompt.prompt_id} className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-medium">{prompt.question_text}</h3>
                          {prompt.is_live_discuss && (
                            <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                              Discuss live
                            </span>
                          )}
                        </div>
                        <p
                          className={
                            prompt.is_live_discuss
                              ? 'text-base leading-relaxed text-amber-600 dark:text-amber-400'
                              : displayAnswer(prompt.answer_text) === '—'
                                ? 'text-base leading-relaxed text-muted-foreground'
                                : 'text-base leading-relaxed'
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
                                void handleStatusChange(
                                  item.id,
                                  value as ActionItemStatus,
                                )
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
        </div>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-xl border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Add Action Item</DialogTitle>
            <DialogDescription>
              Add a task to this meeting's action items list.
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
              onClick={() => setIsAddDialogOpen(false)}
              disabled={isSavingActionItem}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleAddActionItem()}
              disabled={!canAddActionItem || isSavingActionItem}
            >
              {isSavingActionItem ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  )
}
