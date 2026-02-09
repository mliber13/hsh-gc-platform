// ============================================================================
// Gameplan Board - Chapters (phases) + Plays (gates). Readiness-first view.
// ============================================================================

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  GAMEPLAN_CHAPTERS,
  HSH_PLAYBOOK_PLAYS,
  getChapterStatus,
  getBlockingCount,
  getConfidence,
  type GameplanPlay,
  type ChapterStatus,
  type PlayStatus,
  type PlayOwner,
  type DefaultPlaybookPlay,
} from '@/types/gameplan'
import {
  fetchGameplanPlays_Hybrid,
  fetchDefaultPlaybookPlays_Hybrid,
  createGameplanPlay_Hybrid,
  updateGameplanPlay_Hybrid,
  deleteGameplanPlay_Hybrid,
  deleteGameplanPlaysByProject_Hybrid,
} from '@/services/hybridService'
import { getCurrentUserProfile } from '@/services/userService'
import { DefaultPlaybookManager } from './DefaultPlaybookManager'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { ChevronDown, ChevronRight, Trash2, Edit } from 'lucide-react'

const PLAY_OWNERS: PlayOwner[] = ['GC', 'SUB', 'IN_HOUSE', 'SUPPLIER']
const PLAY_STATUSES: PlayStatus[] = ['NOT_STARTED', 'BLOCKED', 'IN_PROGRESS', 'COMPLETE']

