// ============================================================================
// Estimate Builder Component
// ============================================================================
//
// Main component for building estimates, matching the Excel "Estimate Book" structure
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import hshLogo from '/HSH Contractor Logo - Color.png'
import {
  Project,
  Estimate,
  Trade,
  TradeInput,
  UnitType,
  TRADE_CATEGORIES,
  UNIT_TYPES,
  DEFAULT_VALUES,
  DEFAULT_CATEGORY_ITEMS,
  PROJECT_TYPES,
} from '@/types'
import {
  createProject,
  updateProject,
  addTrade,
  updateTrade,
  deleteTrade,
  recalculateEstimate,
} from '@/services'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { 
  Edit, 
  Trash2, 
  PlusCircle, 
  Info, 
  Building, 
  MapPin, 
  Calendar, 
  DollarSign, 
  Percent, 
  Calculator, 
  ClipboardList, 
  Users, 
  Tag, 
  Ruler, 
  Hammer, 
  Package, 
  HardHat, 
  FileText, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  ChevronDown, 
  ChevronUp,
  ArrowLeft
} from 'lucide-react'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface EstimateBuilderProps {
  project?: Project | null
  onSave?: (project: Project) => void
  onBack?: () => void
}

interface TradeFormData extends TradeInput {
  id?: string
  isEditing?: boolean
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function EstimateBuilder({ project, onSave, onBack }: EstimateBuilderProps) {
  // State
  const [projectData, setProjectData] = useState<Project | null>(project || null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [editingTrade, setEditingTrade] = useState<TradeFormData | null>(null)
  const [isAddingTrade, setIsAddingTrade] = useState(false)

  // Initialize project if none provided
  useEffect(() => {
    if (!projectData) {
      const newProject = createProject({
        name: 'New Project',
        client: { name: 'New Client' },
        type: 'residential',
      })
      setProjectData(newProject)
    }
  }, [projectData])

  // Load trades when project changes
  useEffect(() => {
    if (projectData) {
      setTrades(projectData.estimate.trades || [])
    }
  }, [projectData])

  // ----------------------------------------------------------------------------
  // Event Handlers
  // ----------------------------------------------------------------------------

  const handleProjectUpdate = (updates: Partial<Project>) => {
    if (!projectData) return

    const updated = updateProject(projectData.id, updates)
    if (updated) {
      setProjectData(updated)
      onSave?.(updated)
    }
  }

  const handleAddTrade = () => {
    setEditingTrade({
      category: 'other',
      name: '',
      quantity: 0,
      unit: 'each',
      laborCost: 0,
      materialCost: 0,
      subcontractorCost: 0,
      isSubcontracted: false,
      wasteFactor: DEFAULT_VALUES.WASTE_FACTOR,
      isEditing: true,
    })
    setIsAddingTrade(true)
  }

  const handleEditTrade = (trade: Trade) => {
    setEditingTrade({
      id: trade.id,
      category: trade.category,
      name: trade.name,
      description: trade.description,
      quantity: trade.quantity,
      unit: trade.unit,
      laborCost: trade.laborCost,
      laborRate: trade.laborRate,
      laborHours: trade.laborHours,
      materialCost: trade.materialCost,
      materialRate: trade.materialRate,
      subcontractorCost: trade.subcontractorCost,
      isSubcontracted: trade.isSubcontracted,
      wasteFactor: trade.wasteFactor,
      notes: trade.notes,
      isEditing: true,
    })
    setIsAddingTrade(false)
  }

  const handleSaveTrade = async () => {
    if (!editingTrade || !projectData) return

    try {
      let updatedTrade: Trade

      if (isAddingTrade) {
        // Add new trade
        updatedTrade = addTrade(projectData.estimate.id, editingTrade)
        setTrades(prev => [...prev, updatedTrade])
      } else {
        // Update existing trade
        if (!editingTrade.id) return
        
        const result = updateTrade(editingTrade.id, editingTrade)
        if (!result) return
        updatedTrade = result
        setTrades(prev => prev.map(t => t.id === editingTrade.id ? updatedTrade! : t))
      }

      // Project data will be updated through trade storage
      // Just refresh the local state
      setProjectData({ ...projectData, updatedAt: new Date() })

      setEditingTrade(null)
      setIsAddingTrade(false)
    } catch (error) {
      console.error('Error saving trade:', error)
    }
  }

  const handleDeleteTrade = (tradeId: string) => {
    if (!projectData) return

    const deleted = deleteTrade(tradeId)
    if (deleted) {
      setTrades(prev => prev.filter(t => t.id !== tradeId))
      
      // Update project data
      // Update local state
      setProjectData({ ...projectData, updatedAt: new Date() })
    }
  }

  const handleCancelEdit = () => {
    setEditingTrade(null)
    setIsAddingTrade(false)
  }

  const handleAddDefaultCategories = () => {
    if (!projectData) return

    const defaultCategories = [
      'planning', 'site-prep', 'excavation-foundation', 'utilities', 'water-sewer',
      'rough-framing', 'windows-doors', 'exterior-finishes', 'roofing', 'masonry-paving',
      'porches-decks', 'insulation', 'plumbing', 'electrical', 'hvac', 'drywall',
      'interior-finishes', 'kitchen', 'bath', 'appliances'
    ]

    const newTrades: Trade[] = defaultCategories.map((category, index) => {
      const tradeId = uuidv4()
      return {
        id: tradeId,
        estimateId: projectData.estimate.id,
        category: category as any,
        name: `${TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category} - To Be Determined`,
        description: '',
        quantity: 0,
        unit: 'each',
        laborCost: 0,
        laborRate: 0,
        laborHours: 0,
        materialCost: 0,
        materialRate: 0,
        subcontractorCost: 0,
        isSubcontracted: false,
        wasteFactor: DEFAULT_VALUES.WASTE_FACTOR,
        totalCost: 0,
        sortOrder: index,
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    const updatedTrades = [...trades, ...newTrades]
    setTrades(updatedTrades)

    // Update local state
    setProjectData({ ...projectData, updatedAt: new Date() })
  }

  // ----------------------------------------------------------------------------
  // Calculations
  // ----------------------------------------------------------------------------

  const calculateTotals = () => {
    const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
    const contingency = basePriceTotal * 0.10 // 10% contingency
    const grossProfitTotal = trades.reduce((sum, trade) => {
      // Calculate gross profit for each trade (11.1% markup)
      const markup = trade.totalCost * 0.111
      return sum + markup
    }, 0)
    const totalEstimated = basePriceTotal + contingency + grossProfitTotal
    const marginOfProfit = totalEstimated > 0 ? (grossProfitTotal / totalEstimated) * 100 : 0

    return {
      basePriceTotal,
      contingency,
      grossProfitTotal,
      totalEstimated,
      marginOfProfit,
    }
  }

  const totals = calculateTotals()

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  if (!projectData) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-2 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Header Section with integrated back button */}
          <ProjectHeader
            project={projectData}
            onUpdate={handleProjectUpdate}
            onBack={onBack}
          />

        {/* Summary Section */}
        <SummarySection totals={totals} />

        {/* Main Trade Table */}
        <TradeTable
          trades={trades}
          onEditTrade={handleEditTrade}
          onDeleteTrade={handleDeleteTrade}
          onAddTrade={handleAddTrade}
          onAddDefaultCategories={handleAddDefaultCategories}
        />

        {/* Trade Form Modal */}
        {editingTrade && (
          <TradeForm
            trade={editingTrade}
            onSave={handleSaveTrade}
            onCancel={handleCancelEdit}
            isAdding={isAddingTrade}
          />
        )}
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Project Header Component
// ----------------------------------------------------------------------------

interface ProjectHeaderProps {
  project: Project
  onUpdate: (updates: Partial<Project>) => void
  onBack?: () => void
}

function ProjectHeader({ project, onUpdate, onBack }: ProjectHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: project.name,
    planId: project.metadata?.planId || '',
    address: project.address?.street 
      ? `${project.address.street}, ${project.address.city}, ${project.address.state} ${project.address.zip}`
      : `${project.city || ''}, ${project.state || ''} ${project.zipCode || ''}`.trim(),
    type: project.type,
    startDate: project.startDate ? project.startDate.toISOString().split('T')[0] : '',
    endDate: project.endDate ? project.endDate.toISOString().split('T')[0] : '',
  })

  const handleSave = () => {
    // Parse address back into components
    const addressParts = formData.address.split(',').map(s => s.trim())
    const street = addressParts[0] || ''
    const city = addressParts[1] || ''
    const stateZip = addressParts[2] || ''
    const [state, zipCode] = stateZip.split(' ').filter(Boolean)
    
    onUpdate({
      name: formData.name,
      type: formData.type,
      address: {
        street: street,
        city: city,
        state: state || '',
        zip: zipCode || '',
      },
      city: city,
      state: state || '',
      zipCode: zipCode || '',
      startDate: formData.startDate ? new Date(formData.startDate) : undefined,
      endDate: formData.endDate ? new Date(formData.endDate) : undefined,
      metadata: {
        ...project.metadata,
        planId: formData.planId,
      },
    })
    setIsEditing(false)
  }

  return (
    <Card className="bg-gradient-to-br from-gray-50 to-white text-gray-900 border border-gray-200 shadow-lg">
      <CardHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3 sm:gap-4 lg:gap-6">
            {/* HSH Logo */}
            <div className="flex-shrink-0">
              <img 
                src={hshLogo} 
                alt="HSH Contractor Logo" 
                className="h-20 sm:h-32 lg:h-40 w-auto"
              />
            </div>
            
            {/* Estimate Book Title */}
            <div className="flex-shrink-0">
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-gray-900">Estimate Book</h2>
            </div>
          </div>
          
          {/* Back Button - Full Width Centered */}
          {onBack && (
            <div className="flex justify-center">
              <Button
                onClick={onBack}
                variant="outline"
                className="border-gray-300 hover:bg-gray-50 w-full max-w-md"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {project ? 'Back to Project Detail' : 'Back to Projects'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {isEditing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="projectName" className="text-gray-700">Project Name</Label>
              <Input
                id="projectName"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="bg-white border-[#E65133] text-gray-900 focus:border-[#66A3FF]"
              />
            </div>
            <div>
              <Label htmlFor="planId" className="text-gray-700">Plan ID</Label>
              <Input
                id="planId"
                value={formData.planId}
                onChange={(e) => setFormData(prev => ({ ...prev, planId: e.target.value }))}
                className="bg-white border-[#E65133] text-gray-900 focus:border-[#66A3FF]"
              />
            </div>
            <div>
              <Label htmlFor="projectType" className="text-gray-700">Project Type</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, type: value as any }))}
              >
                <SelectTrigger className="bg-white border-[#E65133] text-gray-900 focus:border-[#66A3FF]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROJECT_TYPES).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="location" className="text-gray-700">Project Location</Label>
              <Input
                id="location"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="bg-white border-[#E65133] text-gray-900 focus:border-[#66A3FF]"
              />
            </div>
            <div>
              <Label htmlFor="startDate" className="text-gray-700">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                className="bg-white border-[#E65133] text-gray-900 focus:border-[#66A3FF]"
              />
            </div>
            <div>
              <Label htmlFor="endDate" className="text-gray-700">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                className="bg-white border-[#E65133] text-gray-900 focus:border-[#66A3FF]"
              />
            </div>
            <div className="col-span-1 sm:col-span-2 flex gap-2">
              <Button 
                onClick={handleSave} 
                size="sm"
                className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226] text-white border-none shadow-lg"
              >
                Save
              </Button>
              <Button 
                onClick={() => setIsEditing(false)} 
                variant="outline" 
                size="sm"
                className="border-[#66A3FF] text-[#66A3FF] hover:bg-[#66A3FF] hover:text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <Label className="text-[#E65133]">Project Name</Label>
              <p className="text-gray-900 font-semibold">{project.name}</p>
            </div>
            <div>
              <Label className="text-[#E65133]">Plan ID</Label>
              <p className="text-gray-900 font-semibold">{project.metadata?.planId || 'Not set'}</p>
              {project.metadata?.planOptions && project.metadata.planOptions.length > 0 && (
                <div className="mt-1">
                  {project.metadata.planOptions.map((option: string) => (
                    <span 
                      key={option}
                      className="inline-block text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded mr-1"
                    >
                      {option}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label className="text-[#E65133]">Project Type</Label>
              <p className="text-gray-900 font-semibold capitalize">{project.type.replace('-', ' ')}</p>
            </div>
            <div>
              <Label className="text-[#E65133]">Project Location</Label>
              <p className="text-gray-900 font-semibold text-sm">
                {project.address?.street || 'Not set'}
                {project.city && `, ${project.city}`}
                {project.state && `, ${project.state}`}
                {project.zipCode && ` ${project.zipCode}`}
              </p>
            </div>
            <div>
              <Label className="text-[#E65133]">Start Date</Label>
              <p className="text-gray-900 font-semibold">
                {project.startDate ? project.startDate.toLocaleDateString() : 'Not set'}
              </p>
            </div>
            <div>
              <Label className="text-[#E65133]">End Date</Label>
              <p className="text-gray-900 font-semibold">
                {project.endDate ? project.endDate.toLocaleDateString() : 'Not set'}
              </p>
            </div>
            <div>
              <Label className="text-[#E65133]">Status</Label>
              <p className="text-gray-900 font-semibold capitalize">{project.status.replace('-', ' ')}</p>
            </div>
            <div>
              <Label className="text-[#E65133]">Created</Label>
              <p className="text-gray-900 font-semibold">{project.createdAt.toLocaleDateString()}</p>
            </div>
            <div className="col-span-2">
              <Button 
                onClick={() => setIsEditing(true)} 
                variant="outline" 
                size="sm"
                className="border-[#66A3FF] text-[#66A3FF] hover:bg-[#66A3FF] hover:text-white shadow-lg w-full sm:w-auto"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Project Info
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------------------
// Summary Section Component
// ----------------------------------------------------------------------------

interface SummarySectionProps {
  totals: {
    basePriceTotal: number
    contingency: number
    grossProfitTotal: number
    totalEstimated: number
    marginOfProfit: number
  }
}

function SummarySection({ totals }: SummarySectionProps) {
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatPercent = (percent: number) => `${percent.toFixed(1)}%`

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estimate Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-[#213069] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-xs sm:text-sm opacity-90">Base Price Total</p>
            <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totals.basePriceTotal)}</p>
          </div>
          <div className="bg-[#D95C00] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-xs sm:text-sm opacity-90">Contingency</p>
            <p className="text-xl sm:text-2xl font-bold">{formatPercent(10)}</p>
          </div>
          <div className="bg-[#D95C00] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-xs sm:text-sm opacity-90">Gross Profit Total</p>
            <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totals.grossProfitTotal)}</p>
          </div>
          <div className="bg-[#D95C00] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-xs sm:text-sm opacity-90">Margin of Profit</p>
            <p className="text-xl sm:text-2xl font-bold">{formatPercent(totals.marginOfProfit)}</p>
          </div>
          <div className="bg-[#34AB8A] text-white p-4 rounded-lg text-center shadow-lg sm:col-span-2 lg:col-span-1">
            <p className="text-xs sm:text-sm opacity-90">Total Estimated</p>
            <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totals.totalEstimated)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------------------
// Trade Table Component
// ----------------------------------------------------------------------------

interface TradeTableProps {
  trades: Trade[]
  onEditTrade: (trade: Trade) => void
  onDeleteTrade: (tradeId: string) => void
  onAddTrade: () => void
  onAddDefaultCategories: () => void
}

function TradeTable({ trades, onEditTrade, onDeleteTrade, onAddTrade, onAddDefaultCategories }: TradeTableProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatNumber = (num: number) => num.toFixed(2)

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  // Group trades by category
  const groupedTrades = trades.reduce((acc, trade) => {
    if (!acc[trade.category]) {
      acc[trade.category] = []
    }
    acc[trade.category].push(trade)
    return acc
  }, {} as Record<string, Trade[]>)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>Estimate Breakdown</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              onClick={onAddDefaultCategories}
              variant="outline"
              size="sm"
              className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white w-full sm:w-auto"
            >
              <Package className="w-4 h-4 mr-2" />
              Add Default Categories
            </Button>
            <Button 
              onClick={onAddTrade}
              size="sm"
              className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226] text-white border-none shadow-lg w-full sm:w-auto"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Trade
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile View - Accordion Style */}
        <div className="md:hidden space-y-2">
          {Object.entries(groupedTrades).length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No trades added yet. Click "Add Trade" to get started.
            </div>
          ) : (
            Object.entries(groupedTrades).map(([category, categoryTrades]) => {
              const categoryTotal = categoryTrades.reduce((sum, t) => sum + t.totalCost, 0)
              const categoryEstimated = categoryTotal * 1.111
              const isExpanded = expandedCategories.has(category)

              return (
                <Card key={category} className="border-2 border-gray-200">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                      </span>
                      <div className="text-left">
                        <p className="font-bold text-gray-900">
                          {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                        </p>
                        <p className="text-xs text-gray-500">{categoryTrades.length} items</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Total</p>
                        <p className="font-bold text-[#34AB8A]">{formatCurrency(categoryEstimated)}</p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3">
                      {categoryTrades.map((trade) => (
                        <div key={trade.id} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-semibold text-gray-900">{trade.name}</h4>
                            <p className="font-bold text-[#34AB8A] text-lg">{formatCurrency(trade.totalCost * 1.111)}</p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                            <div>
                              <span className="text-gray-500">Qty:</span>
                              <span className="ml-1 font-medium">{trade.quantity} {UNIT_TYPES[trade.unit]?.abbreviation}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Base:</span>
                              <span className="ml-1 font-medium">{formatCurrency(trade.totalCost)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Material:</span>
                              <span className="ml-1 font-medium">{formatCurrency(trade.materialCost)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Labor:</span>
                              <span className="ml-1 font-medium">{formatCurrency(trade.laborCost)}</span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => onEditTrade(trade)}
                              className="flex-1"
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              onClick={() => onDeleteTrade(trade.id)}
                              className="flex-1"
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

        {/* Desktop View - Table */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[1200px]">
            <thead>
              <tr className="border-b">
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3 border-r-2 border-gray-300"></th>
                <th className="text-center p-3 text-[#913E00] text-3xl font-bold border-r-2 border-gray-300" colSpan={2}>Material</th>
                <th className="text-center p-3 text-[#913E00] text-3xl font-bold border-r-2 border-gray-300" colSpan={2}>Labor</th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
              </tr>
              <tr className="border-b">
                <th className="text-left p-3 bg-[#213069] text-white border-r-2 border-gray-300">Category & Items</th>
                <th className="text-center p-3 bg-[#213069] text-white border-r-2 border-gray-300">Qty</th>
                <th className="text-center p-3 bg-[#213069] text-white border-r-2 border-gray-300">Unit</th>
                <th className="text-center p-3 bg-[#213069] text-white">Unit Cost</th>
                <th className="text-center p-3 bg-[#213069] text-white border-r-2 border-gray-300">Cost</th>
                <th className="text-center p-3 bg-[#213069] text-white">Unit Cost</th>
                <th className="text-center p-3 bg-[#213069] text-white border-r-2 border-gray-300">Cost</th>
                <th className="text-center p-3 bg-[#0E79C9] text-white border-r-2 border-gray-300">Base Price</th>
                <th className="text-center p-3 bg-[#D95C00] text-white border-r-2 border-gray-300">Markup</th>
                <th className="text-center p-3 bg-[#D95C00] text-white border-r-2 border-gray-300">Gross Profit</th>
                <th className="text-center p-3 bg-[#D95C00] text-white border-r-2 border-gray-300">Margin</th>
                <th className="text-center p-3 bg-[#34AB8A] text-white border-r-2 border-gray-300">Total Estimated</th>
                <th className="text-center p-3 bg-[#34AB8A] text-white">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedTrades).map(([category, categoryTrades]) => (
                <React.Fragment key={category}>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="p-3 border-b border-r-2 border-gray-300">{TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}</td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300"></td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300"></td>
                    <td className="p-3 text-center border-b"></td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.materialCost, 0))}</td>
                    <td className="p-3 text-center border-b"></td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.laborCost, 0))}</td>
                    <td className="p-3 text-center border-b font-bold border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost, 0))}</td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300">11.1%</td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost * 0.111, 0))}</td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300">10.0%</td>
                    <td className="p-3 text-center border-b font-bold border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost * 1.111, 0))}</td>
                    <td className="p-3 text-center border-b"></td>
                  </tr>
                  {categoryTrades.map((trade) => (
                    <tr key={trade.id} className="hover:bg-gray-50">
                      <td className="p-3 border-b pl-6 border-r-2 border-gray-300">{trade.name}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{trade.quantity}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{UNIT_TYPES[trade.unit]?.abbreviation || trade.unit}</td>
                      <td className="p-3 text-center border-b">{trade.materialRate ? formatCurrency(trade.materialRate) : '-'}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.materialCost)}</td>
                      <td className="p-3 text-center border-b">{trade.laborRate ? formatCurrency(trade.laborRate) : '-'}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.laborCost)}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.totalCost)}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">11.1%</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.totalCost * 0.111)}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">10.0%</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.totalCost * 1.111)}</td>
                      <td className="p-3 text-center border-b">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => onEditTrade(trade)}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={() => onDeleteTrade(trade.id)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-gray-500">
                    No trades added yet. Click "Add Trade" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------------------
// Trade Form Component
// ----------------------------------------------------------------------------

interface TradeFormProps {
  trade: TradeFormData
  onSave: () => void
  onCancel: () => void
  isAdding: boolean
}

function TradeForm({ trade, onSave, onCancel, isAdding }: TradeFormProps) {
  const [formData, setFormData] = useState<TradeFormData>(trade)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">{isAdding ? 'Add Trade' : 'Edit Trade'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as any }))}>
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
                <Label htmlFor="name">Item Name</Label>
                <div className="space-y-2">
                  {DEFAULT_CATEGORY_ITEMS[formData.category as keyof typeof DEFAULT_CATEGORY_ITEMS] && DEFAULT_CATEGORY_ITEMS[formData.category as keyof typeof DEFAULT_CATEGORY_ITEMS].length > 0 ? (
                    <div className="space-y-2">
                      <Select 
                        value={formData.name} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, name: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select or type custom name..." />
                        </SelectTrigger>
                        <SelectContent>
                          {DEFAULT_CATEGORY_ITEMS[formData.category as keyof typeof DEFAULT_CATEGORY_ITEMS].map((item: string) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        id="name"
                        placeholder="Or type custom name..."
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        required
                      />
                    </div>
                  ) : (
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Select value={formData.unit} onValueChange={(value) => setFormData(prev => ({ ...prev, unit: value as any }))}>
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
                <Label htmlFor="wasteFactor">Waste Factor (%)</Label>
                <Input
                  id="wasteFactor"
                  type="number"
                  value={formData.wasteFactor}
                  onChange={(e) => setFormData(prev => ({ ...prev, wasteFactor: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="materialRate">Material Unit Cost</Label>
                <Input
                  id="materialRate"
                  type="number"
                  step="0.01"
                  value={formData.materialRate || ''}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0
                    const cost = rate * formData.quantity
                    setFormData(prev => ({ ...prev, materialRate: rate, materialCost: cost }))
                  }}
                />
              </div>
              <div>
                <Label htmlFor="materialCost">Material Cost</Label>
                <Input
                  id="materialCost"
                  type="number"
                  step="0.01"
                  value={formData.materialCost}
                  onChange={(e) => {
                    const cost = parseFloat(e.target.value) || 0
                    const rate = formData.quantity > 0 ? cost / formData.quantity : 0
                    setFormData(prev => ({ ...prev, materialCost: cost, materialRate: rate }))
                  }}
                />
              </div>
              <div>
                <Label htmlFor="isSubcontracted">Subcontracted?</Label>
                <Select value={formData.isSubcontracted ? 'yes' : 'no'} onValueChange={(value) => setFormData(prev => ({ ...prev, isSubcontracted: value === 'yes' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Self-performed</SelectItem>
                    <SelectItem value="yes">Subcontracted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="laborRate">Labor Unit Cost</Label>
                <Input
                  id="laborRate"
                  type="number"
                  step="0.01"
                  value={formData.laborRate || ''}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0
                    const cost = rate * formData.quantity
                    setFormData(prev => ({ ...prev, laborRate: rate, laborCost: cost }))
                  }}
                />
              </div>
              <div>
                <Label htmlFor="laborCost">Labor Cost</Label>
                <Input
                  id="laborCost"
                  type="number"
                  step="0.01"
                  value={formData.laborCost}
                  onChange={(e) => {
                    const cost = parseFloat(e.target.value) || 0
                    const rate = formData.quantity > 0 ? cost / formData.quantity : 0
                    setFormData(prev => ({ ...prev, laborCost: cost, laborRate: rate }))
                  }}
                />
              </div>
              <div>
                <Label htmlFor="subcontractorCost">Subcontractor Cost</Label>
                <Input
                  id="subcontractorCost"
                  type="number"
                  step="0.01"
                  value={formData.subcontractorCost}
                  onChange={(e) => setFormData(prev => ({ ...prev, subcontractorCost: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onCancel}
                className="border-[#66A3FF] text-[#66A3FF] hover:bg-[#66A3FF] hover:text-white"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226] text-white border-none shadow-lg"
              >
                {isAdding ? 'Add Trade' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
