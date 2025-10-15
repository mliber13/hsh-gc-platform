// ============================================================================
// HSH GC Platform - Item Library
// ============================================================================
//
// Manage default item templates and rates for estimates
//

import React, { useState, useEffect } from 'react'
import { ItemTemplate, ItemTemplateInput } from '@/types'
import {
  getAllItemTemplates,
  getItemTemplatesByCategory,
  createItemTemplate,
  updateItemTemplate,
  deleteItemTemplate,
  resetToDefaults,
} from '@/services'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TRADE_CATEGORIES, UNIT_TYPES } from '@/types'
import {
  ArrowLeft,
  PlusCircle,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Package,
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

export function ItemLibrary({ onBack }: ItemLibraryProps) {
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

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = []
    }
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, ItemTemplate[]>)

  const formatCurrency = (amount: number | undefined) =>
    amount !== undefined ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount) : '$0.00'

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <div className="p-2 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Header */}
          <ItemLibraryHeader onBack={onBack} />

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
                {Object.entries(groupedItems).length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">No item templates</p>
                    <p>Click "Add New Item" to create your first template</p>
                  </div>
                ) : (
                  Object.entries(groupedItems).map(([category, categoryItems]) => {
                    const isExpanded = expandedCategories.has(category)

                    return (
                      <Card key={category} className="border-2">
                        <button
                          onClick={() => toggleCategory(category)}
                          className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">
                              {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                            </span>
                            <div className="text-left">
                              <p className="font-bold text-gray-900">
                                {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                              </p>
                              <p className="text-xs text-gray-500">{categoryItems.length} items</p>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>

                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-3">
                            {categoryItems.map((item) => (
                              <div key={item.id} className="bg-white rounded-lg p-4 border border-gray-200">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-gray-900">{item.name}</h4>
                                    {item.description && (
                                      <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
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

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-600">Unit:</span>
                                    <span className="ml-2 font-medium">
                                      {UNIT_TYPES[item.defaultUnit]?.abbreviation || item.defaultUnit}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Material:</span>
                                    <span className="ml-2 font-medium">{formatCurrency(item.defaultMaterialRate)}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Labor:</span>
                                    <span className="ml-2 font-medium">{formatCurrency(item.defaultLaborRate)}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Type:</span>
                                    <span className="ml-2 font-medium">
                                      {item.isSubcontracted ? 'Subcontracted' : 'Self-Performed'}
                                    </span>
                                  </div>
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
              <h1 className="text-lg font-bold text-gray-900">Item Library</h1>
              <p className="text-xs text-gray-600">Manage default items and rates</p>
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
                <h2 className="text-xl sm:text-4xl lg:text-5xl font-bold text-gray-900">Item Library</h2>
                <p className="text-sm sm:text-base text-gray-600 mt-1">Manage default items and rates for estimates</p>
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
  onSave: (data: ItemTemplateInput) => void
  onCancel: () => void
}

function ItemForm({ item, onSave, onCancel }: ItemFormProps) {
  const [formData, setFormData] = useState<ItemTemplateInput>({
    category: item?.category || 'rough-framing',
    name: item?.name || '',
    description: item?.description || '',
    defaultUnit: item?.defaultUnit || 'each',
    defaultMaterialRate: item?.defaultMaterialRate,
    defaultLaborRate: item?.defaultLaborRate,
    defaultSubcontractorCost: item?.defaultSubcontractorCost,
    isSubcontracted: item?.isSubcontracted || false,
    defaultWasteFactor: item?.defaultWasteFactor || 10,
    notes: item?.notes || '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
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
                    {Object.entries(TRADE_CATEGORIES).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.icon} {value.label}
                      </SelectItem>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {!formData.isSubcontracted && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="defaultMaterialRate">Default Material Rate</Label>
                  <Input
                    id="defaultMaterialRate"
                    type="number"
                    step="0.01"
                    value={formData.defaultMaterialRate || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        defaultMaterialRate: parseFloat(e.target.value) || undefined,
                      }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="defaultLaborRate">Default Labor Rate</Label>
                  <Input
                    id="defaultLaborRate"
                    type="number"
                    step="0.01"
                    value={formData.defaultLaborRate || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        defaultLaborRate: parseFloat(e.target.value) || undefined,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {formData.isSubcontracted && (
              <div>
                <Label htmlFor="defaultSubcontractorCost">Default Subcontractor Cost</Label>
                <Input
                  id="defaultSubcontractorCost"
                  type="number"
                  step="0.01"
                  value={formData.defaultSubcontractorCost || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      defaultSubcontractorCost: parseFloat(e.target.value) || undefined,
                    }))
                  }
                />
              </div>
            )}

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              />
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

