// ============================================================================
// HSH GC Platform - Estimate Library
// ============================================================================
//
// Item templates, trade categories, and estimate templates for the estimate book.
//

import React, { useState, useEffect } from 'react'
import { ItemTemplate, ItemTemplateInput, Subcontractor } from '@/types'
import {
  getAllItemTemplates,
  getItemTemplatesByCategory,
  createItemTemplate,
  updateItemTemplate,
  deleteItemTemplate,
  resetToDefaults,
} from '@/services'
import { fetchSubcontractors } from '@/services/partnerDirectoryService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTradeCategories } from '@/contexts/TradeCategoriesContext'
import { TradeCategoriesEditor } from '@/components/TradeCategoriesManagement'
import { getCategoryAccentLeftBorderStyle } from '@/lib/categoryAccent'
import { EstimateTemplatesContent } from '@/components/EstimateTemplateManagement'
import { EstimateTemplateEditor } from '@/components/EstimateTemplateEditor'
import { UNIT_TYPES } from '@/types'
import {
  ArrowLeft,
  PlusCircle,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Package,
  Layers,
  FileText,
} from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface ItemLibraryProps {
  onBack: () => void
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

type ItemLibraryTab = 'items' | 'categories' | 'templates'

export function ItemLibrary({ onBack }: ItemLibraryProps) {
  const { categories, byKey } = useTradeCategories()
  const [activeTab, setActiveTab] = useState<ItemLibraryTab>('items')
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [items, setItems] = useState<ItemTemplate[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ItemTemplate | null>(null)

  useEffect(() => {
    loadItems()
  }, [])

  const loadItems = async () => {
    const allItems = await getAllItemTemplates()
    setItems(allItems)
  }

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const handleAddItem = () => {
    setEditingItem(null)
    setShowItemForm(true)
  }

  const handleEditItem = (item: ItemTemplate) => {
    setEditingItem(item)
    setShowItemForm(true)
  }

  const handleDeleteItem = async (id: string) => {
    if (confirm('Are you sure you want to delete this item template?')) {
      await deleteItemTemplate(id)
      await loadItems()
    }
  }

  const handleSaveItem = async (data: ItemTemplateInput) => {
    if (editingItem) {
      await updateItemTemplate(editingItem.id, data)
    } else {
      await createItemTemplate(data)
    }
    await loadItems()
    setShowItemForm(false)
    setEditingItem(null)
  }

  const handleResetToDefaults = async () => {
    if (confirm('This will reset all items to defaults and DELETE any custom items you added. Are you sure?')) {
      resetToDefaults()
      await loadItems()
    }
  }

  const itemsByCategory = items.reduce((acc, item) => {
    const cat = item.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {} as Record<string, ItemTemplate[]>)
  const categoryOrder = categories
    .map((c) => c.key)
    .filter((cat) => (itemsByCategory[cat]?.length ?? 0) > 0)

  const formatCurrency = (amount: number | undefined) =>
    amount !== undefined ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount) : '$0.00'

  // When editing a template from the Library, show full-page editor; Back returns to templates tab
  if (activeTab === 'templates' && editingTemplateId) {
    return (
      <EstimateTemplateEditor
        templateId={editingTemplateId}
        onBack={() => setEditingTemplateId(null)}
        onSave={() => setEditingTemplateId(null)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <div className="p-2 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Header */}
          <ItemLibraryHeader onBack={onBack} />

          {/* Tabs: Item templates | Trade categories | Estimate templates */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === 'items'
                  ? 'border-[#0E79C9] text-[#0E79C9]'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Item templates
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === 'categories'
                  ? 'border-[#0E79C9] text-[#0E79C9]'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Trade categories
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === 'templates'
                  ? 'border-[#0E79C9] text-[#0E79C9]'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Estimate templates
              </span>
            </button>
          </div>

          {activeTab === 'categories' ? (
            <div className="max-w-2xl">
              <TradeCategoriesEditor />
            </div>
          ) : activeTab === 'templates' ? (
            <EstimateTemplatesContent onOpenEditor={setEditingTemplateId} />
          ) : (
            <>
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleAddItem}
              className="flex-1 sm:flex-none bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add New Item
            </Button>
            <Button
              onClick={handleResetToDefaults}
              variant="outline"
              className="flex-1 sm:flex-none border-orange-600 text-orange-600 hover:bg-orange-600 hover:text-white"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>

          {/* Items by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Item Templates by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {categoryOrder.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">No item templates</p>
                    <p>Click "Add New Item" to create your first template</p>
                  </div>
                ) : (
                  categoryOrder.map((category) => {
                    const categoryItems = itemsByCategory[category] || []
                    const isCategoryExpanded = expandedCategories.has(category)

                    return (
                      <Card key={category} className="border-2 border-blue-200 border-l-4" style={getCategoryAccentLeftBorderStyle(category)}>
                        <button
                          onClick={() => toggleCategory(category)}
                          className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-blue-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-left">
                              <p className="font-bold text-blue-800">
                                {byKey[category]?.label || category}
                              </p>
                              <p className="text-xs text-blue-600">{categoryItems.length} items</p>
                            </div>
                          </div>
                          {isCategoryExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>

                        {isCategoryExpanded && (
                          <div className="border-t border-blue-200 bg-blue-50 p-4 space-y-3">
                            {categoryItems.map((item) => (
                              <div key={item.id} className="bg-white rounded-lg p-3 border border-gray-200 flex items-center gap-4 flex-wrap">
                                <div className="min-w-0 flex-shrink-0" style={{ minWidth: '140px' }}>
                                  <h4 className="font-semibold text-gray-900">{item.name}</h4>
                                  {item.description && (
                                    <p className="text-sm text-gray-600">{item.description}</p>
                                  )}
                                </div>
                                <div className="flex gap-x-6 gap-y-1 text-sm flex-1 min-w-0 justify-center">
                                  <div className="flex flex-col gap-0.5">
                                    <div>
                                      <span className="text-gray-600">Default Unit:</span>
                                      <span className="ml-2 font-medium">
                                        {UNIT_TYPES[item.defaultUnit]?.abbreviation || item.defaultUnit}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">Material Unit Cost:</span>
                                      <span className="ml-2 font-medium">{formatCurrency(item.defaultMaterialRate)}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">Labor Unit Cost:</span>
                                      <span className="ml-2 font-medium">{formatCurrency(item.defaultLaborRate)}</span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <div>
                                      <span className="text-gray-600">Type:</span>
                                      <span className="ml-2 font-medium">
                                        {item.isSubcontracted ? 'Subcontracted' : 'Self-Performed'}
                                      </span>
                                    </div>
                                    {item.isSubcontracted && (
                                      <>
                                        <div>
                                          <span className="text-gray-600">Subcontractor unit:</span>
                                          <span className="ml-2 font-medium">
                                            {formatCurrency(item.defaultSubcontractorRate)}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Subcontractor lump:</span>
                                          <span className="ml-2 font-medium">
                                            {formatCurrency(item.defaultSubcontractorCost)}
                                          </span>
                                        </div>
                                      </>
                                    )}
                                    {item.defaultWasteFactor != null && item.defaultWasteFactor > 0 && (
                                      <div>
                                        <span className="text-gray-600">Waste %:</span>
                                        <span className="ml-2 font-medium">{item.defaultWasteFactor}%</span>
                                      </div>
                                    )}
                                    {(item.rateSourceName || item.rateSourceDate) && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        Rate: {[item.rateSourceName, item.rateSourceDate ? new Date(item.rateSourceDate).toLocaleDateString() : null].filter(Boolean).join(', ')}
                                        {item.rateSourceNotes && ` — ${item.rateSourceNotes}`}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditItem(item)}
                                  >
                                    <Edit className="w-3 h-3 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleDeleteItem(item.id)}
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
            </>
          )}
        </div>
      </div>

      {/* Item Form Modal */}
      {showItemForm && (
        <ItemForm
          item={editingItem}
          onSave={handleSaveItem}
          onCancel={() => {
            setShowItemForm(false)
            setEditingItem(null)
          }}
        />
      )}

      {/* Mobile Back Button */}
      {onBack && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg z-40">
          <Button onClick={onBack} variant="outline" className="border-gray-300 hover:bg-gray-50 w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Header Component
// ----------------------------------------------------------------------------

interface ItemLibraryHeaderProps {
  onBack?: () => void
}

function ItemLibraryHeader({ onBack }: ItemLibraryHeaderProps) {
  return (
    <>
      {/* Mobile Header */}
      <header className="sm:hidden bg-white shadow-md border-b border-gray-200">
        <div className="px-4 py-4">
          <div className="flex items-center space-x-3">
            <img src={hshLogo} alt="HSH Contractor" className="h-16 w-auto" />
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">Estimate Library</h1>
              <p className="text-xs text-gray-600">Items, categories, and estimate templates</p>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop Header */}
      <Card className="hidden sm:block bg-gradient-to-br from-gray-50 to-white border border-gray-200 shadow-lg">
        <CardHeader className="pb-3 sm:pb-6">
          <div className="space-y-2 sm:space-y-4">
            <div className="flex items-center justify-center gap-2 sm:gap-4 lg:gap-6">
              <div className="flex-shrink-0">
                <img src={hshLogo} alt="HSH Contractor Logo" className="h-20 sm:h-32 lg:h-40 w-auto" />
              </div>
              <div className="flex-shrink-0">
                <h2 className="text-xl sm:text-4xl lg:text-5xl font-bold text-gray-900">Estimate Library</h2>
                <p className="text-sm sm:text-base text-gray-600 mt-1">Item templates, trade categories, and estimate templates</p>
              </div>
            </div>

            {onBack && (
              <div className="hidden sm:flex justify-center">
                <Button
                  onClick={onBack}
                  variant="outline"
                  size="sm"
                  className="border-gray-300 hover:bg-gray-50 w-full max-w-md text-xs sm:text-sm"
                >
                  <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Back to Projects
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>
    </>
  )
}

// ----------------------------------------------------------------------------
// Item Form Component
// ----------------------------------------------------------------------------

interface ItemFormProps {
  item: ItemTemplate | null
  onSave: (data: ItemTemplateInput) => Promise<void> | void
  onCancel: () => void
}

const RATE_SOURCE_OTHER = '__other__'
const RATE_SOURCE_NONE = '__none__'

function ItemForm({ item, onSave, onCancel }: ItemFormProps) {
  const { categories } = useTradeCategories()
  const [formData, setFormData] = useState<ItemTemplateInput>({
    category: item?.category || 'rough-framing',
    name: item?.name || '',
    description: item?.description || '',
    defaultUnit: item?.defaultUnit || 'each',
    defaultMaterialRate: item?.defaultMaterialRate,
    defaultLaborRate: item?.defaultLaborRate,
    defaultSubcontractorRate: item?.defaultSubcontractorRate,
    defaultSubcontractorCost: item?.defaultSubcontractorCost,
    isSubcontracted: item?.isSubcontracted || false,
    defaultWasteFactor: item?.defaultWasteFactor ?? 10,
    notes: item?.notes || '',
    rateSourceName: item?.rateSourceName ?? undefined,
    rateSourceDate: item?.rateSourceDate ?? undefined,
    rateSourceNotes: item?.rateSourceNotes ?? undefined,
  })
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [subsLoaded, setSubsLoaded] = useState(false)

  useEffect(() => {
    fetchSubcontractors({ includeInactive: true })
      .then((list) => setSubcontractors(list ?? []))
      .catch(() => setSubcontractors([]))
      .finally(() => setSubsLoaded(true))
  }, [])

  const subsWithNames = subcontractors.filter((s) => s?.name != null && String(s.name).trim() !== '')
  const rateSourceSelectValue = (() => {
    if (!formData.rateSourceName || String(formData.rateSourceName).trim() === '') return RATE_SOURCE_NONE
    const name = String(formData.rateSourceName).trim()
    if (subsWithNames.some((s) => s.name === name)) return name
    return RATE_SOURCE_OTHER
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSave(formData)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>{item ? 'Edit Item Template' : 'Add New Item Template'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="name">Item Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="defaultUnit">Default Unit *</Label>
              <Select
                value={formData.defaultUnit}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, defaultUnit: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(UNIT_TYPES).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.abbreviation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="defaultMaterialRate">
                    {formData.isSubcontracted ? 'Material Unit Cost (optional)' : 'Material Unit Cost'}
                  </Label>
                  <Input
                    id="defaultMaterialRate"
                    type="number"
                    step="0.01"
                    value={formData.defaultMaterialRate ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        defaultMaterialRate: e.target.value === '' ? undefined : parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="defaultLaborRate">
                    {formData.isSubcontracted ? 'Labor Unit Cost (optional)' : 'Labor Unit Cost'}
                  </Label>
                  <Input
                    id="defaultLaborRate"
                    type="number"
                    step="0.01"
                    value={formData.defaultLaborRate ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        defaultLaborRate: e.target.value === '' ? undefined : parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="defaultSubcontractorRate">Subcontractor Unit Cost (optional)</Label>
                  <Input
                    id="defaultSubcontractorRate"
                    type="number"
                    step="0.01"
                    value={formData.defaultSubcontractorRate ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        defaultSubcontractorRate: e.target.value === '' ? undefined : parseFloat(e.target.value),
                      }))
                    }
                    placeholder="Per unit"
                  />
                </div>
                <div>
                  <Label htmlFor="defaultSubcontractorCost">Subcontractor Lump Sum (optional)</Label>
                  <Input
                    id="defaultSubcontractorCost"
                    type="number"
                    step="0.01"
                    value={formData.defaultSubcontractorCost ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        defaultSubcontractorCost: e.target.value === '' ? undefined : parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="isSubcontracted">Work Type</Label>
                <Select
                  value={formData.isSubcontracted ? 'yes' : 'no'}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      isSubcontracted: value === 'yes',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Self-Performed</SelectItem>
                    <SelectItem value="yes">Subcontracted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.isSubcontracted && (
              <p className="text-xs text-gray-500 -mt-2">
                Use unit cost for per-unit pricing (like material/labor), or lump sum for a fixed total.
              </p>
            )}

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Rate source (audit)</p>
              <p className="text-xs text-gray-500">
                Optional: who provided this rate and when, for reference and history.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rateSourceName">Source (subcontractor)</Label>
                  {subsLoaded ? (
                    <>
                      <Select
                        value={rateSourceSelectValue}
                        onValueChange={(value) => {
                          if (value === RATE_SOURCE_NONE) {
                            setFormData((prev) => ({ ...prev, rateSourceName: undefined }))
                          } else if (value === RATE_SOURCE_OTHER) {
                            setFormData((prev) => ({ ...prev, rateSourceName: prev.rateSourceName || '' }))
                          } else {
                            setFormData((prev) => ({ ...prev, rateSourceName: value }))
                          }
                        }}
                      >
                        <SelectTrigger id="rateSourceName">
                          <SelectValue placeholder="Select or type below" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={RATE_SOURCE_NONE}>None</SelectItem>
                          {subsWithNames.map((s) => (
                            <SelectItem key={s.id} value={String(s.name)}>
                              {s.name}
                            </SelectItem>
                          ))}
                          <SelectItem value={RATE_SOURCE_OTHER}>Other…</SelectItem>
                        </SelectContent>
                      </Select>
                      {rateSourceSelectValue === RATE_SOURCE_OTHER && (
                        <Input
                          className="mt-2"
                          value={formData.rateSourceName ?? ''}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, rateSourceName: e.target.value || undefined }))
                          }
                          placeholder="e.g. Tapco or vendor name"
                        />
                      )}
                    </>
                  ) : (
                    <Input
                      id="rateSourceName"
                      value={formData.rateSourceName ?? ''}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, rateSourceName: e.target.value || undefined }))
                      }
                      placeholder="Loading…"
                      disabled
                    />
                  )}
                </div>
                <div>
                  <Label htmlFor="rateSourceDate">Date provided</Label>
                  <Input
                    id="rateSourceDate"
                    type="date"
                    value={formData.rateSourceDate ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, rateSourceDate: e.target.value || undefined }))
                    }
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="rateSourceNotes">Rate notes</Label>
                <Input
                  id="rateSourceNotes"
                  value={formData.rateSourceNotes ?? ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, rateSourceNotes: e.target.value || undefined }))
                  }
                  placeholder="e.g. Per email; includes XYZ"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
              >
                {item ? 'Save Changes' : 'Add Item'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

