// ============================================================================
// Trade categories: list, add custom, edit/delete custom (system = locked)
// ============================================================================

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTradeCategories } from '@/contexts/TradeCategoriesContext'
import { createTradeCategory, updateTradeCategory, deleteTradeCategory } from '@/services/tradeCategoryService'
import type { TradeCategoryRecord } from '@/types/tradeCategory'
import { getCategoryAccentColor } from '@/lib/categoryAccent'
import { ArrowLeft, PlusCircle, Edit, Trash2, Lock } from 'lucide-react'

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/** Embeddable trade categories editor (list + add/edit/delete). Use in Item Library or standalone. */
export function TradeCategoriesEditor() {
  const { categories, refetch, loading } = useTradeCategories()
  const [showAdd, setShowAdd] = useState(false)
  const [addKey, setAddKey] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const systemFirst = [...categories].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
    return a.sortOrder - b.sortOrder
  })

  const handleAdd = async () => {
    const key = (addKey || slugify(addLabel)).trim()
    const label = addLabel.trim()
    if (!key || !label) {
      setAddError('Key and label are required.')
      return
    }
    if (!/^[a-z0-9-]+$/.test(key)) {
      setAddError('Key must be lowercase letters, numbers, and hyphens only.')
      return
    }
    setAddError(null)
    setAddSaving(true)
    try {
      const created = await createTradeCategory({ key, label })
      if (created) {
        await refetch()
        setShowAdd(false)
        setAddKey('')
        setAddLabel('')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setAddError(
        msg === 'KEY_EXISTS'
          ? 'That key is already in use. Edit or delete the existing category above, or use a different key (e.g. flooring-2).'
          : msg || 'Failed to create'
      )
    } finally {
      setAddSaving(false)
    }
  }

  const startEdit = (c: TradeCategoryRecord) => {
    if (c.isSystem) return
    setEditingId(c.id)
    setEditLabel(c.label)
  }

  const saveEdit = async () => {
    if (!editingId) return
    setEditSaving(true)
    try {
      await updateTradeCategory(editingId, { label: editLabel.trim() })
      await refetch()
      setEditingId(null)
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteTradeCategory(id)
      await refetch()
      setDeleteConfirmId(null)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <Card>
          <CardHeader>
            <CardTitle>Trade categories</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Built-in categories are locked. Add your own (e.g. Flooring, Painting) for estimates and item library.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-gray-500">Loading…</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {systemFirst.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 py-2 px-3 rounded-lg border border-gray-200 bg-white overflow-hidden"
                    >
                      <div
                        className="shrink-0 w-1.5 rounded-l-md"
                        style={{ backgroundColor: getCategoryAccentColor(c.key) }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        {editingId === c.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              className="flex-1 min-w-[120px]"
                            />
                            <Button size="sm" onClick={saveEdit} disabled={editSaving}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="font-medium">{c.label}</span>
                            <span className="text-gray-400 text-sm ml-2">({c.key})</span>
                          </>
                        )}
                      </div>
                      {c.isSystem ? (
                        <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                          <Lock className="w-3 h-3" />
                          Locked
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(c)}
                            disabled={!!editingId}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          {deleteConfirmId === c.id ? (
                            <>
                              <Button size="sm" variant="destructive" onClick={() => handleDelete(c.id)}>
                                Confirm
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteConfirmId(c.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {showAdd ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <Label>New category</Label>
                    <div>
                      <Label className="text-xs">Label (e.g. Flooring)</Label>
                      <Input
                        value={addLabel}
                        onChange={(e) => {
                          const label = e.target.value
                          setAddLabel(label)
                          setAddKey(slugify(label))
                        }}
                        placeholder="e.g. Flooring"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Key (slug, used in data)</Label>
                      <Input
                        value={addKey}
                        onChange={(e) => setAddKey(e.target.value)}
                        placeholder="e.g. flooring"
                      />
                    </div>
                    {addError && <p className="text-sm text-red-600">{addError}</p>}
                    <div className="flex gap-2">
                      <Button onClick={handleAdd} disabled={addSaving}>
                        {addSaving ? 'Adding…' : 'Add category'}
                      </Button>
                      <Button variant="outline" onClick={() => { setShowAdd(false); setAddError(null) }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setShowAdd(true)} className="w-full">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Add category
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
  )
}

interface TradeCategoriesManagementProps {
  onBack: () => void
}

/** Full-page trade categories view (with Back). Kept for any direct navigation; prefer Item Library tab. */
export function TradeCategoriesManagement({ onBack }: TradeCategoriesManagementProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20 sm:pb-0">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Button variant="outline" onClick={onBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <TradeCategoriesEditor />
      </div>
    </div>
  )
}
