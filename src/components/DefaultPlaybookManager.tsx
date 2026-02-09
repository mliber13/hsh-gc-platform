// ============================================================================
// Default Playbook Manager - Edit the HSH default (admin only)
// ============================================================================
// The built-in default can evolve over time. Shown only to admins.

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
  type DefaultPlaybookPlay,
  type PlayOwner,
  type CreateDefaultPlaybookPlayInput,
} from '@/types/gameplan'
import {
  fetchDefaultPlaybookPlays_Hybrid,
  createDefaultPlaybookPlay_Hybrid,
  updateDefaultPlaybookPlay_Hybrid,
  deleteDefaultPlaybookPlay_Hybrid,
  deleteAllDefaultPlaybookPlays_Hybrid,
} from '@/services/hybridService'
import { Plus, Trash2, Edit } from 'lucide-react'

const OWNERS: PlayOwner[] = ['GC', 'SUB', 'IN_HOUSE', 'SUPPLIER']

interface DefaultPlaybookManagerProps {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

export function DefaultPlaybookManager({
  open,
  onClose,
  onSaved,
}: DefaultPlaybookManagerProps) {
  const [plays, setPlays] = useState<DefaultPlaybookPlay[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  const [formChapter, setFormChapter] = useState<string>(GAMEPLAN_CHAPTERS[0].key)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formOwner, setFormOwner] = useState<PlayOwner>('GC')

  const load = useCallback(() => fetchDefaultPlaybookPlays_Hybrid().then(setPlays), [])

  useEffect(() => {
    if (open) {
      setLoading(true)
      load().finally(() => setLoading(false))
    }
  }, [open, load])

  const playsByChapter = React.useMemo(() => {
    const map: Record<string, DefaultPlaybookPlay[]> = {}
    GAMEPLAN_CHAPTERS.forEach((ch) => { map[ch.key] = [] })
    plays.forEach((p) => {
      if (!map[p.chapterKey]) map[p.chapterKey] = []
      map[p.chapterKey].push(p)
    })
    GAMEPLAN_CHAPTERS.forEach((ch) => { map[ch.key].sort((a, b) => a.sortOrder - b.sortOrder) })
    return map
  }, [plays])

  const handleResetToCodeDefault = async () => {
    if (!confirm('Replace the HSH default playbook with the built-in list from code? This will remove any customizations.')) return
    setResetting(true)
    try {
      await deleteAllDefaultPlaybookPlays_Hybrid()
      for (const t of HSH_PLAYBOOK_PLAYS) {
        await createDefaultPlaybookPlay_Hybrid({
          chapterKey: t.chapterKey,
          title: t.title,
          description: t.description,
          owner: t.owner,
          sortOrder: t.sortOrder,
        })
      }
      await load()
      onSaved?.()
    } catch (e: unknown) {
      alert((e as Error)?.message ?? 'Failed to reset')
    } finally {
      setResetting(false)
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

  const openEdit = (p: DefaultPlaybookPlay) => {
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
        await updateDefaultPlaybookPlay_Hybrid(editingId, {
          title,
          description: formDescription.trim() || null,
          owner: formOwner,
        })
      } else {
        const maxOrder = Math.max(0, ...(plays.filter((p) => p.chapterKey === formChapter).map((p) => p.sortOrder) || [0]))
        await createDefaultPlaybookPlay_Hybrid({
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
    if (!confirm('Remove this play from the HSH default?')) return
    const ok = await deleteDefaultPlaybookPlay_Hybrid(id)
    if (ok) {
      await load()
      onSaved?.()
    } else alert('Failed to delete (admin only)')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit HSH Default Gameplan</DialogTitle>
          <DialogDescription>
            The default gameplan: each phase (Pre-Con, Foundation, etc.) is a playbook; the items under it are the plays. Only admins can edit.
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
                onClick={handleResetToCodeDefault}
                disabled={resetting}
              >
                {resetting ? 'Resetting…' : 'Reset to built-in default'}
              </Button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-2">
              {GAMEPLAN_CHAPTERS.map((ch) => {
                const chapterPlays = playsByChapter[ch.key] ?? []
                return (
                  <div key={ch.key} className="border rounded-lg p-3">
                    <div className="font-medium text-sm text-slate-700 mb-2">{ch.name} (playbook)</div>
                    {chapterPlays.length === 0 ? (
                      <p className="text-xs text-slate-500">No plays in this playbook</p>
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