interface GameplanBoardProps {
  projectId: string
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

function statusColor(status: ChapterStatus): string {
  switch (status) {
    case 'COMPLETE': return 'bg-green-100 text-green-800 border-green-200'
    case 'BLOCKED': return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800 border-blue-200'
    default: return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

function playStatusColor(s: PlayStatus): string {
  switch (s) {
    case 'COMPLETE': return 'bg-green-100 text-green-800'
    case 'BLOCKED': return 'bg-amber-100 text-amber-800'
    case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function ChapterCard({
  chapterKey,
  chapterName,
  plays,
  expanded,
  onToggle,
  isTemplateMode = false,
  onEditPlay,
  onDeletePlay,
}: {
  chapterKey: string
  chapterName: string
  plays: GameplanPlay[]
  expanded: boolean
  onToggle: () => void
  isTemplateMode?: boolean
  onEditPlay?: (play: GameplanPlay) => void
  onDeletePlay?: (playId: string) => void
}) {
  const status = getChapterStatus(plays)
  const blockingCount = getBlockingCount(plays)
  const confidence = getConfidence(plays)

  const targetStarts = plays.map((p) => p.targetStart).filter(Boolean) as string[]
  const targetFinishes = plays.map((p) => p.targetFinish).filter(Boolean) as string[]
  const windowStart = targetStarts.length ? targetStarts.sort()[0] : null
  const windowEnd = targetFinishes.length ? targetFinishes.sort().reverse()[0] : null
  const targetWindow = windowStart || windowEnd ? `${formatDate(windowStart)} – ${formatDate(windowEnd)}` : null

  return (
    <Card className="flex-shrink-0 w-64 border shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left"
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-1">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {chapterName}
            </CardTitle>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded border ${statusColor(status)}`}>
              {status}
            </span>
            {status === 'BLOCKED' && blockingCount > 0 && (
              <span className="text-xs text-amber-700">
                {blockingCount} blocking
              </span>
            )}
            {confidence && (
              <span className="text-xs text-slate-500 capitalize">{confidence}</span>
            )}
          </div>
          {targetWindow && (
            <p className="text-xs text-slate-500 mt-1">Target: {targetWindow}</p>
          )}
        </CardHeader>
      </button>
      {expanded && (
        <CardContent className="pt-0 border-t">
            {plays.length === 0 ? (
            <p className="text-sm text-slate-500 py-3">
              {isTemplateMode ? 'Use “Copy Gameplan to this project” above to add these plays.' : 'Not configured yet. Add plays to track readiness.'}
            </p>
          ) : (
            <>
              {isTemplateMode && (
                <p className="text-xs text-slate-500 mb-2">Default gameplan — copy to project to track.</p>
              )}
              <ul className="space-y-2">
                {plays.map((p) => {
                  const canEdit = onEditPlay && !p.id.startsWith('template-') && !p.id.startsWith('default-')
                  const canDelete = onDeletePlay && !p.id.startsWith('template-')
                  return (
                    <li key={p.id} className="text-sm flex flex-wrap items-center gap-2 py-1 border-b border-slate-100 last:border-0 group">
                      <span className="font-medium flex-1 min-w-0 truncate">{p.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${playStatusColor(p.status)}`}>{p.status.replace('_', ' ')}</span>
                      <span className="text-xs text-slate-500">{p.owner}</span>
                      {(p.targetStart || p.targetFinish) && (
                        <span className="text-xs text-slate-400">
                          {formatDate(p.targetStart)} – {formatDate(p.targetFinish)}
                        </span>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onEditPlay(p) }}
                          className="opacity-60 group-hover:opacity-100 p-0.5 text-slate-600 hover:text-slate-800 rounded"
                          title="Edit play"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeletePlay(p.id) }}
                          className="opacity-60 hover:opacity-100 text-red-600 p-0.5 rounded"
                          title="Delete play"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}

/** Static HSH default → display-only plays (all NOT_STARTED). */
function templateToDisplayPlays(): GameplanPlay[] {
  return HSH_PLAYBOOK_PLAYS.map((t, i) => ({
    id: `template-${t.chapterKey}-${i}`,
    projectId: '',
    organizationId: '',
    chapterKey: t.chapterKey,
    title: t.title,
    description: t.description,
    owner: t.owner,
    status: 'NOT_STARTED' as PlayStatus,
    targetStart: null,
    targetFinish: null,
    sortOrder: t.sortOrder,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }))
}

/** DB default playbook plays → display-only plays (all NOT_STARTED). */
function defaultToDisplayPlays(defaultPlays: DefaultPlaybookPlay[]): GameplanPlay[] {
  return defaultPlays.map((p) => ({
    id: `default-${p.id}`,
    projectId: '',
    organizationId: '',
    chapterKey: p.chapterKey,
    title: p.title,
    description: p.description,
    owner: p.owner,
    status: 'NOT_STARTED' as PlayStatus,
    targetStart: null,
    targetFinish: null,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }))
}

export function GameplanBoard({ projectId }: GameplanBoardProps) {
  const [plays, setPlays] = useState<GameplanPlay[]>([])
  const [defaultPlaybookPlays, setDefaultPlaybookPlays] = useState<DefaultPlaybookPlay[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [manageDefaultOpen, setManageDefaultOpen] = useState(false)
  const [editingPlay, setEditingPlay] = useState<GameplanPlay | null>(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', owner: 'GC' as PlayOwner, status: 'NOT_STARTED' as PlayStatus, targetStart: '', targetFinish: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copying, setCopying] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const load = React.useCallback(() => {
    return fetchGameplanPlays_Hybrid(projectId).then(setPlays)
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [load])

  useEffect(() => {
    getCurrentUserProfile().then((p) => {
      setIsAdmin(p?.role === 'admin')
    })
  }, [])

  useEffect(() => {
    fetchDefaultPlaybookPlays_Hybrid().then(setDefaultPlaybookPlays)
  }, [])
  useEffect(() => {
    if (manageDefaultOpen) fetchDefaultPlaybookPlays_Hybrid().then(setDefaultPlaybookPlays)
  }, [manageDefaultOpen])

  const templateSource = defaultPlaybookPlays.length > 0
    ? defaultToDisplayPlays(defaultPlaybookPlays)
    : templateToDisplayPlays()
  const displayPlays = plays.length > 0 ? plays : templateSource
  const isTemplateMode = plays.length === 0

  const playsByChapter = React.useMemo(() => {
    const map: Record<string, GameplanPlay[]> = {}
    GAMEPLAN_CHAPTERS.forEach((ch) => { map[ch.key] = [] })
    displayPlays.forEach((p) => {
      if (!map[p.chapterKey]) map[p.chapterKey] = []
      map[p.chapterKey].push(p)
    })
    return map
  }, [displayPlays])

  const handleCopyPlaybook = async () => {
    setCopying(true)
    try {
      const source = defaultPlaybookPlays.length > 0 ? defaultPlaybookPlays : HSH_PLAYBOOK_PLAYS
      for (const t of source) {
        await createGameplanPlay_Hybrid(projectId, {
          chapterKey: t.chapterKey,
          title: t.title,
          description: t.description ?? null,
          owner: t.owner,
          status: 'NOT_STARTED',
          sortOrder: t.sortOrder,
        })
      }
      await load()
    } catch (e: unknown) {
      alert((e as Error)?.message ?? 'Failed to copy playbook')
    } finally {
      setCopying(false)
    }
  }

  const handleEditPlay = (play: GameplanPlay) => {
    setEditingPlay(play)
    setEditForm({
      title: play.title,
      description: play.description ?? '',
      owner: play.owner,
      status: play.status,
      targetStart: play.targetStart ?? '',
      targetFinish: play.targetFinish ?? '',
    })
  }

  const handleSaveEditPlay = async () => {
    if (!editingPlay) return
    const title = editForm.title.trim()
    if (!title) return
    setSavingEdit(true)
    try {
      await updateGameplanPlay_Hybrid(editingPlay.id, {
        title,
        description: editForm.description.trim() || null,
        owner: editForm.owner,
        status: editForm.status,
        targetStart: editForm.targetStart.trim() || null,
        targetFinish: editForm.targetFinish.trim() || null,
      })
      setEditingPlay(null)
      await load()
    } catch (e: unknown) {
      alert((e as Error)?.message ?? 'Failed to save play')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeletePlay = async (playId: string) => {
    if (!confirm('Delete this play?')) return
    const ok = await deleteGameplanPlay_Hybrid(playId)
    if (ok) await load()
    else alert('Failed to delete play')
  }

  const handleDeleteEntireGameplan = async () => {
    if (!confirm('Delete the entire gameplan for this project? All plays will be removed.')) return
    setDeletingAll(true)
    try {
      const ok = await deleteGameplanPlaysByProject_Hybrid(projectId)
      if (ok) {
        setPlays([])
        await load()
      } else {
        alert('Failed to delete gameplan. You may not have permission or the request failed.')
      }
    } finally {
      setDeletingAll(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gameplan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Gameplan</CardTitle>
        <p className="text-sm text-slate-500 mt-0.5">
          Each phase (Pre-Con, Foundation, etc.) is a playbook; the items under it are the plays. Readiness first; schedule is a constraint layer.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {isTemplateMode && (
            <Button onClick={handleCopyPlaybook} disabled={copying}>
              {copying ? 'Copying…' : 'Copy Gameplan to this project'}
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={() => setManageDefaultOpen(true)}>
              Edit HSH Default Gameplan
            </Button>
          )}
          {!isTemplateMode && plays.length > 0 && (
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleDeleteEntireGameplan}
              disabled={deletingAll}
            >
              {deletingAll ? 'Deleting…' : 'Delete entire gameplan'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isTemplateMode && (
          <div className="mb-4 p-3 rounded-lg bg-slate-100 border border-slate-200 text-sm text-slate-700">
            <strong>No gameplan saved for this project.</strong> The playbooks below are the default — copy to this project to start tracking.
          </div>
        )}
        <div className="overflow-x-auto pb-2 -mx-1">
          <div className="flex gap-4 min-w-max">
            {GAMEPLAN_CHAPTERS.map((ch) => (
              <ChapterCard
                key={ch.key}
                chapterKey={ch.key}
                chapterName={ch.name}
                plays={playsByChapter[ch.key] ?? []}
                expanded={expandedKey === ch.key}
                onToggle={() => setExpandedKey((k) => (k === ch.key ? null : ch.key))}
                isTemplateMode={isTemplateMode}
                onEditPlay={!isTemplateMode ? handleEditPlay : undefined}
                onDeletePlay={!isTemplateMode ? handleDeletePlay : undefined}
              />
            ))}
          </div>
        </div>
      </CardContent>

      {isAdmin && (
        <DefaultPlaybookManager
          open={manageDefaultOpen}
          onClose={() => setManageDefaultOpen(false)}
          onSaved={() => fetchDefaultPlaybookPlays_Hybrid().then(setDefaultPlaybookPlays)}
        />
      )}

      {/* Edit play dialog (project plays only) */}
      <Dialog open={!!editingPlay} onOpenChange={(open) => !open && setEditingPlay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit play</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Play title"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Details"
              />
            </div>
            <div>
              <Label>Owner</Label>
              <Select value={editForm.owner} onValueChange={(v) => setEditForm((f) => ({ ...f, owner: v as PlayOwner }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAY_OWNERS.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as PlayStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Target start (optional)</Label>
                <Input
                  type="date"
                  value={editForm.targetStart}
                  onChange={(e) => setEditForm((f) => ({ ...f, targetStart: e.target.value }))}
                />
              </div>
              <div>
                <Label>Target finish (optional)</Label>
                <Input
                  type="date"
                  value={editForm.targetFinish}
                  onChange={(e) => setEditForm((f) => ({ ...f, targetFinish: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPlay(null)}>Cancel</Button>
            <Button onClick={handleSaveEditPlay} disabled={savingEdit || !editForm.title.trim()}>
              {savingEdit ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
