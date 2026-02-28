// ============================================================================
// Estimate Template Editor Component
// ============================================================================
//
// Component for editing trades/items within an estimate template
//

import React, { useState, useEffect } from 'react'
import {
  PlanEstimateTemplate,
  UpdatePlanEstimateTemplateInput,
} from '@/types/estimateTemplate'
import { Trade, TradeInput, TradeCategory } from '@/types'
import type { ItemTemplateInput } from '@/types/itemTemplate'
import {
  getEstimateTemplateById,
  updateEstimateTemplate,
} from '@/services/estimateTemplateService'
import { getItemTemplatesByCategory, createItemTemplate } from '@/services/itemTemplateService'
import { createTradeCategory } from '@/services/tradeCategoryService'
import { fetchSubcontractors } from '@/services/partnerDirectoryService'
import { UNIT_TYPES, DEFAULT_VALUES, formatCurrency } from '@/types/constants'
import { useTradeCategories } from '@/contexts/TradeCategoriesContext'
import { UnitType } from '@/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
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
import { ArrowLeft, Plus, Edit, Trash2, Save, X, BookPlus, Layers, ChevronDown, ChevronUp } from 'lucide-react'
import { getCategoryAccentColor } from '@/lib/categoryAccent'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface EstimateTemplateEditorProps {
  templateId: string
  onBack: () => void
  onSave?: () => void
}

// Trade with temporary ID for editing
interface EditableTrade extends Omit<Trade, 'id' | 'estimateId' | 'createdAt' | 'updatedAt'> {
  tempId: string // Temporary ID for editing
}

