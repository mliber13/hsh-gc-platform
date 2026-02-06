// ============================================================================
// Project Milestones - GC <-> Drywall schedule bridge (GC app)
// ============================================================================

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ProjectMilestone, CreateMilestoneInput, MilestoneStatus } from '@/types/projectMilestone'
import {
  fetchMilestones_Hybrid,
  upsertMilestone_Hybrid,
  updateMilestone_Hybrid,
  deleteMilestone_Hybrid,
} from '@/services/hybridService'
import { Plus, Trash2, Building2, HardHat } from 'lucide-react'

interface ProjectMilestonesSectionProps {
  projectId: string
}

const MILESTONE_STATUS_OPTIONS: MilestoneStatus[] = [
  'PLANNED',
  'FORECASTED',
  'IN_PROGRESS',
  'DONE',
  'BLOCKED',
  'CANCELLED',
]

function formatDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function ProjectMilestonesSection({ projectId }: ProjectMilestonesSectionProps) {
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'GC' | 'DRYWALL'>('GC')

  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ProjectMilestone>>({})

  const load = async () => {
    setLoading(true)
    const list = await fetchMilestones_Hybrid(projectId)
    setMilestones(list)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [projectId])

  const gcList = milestones.filter((m) => m.sourceApp === 'GC')
  const drywallList = milestones.filter((m) => m.sourceApp === 'DRYWALL')

  const handleAddGC = async () => {
    const key = newKey.trim()
    const name = newName.trim()
    if (!key || !name) return
    setAdding(true)
    const input: CreateMilestoneInput = { milestoneKey: key, milestoneName: name }
    const created = await upsertMilestone_Hybrid(projectId, 'GC', input)
    if (created) {
      await load()
      setNewKey('')
      setNewName('')
    }
    setAdding(false)
  }

  const startEdit = (m: ProjectMilestone) => {
    setEditingId(m.id)
    setEditForm({
      milestoneName: m.milestoneName,
      targetDate: m.targetDate,
      forecastDate: m.forecastDate,
      actualDate: m.actualDate,
      status: m.status,
      notes: m.notes,
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    await updateMilestone_Hybrid(editingId, {
      milestoneName: editForm.milestoneName,
      targetDate: editForm.targetDate ?? null,
      forecastDate: editForm.forecastDate ?? null,
      actualDate: editForm.actualDate ?? null,
      status: editForm.status,
      notes: editForm.notes ?? null,
    })
    setEditingId(null)
    await load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this milestone?')) return
    const ok = await deleteMilestone_Hybrid(id)
    if (ok) await load()
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Project Milestones</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Project Milestones</CardTitle>
        <p className="text-sm text-gray-500 mt-1">
          Schedule bridge between GC and Drywall. GC milestones are editable here; Drywall milestones are read-only.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 pb-2">
          <Button
            variant={tab === 'GC' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('GC')}
          >
            <Building2 className="h-4 w-4 mr-1" />
            GC Milestones ({gcList.length})
          </Button>
          <Button
            variant={tab === 'DRYWALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('DRYWALL')}
          >
            <HardHat className="h-4 w-4 mr-1" />
            Drywall Milestones ({drywallList.length})
          </Button>
        </div>

        {/* GC Milestones (editable) */}
        {tab === 'GC' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2 p-3 bg-gray-50 rounded-lg">
              <div className="min-w-[120px]">
                <Label className="text-xs">Key *</Label>
                <Input
                  placeholder="e.g. rough-in"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="min-w-[160px]">
                <Label className="text-xs">Name *</Label>
                <Input
                  placeholder="e.g. Rough-in complete"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button
                size="sm"
                onClick={handleAddGC}
                disabled={adding || !newKey.trim() || !newName.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Milestone
              </Button>
            </div>

            {gcList.length === 0 ? (
              <p className="text-sm text-gray-500">No GC milestones yet. Add one above.</p>
            ) : (
              <div className="space-y-3">
                {gcList.map((m) => (
                  <div key={m.id} className="border rounded-lg p-3 text-sm">
                    {editingId === m.id ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="col-span-2">
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={editForm.milestoneName ?? ''}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, milestoneName: e.target.value }))}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Status</Label>
                            <Select
                              value={editForm.status ?? ''}
                              onValueChange={(v) =>
                                setEditForm((f) => ({ ...f, status: v as MilestoneStatus }))}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MILESTONE_STATUS_OPTIONS.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s.replace('_', ' ')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Target Date</Label>
                            <Input
                              type="date"
                              value={editForm.targetDate ?? ''}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  targetDate: e.target.value || null,
                                }))}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Forecast Date</Label>
                            <Input
                              type="date"
                              value={editForm.forecastDate ?? ''}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  forecastDate: e.target.value || null,
                                }))}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Actual Date</Label>
                            <Input
                              type="date"
                              value={editForm.actualDate ?? ''}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  actualDate: e.target.value || null,
                                }))}
                              className="mt-1"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs">Notes</Label>
                            <Input
                              value={editForm.notes ?? ''}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, notes: e.target.value || null }))}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" onClick={handleSaveEdit}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-medium">{m.milestoneName}</span>
                            <span className="ml-2 text-gray-500 text-xs">
                              ({m.milestoneKey})
                            </span>
                            <span className="ml-2 text-gray-500 text-xs">{m.status}</span>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(m)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(m.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-gray-600 mt-2">
                          <div>
                            <span className="text-xs text-gray-400">Target:</span>{' '}
                            {formatDate(m.targetDate)}
                          </div>
                          <div>
                            <span className="text-xs text-gray-400">Forecast:</span>{' '}
                            {formatDate(m.forecastDate)}
                          </div>
                          <div>
                            <span className="text-xs text-gray-400">Actual:</span>{' '}
                            {formatDate(m.actualDate)}
                          </div>
                          {m.notes && (
                            <div className="col-span-2">
                              <span className="text-xs text-gray-400">Notes:</span> {m.notes}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Drywall Milestones (read-only) */}
        {tab === 'DRYWALL' && (
          <div className="space-y-3">
            {drywallList.length === 0 ? (
              <p className="text-sm text-gray-500">
                No Drywall milestones for this project. They appear when the Drywall app adds them.
              </p>
            ) : (
              drywallList.map((m) => (
                <div
                  key={m.id}
                  className="border rounded-lg p-3 text-sm bg-gray-50"
                >
                  <div className="font-medium">{m.milestoneName}</div>
                  <span className="text-gray-500 text-xs">({m.milestoneKey})</span>
                  <span className="ml-2 text-gray-500 text-xs">{m.status}</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-gray-600 mt-2">
                    <div>
                      <span className="text-xs text-gray-400">Target:</span>{' '}
                      {formatDate(m.targetDate)}
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">Forecast:</span>{' '}
                      {formatDate(m.forecastDate)}
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">Actual:</span>{' '}
                      {formatDate(m.actualDate)}
                    </div>
                    {m.notes && (
                      <div className="col-span-2">
                        <span className="text-xs text-gray-400">Notes:</span> {m.notes}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
