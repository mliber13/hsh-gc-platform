// ============================================================================
// Playbook Manager - CRUD for org-level gameplan playbook template
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
  GAMEPLAN_CHAPTERS,
  HSH_PLAYBOOK_PLAYS,
  type PlaybookPlay,
  type PlayOwner,
  type CreatePlaybookPlayInput,
} from '@/types/gameplan'
import {
  fetchPlaybookPlays_Hybrid,
  fetchDefaultPlaybookPlays_Hybrid,
  createPlaybookPlay_Hybrid,
  updatePlaybookPlay_Hybrid,
  deletePlaybookPlay_Hybrid,
  deleteAllPlaybookPlays_Hybrid,
} from '@/services/hybridService'
import { Plus, Trash2, Edit } from 'lucide-react'

const OWNERS: PlayOwner[] = ['GC', 'SUB', 'IN_HOUSE', 'SUPPLIER']

interface PlaybookManagerProps {
  open: boolean
  onClose: () => void
  organizationId: string
  onSaved?: () => void
}

export function PlaybookManager({
  open,
  onClose,
  organizationId,
  onSaved,
}: PlaybookManagerProps) {
  const [plays, setPlays] = useState<PlaybookPlay[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [initFromDefault, setInitFromDefault] = useState(false)

  const [formChapter, setFormChapter] = useState<string>(GAMEPLAN_CHAPTERS[0].key)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formOwner, setFormOwner] = useState<PlayOwner>('GC')

  const load = useCallback(() => {
    if (!organizationId) return Promise.resolve([])
    return fetchPlaybookPlays_Hybrid(organizationId).then(setPlays)
  }, [organizationId])

  useEffect(() => {
    if (open && organizationId) {
      setLoading(true)
      load().finally(() => setLoading(false))
    }
  }, [open, organizationId, load])

  const playsByChapter = React.useMemo(() => {
    const map: Record<string, PlaybookPlay[]> = {}
    GAMEPLAN_CHAPTERS.forEach((ch) => { map[ch.key] = [] })
    plays.forEach((p) => {
      if (!map[p.chapterKey]) map[p.chapterKey] = []
      map[p.chapterKey].push(p)
    })
    GAMEPLAN_CHAPTERS.forEach((ch) => { map[ch.key].sort((a, b) => a.sortOrder - b.sortOrder) })
    return map
  }, [plays])

  const handleInitFromDefault = async () => {
    if (plays.length > 0 && !confirm('Replace current playbook with HSH default? This cannot be undone.')) return
    setInitFromDefault(true)
    try {
      if (plays.length > 0) await deleteAllPlaybookPlays_Hybrid(organizationId)
      const defaultPlays = await fetchDefaultPlaybookPlays_Hybrid()
      const source = defaultPlays.length > 0 ? defaultPlays : HSH_PLAYBOOK_PLAYS
      for (const t of source) {
        await createPlaybookPlay_Hybrid(organizationId, {
          chapterKey: t.chapterKey,
          title: t.title,
          description: t.description ?? null,
          owner: t.owner,
          sortOrder: t.sortOrder,
        })
      }
      await load()
      onSaved?.()
    } catch (e: unknown) {
      alert((e as Error)?.message ?? 'Failed to initialize playbook')
    } finally {
      setInitFromDefault(false)
    }
  }

  const openAdd = () => {
    setFormChapter(GAMEPLAN_CHAPTERS[0].key)
    setFormTitle('')
    setFormDescription('')
    setFormOwner('GC')
    setEditingId(null)
    setAddOpen(true)
  }

  const openEdit = (p: PlaybookPlay) => {
    setFormChapter(p.chapterKey)
    setFormTitle(p.title)
    setFormDescription(p.description ?? '')
    setFormOwner(p.owner)
    setEditingId(p.id)
    setAddOpen(false)
  }

  const closeForm = () => {
    setAddOpen(false)
    setEditingId(null)
  }

  const handleSavePlay = async () => {
    const title = formTitle.trim()
    if (!title) return
    setSaving(true)
    try {
      if (editingId) {
        await updatePlaybookPlay_Hybrid(editingId, {
          title,
          description: formDescription.trim() || null,
          owner: formOwner,
          sortOrder: undefined,
        })
      } else {
        const maxOrder = Math.max(0, ...plays.filter((p) => p.chapterKey === formChapter).map((p) => p.sortOrder))
        await createPlaybookPlay_Hybrid(organizationId, {
          chapterKey: formChapter,
          title,
          description: formDescription.trim() || null,
          owner: formOwner,
          sortOrder: maxOrder + 1,
        })
      }
      await load()
      onSaved?.()
      closeForm()
    } catch (e: unknown) {
      alert((e as Error)?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePlay = async (id: string) => {
    if (!confirm('Remove this play from the playbook?')) return
    const ok = await deletePlaybookPlay_Hybrid(id)
    if (ok) {
      await load()
      onSaved?.()
    } else alert('Failed to delete')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage playbook</DialogTitle>
          <DialogDescription>
            This template is used when a project has no plays. New projects can &quot;Copy playbook to this project&quot; to start from here.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-slate-500 py-4">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={openAdd}>
                <Plus className="w-4 h-4 mr-1" />
                Add play
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleInitFromDefault}
                disabled={initFromDefault}
              >
                {initFromDefault ? 'Initializing…' : plays.length === 0 ? 'Initialize from HSH default' : 'Replace with HSH default'}
              </Button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-2">
              {GAMEPLAN_CHAPTERS.map((ch) => {
                const chapterPlays = playsByChapter[ch.key] ?? []
                return (
                  <div key={ch.key} className="border rounded-lg p-3">
                    <div className="font-medium text-sm text-slate-700 mb-2">{ch.name}</div>
                    {chapterPlays.length === 0 ? (
                      <p className="text-xs text-slate-500">No plays</p>
                    ) : (
                      <ul className="space-y-1">
                        {chapterPlays.map((p) => (
                          <li key={p.id} className="flex items-center gap-2 text-sm group">
                            <span className="flex-1 min-w-0 truncate">{p.title}</span>
                            <span className="text-xs text-slate-500 shrink-0">{p.owner}</span>
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-slate-700"
                              onClick={() => openEdit(p)}
                              title="Edit"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-100 p-1 text-red-600"
                              onClick={() => handleDeletePlay(p.id)}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>

      {/* Add / Edit play form dialog */}
      <Dialog open={addOpen || !!editingId} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit play' : 'Add play'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editingId && (
              <div>
                <Label>Chapter</Label>
                <Select value={formChapter} onValueChange={setFormChapter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GAMEPLAN_CHAPTERS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Title</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Play title" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Details" />
            </div>
            <div>
              <Label>Owner</Label>
              <Select value={formOwner} onValueChange={(v) => setFormOwner(v as PlayOwner)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OWNERS.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={handleSavePlay} disabled={saving || !formTitle.trim()}>
              {saving ? 'Saving…' : editingId ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
