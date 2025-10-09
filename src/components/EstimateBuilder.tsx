// ============================================================================
// Estimate Builder Component
// ============================================================================
//
// Main component for building estimates, matching the Excel "Estimate Book" structure
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  Project,
  Estimate,
  Trade,
  TradeInput,
  UnitType,
  TRADE_CATEGORIES,
  UNIT_TYPES,
  DEFAULT_VALUES,
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
  ChevronUp 
} from 'lucide-react'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface EstimateBuilderProps {
  project?: Project
  onSave?: (project: Project) => void
}

interface TradeFormData extends TradeInput {
  id?: string
  isEditing?: boolean
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function EstimateBuilder({ project, onSave }: EstimateBuilderProps) {
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
        
        updatedTrade = updateTrade(editingTrade.id, editingTrade)
        if (updatedTrade) {
          setTrades(prev => prev.map(t => t.id === editingTrade.id ? updatedTrade : t))
        }
      }

      // Update project data
      const updatedProject = updateProject(projectData.id, {
        estimate: { ...projectData.estimate, trades: [...trades, updatedTrade] },
        updatedAt: new Date(),
      })

      if (updatedProject) {
        setProjectData(updatedProject)
        onSave?.(updatedProject)
      }

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
      const updatedProject = updateProject(projectData.id, {
        estimate: { ...projectData.estimate, trades: trades.filter(t => t.id !== tradeId) },
        updatedAt: new Date(),
      })

      if (updatedProject) {
        setProjectData(updatedProject)
        onSave?.(updatedProject)
      }
    }
  }

  const handleCancelEdit = () => {
    setEditingTrade(null)
    setIsAddingTrade(false)
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <ProjectHeader
          project={projectData}
          onUpdate={handleProjectUpdate}
        />

        {/* Summary Section */}
        <SummarySection totals={totals} />

        {/* Main Trade Table */}
        <TradeTable
          trades={trades}
          onEditTrade={handleEditTrade}
          onDeleteTrade={handleDeleteTrade}
          onAddTrade={handleAddTrade}
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
  )
}

// ----------------------------------------------------------------------------
// Project Header Component
// ----------------------------------------------------------------------------

interface ProjectHeaderProps {
  project: Project
  onUpdate: (updates: Partial<Project>) => void
}

function ProjectHeader({ project, onUpdate }: ProjectHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: project.name,
    projectNumber: project.projectNumber || '',
    client: project.client.name,
    address: project.address?.street || '',
  })

  const handleSave = () => {
    onUpdate({
      name: formData.name,
      projectNumber: formData.projectNumber || undefined,
      client: { ...project.client, name: formData.client },
      address: formData.address ? { 
        street: formData.address,
        city: project.address?.city || '',
        state: project.address?.state || '',
        zip: project.address?.zip || '',
      } : undefined,
    })
    setIsEditing(false)
  }

  return (
    <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            {/* HSH Logo */}
            <div className="mb-6">
              <div className="flex items-center justify-center mb-3">
                <span className="text-7xl font-bold text-[#E65133] mr-3 drop-shadow-lg">H</span>
                <span className="text-7xl font-bold bg-gradient-to-b from-[#66A3FF] to-[#3366CC] bg-clip-text text-transparent drop-shadow-lg relative z-10">S</span>
                <span className="text-7xl font-bold text-[#E65133] ml-3 drop-shadow-lg">H</span>
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-b from-[#66A3FF] to-[#3366CC] bg-clip-text text-transparent mb-2 text-center">
                CONTRACTOR
              </h1>
              <p className="text-[#E68A66] text-xl text-center">Commercial + Home Builders</p>
              <p className="text-[#E68A66] text-base text-center">Est. 2011</p>
            </div>
            <h2 className="text-2xl font-semibold text-white">Estimate Book - UPDATED!</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-300">Status: {project.status}</p>
            <p className="text-sm text-gray-300">
              Created: {project.createdAt.toLocaleDateString()}
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {isEditing ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="projectName" className="text-white">Project Name</Label>
              <Input
                id="projectName"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="bg-gray-800 border-[#E65133] text-white focus:border-[#66A3FF]"
              />
            </div>
            <div>
              <Label htmlFor="planId" className="text-white">Plan ID</Label>
              <Input
                id="planId"
                value={formData.projectNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, projectNumber: e.target.value }))}
                className="bg-gray-800 border-[#E65133] text-white focus:border-[#66A3FF]"
              />
            </div>
            <div>
              <Label htmlFor="client" className="text-white">Client</Label>
              <Input
                id="client"
                value={formData.client}
                onChange={(e) => setFormData(prev => ({ ...prev, client: e.target.value }))}
                className="bg-gray-800 border-[#E65133] text-white focus:border-[#66A3FF]"
              />
            </div>
            <div>
              <Label htmlFor="location" className="text-white">Project Location</Label>
              <Input
                id="location"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="bg-gray-800 border-[#E65133] text-white focus:border-[#66A3FF]"
              />
            </div>
            <div className="col-span-2 flex gap-2">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-[#E68A66]">Project Name</Label>
              <p className="text-white font-semibold">{project.name}</p>
            </div>
            <div>
              <Label className="text-[#E68A66]">Plan ID</Label>
              <p className="text-white font-semibold">{project.projectNumber || 'Not set'}</p>
            </div>
            <div>
              <Label className="text-[#E68A66]">Client</Label>
              <p className="text-white font-semibold">{project.client.name}</p>
            </div>
            <div>
              <Label className="text-[#E68A66]">Project Location</Label>
              <p className="text-white font-semibold">{project.address?.street || 'Not set'}</p>
            </div>
            <div className="col-span-2">
              <Button 
                onClick={() => setIsEditing(true)} 
                variant="outline" 
                size="sm"
                className="border-[#66A3FF] text-[#66A3FF] hover:bg-[#66A3FF] hover:text-white shadow-lg"
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
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-gradient-to-r from-[#E65133] to-[#D14520] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-sm opacity-90">Base Price Total</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.basePriceTotal)}</p>
          </div>
          <div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-sm opacity-90">Contingency</p>
            <p className="text-2xl font-bold">{formatPercent(10)}</p>
          </div>
          <div className="bg-gradient-to-r from-[#66A3FF] to-[#3366CC] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-sm opacity-90">Gross Profit Total</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.grossProfitTotal)}</p>
          </div>
          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-sm opacity-90">Margin of Profit</p>
            <p className="text-2xl font-bold">{formatPercent(totals.marginOfProfit)}</p>
          </div>
          <div className="bg-gradient-to-r from-[#E65133] to-[#C0392B] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-sm opacity-90">Total Estimated</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalEstimated)}</p>
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
}

