// ============================================================================
// Work Packages (Targets) - minimal section for Project Detail
// ============================================================================

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { WorkPackage, CreateWorkPackageInput } from '@/types/workPackage'
import {
  fetchWorkPackages_Hybrid,
  createWorkPackage_Hybrid,
  updateWorkPackage_Hybrid,
  deleteWorkPackage_Hybrid,
} from '@/services/hybridService'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'

interface WorkPackagesSectionProps {
  projectId: string
}

const STATUS_OPTIONS = ['PLANNED', 'IN_PROGRESS', 'COMPLETE', 'ON_HOLD']
const RESPONSIBLE_PARTY_OPTIONS = ['IN_HOUSE', 'SUB']

function formatDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

function dateVariance(target: string | null, forecast: string | null): 'ok' | 'behind' | 'ahead' | null {
  if (!target || !forecast) return null
  const t = new Date(target).getTime()
  const f = new Date(forecast).getTime()
  if (isNaN(t) || isNaN(f)) return null
  const diff = f - t
  if (Math.abs(diff) < 86400000) return 'ok' // same day
  return diff > 0 ? 'behind' : 'ahead'
}

export function WorkPackagesSection({ projectId }: WorkPackagesSectionProps) {
  const [packages, setPackages] = useState<WorkPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newPackageType, setNewPackageType] = useState('')
  const [newTargetStart, setNewTargetStart] = useState('')
  const [newTargetFinish, setNewTargetFinish] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<WorkPackage>>({})

  const load = async () => {
    setLoading(true)
    const list = await fetchWorkPackages_Hybrid(projectId)
    setPackages(list)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [projectId])

  const handleAdd = async () => {
    if (!newPackageType.trim()) return
    setAdding(true)
    const input: CreateWorkPackageInput = {
      packageType: newPackageType.trim(),
      targetStart: newTargetStart.trim() || null,
      targetFinish: newTargetFinish.trim() || null,
      notes: newNotes.trim() || null,
    }
    const created = await createWorkPackage_Hybrid(projectId, input)
    if (created) {
      await load()
      setNewPackageType('')
      setNewTargetStart('')
      setNewTargetFinish('')
      setNewNotes('')
    }
    setAdding(false)
  }

  const startEdit = (wp: WorkPackage) => {
    setEditingId(wp.id)
    setEditForm({
      packageType: wp.packageType,
      status: wp.status,
      responsiblePartyType: wp.responsiblePartyType,
      targetStart: wp.targetStart,
      targetFinish: wp.targetFinish,
      notes: wp.notes,
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    await updateWorkPackage_Hybrid(editingId, {
      packageType: editForm.packageType,
      status: editForm.status,
      responsiblePartyType: editForm.responsiblePartyType,
      targetStart: editForm.targetStart ?? null,
      targetFinish: editForm.targetFinish ?? null,
      notes: editForm.notes ?? null,
    })
    setEditingId(null)
    await load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this work package?')) return
    const ok = await deleteWorkPackage_Hybrid(id)
    if (ok) await load()
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Work Packages (Targets)</CardTitle>
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
        <CardTitle className="text-lg">Work Packages (Targets)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new */}
        <div className="flex flex-wrap items-end gap-2 p-3 bg-gray-50 rounded-lg">
          <div className="min-w-[140px]">
            <Label className="text-xs">Type *</Label>
            <Input
              placeholder="e.g. Drywall"
              value={newPackageType}
              onChange={(e) => setNewPackageType(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="min-w-[120px]">
            <Label className="text-xs">Target Start</Label>
            <Input
              type="date"
              value={newTargetStart}
              onChange={(e) => setNewTargetStart(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="min-w-[120px]">
            <Label className="text-xs">Target Finish</Label>
            <Input
              type="date"
              value={newTargetFinish}
              onChange={(e) => setNewTargetFinish(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <Label className="text-xs">Notes</Label>
            <Input
              placeholder="Optional"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={adding || !newPackageType.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* List */}
        {packages.length === 0 ? (
          <p className="text-sm text-gray-500">No work packages yet. Add one above.</p>
        ) : (
          <div className="space-y-3">
            {packages.map((wp) => (
              <div
                key={wp.id}
                className="border rounded-lg p-3 space-y-2 text-sm"
              >
                {editingId === wp.id ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <Label className="text-xs">Type</Label>
                        <Input
                          value={editForm.packageType ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, packageType: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Status</Label>
                        <Select
                          value={editForm.status ?? ''}
                          onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Responsible</Label>
                        <Select
                          value={editForm.responsiblePartyType ?? ''}
                          onValueChange={(v) => setEditForm((f) => ({ ...f, responsiblePartyType: v }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RESPONSIBLE_PARTY_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Target Start</Label>
                        <Input
                          type="date"
                          value={editForm.targetStart ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, targetStart: e.target.value || null }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Target Finish</Label>
                        <Input
                          type="date"
                          value={editForm.targetFinish ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, targetFinish: e.target.value || null }))}
                          className="mt-1"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Notes</Label>
                        <Input
                          value={editForm.notes ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value || null }))}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium">{wp.packageType}</span>
                        <span className="ml-2 text-gray-500 text-xs">{wp.status}</span>
                        <span className="ml-2 text-gray-500 text-xs">({wp.responsiblePartyType})</span>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(wp)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(wp.id)} className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-gray-600">
                      <div>
                        <span className="text-xs text-gray-400">Target:</span>{' '}
                        {formatDate(wp.targetStart)} → {formatDate(wp.targetFinish)}
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">Forecast:</span>{' '}
                        {formatDate(wp.forecastStart)} → {formatDate(wp.forecastFinish)}
                        {(() => {
                          const vStart = dateVariance(wp.targetStart, wp.forecastStart)
                          const vFinish = dateVariance(wp.targetFinish, wp.forecastFinish)
                          const v = vFinish ?? vStart
                          if (!v || v === 'ok') return null
                          return (
                            <span className={`ml-1 text-xs ${v === 'behind' ? 'text-amber-600' : 'text-green-600'}`}>
                              <AlertTriangle className="inline h-3 w-3 mr-0.5" />
                              {v === 'behind' ? 'Behind target' : 'Ahead of target'}
                            </span>
                          )
                        })()}
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">Actual:</span>{' '}
                        {formatDate(wp.actualStart)} → {formatDate(wp.actualFinish)}
                      </div>
                      {wp.notes && (
                        <div className="col-span-2">
                          <span className="text-xs text-gray-400">Notes:</span> {wp.notes}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
