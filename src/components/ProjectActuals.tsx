// ============================================================================
// HSH GC Platform - Project Actuals
// ============================================================================
//
// Track actual costs as they occur (labor, materials, subcontractors)
// Compare against estimates and show variance by category and line item
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  Project,
  Trade,
  LaborEntry,
  MaterialEntry,
  SubcontractorEntry,
  Subcontractor as DirectorySubcontractor,
  Supplier,
} from '@/types'
import { PrintableReport, ReportDepth } from './PrintableReport'
import { 
  getProjectActuals_Hybrid,
  addLaborEntry_Hybrid,
  addMaterialEntry_Hybrid,
  addSubcontractorEntry_Hybrid,
  updateLaborEntry_Hybrid,
  updateMaterialEntry_Hybrid,
  updateSubcontractorEntry_Hybrid,
  deleteLaborEntry_Hybrid,
  deleteMaterialEntry_Hybrid,
  deleteSubcontractorEntry_Hybrid,
} from '@/services/actualsHybridService'
import { getTradesForEstimate_Hybrid } from '@/services/hybridService'
import { fetchTradesForEstimate } from '@/services/supabaseService'
import { isOnlineMode } from '@/lib/supabase'
import { fetchSubcontractors, fetchSuppliers } from '@/services/partnerDirectoryService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TRADE_CATEGORIES, CATEGORY_GROUPS, getCategoryGroup } from '@/types'
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
  HardHat,
  Edit,
  Trash2,
  Printer
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
  const [editingEntry, setEditingEntry] = useState<ActualEntry | null>(null)
  const [changeOrders, setChangeOrders] = useState<any[]>([])
  const [expandedCOItems, setExpandedCOItems] = useState<Set<string>>(new Set())
  const [showPrintReport, setShowPrintReport] = useState(false)
  const [reportDepth, setReportDepth] = useState<ReportDepth>('full')
  const [reportType, setReportType] = useState<'actuals' | 'comparison'>('actuals')
  const [availableSubcontractors, setAvailableSubcontractors] = useState<DirectorySubcontractor[]>([])
  const [availableSuppliers, setAvailableSuppliers] = useState<Supplier[]>([])

  // Load trades for the estimate
  useEffect(() => {
    const loadTrades = async () => {
      if (project) {
        const loadedTrades = await getTradesForEstimate_Hybrid(project.estimate.id)
        setTrades(loadedTrades)
        
        // Load change orders
        if (project.actuals?.changeOrders) {
          setChangeOrders(project.actuals.changeOrders.filter(co => 
            co.status === 'approved' || co.status === 'implemented'
          ))
        }
      }
    }
    
    loadTrades()
  }, [project])

  // Load actual entries from project.actuals
  useEffect(() => {
    const loadActuals = async () => {
      const actuals = await getProjectActuals_Hybrid(project.id)
      
      if (actuals) {
        const entries: ActualEntry[] = []
        
        // Convert labor entries
        actuals.laborEntries?.forEach((labor: LaborEntry) => {
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
        actuals.materialEntries?.forEach((material: MaterialEntry) => {
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
        actuals.subcontractorEntries?.forEach((sub: SubcontractorEntry) => {
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

  // Load subcontractor and supplier directories
  useEffect(() => {
    const loadPartnerDirectories = async () => {
      try {
        const [subs, sups] = await Promise.all([
          fetchSubcontractors({ includeInactive: false }),
          fetchSuppliers({ includeInactive: false }),
        ])
        setAvailableSubcontractors(subs)
        setAvailableSuppliers(sups)
      } catch (error) {
        console.warn('Unable to load partner directory data:', error)
      }
    }

    loadPartnerDirectories()
  }, [])

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
    const total = actualEntries.reduce((sum, entry) => sum + entry.amount, 0)
    return total
  }

  const calculateVariance = () => {
    const estimated = calculateEstimatedTotal()
    const actual = calculateActualTotal()
    return actual - estimated
  }

  const calculateChangeOrderImpact = () => {
    return changeOrders.reduce((sum, co) => sum + co.costImpact, 0)
  }

  const getChangeOrdersForTrade = (tradeId: string) => {
    return changeOrders.filter(co => 
      co.trades?.some((t: any) => t.id === tradeId)
    )
  }

  const hasChangeOrder = (tradeId: string) => {
    return getChangeOrdersForTrade(tradeId).length > 0
  }

  const getVarianceType = (tradeId: string, variance: number) => {
    if (variance <= 0) return 'under' // Under budget is always good
    
    const cos = getChangeOrdersForTrade(tradeId)
    if (cos.length === 0) return 'overrun' // Over budget with no CO = problem
    
    const coImpact = cos.reduce((sum, co) => sum + co.costImpact, 0)
    
    if (Math.abs(variance - coImpact) < 100) return 'approved-change' // Variance matches CO
    if (variance > coImpact) return 'mixed' // Part CO, part overrun
    
    return 'overrun'
  }

  const getVarianceColor = (type: string) => {
    switch (type) {
      case 'under': return 'text-green-600'
      case 'approved-change': return 'text-blue-600' // Blue for approved changes
      case 'mixed': return 'text-yellow-600'
      case 'overrun': return 'text-red-600'
      default: return 'text-gray-900'
    }
  }

  const getVarianceIcon = (type: string) => {
    switch (type) {
      case 'under': return '✓'
      case 'approved-change': return '📋' // Document icon for approved change
      case 'mixed': return '⚠️'
      case 'overrun': return '⚠️'
      default: return ''
    }
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
    const entries = getActualsByCategory(category)
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0)
    return total
  }

  const getCategoryActualsByType = (category: string) => {
    const entries = getActualsByCategory(category)
    return {
      labor: entries.filter(e => e.type === 'labor').reduce((sum, entry) => sum + entry.amount, 0),
      material: entries.filter(e => e.type === 'material').reduce((sum, entry) => sum + entry.amount, 0),
      subcontractor: entries.filter(e => e.type === 'subcontractor').reduce((sum, entry) => sum + entry.amount, 0),
      generalCount: entries.filter(e => !e.tradeId).length,
    }
  }

  const getGroupActualsByType = (group: string, groupCategories: Record<string, Trade[]>) => {
    const categories = Object.keys(groupCategories)
    const groupEntries = categories.flatMap(category => getActualsByCategory(category))
    return {
      labor: groupEntries.filter(e => e.type === 'labor').reduce((sum, entry) => sum + entry.amount, 0),
      material: groupEntries.filter(e => e.type === 'material').reduce((sum, entry) => sum + entry.amount, 0),
      subcontractor: groupEntries.filter(e => e.type === 'subcontractor').reduce((sum, entry) => sum + entry.amount, 0),
      generalCount: groupEntries.filter(e => !e.tradeId).length,
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  // Group trades by group, then by category
  const groupedTrades = trades.reduce((acc, trade) => {
    const group = trade.group || getCategoryGroup(trade.category)
    if (!acc[group]) {
      acc[group] = {}
    }
    if (!acc[group][trade.category]) {
      acc[group][trade.category] = []
    }
    acc[group][trade.category].push(trade)
    return acc
  }, {} as Record<string, Record<string, Trade[]>>)

  // Handle print report
  const handlePrintReport = (type: 'actuals' | 'comparison', depth: ReportDepth) => {
    setReportType(type)
    setReportDepth(depth)
    setShowPrintReport(true)
  }

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

  const handleEditEntry = (entry: ActualEntry) => {
    setEditingEntry(entry)
    setEntryType(entry.type)
    setShowEntryForm(true)
  }

  const handleDeleteEntry = async (entry: ActualEntry) => {
    if (!confirm(`Delete this ${entry.type} entry for ${formatCurrency(entry.amount)}?`)) {
      return
    }

    let deleted = false
    if (entry.type === 'labor') {
      deleted = await deleteLaborEntry_Hybrid(entry.id)
    } else if (entry.type === 'material') {
      deleted = await deleteMaterialEntry_Hybrid(entry.id)
    } else if (entry.type === 'subcontractor') {
      deleted = await deleteSubcontractorEntry_Hybrid(entry.id)
    }

    if (deleted) {
      // Reload actuals
      const actuals = await getProjectActuals_Hybrid(project.id)
      if (actuals) {
        const entries: ActualEntry[] = []
        
        actuals.laborEntries?.forEach((labor: LaborEntry) => {
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
        
        actuals.materialEntries?.forEach((material: MaterialEntry) => {
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
        
        actuals.subcontractorEntries?.forEach((sub: SubcontractorEntry) => {
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
      <div className="p-2 sm:p-4 lg:p-6 xl:p-8">
        <div className="w-full space-y-4 sm:space-y-6">
          {/* Header */}
          <ProjectActualsHeader project={project} onBack={onBack} onPrintReport={handlePrintReport} />

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
                    <p className="text-sm text-gray-600">Change Orders</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">
                      {formatCurrency(Math.abs(calculateChangeOrderImpact()))}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {changeOrders.length} approved
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

          {/* Debug Information removed */}

          {/* Unlinked Entries Summary */}
          {(() => {
            const allUnlinkedEntries = actualEntries.filter(entry => !entry.tradeId)
            return allUnlinkedEntries.length > 0 && (
              <Card className="bg-yellow-50 border-yellow-200">
                <CardHeader>
                  <CardTitle className="text-yellow-800">General Entries (Not Linked to Specific Items)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {allUnlinkedEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between p-3 rounded border ${getEntryColor(entry.type)}`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          {getEntryIcon(entry.type)}
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{entry.description}</p>
                            <p className="text-xs text-gray-600">
                              {entry.date.toLocaleDateString()}
                              {entry.category && ` • ${TRADE_CATEGORIES[entry.category as keyof typeof TRADE_CATEGORIES]?.label || entry.category}`}
                              {entry.vendor && ` • ${entry.vendor}`}
                              {entry.invoiceNumber && ` • Invoice: ${entry.invoiceNumber}`}
                              {entry.subcontractorName && ` • ${entry.subcontractorName}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900">{formatCurrency(entry.amount)}</p>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditEntry(entry)}
                              className="h-7 px-2"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteEntry(entry)}
                              className="h-7 px-2"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-yellow-300">
                      <p className="text-sm font-semibold text-yellow-800">
                        Total Unlinked Entries: {formatCurrency(allUnlinkedEntries.reduce((sum, entry) => sum + entry.amount, 0))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          {/* Variance Legend */}
          {changeOrders.length > 0 && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900 mb-2">Variance Color Guide:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600 font-bold">✓ Green</span>
                        <span className="text-gray-700">= Under budget</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600 font-bold">📋 Blue</span>
                        <span className="text-gray-700">= Approved change order</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-600 font-bold">⚠️ Yellow</span>
                        <span className="text-gray-700">= Partial CO + overrun</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-600 font-bold">⚠️ Red</span>
                        <span className="text-gray-700">= Cost overrun (no CO)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actuals by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Actuals by Group & Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(groupedTrades).map(([group, groupCategories]) => {
                  const isGroupExpanded = expandedCategories.has(group)
                  
                  // Calculate group totals
                  const groupEstimate = Object.values(groupCategories).flat().reduce((sum, trade) => {
                    return sum + (trade.totalCost * (1 + (trade.markupPercent || 11.1) / 100))
                  }, 0)
                  
                  const groupActual = Object.keys(groupCategories).reduce((sum, category) => {
                    return sum + getCategoryActual(category)
                  }, 0)
                  
                  const groupVariance = groupActual - groupEstimate
                  const isGroupOver = groupVariance > 0

                  return (
                    <Card key={group} className="border-2">
                      <button
                        onClick={() => toggleCategory(group)}
                        className="w-full p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                      >
                        {/* Mobile Layout - Stacked */}
                        <div className="sm:hidden">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">
                                {CATEGORY_GROUPS[group as keyof typeof CATEGORY_GROUPS]?.icon || '📦'}
                              </span>
                              <div className="text-left">
                                <p className="font-bold text-gray-900 text-sm">
                                  {CATEGORY_GROUPS[group as keyof typeof CATEGORY_GROUPS]?.label || group}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {Object.values(groupCategories).flat().length} items
                                </p>
                              </div>
                            </div>
                            {isGroupExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="text-center bg-blue-50 rounded p-2">
                              <p className="text-gray-600 mb-1">Est.</p>
                              <p className="font-bold text-gray-900">{formatCurrency(groupEstimate)}</p>
                            </div>
                            <div className="text-center bg-orange-50 rounded p-2">
                              <p className="text-gray-600 mb-1">Actual</p>
                              <p className="font-bold text-gray-900">{formatCurrency(groupActual)}</p>
                            </div>
                            <div className={`text-center rounded p-2 ${isGroupOver ? 'bg-red-50' : 'bg-green-50'}`}>
                              <p className="text-gray-600 mb-1">Var.</p>
                              <p className={`font-bold ${isGroupOver ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(Math.abs(groupVariance))}
                                {isGroupOver ? ' ⚠️' : ' ✓'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Desktop Layout - Row */}
                        <div className="hidden sm:flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">
                              {CATEGORY_GROUPS[group as keyof typeof CATEGORY_GROUPS]?.icon || '📦'}
                            </span>
                            <div className="text-left">
                              <p className="font-bold text-gray-900">
                                {CATEGORY_GROUPS[group as keyof typeof CATEGORY_GROUPS]?.label || group}
                              </p>
                              <p className="text-xs text-gray-500">
                                {Object.values(groupCategories).flat().length} items
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm text-gray-600">Estimated</p>
                              <p className="font-bold text-gray-900">{formatCurrency(groupEstimate)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-600">Actual</p>
                              <p className="font-bold text-gray-900">{formatCurrency(groupActual)}</p>
                            </div>
                            <div className="text-right min-w-[100px]">
                              <p className="text-sm text-gray-600">Variance</p>
                              <p className={`font-bold ${isGroupOver ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(Math.abs(groupVariance))}
                                {isGroupOver ? ' ⚠️' : ' ✓'}
                              </p>
                            </div>
                            {isGroupExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </button>

                      {isGroupExpanded && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-4">
                          {/* Group Breakdown */}
                          {groupActual > 0 && (() => {
                            const groupBreakdown = getGroupActualsByType(group, groupCategories)
                            const groupEntries = Object.keys(groupCategories).flatMap(category => getActualsByCategory(category))
                            const unlinkedGroupEntries = groupEntries.filter(entry => !entry.tradeId)
                            return (
                              <div className="mb-4 pb-4 border-b border-gray-300 bg-white rounded-lg p-4">
                                <p className="text-sm font-semibold text-gray-800 uppercase mb-3">Group Breakdown by Type:</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div className={`px-3 py-2 rounded-md border text-sm ${
                                    groupBreakdown.labor > 0 
                                      ? 'bg-blue-50 border-blue-300 text-blue-800' 
                                      : 'bg-gray-50 border-gray-200 text-gray-400'
                                  }`}>
                                    <div className="font-semibold mb-1">Labor</div>
                                    <div className="text-lg font-bold">{formatCurrency(groupBreakdown.labor)}</div>
                                  </div>
                                  <div className={`px-3 py-2 rounded-md border text-sm ${
                                    groupBreakdown.material > 0 
                                      ? 'bg-green-50 border-green-300 text-green-800' 
                                      : 'bg-gray-50 border-gray-200 text-gray-400'
                                  }`}>
                                    <div className="font-semibold mb-1">Material</div>
                                    <div className="text-lg font-bold">{formatCurrency(groupBreakdown.material)}</div>
                                  </div>
                                  <div className={`px-3 py-2 rounded-md border text-sm ${
                                    groupBreakdown.subcontractor > 0 
                                      ? 'bg-orange-50 border-orange-300 text-orange-800' 
                                      : 'bg-gray-50 border-gray-200 text-gray-400'
                                  }`}>
                                    <div className="font-semibold mb-1">Subcontractor</div>
                                    <div className="text-lg font-bold">{formatCurrency(groupBreakdown.subcontractor)}</div>
                                  </div>
                                  {unlinkedGroupEntries.length > 0 && (
                                    <div className="px-3 py-2 rounded-md border bg-yellow-50 border-yellow-300 text-yellow-800 text-sm">
                                      <div className="font-semibold mb-1">General ({unlinkedGroupEntries.length})</div>
                                      <div className="text-lg font-bold">{formatCurrency(unlinkedGroupEntries.reduce((sum, e) => sum + e.amount, 0))}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })()}
                          
                          {Object.entries(groupCategories).map(([category, categoryTrades]) => {
                            const categoryEstimate = getCategoryEstimate(category)
                            const categoryActual = getCategoryActual(category)
                            const categoryVariance = categoryActual - categoryEstimate
                            const isOver = categoryVariance > 0
                            const categoryActualBreakdown = getCategoryActualsByType(category)
                            const categoryEntries = getActualsByCategory(category)
                            const unlinkedEntries = categoryEntries.filter(entry => !entry.tradeId)
                            
                            return (
                              <div key={category} className="bg-white rounded-lg border border-gray-200 p-3">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">
                                      {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                                    </span>
                                    <div>
                                      <h4 className="font-semibold text-gray-900 text-sm">
                                        {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                                      </h4>
                                      <p className="text-xs text-gray-500">
                                        {categoryTrades.length} items • {getActualsByCategory(category).length} entries
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm">
                                    <div className="text-right">
                                      <span className="text-gray-500">Est:</span>
                                      <span className="font-semibold ml-1">{formatCurrency(categoryEstimate)}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-gray-500">Act:</span>
                                      <span className={`font-semibold ml-1 ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                                        {formatCurrency(categoryActual)}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-gray-500">Var:</span>
                                      <span className={`font-semibold ml-1 ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                                        {formatCurrency(Math.abs(categoryVariance))}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Breakdown by Type */}
                                {categoryActual > 0 && (
                                  <div className="mb-3 pb-3 border-b border-gray-200">
                                    <p className="text-xs font-semibold text-gray-700 uppercase mb-2">Breakdown by Type:</p>
                                    <div className="flex flex-wrap gap-2">
                                      <div className={`px-3 py-1.5 rounded-md border text-xs font-medium ${
                                        categoryActualBreakdown.labor > 0 
                                          ? 'bg-blue-50 border-blue-300 text-blue-800' 
                                          : 'bg-gray-50 border-gray-200 text-gray-400'
                                      }`}>
                                        <span className="font-semibold">Labor:</span> {formatCurrency(categoryActualBreakdown.labor)}
                                      </div>
                                      <div className={`px-3 py-1.5 rounded-md border text-xs font-medium ${
                                        categoryActualBreakdown.material > 0 
                                          ? 'bg-green-50 border-green-300 text-green-800' 
                                          : 'bg-gray-50 border-gray-200 text-gray-400'
                                      }`}>
                                        <span className="font-semibold">Material:</span> {formatCurrency(categoryActualBreakdown.material)}
                                      </div>
                                      <div className={`px-3 py-1.5 rounded-md border text-xs font-medium ${
                                        categoryActualBreakdown.subcontractor > 0 
                                          ? 'bg-orange-50 border-orange-300 text-orange-800' 
                                          : 'bg-gray-50 border-gray-200 text-gray-400'
                                      }`}>
                                        <span className="font-semibold">Subcontractor:</span> {formatCurrency(categoryActualBreakdown.subcontractor)}
                                      </div>
                                      {unlinkedEntries.length > 0 && (
                                        <div className="px-3 py-1.5 rounded-md border bg-yellow-50 border-yellow-300 text-yellow-800 text-xs font-medium">
                                          <span className="font-semibold">General ({unlinkedEntries.length}):</span> {formatCurrency(unlinkedEntries.reduce((sum, e) => sum + e.amount, 0))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                <div className="space-y-2">
                                  {categoryTrades.map((trade) => {
                                    const tradeActuals = getActualsByTrade(trade.id)
                                    const tradeActualTotal = tradeActuals.reduce((sum, entry) => sum + entry.amount, 0)
                                    const tradeEstimate = trade.totalCost * (1 + (trade.markupPercent || 11.1) / 100)
                                    const tradeVariance = tradeActualTotal - tradeEstimate
                                    const isTradeOver = tradeVariance > 0

                                    const itemCOs = getChangeOrdersForTrade(trade.id)
                                    const varianceType = getVarianceType(trade.id, tradeVariance)
                                    const hasExpanded = expandedCOItems.has(trade.id)

                                    return (
                                      <div key={trade.id} className="bg-white rounded-lg p-3 sm:p-4 border border-gray-200">
                                        {/* Item Header */}
                                        <div className="mb-3">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="font-semibold text-gray-900 text-sm sm:text-base">{trade.name}</h4>
                                            {itemCOs.length > 0 && (
                                              <button
                                                onClick={() => {
                                                  const newExpanded = new Set(expandedCOItems)
                                                  if (hasExpanded) {
                                                    newExpanded.delete(trade.id)
                                                  } else {
                                                    newExpanded.add(trade.id)
                                                  }
                                                  setExpandedCOItems(newExpanded)
                                                }}
                                                className="flex items-center gap-1 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
                                              >
                                                <FileText className="w-3 h-3" />
                                                {itemCOs.length} Change Order{itemCOs.length > 1 ? 's' : ''}
                                              </button>
                                            )}
                                          </div>
                                          <p className="text-xs sm:text-sm text-gray-600">
                                            {trade.quantity} {trade.unit}
                                          </p>
                                        </div>

                                        {/* Expanded Change Order Details */}
                                        {hasExpanded && itemCOs.length > 0 && (
                                          <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                                            <p className="text-xs font-semibold text-blue-900 mb-2">Related Change Orders:</p>
                                            {itemCOs.map((co: any) => (
                                              <div key={co.id} className="text-xs text-blue-800 mb-1">
                                                • {co.changeOrderNumber}: {co.title} ({formatCurrency(co.costImpact)})
                                              </div>
                                            ))}
                                          </div>
                                        )}

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
                                          <div className={`text-center rounded p-2 ${
                                            varianceType === 'approved-change' ? 'bg-blue-50' :
                                            varianceType === 'mixed' ? 'bg-yellow-50' :
                                            isTradeOver ? 'bg-red-50' : 'bg-green-50'
                                          }`}>
                                            <p className="text-gray-600 mb-1">Var.</p>
                                            <p className={`font-bold text-xs ${getVarianceColor(varianceType)}`}>
                                              {formatCurrency(Math.abs(tradeVariance))}
                                              {' '}{getVarianceIcon(varianceType)}
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
                                            <p className={`font-bold ${getVarianceColor(varianceType)}`}>
                                              {formatCurrency(Math.abs(tradeVariance))}
                                              {' '}{getVarianceIcon(varianceType)}
                                            </p>
                                            {varianceType === 'approved-change' && (
                                              <p className="text-xs text-blue-600">Approved Change</p>
                                            )}
                                            {varianceType === 'mixed' && (
                                              <p className="text-xs text-yellow-600">Partial Change</p>
                                            )}
                                          </div>
                                        </div>

                                        {/* Trade Item Breakdown by Type */}
                                        {tradeActualTotal > 0 && (() => {
                                          const tradeBreakdown = {
                                            labor: tradeActuals.filter(e => e.type === 'labor').reduce((sum, entry) => sum + entry.amount, 0),
                                            material: tradeActuals.filter(e => e.type === 'material').reduce((sum, entry) => sum + entry.amount, 0),
                                            subcontractor: tradeActuals.filter(e => e.type === 'subcontractor').reduce((sum, entry) => sum + entry.amount, 0),
                                          }
                                          return (
                                            <div className="mb-3 pb-3 border-b border-gray-200">
                                              <p className="text-xs font-semibold text-gray-700 uppercase mb-2">Item Breakdown:</p>
                                              <div className="flex flex-wrap gap-2">
                                                <div className={`px-2 py-1 rounded border text-xs ${
                                                  tradeBreakdown.labor > 0 
                                                    ? 'bg-blue-50 border-blue-200 text-blue-800' 
                                                    : 'bg-gray-50 border-gray-200 text-gray-400'
                                                }`}>
                                                  <span className="font-semibold">Labor:</span> {formatCurrency(tradeBreakdown.labor)}
                                                </div>
                                                <div className={`px-2 py-1 rounded border text-xs ${
                                                  tradeBreakdown.material > 0 
                                                    ? 'bg-green-50 border-green-200 text-green-800' 
                                                    : 'bg-gray-50 border-gray-200 text-gray-400'
                                                }`}>
                                                  <span className="font-semibold">Material:</span> {formatCurrency(tradeBreakdown.material)}
                                                </div>
                                                <div className={`px-2 py-1 rounded border text-xs ${
                                                  tradeBreakdown.subcontractor > 0 
                                                    ? 'bg-orange-50 border-orange-200 text-orange-800' 
                                                    : 'bg-gray-50 border-gray-200 text-gray-400'
                                                }`}>
                                                  <span className="font-semibold">Sub:</span> {formatCurrency(tradeBreakdown.subcontractor)}
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        })()}

                                        {/* Actual Entries for this trade */}
                                        {tradeActuals.length > 0 && (
                                          <div className="space-y-2 mt-3 pt-3 border-t border-gray-200">
                                            <p className="text-xs font-semibold text-gray-700 uppercase">Actual Entries:</p>
                                            {tradeActuals.map((entry) => (
                                              <div
                                                key={entry.id}
                                                className={`flex items-center justify-between p-2 rounded border ${getEntryColor(entry.type)}`}
                                              >
                                                <div className="flex items-center gap-2 flex-1">
                                                  {getEntryIcon(entry.type)}
                                                  <div className="flex-1">
                                                    <p className="text-sm font-medium text-gray-900">{entry.description}</p>
                                            <p className="text-xs text-gray-600">
                                              {formatDate(entry.date)}
                                              {entry.category && ` • ${TRADE_CATEGORIES[entry.category as keyof typeof TRADE_CATEGORIES]?.label || entry.category}`}
                                                      {entry.tradeId && trades.find(t => t.id === entry.tradeId) && ` • ${trades.find(t => t.id === entry.tradeId)?.name}`}
                                                      {entry.vendor && ` • ${entry.vendor}`}
                                                      {entry.invoiceNumber && ` • Invoice: ${entry.invoiceNumber}`}
                                                      {entry.subcontractorName && ` • ${entry.subcontractorName}`}
                                                    </p>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <p className="font-bold text-gray-900">{formatCurrency(entry.amount)}</p>
                                                  <div className="flex gap-1">
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleEditEntry(entry)
                                                      }}
                                                      className="h-7 px-2"
                                                    >
                                                      <Edit className="w-3 h-3" />
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      variant="destructive"
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDeleteEntry(entry)
                                                      }}
                                                      className="h-7 px-2"
                                                    >
                                                      <Trash2 className="w-3 h-3" />
                                                    </Button>
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        {/* Show unlinked entries for this category */}
                                        {(() => {
                                          return unlinkedEntries.length > 0 && (
                                            <div className="space-y-2 mt-3 pt-3 border-t border-gray-200">
                                              <div className="flex items-center justify-between">
                                                <p className="text-xs font-semibold text-gray-700 uppercase">General Category Entries:</p>
                                                <button
                                                  className="text-xs h-6 px-2 border border-gray-300 rounded hover:bg-gray-100"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    const firstEntry = unlinkedEntries[0]
                                                    handleEditEntry(firstEntry)
                                                  }}
                                                >
                                                  Assign to Item
                                                </button>
                                              </div>
                                              {unlinkedEntries.map((entry) => (
                                                <div
                                                  key={entry.id}
                                                  className={`flex items-center justify-between p-2 rounded border ${getEntryColor(entry.type)}`}
                                                >
                                                  <div className="flex items-center gap-2 flex-1">
                                                    {getEntryIcon(entry.type)}
                                                    <div className="flex-1">
                                                      <p className="text-sm font-medium text-gray-900">{entry.description}</p>
                                                      <p className="text-xs text-gray-600">
                                                        {formatDate(entry.date)}
                                                        {entry.category && ` • ${TRADE_CATEGORIES[entry.category as keyof typeof TRADE_CATEGORIES]?.label || entry.category}`}
                                                        {entry.vendor && ` • ${entry.vendor}`}
                                                        {entry.invoiceNumber && ` • Invoice: ${entry.invoiceNumber}`}
                                                        {entry.subcontractorName && ` • ${entry.subcontractorName}`}
                                                      </p>
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <p className="font-bold text-gray-900">{formatCurrency(entry.amount)}</p>
                                                    <div className="flex gap-1">
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={(e) => {
                                                          e.stopPropagation()
                                                          handleEditEntry(entry)
                                                        }}
                                                        className="h-7 px-2"
                                                      >
                                                        <Edit className="w-3 h-3" />
                                                      </Button>
                                                      <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={(e) => {
                                                          e.stopPropagation()
                                                          handleDeleteEntry(entry)
                                                        }}
                                                        className="h-7 px-2"
                                                      >
                                                        <Trash2 className="w-3 h-3" />
                                                      </Button>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )
                                        })()}

                                        {tradeActuals.length === 0 && (() => {
                                          const categoryEntries = getActualsByCategory(category)
                                          const unlinkedEntries = categoryEntries.filter(entry => !entry.tradeId)
                                          return unlinkedEntries.length === 0 && (
                                            <p className="text-sm text-gray-500 italic mt-2">No actual entries yet</p>
                                          )
                                        })()}
                                      </div>
                                    )
                                  })}
                                </div>
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

      {/* All Actual Entries List */}
      <Card>
        <CardHeader>
          <CardTitle>All Actual Entries</CardTitle>
          <p className="text-sm text-gray-500">
            Use this list to quickly edit or assign any entry—even if it isn’t linked to a specific estimate item yet.
          </p>
        </CardHeader>
        <CardContent>
          {actualEntries.length === 0 ? (
            <p className="text-gray-500 text-sm">No actual entries recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {actualEntries.map((entry) => {
                const tradeName = entry.tradeId ? trades.find(t => t.id === entry.tradeId)?.name : null
                return (
                  <div
                    key={entry.id}
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between border rounded-lg p-3 ${getEntryColor(entry.type)}`}
                  >
                    <div className="flex items-start gap-3 flex-1">
                      {getEntryIcon(entry.type)}
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                          <span>{formatDate(entry.date)}</span>
                          <span>•</span>
                          <span className="font-semibold text-gray-800">
                            {entry.category ? TRADE_CATEGORIES[entry.category as keyof typeof TRADE_CATEGORIES]?.label || entry.category : 'No category'}
                          </span>
                          <span>•</span>
                          <span className="uppercase tracking-wide">{entry.type}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900">
                          {entry.description || entry.vendor || entry.subcontractorName || 'No description'}
                        </p>
                        <div className="text-xs text-gray-500">
                          {tradeName ? (
                            <span className="text-green-700 font-semibold">Linked to {tradeName}</span>
                          ) : (
                            <span className="text-red-600 font-semibold">Not linked to a specific item</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end gap-3 mt-3 sm:mt-0">
                      <p className="text-base font-bold text-gray-900">{formatCurrency(entry.amount)}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditEntry(entry)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteEntry(entry)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Print Report */}
      {showPrintReport && (
        <PrintableReport
          project={project}
          trades={trades}
          reportType={reportType}
          depth={reportDepth}
          actualEntries={actualEntries}
          changeOrders={changeOrders}
          onClose={() => setShowPrintReport(false)}
        />
      )}

      {/* Entry Form Modal */}
      {showEntryForm && (
        <ActualEntryForm
          type={entryType}
          project={project}
          trades={trades}
          availableSuppliers={availableSuppliers}
          availableSubcontractors={availableSubcontractors}
          editingEntry={editingEntry}
          onSave={async (entry) => {
            // Save to storage based on entry type
            if (editingEntry) {
              // Update existing entry
              if (entry.type === 'labor') {
                await updateLaborEntry_Hybrid(entry.id, {
                  date: entry.date,
                  description: entry.description,
                  totalCost: entry.amount,
                })
              } else if (entry.type === 'material') {
                const materialCategory = entry.category as Trade['category'] | undefined
                await updateMaterialEntry_Hybrid(entry.id, {
                  date: entry.date,
                  materialName: entry.description,
                  totalCost: entry.amount,
                  vendor: entry.vendor,
                  invoiceNumber: entry.invoiceNumber,
                  category: materialCategory,
                  tradeId: entry.tradeId,
                  group: materialCategory ? getCategoryGroup(materialCategory) : undefined,
                })
              } else if (entry.type === 'subcontractor') {
                await updateSubcontractorEntry_Hybrid(entry.id, {
                  subcontractorName: entry.subcontractorName || 'Unknown',
                  scopeOfWork: entry.description,
                  totalPaid: entry.amount,
                })
              }
            } else {
              // Add new entry
              if (entry.type === 'labor') {
                await addLaborEntry_Hybrid(project.id, {
                  date: entry.date,
                  description: entry.description,
                  totalCost: entry.amount,
                  trade: entry.category as any,
                  tradeId: entry.tradeId,
                })
              } else if (entry.type === 'material') {
                const materialCategory = entry.category as Trade['category'] | undefined
                await addMaterialEntry_Hybrid(project.id, {
                  date: entry.date,
                  materialName: entry.description,
                  totalCost: entry.amount,
                  category: materialCategory,
                  tradeId: entry.tradeId,
                  vendor: entry.vendor,
                  invoiceNumber: entry.invoiceNumber,
                  group: materialCategory ? getCategoryGroup(materialCategory) : undefined,
                })
              } else if (entry.type === 'subcontractor') {
                await addSubcontractorEntry_Hybrid(project.id, {
                  subcontractorName: entry.subcontractorName || 'Unknown',
                  scopeOfWork: entry.description,
                  contractAmount: entry.amount,
                  totalPaid: entry.amount,
                  trade: entry.category as any,
                  tradeId: entry.tradeId,
                })
              }
            }
            
            // Reload actuals to reflect changes
            const actuals = await getProjectActuals_Hybrid(project.id)
            if (actuals) {
              const entries: ActualEntry[] = []
              
              actuals.laborEntries?.forEach((labor: LaborEntry) => {
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
              
              actuals.materialEntries?.forEach((material: MaterialEntry) => {
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
              
              actuals.subcontractorEntries?.forEach((sub: SubcontractorEntry) => {
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
            setEditingEntry(null)
          }}
          onCancel={() => {
            setShowEntryForm(false)
            setEditingEntry(null)
          }}
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
  onPrintReport?: (type: 'actuals' | 'comparison', depth: ReportDepth) => void
}

function ProjectActualsHeader({ project, onBack, onPrintReport }: ProjectActualsHeaderProps) {
  const [showPrintMenu, setShowPrintMenu] = useState(false)
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
            
            <div className="hidden sm:flex justify-center gap-3">
              {onBack && (
                <Button
                  onClick={onBack}
                  variant="outline"
                  size="sm"
                  className="border-gray-300 hover:bg-gray-50 text-xs sm:text-sm"
                >
                  <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Back to Project Detail
                </Button>
              )}
              
              {onPrintReport && (
                <div className="relative">
                  <Button
                    onClick={() => setShowPrintMenu(!showPrintMenu)}
                    variant="outline"
                    size="sm"
                    className="border-[#34AB8A] text-[#34AB8A] hover:bg-[#34AB8A] hover:text-white"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                  
                  {showPrintMenu && (
                    <div className="absolute right-0 top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-10 min-w-[250px]">
                      <div className="p-2">
                        <p className="text-xs font-semibold text-gray-700 mb-2 px-2">Select Report Type & Detail:</p>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-600 px-2 mt-2">Actuals Only:</p>
                          <button
                            onClick={() => { onPrintReport('actuals', 'summary'); setShowPrintMenu(false) }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                          >
                            📊 Summary
                          </button>
                          <button
                            onClick={() => { onPrintReport('actuals', 'category'); setShowPrintMenu(false) }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                          >
                            📋 Category Detail
                          </button>
                          <button
                            onClick={() => { onPrintReport('actuals', 'full'); setShowPrintMenu(false) }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                          >
                            📄 Full Detail
                          </button>
                          
                          <div className="border-t my-2"></div>
                          <p className="text-xs text-gray-600 px-2">Estimate vs Actuals:</p>
                          <button
                            onClick={() => { onPrintReport('comparison', 'summary'); setShowPrintMenu(false) }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                          >
                            📊 Comparison Summary
                          </button>
                          <button
                            onClick={() => { onPrintReport('comparison', 'full'); setShowPrintMenu(false) }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                          >
                            📄 Full Comparison
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
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
  availableSuppliers: Supplier[]
  availableSubcontractors: DirectorySubcontractor[]
  editingEntry: ActualEntry | null
  onSave: (entry: ActualEntry) => void
  onCancel: () => void
}

function ActualEntryForm({
  type,
  project,
  trades,
  availableSuppliers,
  availableSubcontractors,
  editingEntry,
  onSave,
  onCancel,
}: ActualEntryFormProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const [formData, setFormData] = useState({
    date: editingEntry?.date ? new Date(editingEntry.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    amount: editingEntry?.amount?.toString() || '',
    description: editingEntry?.description || '',
    category: editingEntry?.category || '',
    tradeId: editingEntry?.tradeId || '',
    
    // Labor
    payrollPeriod: editingEntry?.payrollPeriod || '',
    
    // Material
    vendor: editingEntry?.vendor || '',
    invoiceNumber: editingEntry?.invoiceNumber || '',
    
    // Subcontractor
    subcontractorName: editingEntry?.subcontractorName || '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const entry: ActualEntry = {
      id: editingEntry?.id || uuidv4(),
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
    const action = editingEntry ? 'Edit' : 'Add'
    switch (type) {
      case 'labor': return `${action} Labor Entry`
      case 'material': return `${action} Material Entry`
      case 'subcontractor': return `${action} Subcontractor Entry`
    }
  }

  const getIcon = () => {
    switch (type) {
      case 'labor': return <Users className="w-5 h-5" />
      case 'material': return <Package className="w-5 h-5" />
      case 'subcontractor': return <HardHat className="w-5 h-5" />
    }
  }

  // Get unique categories from trades (ensure editing entry category is included)
  const categories = React.useMemo(() => {
    const set = new Set(trades.map(t => t.category))
    if (editingEntry?.category) {
      set.add(editingEntry.category as Trade['category'])
    }
    return Array.from(set)
  }, [trades, editingEntry?.category])

  // Filter trades by selected category
  const selectedCategory = formData.category as Trade['category'] | ''
  const filteredTrades = selectedCategory
    ? trades.filter(t => t.category === selectedCategory)
    : []

  const supplierOptions = React.useMemo(
    () =>
      availableSuppliers
        .filter((supplier) => supplier.isActive)
        .map((supplier) => supplier.name)
        .sort((a, b) => a.localeCompare(b)),
    [availableSuppliers]
  )

  const subcontractorOptions = React.useMemo(
    () =>
      availableSubcontractors
        .filter((sub) => sub.isActive)
        .map((sub) => sub.name)
        .sort((a, b) => a.localeCompare(b)),
    [availableSubcontractors]
  )

  const supplierSelectValue = supplierOptions.includes(formData.vendor) ? formData.vendor : 'manual'
  const subcontractorSelectValue = subcontractorOptions.includes(formData.subcontractorName)
    ? formData.subcontractorName
    : 'manual'

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
                <div className="space-y-2">
                  <Label htmlFor="vendor">Supplier</Label>
                  {supplierOptions.length > 0 ? (
                    <Select
                      value={supplierSelectValue}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          vendor: value === 'manual' ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Type supplier name...</SelectItem>
                        {supplierOptions.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Add suppliers in the Partner Directory to reuse them here.
                    </p>
                  )}
                  <Input
                    id="vendor"
                    placeholder="Type supplier name"
                    value={formData.vendor}
                    onChange={(e) => setFormData((prev) => ({ ...prev, vendor: e.target.value }))}
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
              <div className="space-y-2">
                <Label htmlFor="subcontractorName">Subcontractor</Label>
                {subcontractorOptions.length > 0 ? (
                  <Select
                    value={subcontractorSelectValue}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        subcontractorName: value === 'manual' ? '' : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subcontractor..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Type subcontractor name...</SelectItem>
                      {subcontractorOptions.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-gray-500">
                    Add subcontractors in the Partner Directory to reuse them here.
                  </p>
                )}
                <Input
                  id="subcontractorName"
                  placeholder="Type subcontractor name"
                  value={formData.subcontractorName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, subcontractorName: e.target.value }))}
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
                <Label htmlFor="tradeId">Link to Specific Item</Label>
                <Select 
                  value={formData.tradeId || 'none'} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, tradeId: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select item or leave blank..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Apply to entire category (recommended for general costs)</SelectItem>
                    {filteredTrades.map((trade) => (
                      <SelectItem key={trade.id} value={trade.id}>
                        {trade.name} ({trade.quantity} {trade.unit}) - {formatCurrency(trade.totalCost)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  💡 <strong>Tip:</strong> Link to specific items for detailed tracking, or apply to category for general costs like permits, cleanup, etc.
                </p>
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
                {editingEntry ? 'Save Changes' : 'Save Entry'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

