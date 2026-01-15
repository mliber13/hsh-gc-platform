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
import { Trade, TradeInput } from '@/types'
import {
  getEstimateTemplateById,
  updateEstimateTemplate,
} from '@/services/estimateTemplateService'
import { getItemTemplatesByCategory } from '@/services/itemTemplateService'
import { fetchSubcontractors } from '@/services/partnerService'
import { TRADE_CATEGORIES, UNIT_TYPES, formatCurrency } from '@/types/constants'
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
import { ArrowLeft, Plus, Edit, Trash2, Save, X } from 'lucide-react'
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
      category: 'general',
      name: '',
      description: '',
      quantity: 1,
      unit: 'each',
      laborCost: 0,
      materialCost: 0,
      subcontractorCost: 0,
      totalCost: 0,
      markupPercent: template?.defaultMarkupPercent || 11.1,
      isSubcontracted: false,
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

  const calculateTotals = () => {
    const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
    const grossProfitTotal = trades.reduce((sum, trade) => {
      const markup = trade.markupPercent || template?.defaultMarkupPercent || 11.1
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
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="p-3 text-left border-b border-r border-gray-300">Category</th>
                      <th className="p-3 text-left border-b border-r border-gray-300">Item Name</th>
                      <th className="p-3 text-center border-b border-r border-gray-300">Qty</th>
                      <th className="p-3 text-center border-b border-r border-gray-300">Unit</th>
                      <th className="p-3 text-center border-b border-r border-gray-300">Material Cost</th>
                      <th className="p-3 text-center border-b border-r border-gray-300">Labor Cost</th>
                      <th className="p-3 text-center border-b border-r border-gray-300">Sub Cost</th>
                      <th className="p-3 text-center border-b border-r border-gray-300">Total Cost</th>
                      <th className="p-3 text-center border-b border-r border-gray-300">Markup %</th>
                      <th className="p-3 text-center border-b">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => (
                      <tr key={trade.tempId} className="hover:bg-gray-50">
                        <td className="p-3 border-b border-r border-gray-200">
                          {TRADE_CATEGORIES[trade.category]?.label || trade.category}
                        </td>
                        <td className="p-3 border-b border-r border-gray-200">{trade.name}</td>
                        <td className="p-3 text-center border-b border-r border-gray-200">{trade.quantity}</td>
                        <td className="p-3 text-center border-b border-r border-gray-200">{trade.unit}</td>
                        <td className="p-3 text-center border-b border-r border-gray-200">{formatCurrency(trade.materialCost)}</td>
                        <td className="p-3 text-center border-b border-r border-gray-200">{formatCurrency(trade.laborCost)}</td>
                        <td className="p-3 text-center border-b border-r border-gray-200">{formatCurrency(trade.subcontractorCost)}</td>
                        <td className="p-3 text-center border-b border-r border-gray-200 font-semibold">{formatCurrency(trade.totalCost)}</td>
                        <td className="p-3 text-center border-b border-r border-gray-200">{trade.markupPercent || template.defaultMarkupPercent || 11.1}%</td>
                        <td className="p-3 text-center border-b">
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="outline" onClick={() => handleEditTrade(trade)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteTrade(trade.tempId)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          defaultMarkupPercent={template.defaultMarkupPercent || 11.1}
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
  const [formData, setFormData] = useState<EditableTrade>(trade)
  const [itemTemplates, setItemTemplates] = useState<any[]>([])

  useEffect(() => {
    if (formData.category) {
      getItemTemplatesByCategory(formData.category).then(templates => {
        setItemTemplates(templates)
      })
    }
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
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRADE_CATEGORIES).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.icon} {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {itemTemplates.length > 0 && (
                <div>
                  <Label htmlFor="item-template">Item Template (Optional)</Label>
                  <Select onValueChange={(value) => {
                    const template = itemTemplates.find(t => t.id === value)
                    if (template) handleItemTemplateSelect(template)
                  }}>
                    <SelectTrigger>
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
                </div>
              )}

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
    </div>
  )
}
