// ============================================================================
// HSH GC Platform - Project Actuals
// ============================================================================
//
// Track actual costs as they occur (labor, materials, subcontractors)
// Compare against estimates and show variance by category and line item
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Project, Trade, LaborEntry, MaterialEntry, SubcontractorEntry } from '@/types'
import { 
  getTradesForEstimate,
  getProjectActuals,
  addLaborEntry,
  addMaterialEntry,
  addSubcontractorEntry,
} from '@/services'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TRADE_CATEGORIES } from '@/types'
import { 
  ArrowLeft, 
  PlusCircle, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  ChevronDown,
  ChevronUp,
  Calendar,
  FileText,
  Users,
  Package,
  HardHat
} from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface ProjectActualsProps {
  project: Project
  onBack: () => void
}

type EntryType = 'labor' | 'material' | 'subcontractor'

interface ActualEntry {
  id: string
  type: EntryType
  date: Date
  amount: number
  description: string
  category?: string
  tradeId?: string
  
  // Labor specific
  payrollPeriod?: string
  
  // Material specific
  vendor?: string
  invoiceNumber?: string
  
  // Subcontractor specific
  subcontractorName?: string
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function ProjectActuals({ project, onBack }: ProjectActualsProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [actualEntries, setActualEntries] = useState<ActualEntry[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [entryType, setEntryType] = useState<EntryType>('labor')

  // Load trades for the estimate
  useEffect(() => {
    if (project) {
      const loadedTrades = getTradesForEstimate(project.estimate.id)
      setTrades(loadedTrades)
    }
  }, [project])

  // Load actual entries from project.actuals
  useEffect(() => {
    const loadActuals = async () => {
      const actuals = getProjectActuals(project.id)
      
      if (actuals) {
        const entries: ActualEntry[] = []
        
        // Convert labor entries
        actuals.laborEntries?.forEach(labor => {
          entries.push({
            id: labor.id,
            type: 'labor',
            date: labor.date,
            amount: labor.totalCost,
            description: labor.description,
            category: labor.trade,
            tradeId: labor.tradeId,
            payrollPeriod: labor.date.toLocaleDateString(),
          })
        })
        
        // Convert material entries
        actuals.materialEntries?.forEach(material => {
          entries.push({
            id: material.id,
            type: 'material',
            date: material.date,
            amount: material.totalCost,
            description: material.materialName,
            category: material.category,
            tradeId: material.tradeId,
            vendor: material.vendor,
            invoiceNumber: material.invoiceNumber,
          })
        })
        
        // Convert subcontractor entries
        actuals.subcontractorEntries?.forEach(sub => {
          entries.push({
            id: sub.id,
            type: 'subcontractor',
            date: sub.createdAt,
            amount: sub.totalPaid,
            description: sub.scopeOfWork,
            category: sub.trade,
            tradeId: sub.tradeId,
            subcontractorName: sub.subcontractor.name,
          })
        })
        
        // Sort by date, newest first
        entries.sort((a, b) => b.date.getTime() - a.date.getTime())
        
        setActualEntries(entries)
      }
    }
    
    loadActuals()
  }, [project.id])

  // ----------------------------------------------------------------------------
  // Calculations
  // ----------------------------------------------------------------------------

  const calculateEstimatedTotal = () => {
    const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
    const grossProfitTotal = trades.reduce((sum, trade) => {
      const markup = trade.markupPercent || 11.1
      return sum + (trade.totalCost * (markup / 100))
    }, 0)
    const contingency = basePriceTotal * 0.10
    return basePriceTotal + grossProfitTotal + contingency
  }

  const calculateActualTotal = () => {
    return actualEntries.reduce((sum, entry) => sum + entry.amount, 0)
  }

  const calculateVariance = () => {
    const estimated = calculateEstimatedTotal()
    const actual = calculateActualTotal()
    return actual - estimated
  }

  const getActualsByCategory = (category: string) => {
    return actualEntries.filter(entry => entry.category === category)
  }

  const getActualsByTrade = (tradeId: string) => {
    return actualEntries.filter(entry => entry.tradeId === tradeId)
  }

  const getCategoryEstimate = (category: string) => {
    const categoryTrades = trades.filter(t => t.category === category)
    return categoryTrades.reduce((sum, trade) => {
      const total = trade.totalCost
      const markup = trade.markupPercent || 11.1
      return sum + total + (total * markup / 100)
    }, 0)
  }

  const getCategoryActual = (category: string) => {
    return getActualsByCategory(category).reduce((sum, entry) => sum + entry.amount, 0)
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

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

  const getEntryIcon = (type: EntryType) => {
    switch (type) {
      case 'labor': return <Users className="w-4 h-4" />
      case 'material': return <Package className="w-4 h-4" />
      case 'subcontractor': return <HardHat className="w-4 h-4" />
    }
  }

  const getEntryColor = (type: EntryType) => {
    switch (type) {
      case 'labor': return 'bg-blue-50 border-blue-200'
      case 'material': return 'bg-green-50 border-green-200'
      case 'subcontractor': return 'bg-orange-50 border-orange-200'
    }
  }

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  const variance = calculateVariance()
  const isOverBudget = variance > 0
  const isUnderBudget = variance < 0
  const isOnBudget = Math.abs(variance) < 100 // Within $100

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <div className="p-2 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Header */}
          <ProjectActualsHeader project={project} onBack={onBack} />

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Estimated Total</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {formatCurrency(calculateEstimatedTotal())}
                    </p>
                  </div>
                  <div className="bg-blue-100 rounded-full p-3">
                    <FileText className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Actual Spent</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {formatCurrency(calculateActualTotal())}
                    </p>
                  </div>
                  <div className="bg-orange-100 rounded-full p-3">
                    <DollarSign className="w-8 h-8 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Variance</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      isOverBudget ? 'text-red-600' : isUnderBudget ? 'text-green-600' : 'text-gray-900'
                    }`}>
                      {formatCurrency(Math.abs(variance))}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {isOverBudget ? 'Over Budget' : isUnderBudget ? 'Under Budget' : 'On Budget'}
                    </p>
                  </div>
                  <div className={`rounded-full p-3 ${
                    isOverBudget ? 'bg-red-100' : isUnderBudget ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    {isOverBudget ? <TrendingUp className="w-8 h-8 text-red-600" /> :
                     isUnderBudget ? <TrendingDown className="w-8 h-8 text-green-600" /> :
                     <Minus className="w-8 h-8 text-gray-600" />}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Entries</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {actualEntries.length}
                    </p>
                  </div>
                  <div className="bg-purple-100 rounded-full p-3">
                    <Calendar className="w-8 h-8 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Entry Buttons */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => {
                    setEntryType('labor')
                    setShowEntryForm(true)
                  }}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Add Labor Entry
                </Button>
                <Button
                  onClick={() => {
                    setEntryType('material')
                    setShowEntryForm(true)
                  }}
                  className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Add Material Entry
                </Button>
                <Button
                  onClick={() => {
                    setEntryType('subcontractor')
                    setShowEntryForm(true)
                  }}
                  className="flex-1 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800"
                >
                  <HardHat className="w-4 h-4 mr-2" />
                  Add Subcontractor Entry
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Actuals by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Actuals by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(groupedTrades).map(([category, categoryTrades]) => {
                  const isExpanded = expandedCategories.has(category)
                  const categoryEstimate = getCategoryEstimate(category)
                  const categoryActual = getCategoryActual(category)
                  const categoryVariance = categoryActual - categoryEstimate
                  const isOver = categoryVariance > 0

                  return (
                    <Card key={category} className="border-2">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                      >
                        {/* Mobile Layout - Stacked */}
                        <div className="sm:hidden">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">
                                {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                              </span>
                              <div className="text-left">
                                <p className="font-bold text-gray-900 text-sm">
                                  {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {categoryTrades.length} items • {getActualsByCategory(category).length} entries
                                </p>
                              </div>
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="text-center bg-blue-50 rounded p-2">
                              <p className="text-gray-600 mb-1">Est.</p>
                              <p className="font-bold text-gray-900">{formatCurrency(categoryEstimate)}</p>
                            </div>
                            <div className="text-center bg-orange-50 rounded p-2">
                              <p className="text-gray-600 mb-1">Actual</p>
                              <p className="font-bold text-gray-900">{formatCurrency(categoryActual)}</p>
                            </div>
                            <div className={`text-center rounded p-2 ${isOver ? 'bg-red-50' : 'bg-green-50'}`}>
                              <p className="text-gray-600 mb-1">Var.</p>
                              <p className={`font-bold ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(Math.abs(categoryVariance))}
                                {isOver ? ' ⚠️' : ' ✓'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Desktop Layout - Row */}
                        <div className="hidden sm:flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">
                              {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                            </span>
                            <div className="text-left">
                              <p className="font-bold text-gray-900">
                                {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                              </p>
                              <p className="text-xs text-gray-500">
                                {categoryTrades.length} items • {getActualsByCategory(category).length} entries
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm text-gray-600">Estimated</p>
                              <p className="font-bold text-gray-900">{formatCurrency(categoryEstimate)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-600">Actual</p>
                              <p className="font-bold text-gray-900">{formatCurrency(categoryActual)}</p>
                            </div>
                            <div className="text-right min-w-[100px]">
                              <p className="text-sm text-gray-600">Variance</p>
                              <p className={`font-bold ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(Math.abs(categoryVariance))}
                                {isOver ? ' ⚠️' : ' ✓'}
                              </p>
                            </div>
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-4">
                          {categoryTrades.map((trade) => {
                            const tradeActuals = getActualsByTrade(trade.id)
                            const tradeActualTotal = tradeActuals.reduce((sum, entry) => sum + entry.amount, 0)
                            const tradeEstimate = trade.totalCost * (1 + (trade.markupPercent || 11.1) / 100)
                            const tradeVariance = tradeActualTotal - tradeEstimate
                            const isTradeOver = tradeVariance > 0

                            return (
                              <div key={trade.id} className="bg-white rounded-lg p-3 sm:p-4 border border-gray-200">
                                {/* Item Header */}
                                <div className="mb-3">
                                  <h4 className="font-semibold text-gray-900 text-sm sm:text-base">{trade.name}</h4>
                                  <p className="text-xs sm:text-sm text-gray-600">
                                    {trade.quantity} {trade.unit}
                                  </p>
                                </div>

                                {/* Mobile: Stacked Numbers */}
                                <div className="sm:hidden grid grid-cols-3 gap-2 text-xs mb-3">
                                  <div className="text-center bg-gray-50 rounded p-2">
                                    <p className="text-gray-600 mb-1">Est.</p>
                                    <p className="font-bold text-gray-900 text-xs">{formatCurrency(tradeEstimate)}</p>
                                  </div>
                                  <div className="text-center bg-gray-50 rounded p-2">
                                    <p className="text-gray-600 mb-1">Actual</p>
                                    <p className="font-bold text-gray-900 text-xs">{formatCurrency(tradeActualTotal)}</p>
                                  </div>
                                  <div className={`text-center rounded p-2 ${isTradeOver ? 'bg-red-50' : 'bg-green-50'}`}>
                                    <p className="text-gray-600 mb-1">Var.</p>
                                    <p className={`font-bold text-xs ${isTradeOver ? 'text-red-600' : 'text-green-600'}`}>
                                      {formatCurrency(Math.abs(tradeVariance))}
                                      {isTradeOver ? ' ⚠️' : ' ✓'}
                                    </p>
                                  </div>
                                </div>

                                {/* Desktop: Row Layout */}
                                <div className="hidden sm:flex justify-end gap-4 text-sm mb-3">
                                  <div className="text-right">
                                    <p className="text-xs text-gray-600">Estimated</p>
                                    <p className="font-bold text-gray-900">{formatCurrency(tradeEstimate)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-gray-600">Actual</p>
                                    <p className="font-bold text-gray-900">{formatCurrency(tradeActualTotal)}</p>
                                  </div>
                                  <div className="text-right min-w-[100px]">
                                    <p className="text-xs text-gray-600">Variance</p>
                                    <p className={`font-bold ${isTradeOver ? 'text-red-600' : 'text-green-600'}`}>
                                      {formatCurrency(Math.abs(tradeVariance))}
                                      {isTradeOver ? ' ⚠️' : ' ✓'}
                                    </p>
                                  </div>
                                </div>

                                {/* Actual Entries for this trade */}
                                {tradeActuals.length > 0 && (
                                  <div className="space-y-2 mt-3 pt-3 border-t border-gray-200">
                                    <p className="text-xs font-semibold text-gray-700 uppercase">Actual Entries:</p>
                                    {tradeActuals.map((entry) => (
                                      <div
                                        key={entry.id}
                                        className={`flex items-center justify-between p-2 rounded border ${getEntryColor(entry.type)}`}
                                      >
                                        <div className="flex items-center gap-2">
                                          {getEntryIcon(entry.type)}
                                          <div>
                                            <p className="text-sm font-medium text-gray-900">{entry.description}</p>
                                            <p className="text-xs text-gray-600">
                                              {entry.date.toLocaleDateString()}
                                              {entry.vendor && ` • ${entry.vendor}`}
                                              {entry.invoiceNumber && ` • Invoice: ${entry.invoiceNumber}`}
                                              {entry.subcontractorName && ` • ${entry.subcontractorName}`}
                                            </p>
                                          </div>
                                        </div>
                                        <p className="font-bold text-gray-900">{formatCurrency(entry.amount)}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {tradeActuals.length === 0 && (
                                  <p className="text-sm text-gray-500 italic mt-2">No actual entries yet</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </Card>
                  )
                })}

                {Object.keys(groupedTrades).length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No estimate items found. Please add items to your estimate first.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Entry Form Modal */}
      {showEntryForm && (
        <ActualEntryForm
          type={entryType}
          project={project}
          trades={trades}
          onSave={(entry) => {
            // Save to storage based on entry type
            if (entry.type === 'labor') {
              addLaborEntry(project.id, {
                date: entry.date,
                description: entry.description,
                totalCost: entry.amount,
                trade: entry.category as any,
                tradeId: entry.tradeId,
              })
            } else if (entry.type === 'material') {
              addMaterialEntry(project.id, {
                date: entry.date,
                materialName: entry.description,
                totalCost: entry.amount,
                category: entry.category as any,
                tradeId: entry.tradeId,
                vendor: entry.vendor,
                invoiceNumber: entry.invoiceNumber,
              })
            } else if (entry.type === 'subcontractor') {
              addSubcontractorEntry(project.id, {
                subcontractorName: entry.subcontractorName || 'Unknown',
                scopeOfWork: entry.description,
                contractAmount: entry.amount,
                totalPaid: entry.amount,
                trade: entry.category as any,
                tradeId: entry.tradeId,
              })
            }
            
            // Reload actuals to reflect changes
            const actuals = getProjectActuals(project.id)
            if (actuals) {
              const entries: ActualEntry[] = []
              
              actuals.laborEntries?.forEach(labor => {
                entries.push({
                  id: labor.id,
                  type: 'labor',
                  date: labor.date,
                  amount: labor.totalCost,
                  description: labor.description,
                  category: labor.trade,
                  tradeId: labor.tradeId,
                  payrollPeriod: labor.date.toLocaleDateString(),
                })
              })
              
              actuals.materialEntries?.forEach(material => {
                entries.push({
                  id: material.id,
                  type: 'material',
                  date: material.date,
                  amount: material.totalCost,
                  description: material.materialName,
                  category: material.category,
                  tradeId: material.tradeId,
                  vendor: material.vendor,
                  invoiceNumber: material.invoiceNumber,
                })
              })
              
              actuals.subcontractorEntries?.forEach(sub => {
                entries.push({
                  id: sub.id,
                  type: 'subcontractor',
                  date: sub.createdAt,
                  amount: sub.totalPaid,
                  description: sub.scopeOfWork,
                  category: sub.trade,
                  tradeId: sub.tradeId,
                  subcontractorName: sub.subcontractor.name,
                })
              })
              
              entries.sort((a, b) => b.date.getTime() - a.date.getTime())
              setActualEntries(entries)
            }
            
            setShowEntryForm(false)
          }}
          onCancel={() => setShowEntryForm(false)}
        />
      )}

      {/* Mobile Back Button */}
      {onBack && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg z-40">
          <Button
            onClick={onBack}
            variant="outline"
            className="border-gray-300 hover:bg-gray-50 w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Project Detail
          </Button>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Header Component
// ----------------------------------------------------------------------------

interface ProjectActualsHeaderProps {
  project: Project
  onBack?: () => void
}

function ProjectActualsHeader({ project, onBack }: ProjectActualsHeaderProps) {
  const getStatusColor = (status: string) => {
    const colors = {
      estimating: 'bg-blue-100 text-blue-800',
      'in-progress': 'bg-orange-100 text-orange-800',
      complete: 'bg-green-100 text-green-800',
    }
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  return (
    <>
      {/* Mobile Header */}
      <header className="sm:hidden bg-white shadow-md border-b border-gray-200">
        <div className="px-4 py-4">
          <div className="flex items-center space-x-3">
            <img src={hshLogo} alt="HSH Contractor" className="h-16 w-auto" />
            <div className="flex-1">
              <div className="flex flex-col gap-2 mb-1">
                <h1 className="text-lg font-bold text-gray-900">Project Actuals</h1>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)} w-fit`}>
                  {project.status.replace('-', ' ').toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-gray-600">{project.name}</p>
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
                <h2 className="text-xl sm:text-4xl lg:text-5xl font-bold text-gray-900">Project Actuals</h2>
                <p className="text-sm sm:text-base text-gray-600 mt-1">{project.name}</p>
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
                  Back to Project Detail
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
// Entry Form Component
// ----------------------------------------------------------------------------

interface ActualEntryFormProps {
  type: EntryType
  project: Project
  trades: Trade[]
  onSave: (entry: ActualEntry) => void
  onCancel: () => void
}

function ActualEntryForm({ type, project, trades, onSave, onCancel }: ActualEntryFormProps) {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    description: '',
    category: '',
    tradeId: '',
    
    // Labor
    payrollPeriod: '',
    
    // Material
    vendor: '',
    invoiceNumber: '',
    
    // Subcontractor
    subcontractorName: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const entry: ActualEntry = {
      id: uuidv4(),
      type,
      date: new Date(formData.date),
      amount: parseFloat(formData.amount),
      description: formData.description,
      category: formData.category,
      tradeId: formData.tradeId || undefined,
      
      ...(type === 'labor' && { payrollPeriod: formData.payrollPeriod }),
      ...(type === 'material' && { 
        vendor: formData.vendor,
        invoiceNumber: formData.invoiceNumber 
      }),
      ...(type === 'subcontractor' && { 
        subcontractorName: formData.subcontractorName 
      }),
    }
    
    onSave(entry)
  }

  const getTitle = () => {
    switch (type) {
      case 'labor': return 'Add Labor Entry'
      case 'material': return 'Add Material Entry'
      case 'subcontractor': return 'Add Subcontractor Entry'
    }
  }

  const getIcon = () => {
    switch (type) {
      case 'labor': return <Users className="w-5 h-5" />
      case 'material': return <Package className="w-5 h-5" />
      case 'subcontractor': return <HardHat className="w-5 h-5" />
    }
  }

  // Get unique categories from trades
  const categories = Array.from(new Set(trades.map(t => t.category)))

  // Filter trades by selected category
  const filteredTrades = formData.category 
    ? trades.filter(t => t.category === formData.category)
    : []

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getIcon()}
            {getTitle()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                placeholder={
                  type === 'labor' ? 'e.g., Payroll Week 11' :
                  type === 'material' ? 'e.g., Lumber delivery' :
                  'e.g., Framing scope'
                }
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                required
              />
            </div>

            {type === 'material' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vendor">Vendor</Label>
                  <Input
                    id="vendor"
                    placeholder="e.g., ABC Lumber"
                    value={formData.vendor}
                    onChange={(e) => setFormData(prev => ({ ...prev, vendor: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="invoiceNumber">Invoice Number</Label>
                  <Input
                    id="invoiceNumber"
                    placeholder="e.g., INV-12345"
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {type === 'subcontractor' && (
              <div>
                <Label htmlFor="subcontractorName">Subcontractor Name</Label>
                <Input
                  id="subcontractorName"
                  placeholder="e.g., Smith Electrical"
                  value={formData.subcontractorName}
                  onChange={(e) => setFormData(prev => ({ ...prev, subcontractorName: e.target.value }))}
                />
              </div>
            )}

            <div>
              <Label htmlFor="category">Category *</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, category: value, tradeId: '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}{' '}
                      {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.category && filteredTrades.length > 0 && (
              <div>
                <Label htmlFor="tradeId">Link to Specific Item (Optional)</Label>
                <Select 
                  value={formData.tradeId || 'none'} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, tradeId: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select item or leave blank..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None - Apply to category only</SelectItem>
                    {filteredTrades.map((trade) => (
                      <SelectItem key={trade.id} value={trade.id}>
                        {trade.name} ({trade.quantity} {trade.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
              >
                Save Entry
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