export function EstimateTemplateEditor({ templateId, onBack, onSave }: EstimateTemplateEditorProps) {
  const { categories, byKey } = useTradeCategories()
  const [template, setTemplate] = useState<PlanEstimateTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [trades, setTrades] = useState<EditableTrade[]>([])
  const [editingTrade, setEditingTrade] = useState<EditableTrade | null>(null)
  const [isAddingTrade, setIsAddingTrade] = useState(false)
  const [availableSubcontractors, setAvailableSubcontractors] = useState<any[]>([])

  useEffect(() => {
    loadTemplate()
    loadSubcontractors()
  }, [templateId])

  const loadTemplate = async () => {
    setLoading(true)
    try {
      const loadedTemplate = await getEstimateTemplateById(templateId)
      if (loadedTemplate) {
        setTemplate(loadedTemplate)
        // Convert template trades to editable trades with temp IDs
        const editableTrades: EditableTrade[] = loadedTemplate.trades.map((trade, index) => ({
          ...trade,
          tempId: `temp_${index}_${Date.now()}`,
        }))
        setTrades(editableTrades)
      } else {
        alert('Template not found')
        onBack()
      }
    } catch (error) {
      console.error('Error loading template:', error)
      alert('Failed to load template')
    } finally {
      setLoading(false)
    }
  }

  const loadSubcontractors = async () => {
    try {
      const subs = await fetchSubcontractors({ includeInactive: false })
      setAvailableSubcontractors(subs)
    } catch (error) {
      console.error('Error loading subcontractors:', error)
    }
  }

  const handleAddTrade = () => {
    const newTrade: EditableTrade = {
      tempId: `temp_new_${Date.now()}`,
      category: 'site-prep',
      name: '',
      description: '',
      quantity: 1,
      unit: 'each',
      laborCost: 0,
      materialCost: 0,
      subcontractorCost: 0,
      totalCost: 0,
      markupPercent: effectiveDefaultMarkup,
      isSubcontracted: false,
      wasteFactor: DEFAULT_VALUES.WASTE_FACTOR,
      notes: '',
      sortOrder: trades.length,
    }
    setEditingTrade(newTrade)
    setIsAddingTrade(true)
  }

  const handleEditTrade = (trade: EditableTrade) => {
    setEditingTrade({ ...trade })
    setIsAddingTrade(false)
  }

  const handleDeleteTrade = (tempId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return
    setTrades(prev => prev.filter(t => t.tempId !== tempId))
  }

  const handleSaveTrade = (tradeData: EditableTrade) => {
    if (isAddingTrade) {
      setTrades(prev => [...prev, tradeData])
    } else {
      setTrades(prev => prev.map(t => t.tempId === tradeData.tempId ? tradeData : t))
    }
    setEditingTrade(null)
    setIsAddingTrade(false)
  }

  const handleSaveTemplate = async () => {
    if (!template) return

    setSaving(true)
    try {
      // Convert editable trades back to template format (remove tempId)
      const templateTrades = trades.map(({ tempId, ...trade }) => trade)

      const updates: UpdatePlanEstimateTemplateInput = {
        trades: templateTrades,
      }

      const updated = await updateEstimateTemplate(template.id, updates)
      if (updated) {
        alert('Template saved successfully!')
        onSave?.()
        onBack()
      } else {
        alert('Failed to save template')
      }
    } catch (error) {
      console.error('Error saving template:', error)
      alert('Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const toggleCategory = (category: string) => {
    const next = new Set(expandedCategories)
    if (next.has(category)) next.delete(category)
    else next.add(category)
    setExpandedCategories(next)
  }

  // Normalize legacy 11.1 to 20 so default margin is always 20%
  const effectiveDefaultMarkup = (template?.defaultMarkupPercent === 11.1 || template?.defaultMarkupPercent == null)
    ? 20
    : template.defaultMarkupPercent

  const order = categories.map((c) => c.key)
  const categoryOrder = [...new Set(trades.map((t) => t.category))].sort((a, b) => {
    const i = order.indexOf(a)
    const j = order.indexOf(b)
    if (i === -1 && j === -1) return a.localeCompare(b)
    if (i === -1) return 1
    if (j === -1) return -1
    return i - j
  })
  const tradesByCategory = trades.reduce((acc, trade) => {
    if (!acc[trade.category]) acc[trade.category] = []
    acc[trade.category].push(trade)
    return acc
  }, {} as Record<string, EditableTrade[]>)

  const calculateTotals = () => {
    const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
    const grossProfitTotal = trades.reduce((sum, trade) => {
      const markup = trade.markupPercent || effectiveDefaultMarkup
      return sum + (trade.totalCost * (markup / 100))
    }, 0)
    const contingency = basePriceTotal * ((template?.defaultContingencyPercent || 10) / 100)
    const totalEstimated = basePriceTotal + grossProfitTotal + contingency

    return {
      basePriceTotal,
      grossProfitTotal,
      contingency,
      totalEstimated,
    }
  }

  const totals = calculateTotals()

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0E79C9]"></div>
          <p className="mt-4 text-gray-500">Loading template...</p>
        </div>
      </div>
    )
  }

  if (!template) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-16 w-auto" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Edit Template: {template.name}</h1>
                <p className="text-sm text-gray-600">{template.description || 'No description'}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={onBack} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveTemplate} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Template'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Summary */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">Base Price Total</p>
              <p className="text-2xl font-bold text-[#0E79C9]">{formatCurrency(totals.basePriceTotal)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">Gross Profit Total</p>
              <p className="text-2xl font-bold text-[#D95C00]">{formatCurrency(totals.grossProfitTotal)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">Contingency</p>
              <p className="text-2xl font-bold text-[#D95C00]">{formatCurrency(totals.contingency)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">Total Estimated</p>
              <p className="text-2xl font-bold text-[#34AB8A]">{formatCurrency(totals.totalEstimated)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Trades List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Template Items ({trades.length})</CardTitle>
              <Button onClick={handleAddTrade}>
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {trades.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 mb-4">No items in this template</p>
                <Button onClick={handleAddTrade}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Item
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {categoryOrder.map((category) => {
                  const categoryTrades = tradesByCategory[category] || []
                  const isExpanded = expandedCategories.has(category)
                  const categoryTotal = categoryTrades.reduce((sum, t) => sum + t.totalCost, 0)

                  return (
                    <div key={category} className="flex rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
                      <div
                        className="shrink-0 w-1.5 rounded-l-md"
                        style={{ backgroundColor: getCategoryAccentColor(category) }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleCategory(category)}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-left">
                              <p className="font-semibold text-gray-900">
                                {byKey[category]?.label || category}
                              </p>
                              <p className="text-xs text-gray-500">{categoryTrades.length} items</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Base Total</p>
                              <p className="text-sm font-semibold text-gray-900">{formatCurrency(categoryTotal)}</p>
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-xs sm:text-sm">
                                <thead>
                                  <tr className="bg-gray-100 text-gray-600">
                                    <th className="p-2 text-left border-b border-r border-gray-300">Item</th>
                                    <th className="p-2 text-center border-b border-r border-gray-300">Qty</th>
                                    <th className="p-2 text-center border-b border-r border-gray-300">Unit</th>
                                    <th className="p-2 text-center border-b border-r border-gray-300">Material</th>
                                    <th className="p-2 text-center border-b border-r border-gray-300">Labor</th>
                                    <th className="p-2 text-center border-b border-r border-gray-300">Sub</th>
                                    <th className="p-2 text-center border-b border-r border-gray-300">Total</th>
                                    <th className="p-2 text-center border-b border-r border-gray-300">Markup %</th>
                                    <th className="p-2 text-center border-b border-gray-300">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {categoryTrades.map((trade) => (
                                    <tr key={trade.tempId} className="bg-white hover:bg-gray-50">
                                      <td className="p-2 border-b border-r border-gray-200">
                                        <div className="truncate font-medium text-gray-900">{trade.name}</div>
                                        {trade.description && (
                                          <div className="text-[11px] text-gray-500 truncate">{trade.description}</div>
                                        )}
                                      </td>
                                      <td className="p-2 text-center border-b border-r border-gray-200">{trade.quantity}</td>
                                      <td className="p-2 text-center border-b border-r border-gray-200">{trade.unit}</td>
                                      <td className="p-2 text-center border-b border-r border-gray-200">{formatCurrency(trade.materialCost)}</td>
                                      <td className="p-2 text-center border-b border-r border-gray-200">{formatCurrency(trade.laborCost)}</td>
                                      <td className="p-2 text-center border-b border-r border-gray-200">{formatCurrency(trade.subcontractorCost)}</td>
                                      <td className="p-2 text-center border-b border-r border-gray-200 font-semibold">{formatCurrency(trade.totalCost)}</td>
                                      <td className="p-2 text-center border-b border-r border-gray-200">
                                        {trade.markupPercent || effectiveDefaultMarkup}%
                                      </td>
                                      <td className="p-2 text-center border-b border-gray-200">
                                        <div className="flex gap-1 justify-center">
                                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleEditTrade(trade)}>
                                            <Edit className="w-3 h-3" />
                                          </Button>
                                          <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => handleDeleteTrade(trade.tempId)}>
                                            <Trash2 className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trade Form Dialog */}
      {editingTrade && (
        <TradeFormDialog
          trade={editingTrade}
          onSave={handleSaveTrade}
          onCancel={() => {
            setEditingTrade(null)
            setIsAddingTrade(false)
          }}
          isAdding={isAddingTrade}
          defaultMarkupPercent={effectiveDefaultMarkup}
          availableSubcontractors={availableSubcontractors}
        />
      )}
    </div>
  )
}

// Trade Form Dialog Component
interface TradeFormDialogProps {
  trade: EditableTrade
  onSave: (trade: EditableTrade) => void
  onCancel: () => void
  isAdding: boolean
  defaultMarkupPercent: number
  availableSubcontractors: any[]
}

function TradeFormDialog({
  trade,
  onSave,
  onCancel,
  isAdding,
  defaultMarkupPercent,
  availableSubcontractors,
}: TradeFormDialogProps) {
  const { categories, refetch: refetchCategories } = useTradeCategories()
  const [formData, setFormData] = useState<EditableTrade>(trade)
  const [itemTemplates, setItemTemplates] = useState<any[]>([])
  const [showCreateItemModal, setShowCreateItemModal] = useState(false)
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false)
  const [createCategoryLabel, setCreateCategoryLabel] = useState('')
  const [createCategoryKey, setCreateCategoryKey] = useState('')
  const [createCategorySaving, setCreateCategorySaving] = useState(false)
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(null)
  const [createItemSaving, setCreateItemSaving] = useState(false)
  const [createItemForm, setCreateItemForm] = useState<ItemTemplateInput>({
    category: trade.category as any,
    name: trade.name || '',
    description: trade.description || '',
    defaultUnit: (trade.unit || 'each') as UnitType,
    defaultMaterialRate: trade.materialRate ?? undefined,
    defaultLaborRate: trade.laborRate ?? undefined,
    defaultSubcontractorRate: trade.subcontractorRate ?? undefined,
    defaultSubcontractorCost: trade.subcontractorCost ?? undefined,
    isSubcontracted: trade.isSubcontracted || false,
    defaultWasteFactor: trade.wasteFactor ?? 10,
    notes: trade.notes || '',
  })

  const loadItemTemplates = () => {
    if (formData.category) {
      getItemTemplatesByCategory(formData.category).then(templates => setItemTemplates(templates || []))
    }
  }

  useEffect(() => {
    loadItemTemplates()
  }, [formData.category])

  useEffect(() => {
    // Recalculate totalCost when costs change
    const totalCost = (formData.laborCost || 0) + (formData.materialCost || 0) + (formData.subcontractorCost || 0)
    setFormData(prev => ({ ...prev, totalCost }))
  }, [formData.laborCost, formData.materialCost, formData.subcontractorCost])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  const handleItemTemplateSelect = (template: any) => {
    setFormData(prev => ({
      ...prev,
      name: template.name || prev.name,
      description: template.description || prev.description,
      unit: template.unit || prev.unit,
      laborRate: template.laborRate || prev.laborRate,
      materialRate: template.materialRate || prev.materialRate,
      subcontractorRate: template.subcontractorRate || prev.subcontractorRate,
    }))
  }

  const openCreateItemModal = () => {
    setCreateItemForm({
      category: formData.category as any,
      name: formData.name || '',
      description: formData.description || '',
      defaultUnit: (formData.unit || 'each') as UnitType,
      defaultMaterialRate: formData.materialRate ?? undefined,
      defaultLaborRate: formData.laborRate ?? undefined,
      defaultSubcontractorRate: formData.subcontractorRate ?? undefined,
      defaultSubcontractorCost: formData.subcontractorCost ?? undefined,
      isSubcontracted: formData.isSubcontracted || false,
      defaultWasteFactor: formData.wasteFactor ?? 10,
      notes: formData.notes || '',
    })
    setShowCreateItemModal(true)
  }

  const handleCreateItemTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createItemForm.name.trim()) return
    setCreateItemSaving(true)
    try {
      const created = await createItemTemplate(createItemForm)
      loadItemTemplates()
      handleItemTemplateSelect({
        ...created,
        unit: created.defaultUnit,
        laborRate: created.defaultLaborRate,
        materialRate: created.defaultMaterialRate,
        subcontractorRate: created.defaultSubcontractorRate,
      })
      setShowCreateItemModal(false)
    } catch (err) {
      console.error('Create item template failed:', err)
      alert('Failed to add item to library.')
    } finally {
      setCreateItemSaving(false)
    }
  }

  const slugifyCategory = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const openCreateCategoryModal = () => {
    setCreateCategoryLabel('')
    setCreateCategoryKey('')
    setCreateCategoryError(null)
    setShowCreateCategoryModal(true)
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    const key = (createCategoryKey || slugifyCategory(createCategoryLabel)).trim()
    const label = createCategoryLabel.trim()
    if (!key || !label) {
      setCreateCategoryError('Label is required.')
      return
    }
    if (!/^[a-z0-9-]+$/.test(key)) {
      setCreateCategoryError('Key must be lowercase letters, numbers, and hyphens only.')
      return
    }
    setCreateCategoryError(null)
    setCreateCategorySaving(true)
    try {
      const created = await createTradeCategory({ key, label })
      if (created) {
        await refetchCategories()
        setFormData(prev => ({ ...prev, category: key as TradeCategory }))
        setShowCreateCategoryModal(false)
      }
    } catch (err) {
      console.error('Create category failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setCreateCategoryError(
        msg === 'KEY_EXISTS'
          ? 'That key is already in use. Go to Estimate Library → Trade categories to edit or delete the existing one, or use a different key (e.g. flooring-2).'
          : msg || 'Failed to create category.'
      )
    } finally {
      setCreateCategorySaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>{isAdding ? 'Add Item' : 'Edit Item'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <div className="flex gap-2 mt-1">
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as any }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" onClick={openCreateCategoryModal} className="shrink-0">
                    <Layers className="w-4 h-4 mr-1" />
                    Add category
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="item-template">Item Template (Optional)</Label>
                <div className="flex gap-2 mt-1">
                  {itemTemplates.length > 0 && (
                    <Select onValueChange={(value) => {
                      const template = itemTemplates.find(t => t.id === value)
                      if (template) handleItemTemplateSelect(template)
                    }}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select template to auto-fill" />
                      </SelectTrigger>
                      <SelectContent>
                        {itemTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={openCreateItemModal} className="shrink-0">
                    <BookPlus className="w-4 h-4 mr-1" />
                    Add to library
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="name">Item Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.quantity || 1}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 1 }))}
                />
              </div>

              <div>
                <Label htmlFor="unit">Unit</Label>
                <Select
                  value={formData.unit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, unit: value as UnitType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(UNIT_TYPES).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.abbreviation} - {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="markup">Markup %</Label>
                <Input
                  id="markup"
                  type="number"
                  step="0.1"
                  value={formData.markupPercent || defaultMarkupPercent}
                  onChange={(e) => setFormData(prev => ({ ...prev, markupPercent: parseFloat(e.target.value) || defaultMarkupPercent }))}
                />
              </div>

              <div>
                <Label htmlFor="labor-cost">Labor Cost</Label>
                <Input
                  id="labor-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.laborCost || 0}
                  onChange={(e) => setFormData(prev => ({ ...prev, laborCost: parseFloat(e.target.value) || 0 }))}
                />
              </div>

              <div>
                <Label htmlFor="material-cost">Material Cost</Label>
                <Input
                  id="material-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.materialCost || 0}
                  onChange={(e) => setFormData(prev => ({ ...prev, materialCost: parseFloat(e.target.value) || 0 }))}
                />
              </div>

              <div>
                <Label htmlFor="subcontractor-cost">Subcontractor Cost</Label>
                <Input
                  id="subcontractor-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.subcontractorCost || 0}
                  onChange={(e) => setFormData(prev => ({ ...prev, subcontractorCost: parseFloat(e.target.value) || 0 }))}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onCancel}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit">
                <Save className="w-4 h-4 mr-2" />
                {isAdding ? 'Add Item' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Create trade category modal */}
      {showCreateCategoryModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Add trade category</CardTitle>
              <p className="text-sm text-gray-500">Add a new category for estimates and the item library.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateCategory} className="space-y-4">
                <div>
                  <Label>Label (e.g. Flooring)</Label>
                  <Input
                    value={createCategoryLabel}
                    onChange={(e) => {
                      const label = e.target.value
                      setCreateCategoryLabel(label)
                      setCreateCategoryKey(slugifyCategory(label))
                    }}
                    placeholder="e.g. Flooring"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Key (optional)</Label>
                  <Input
                    value={createCategoryKey}
                    onChange={(e) => setCreateCategoryKey(e.target.value)}
                    placeholder="e.g. flooring — auto-filled from label"
                  />
                  <p className="text-xs text-gray-400 mt-1">Internal ID used in data. Leave blank to use a safe version of the label.</p>
                </div>
                {createCategoryError && <p className="text-sm text-red-600">{createCategoryError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateCategoryModal(false)}>Cancel</Button>
                  <Button type="submit" disabled={createCategorySaving || !createCategoryLabel.trim()}>
                    {createCategorySaving ? 'Saving…' : 'Add category'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create item template modal (add to library from this form) */}
      {showCreateItemModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Add to item library</CardTitle>
              <p className="text-sm text-gray-500">Save this as a reusable item template and apply to this line.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateItemTemplate} className="space-y-4">
                <div>
                  <Label>Category</Label>
                  <Select
                    value={createItemForm.category}
                    onValueChange={(v) => setCreateItemForm(prev => ({ ...prev, category: v as any }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Item name *</Label>
                  <Input
                    value={createItemForm.name}
                    onChange={(e) => setCreateItemForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. 2x4 Stud"
                    required
                  />
                </div>
                <div>
                  <Label>Default unit</Label>
                  <Select
                    value={createItemForm.defaultUnit}
                    onValueChange={(v) => setCreateItemForm(prev => ({ ...prev, defaultUnit: v as UnitType }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(UNIT_TYPES).map(([key, value]) => (
                        <SelectItem key={key} value={key}>{value.abbreviation} - {value.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Material $</Label>
                    <Input type="number" step="0.01" min="0" value={createItemForm.defaultMaterialRate ?? ''} onChange={(e) => setCreateItemForm(prev => ({ ...prev, defaultMaterialRate: parseFloat(e.target.value) || undefined }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Labor $</Label>
                    <Input type="number" step="0.01" min="0" value={createItemForm.defaultLaborRate ?? ''} onChange={(e) => setCreateItemForm(prev => ({ ...prev, defaultLaborRate: parseFloat(e.target.value) || undefined }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Sub $</Label>
                    <Input type="number" step="0.01" min="0" value={createItemForm.defaultSubcontractorRate ?? ''} onChange={(e) => setCreateItemForm(prev => ({ ...prev, defaultSubcontractorRate: parseFloat(e.target.value) || undefined }))} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateItemModal(false)}>Cancel</Button>
                  <Button type="submit" disabled={createItemSaving || !createItemForm.name.trim()}>
                    {createItemSaving ? 'Saving…' : 'Add to library & apply'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