function TradeTable({ trades, onEditTrade, onDeleteTrade, onAddTrade }: TradeTableProps) {
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatNumber = (num: number) => num.toFixed(2)

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
        <div className="flex items-center justify-between">
          <CardTitle>Estimate Breakdown</CardTitle>
          <Button 
            onClick={onAddTrade}
            className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226] text-white border-none shadow-lg"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Add Trade
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 bg-gradient-to-r from-[#66A3FF] to-[#3366CC] text-white">Category & Items</th>
                <th className="text-center p-3 bg-gradient-to-r from-[#66A3FF] to-[#4A90E2] text-white">Qty</th>
                <th className="text-center p-3 bg-gradient-to-r from-[#66A3FF] to-[#4A90E2] text-white">Unit</th>
                <th className="text-center p-3 bg-gradient-to-r from-[#E65133] to-[#E68A66] text-white" colSpan={2}>Material</th>
                <th className="text-center p-3 bg-gradient-to-r from-green-600 to-green-700 text-white" colSpan={2}>Labor</th>
                <th className="text-center p-3 bg-gradient-to-r from-[#66A3FF] to-[#3366CC] text-white">Base Price</th>
                <th className="text-center p-3 bg-gradient-to-r from-green-500 to-green-600 text-white">Markup</th>
                <th className="text-center p-3 bg-gradient-to-r from-green-500 to-green-600 text-white">Gross Profit</th>
                <th className="text-center p-3 bg-gradient-to-r from-[#66A3FF] to-[#4A90E2] text-white">Margin</th>
                <th className="text-center p-3 bg-gradient-to-r from-[#E65133] to-[#C0392B] text-white">Total Estimated</th>
                <th className="text-center p-3 bg-gradient-to-r from-[#E65133] to-[#C0392B] text-white">Actions</th>
              </tr>
              <tr className="border-b">
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="text-center p-3 bg-orange-400 text-white text-sm">Unit Cost</th>
                <th className="text-center p-3 bg-orange-400 text-white text-sm">Cost</th>
                <th className="text-center p-3 bg-orange-400 text-white text-sm">Unit Cost</th>
                <th className="text-center p-3 bg-orange-400 text-white text-sm">Cost</th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedTrades).map(([category, categoryTrades]) => (
                <React.Fragment key={category}>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="p-3 border-b">{TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}</td>
                    <td className="p-3 text-center border-b"></td>
                    <td className="p-3 text-center border-b"></td>
                    <td className="p-3 text-center border-b"></td>
                    <td className="p-3 text-center border-b">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.materialCost, 0))}</td>
                    <td className="p-3 text-center border-b"></td>
                    <td className="p-3 text-center border-b">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.laborCost, 0))}</td>
                    <td className="p-3 text-center border-b font-bold">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost, 0))}</td>
                    <td className="p-3 text-center border-b">11.1%</td>
                    <td className="p-3 text-center border-b">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost * 0.111, 0))}</td>
                    <td className="p-3 text-center border-b">10.0%</td>
                    <td className="p-3 text-center border-b font-bold">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost * 1.111, 0))}</td>
                    <td className="p-3 text-center border-b"></td>
                  </tr>
                  {categoryTrades.map((trade) => (
                    <tr key={trade.id} className="hover:bg-gray-50">
                      <td className="p-3 border-b pl-6">{trade.name}</td>
                      <td className="p-3 text-center border-b">{trade.quantity}</td>
                      <td className="p-3 text-center border-b">{UNIT_TYPES[trade.unit]?.abbreviation || trade.unit}</td>
                      <td className="p-3 text-center border-b">{trade.materialRate ? formatCurrency(trade.materialRate) : '-'}</td>
                      <td className="p-3 text-center border-b">{formatCurrency(trade.materialCost)}</td>
                      <td className="p-3 text-center border-b">{trade.laborRate ? formatCurrency(trade.laborRate) : '-'}</td>
                      <td className="p-3 text-center border-b">{formatCurrency(trade.laborCost)}</td>
                      <td className="p-3 text-center border-b">{formatCurrency(trade.totalCost)}</td>
                      <td className="p-3 text-center border-b">11.1%</td>
                      <td className="p-3 text-center border-b">{formatCurrency(trade.totalCost * 0.111)}</td>
                      <td className="p-3 text-center border-b">10.0%</td>
                      <td className="p-3 text-center border-b">{formatCurrency(trade.totalCost * 1.111)}</td>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>{isAdding ? 'Add Trade' : 'Edit Trade'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
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

            <div className="grid grid-cols-3 gap-4">
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

            <div className="grid grid-cols-3 gap-4">
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
