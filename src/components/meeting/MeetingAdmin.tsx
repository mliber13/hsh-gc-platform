import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { usePageTitle } from '@/contexts/PageTitleContext'
import {
  createMeetingLead,
  createMeetingPrompt,
  deleteMeetingLead,
  deleteMeetingPrompt,
  getAllMeetingLeads,
  getAllPromptsForLead,
  getCurrentUserMeetingLead,
  listAssignableMeetingLeadUsers,
  updateMeetingLead,
  updateMeetingPrompt,
  type AssignableUser,
} from '@/services/meetingService'
import type { MeetingLead, MeetingPrompt } from '@/types/meeting'
import { NotAuthorized } from '@/components/meeting/NotAuthorized'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function computeNextDisplayOrder(values: number[]): number {
  if (values.length === 0) return 10
  return Math.max(...values) + 10
}

export function MeetingAdmin() {
  usePageTitle('Meeting Admin')
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [leads, setLeads] = useState<MeetingLead[]>([])
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')
  const [prompts, setPrompts] = useState<MeetingPrompt[]>([])

  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [editingPromptQuestion, setEditingPromptQuestion] = useState('')
  const [showAddPromptRow, setShowAddPromptRow] = useState(false)
  const [newPromptQuestion, setNewPromptQuestion] = useState('')
  const [newPromptDefaultLive, setNewPromptDefaultLive] = useState(false)

  const [showAddLeadDialog, setShowAddLeadDialog] = useState(false)
  const [newLeadName, setNewLeadName] = useState('')
  const [newLeadArea, setNewLeadArea] = useState('')
  const [newLeadOrder, setNewLeadOrder] = useState('')

  const [confirmDeletePromptId, setConfirmDeletePromptId] = useState<string | null>(null)
  const [confirmDeleteLeadId, setConfirmDeleteLeadId] = useState<string | null>(null)

  const activeLeads = useMemo(
    () => leads.filter((lead) => lead.is_active).sort((a, b) => a.display_order - b.display_order),
    [leads],
  )
  const inactiveLeads = useMemo(
    () => leads.filter((lead) => !lead.is_active).sort((a, b) => a.display_order - b.display_order),
    [leads],
  )

  const leadNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const lead of leads) map.set(lead.id, lead.display_name)
    return map
  }, [leads])

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  )

  const refreshPrompts = async (leadId: string) => {
    const result = await getAllPromptsForLead(leadId)
    setPrompts(result)
  }

  const loadAdminData = async () => {
    if (!user?.id) {
      setAuthorized(false)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const myLead = await getCurrentUserMeetingLead(user.id)
      const isOperator = Boolean(myLead?.is_meeting_operator)
      setAuthorized(isOperator)
      if (!isOperator) return

      const [leadRows, assignableUsers] = await Promise.all([
        getAllMeetingLeads(),
        listAssignableMeetingLeadUsers(),
      ])
      setLeads(leadRows)
      setUsers(assignableUsers)

      const firstActiveLead = leadRows
        .filter((lead) => lead.is_active)
        .sort((a, b) => a.display_order - b.display_order)[0]
      const defaultLead = firstActiveLead ?? leadRows[0] ?? null
      if (defaultLead) {
        setSelectedLeadId(defaultLead.id)
        await refreshPrompts(defaultLead.id)
      } else {
        setSelectedLeadId('')
        setPrompts([])
      }
    } catch (error) {
      console.error('Failed to load meeting admin', error)
      toast.error('Could not load meeting admin.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAdminData()
  }, [user?.id])

  const handleSelectLead = async (leadId: string) => {
    setSelectedLeadId(leadId)
    try {
      await refreshPrompts(leadId)
    } catch (error) {
      console.error('Failed loading prompts for lead', error)
      toast.error('Could not load prompts for this lead.')
    }
  }

  const savePromptQuestion = async (promptId: string, question: string) => {
    const trimmed = question.trim()
    if (!trimmed) {
      setEditingPromptId(null)
      setEditingPromptQuestion('')
      return
    }
    try {
      const updated = await updateMeetingPrompt(promptId, { question_text: trimmed })
      setPrompts((current) =>
        current.map((prompt) => (prompt.id === promptId ? updated : prompt)),
      )
      toast.success('Saved.')
    } catch (error) {
      console.error('Failed saving prompt question', error)
      toast.error('Could not save prompt.')
    } finally {
      setEditingPromptId(null)
      setEditingPromptQuestion('')
    }
  }

  const handlePromptToggle = async (
    prompt: MeetingPrompt,
    patch: Pick<MeetingPrompt, 'default_live_discuss' | 'is_active'>,
  ) => {
    const previous = prompt
    const optimistic = { ...prompt, ...patch }
    setPrompts((current) =>
      current.map((row) => (row.id === prompt.id ? optimistic : row)),
    )
    try {
      const updated = await updateMeetingPrompt(prompt.id, patch)
      setPrompts((current) =>
        current.map((row) => (row.id === prompt.id ? updated : row)),
      )
      toast.success('Saved.')
    } catch (error) {
      console.error('Failed saving prompt toggle', error)
      setPrompts((current) =>
        current.map((row) => (row.id === prompt.id ? previous : row)),
      )
      toast.error('Could not save prompt.')
    }
  }

  const handleReorderPrompt = async (promptId: string, direction: 'up' | 'down') => {
    const index = prompts.findIndex((prompt) => prompt.id === promptId)
    if (index === -1) return
    const adjacentIndex = direction === 'up' ? index - 1 : index + 1
    if (adjacentIndex < 0 || adjacentIndex >= prompts.length) return

    const current = prompts[index]
    const adjacent = prompts[adjacentIndex]

    try {
      await updateMeetingPrompt(current.id, { display_order: adjacent.display_order })
      await updateMeetingPrompt(adjacent.id, { display_order: current.display_order })
      if (selectedLeadId) await refreshPrompts(selectedLeadId)
      toast.success('Saved.')
    } catch (error) {
      console.error('Failed reordering prompts', error)
      toast.error('Could not reorder prompts.')
      if (selectedLeadId) {
        try {
          await refreshPrompts(selectedLeadId)
        } catch {
          // no-op
        }
      }
    }
  }

  const handleAddPrompt = async () => {
    if (!selectedLeadId) return
    const questionText = newPromptQuestion.trim()
    if (!questionText) return

    try {
      const nextOrder = computeNextDisplayOrder(prompts.map((prompt) => prompt.display_order))
      const created = await createMeetingPrompt({
        lead_id: selectedLeadId,
        question_text: questionText,
        default_live_discuss: newPromptDefaultLive,
        display_order: nextOrder,
      })
      setPrompts((current) =>
        [...current, created].sort((a, b) => a.display_order - b.display_order),
      )
      setNewPromptQuestion('')
      setNewPromptDefaultLive(false)
      setShowAddPromptRow(false)
      toast.success('Saved.')
    } catch (error) {
      console.error('Failed adding prompt', error)
      toast.error('Could not add prompt.')
    }
  }

  const handleDeletePrompt = async () => {
    if (!confirmDeletePromptId) return
    try {
      await deleteMeetingPrompt(confirmDeletePromptId)
      setPrompts((current) => current.filter((prompt) => prompt.id !== confirmDeletePromptId))
      toast.success('Deleted.')
    } catch (error) {
      console.error('Failed deleting prompt', error)
      toast.error('Could not delete prompt.')
    } finally {
      setConfirmDeletePromptId(null)
    }
  }

  const commitLeadPatch = async (
    leadId: string,
    patch: Partial<
      Pick<
        MeetingLead,
        | 'display_name'
        | 'area_label'
        | 'user_id'
        | 'is_meeting_operator'
        | 'is_active'
        | 'display_order'
      >
    >,
  ) => {
    const previous = leads.find((lead) => lead.id === leadId)
    if (!previous) return

    const optimistic = { ...previous, ...patch }
    setLeads((current) =>
      current.map((lead) => (lead.id === leadId ? optimistic : lead)),
    )

    try {
      const updated = await updateMeetingLead(leadId, patch)
      setLeads((current) =>
        current.map((lead) => (lead.id === leadId ? updated : lead)),
      )
      toast.success('Saved.')
    } catch (error) {
      console.error('Failed saving lead', error)
      setLeads((current) =>
        current.map((lead) => (lead.id === leadId ? previous : lead)),
      )
      toast.error('Could not save lead.')
    }
  }

  const handleAddLead = async () => {
    const name = newLeadName.trim()
    const area = newLeadArea.trim()
    const parsedOrder = Number(newLeadOrder)
    if (!name || !area || Number.isNaN(parsedOrder)) return

    try {
      const created = await createMeetingLead({
        display_name: name,
        area_label: area,
        display_order: parsedOrder,
      })
      setLeads((current) =>
        [...current, created].sort((a, b) => a.display_order - b.display_order),
      )
      setShowAddLeadDialog(false)
      setNewLeadName('')
      setNewLeadArea('')
      setNewLeadOrder('')
      toast.success('Saved.')
    } catch (error) {
      console.error('Failed adding lead', error)
      toast.error('Could not add lead.')
    }
  }

  const handleDeleteLead = async () => {
    if (!confirmDeleteLeadId) return
    const deletingLeadId = confirmDeleteLeadId
    try {
      await deleteMeetingLead(deletingLeadId)
      setLeads((current) => current.filter((lead) => lead.id !== deletingLeadId))
      if (selectedLeadId === deletingLeadId) {
        const remaining = leads.filter((lead) => lead.id !== deletingLeadId)
        const next = remaining[0]
        if (next) {
          setSelectedLeadId(next.id)
          await refreshPrompts(next.id)
        } else {
          setSelectedLeadId('')
          setPrompts([])
        }
      }
      toast.success('Deleted.')
    } catch (error) {
      console.error('Failed deleting lead', error)
      toast.error('Could not delete lead.')
    } finally {
      setConfirmDeleteLeadId(null)
    }
  }

  const leadToDelete = leads.find((lead) => lead.id === confirmDeleteLeadId) ?? null

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card className="border-border/60 bg-card/50">
          <CardContent className="py-12 text-center">
            <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              Loading meeting admin...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!authorized) {
    return <NotAuthorized />
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Meeting Admin</h1>
          <p className="text-sm text-muted-foreground">
            Manage prompts and leads.
          </p>
        </header>

        <Tabs defaultValue="prompts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
          </TabsList>

          <TabsContent value="prompts" className="space-y-4">
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="space-y-3">
                <div className="w-full max-w-sm space-y-2">
                  <Label>Lead</Label>
                  <Select value={selectedLeadId} onValueChange={(value) => void handleSelectLead(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select lead..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeLeads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.display_name}
                        </SelectItem>
                      ))}
                      {inactiveLeads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.display_name} (inactive)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedLead ? (
                  <>
                    {prompts.map((prompt, index) => (
                      <div
                        key={prompt.id}
                        className="grid grid-cols-[auto,1fr,auto,auto,auto] items-center gap-2 rounded-md border border-border/60 bg-background p-2"
                      >
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => void handleReorderPrompt(prompt.id, 'up')}
                            disabled={index === 0}
                          >
                            <ArrowUp className="size-4" />
                            <span className="sr-only">Move up</span>
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => void handleReorderPrompt(prompt.id, 'down')}
                            disabled={index === prompts.length - 1}
                          >
                            <ArrowDown className="size-4" />
                            <span className="sr-only">Move down</span>
                          </Button>
                        </div>

                        {editingPromptId === prompt.id ? (
                          <Input
                            value={editingPromptQuestion}
                            onChange={(event) => setEditingPromptQuestion(event.target.value)}
                            onBlur={() => void savePromptQuestion(prompt.id, editingPromptQuestion)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void savePromptQuestion(prompt.id, editingPromptQuestion)
                              } else if (event.key === 'Escape') {
                                setEditingPromptId(null)
                                setEditingPromptQuestion('')
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            className="truncate text-left text-sm"
                            onClick={() => {
                              setEditingPromptId(prompt.id)
                              setEditingPromptQuestion(prompt.question_text)
                            }}
                          >
                            {prompt.question_text}
                          </button>
                        )}

                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Live</Label>
                          <input
                            type="checkbox"
                            checked={prompt.default_live_discuss}
                            onChange={(event) =>
                              void handlePromptToggle(prompt, {
                                default_live_discuss: event.target.checked,
                                is_active: prompt.is_active,
                              })
                            }
                            className="h-4 w-4 rounded border-border/60"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Active</Label>
                          <input
                            type="checkbox"
                            checked={prompt.is_active}
                            onChange={(event) =>
                              void handlePromptToggle(prompt, {
                                default_live_discuss: prompt.default_live_discuss,
                                is_active: event.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-border/60"
                          />
                        </div>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setConfirmDeletePromptId(prompt.id)}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Delete prompt</span>
                        </Button>
                      </div>
                    ))}

                    {showAddPromptRow ? (
                      <div className="rounded-md border border-border/60 bg-background p-3 space-y-3">
                        <Input
                          value={newPromptQuestion}
                          onChange={(event) => setNewPromptQuestion(event.target.value)}
                          placeholder="Prompt question..."
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm">Default discuss live</Label>
                            <input
                              type="checkbox"
                              checked={newPromptDefaultLive}
                              onChange={(event) => setNewPromptDefaultLive(event.target.checked)}
                              className="h-4 w-4 rounded border-border/60"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setShowAddPromptRow(false)
                                setNewPromptQuestion('')
                                setNewPromptDefaultLive(false)
                              }}
                            >
                              Cancel
                            </Button>
                            <Button type="button" onClick={() => void handleAddPrompt()}>
                              Add
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowAddPromptRow(true)}
                      >
                        <Plus className="mr-2 size-4" />
                        Add Prompt
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No leads available.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads" className="space-y-4">
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  setNewLeadOrder(String(computeNextDisplayOrder(leads.map((lead) => lead.display_order))))
                  setShowAddLeadDialog(true)
                }}
              >
                <Plus className="mr-2 size-4" />
                Add Lead
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/60 bg-card/50">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                    <th className="px-3 py-2">display_order</th>
                    <th className="px-3 py-2">display_name</th>
                    <th className="px-3 py-2">area_label</th>
                    <th className="px-3 py-2">linked user</th>
                    <th className="px-3 py-2">operator</th>
                    <th className="px-3 py-2">active</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-3 py-2 align-top">
                        <Input
                          type="number"
                          value={lead.display_order}
                          onChange={(event) => {
                            const next = Number(event.target.value)
                            if (!Number.isNaN(next)) {
                              setLeads((current) =>
                                current.map((row) =>
                                  row.id === lead.id ? { ...row, display_order: next } : row,
                                ),
                              )
                            }
                          }}
                          onBlur={() => void commitLeadPatch(lead.id, { display_order: lead.display_order })}
                          className="h-8 w-24"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          value={lead.display_name}
                          onChange={(event) =>
                            setLeads((current) =>
                              current.map((row) =>
                                row.id === lead.id ? { ...row, display_name: event.target.value } : row,
                              ),
                            )
                          }
                          onBlur={() => void commitLeadPatch(lead.id, { display_name: lead.display_name.trim() })}
                          className="h-8 min-w-[160px]"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          value={lead.area_label}
                          onChange={(event) =>
                            setLeads((current) =>
                              current.map((row) =>
                                row.id === lead.id ? { ...row, area_label: event.target.value } : row,
                              ),
                            )
                          }
                          onBlur={() => void commitLeadPatch(lead.id, { area_label: lead.area_label.trim() })}
                          className="h-8 min-w-[220px]"
                        />
                      </td>
                      <td className="px-3 py-2 align-top min-w-[300px]">
                        <Select
                          value={lead.user_id ?? 'unlinked'}
                          onValueChange={(value) =>
                            void commitLeadPatch(lead.id, { user_id: value === 'unlinked' ? null : value })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="(unlinked)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unlinked">(unlinked)</SelectItem>
                            {users.map((assignableUser) => {
                              const linkedElsewhere =
                                assignableUser.currently_linked_lead_id &&
                                assignableUser.currently_linked_lead_id !== lead.id
                              const linkedLeadName = assignableUser.currently_linked_lead_id
                                ? leadNameById.get(assignableUser.currently_linked_lead_id)
                                : null
                              return (
                                <SelectItem
                                  key={assignableUser.id}
                                  value={assignableUser.id}
                                  disabled={Boolean(linkedElsewhere)}
                                >
                                  {assignableUser.email}
                                  {linkedElsewhere && linkedLeadName
                                    ? ` (linked to ${linkedLeadName})`
                                    : ''}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={lead.is_meeting_operator}
                          onChange={(event) =>
                            void commitLeadPatch(lead.id, { is_meeting_operator: event.target.checked })
                          }
                          className="h-4 w-4 rounded border-border/60"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={lead.is_active}
                          onChange={(event) =>
                            void commitLeadPatch(lead.id, { is_active: event.target.checked })
                          }
                          className="h-4 w-4 rounded border-border/60"
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setConfirmDeleteLeadId(lead.id)}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Delete lead</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showAddLeadDialog} onOpenChange={setShowAddLeadDialog}>
        <DialogContent className="sm:max-w-md border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-lead-name">Display name</Label>
              <Input
                id="new-lead-name"
                value={newLeadName}
                onChange={(event) => setNewLeadName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-lead-area">Area label</Label>
              <Input
                id="new-lead-area"
                value={newLeadArea}
                onChange={(event) => setNewLeadArea(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-lead-order">Display order</Label>
              <Input
                id="new-lead-order"
                type="number"
                value={newLeadOrder}
                onChange={(event) => setNewLeadOrder(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowAddLeadDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleAddLead()}
              disabled={!newLeadName.trim() || !newLeadArea.trim() || Number.isNaN(Number(newLeadOrder))}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmDeletePromptId)} onOpenChange={(open) => !open && setConfirmDeletePromptId(null)}>
        <DialogContent className="sm:max-w-md border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Delete this prompt?</DialogTitle>
            <DialogDescription>
              This will also remove all submissions for it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDeletePromptId(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeletePrompt()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmDeleteLeadId)} onOpenChange={(open) => !open && setConfirmDeleteLeadId(null)}>
        <DialogContent className="sm:max-w-md border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Delete {leadToDelete?.display_name ?? 'lead'}?</DialogTitle>
            <DialogDescription>
              This will permanently remove their prompts, submissions, and action items.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteLeadId(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteLead()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
