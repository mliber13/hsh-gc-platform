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
  SubItem,
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
  reassignMaterialEntryToProject_Hybrid,
  reassignSubcontractorEntryToProject_Hybrid,
} from '@/services/actualsHybridService'
import { getTradesForEstimate_Hybrid, getProjects_Hybrid } from '@/services/hybridService'
import { fetchTradesForEstimate, fetchSubItemsForTrade } from '@/services/supabaseService'
import { isOnlineMode } from '@/lib/supabase'
import { fetchSubcontractors, fetchSuppliers } from '@/services/partnerDirectoryService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TRADE_CATEGORIES, UNIT_TYPES } from '@/types'
import type { UnitType } from '@/types'
import { QuickBooksImport } from '@/components/QuickBooksImport'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  Printer,
  List,
  ArrowRightLeft,
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
  subItemId?: string
  
  // Labor specific
  payrollPeriod?: string
  /** Imported wages (QBO); when set, amount = grossWages + burdenAmount */
  grossWages?: number
  burdenAmount?: number
  
  // Material specific
  vendor?: string
  invoiceNumber?: string
  isSplitEntry?: boolean
  splitParentId?: string
  splitAllocation?: number
  
  // Subcontractor specific
  subcontractorName?: string
}

interface SplitAllocation {
  id: string
  category: string
  tradeId?: string
  subItemId?: string
  amount: number
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
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set())
  const [viewEntriesCell, setViewEntriesCell] = useState<{
    type?: EntryType
    tradeId?: string
    subItemId?: string
    category?: string
    label: string
    /** When true, show unlinked entries for this category (invoices not tied to an estimate line) */
    generalOnly?: boolean
  } | null>(null)
  const [subItemsByTrade, setSubItemsByTrade] = useState<Record<string, SubItem[]>>({})
  const [actualsRefreshKey, setActualsRefreshKey] = useState(0)
  /** 'all' = grouped Labor/Material/Sub; 'labor'|'material'|'subcontractor' = only that type */
  const [allEntriesModalType, setAllEntriesModalType] = useState<null | 'all' | 'labor' | 'material' | 'subcontractor'>(null)
  const [reassignEntry, setReassignEntry] = useState<{ entry: ActualEntry; type: 'material' | 'subcontractor' } | null>(null)
  const [reassignProjects, setReassignProjects] = useState<Project[]>([])
  const [reassignTargetId, setReassignTargetId] = useState<string>('')
  const [reassigning, setReassigning] = useState(false)
  /** Reconciliation checkboxes (session-only; for testing) */
  const [reconciledEntryIds, setReconciledEntryIds] = useState<Set<string>>(new Set())
  const toggleReconciled = (entryId: string) => {
    setReconciledEntryIds((prev) => {
      const next = new Set(prev)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  // Load trades for the estimate
  useEffect(() => {
    const loadTrades = async () => {
      if (project) {
        const loadedTrades = await getTradesForEstimate_Hybrid(project.estimate.id)
        setTrades(loadedTrades)
        
        // Load sub-items for each trade
        if (isOnlineMode() && loadedTrades.length > 0) {
          const subItemsMap: Record<string, SubItem[]> = {}
          for (const trade of loadedTrades) {
            if (trade.subItems && trade.subItems.length > 0) {
              subItemsMap[trade.id] = trade.subItems
            } else {
              const subItems = await fetchSubItemsForTrade(trade.id)
              subItemsMap[trade.id] = subItems
            }
          }
          setSubItemsByTrade(subItemsMap)
        }
        
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
        actuals.laborEntries?.forEach((labor: LaborEntry & { grossWages?: number; burdenAmount?: number }) => {
          entries.push({
            id: labor.id,
            type: 'labor',
            date: labor.date,
            amount: labor.totalCost,
            description: labor.description,
            category: labor.trade,
            tradeId: labor.tradeId,
            subItemId: labor.subItemId,
            payrollPeriod: labor.date.toLocaleDateString(),
            grossWages: labor.grossWages,
            burdenAmount: labor.burdenAmount,
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
            subItemId: material.subItemId,
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
            subItemId: sub.subItemId,
            subcontractorName: sub.subcontractor.name,
            invoiceNumber: (sub as any).invoiceNumber,
            isSplitEntry: (sub as any).isSplitEntry,
            splitParentId: (sub as any).splitParentId,
            splitAllocation: (sub as any).splitAllocation,
          })
        })
        
        // Sort by date, newest first
        entries.sort((a, b) => b.date.getTime() - a.date.getTime())
        
        setActualEntries(entries)
      }
    }
    
    loadActuals()
  }, [project.id, actualsRefreshKey])

  // Load projects when reassign dialog opens
  useEffect(() => {
    if (reassignEntry === null) return
    getProjects_Hybrid().then(setReassignProjects)
  }, [reassignEntry])

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
    return actualEntries.filter(entry => entry.tradeId === tradeId && !entry.subItemId)
  }

  const getActualsBySubItem = (subItemId: string) => {
    return actualEntries.filter(entry => entry.subItemId === subItemId)
  }

  /** Entries for a single Act cell (one type, one row: trade or sub-item) */
  const getEntriesForCell = (type: EntryType, tradeId?: string, subItemId?: string, category?: string): ActualEntry[] => {
    if (subItemId) return actualEntries.filter(e => e.subItemId === subItemId && e.type === type)
    if (tradeId) {
      const tradeEntries = actualEntries.filter(e => e.tradeId === tradeId && !e.subItemId && e.type === type)
      const subItems = subItemsByTrade[tradeId] || []
      const subEntries = subItems.flatMap(si => actualEntries.filter(e => e.subItemId === si.id && e.type === type))
      return [...tradeEntries, ...subEntries]
    }
    if (category) return actualEntries.filter(e => e.category === category && e.type === type)
    return []
  }

  const toggleTradeExpansion = (tradeId: string) => {
    setExpandedTrades(prev => {
      const newSet = new Set(prev)
      if (newSet.has(tradeId)) {
        newSet.delete(tradeId)
      } else {
        newSet.add(tradeId)
      }
      return newSet
    })
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

  // Calculate estimated costs by type from trades
  const getCategoryEstimateByType = (category: string) => {
    const categoryTrades = trades.filter(t => t.category === category)
    return {
      labor: categoryTrades.reduce((sum, trade) => sum + (trade.laborCost || 0), 0),
      material: categoryTrades.reduce((sum, trade) => sum + (trade.materialCost || 0), 0),
      subcontractor: categoryTrades.reduce((sum, trade) => sum + (trade.subcontractorCost || 0), 0),
    }
  }

  const getTradeEstimateByType = (trade: Trade) => {
    const tradeSubItems = subItemsByTrade[trade.id] || []
    // If trade has sub-items, use sub-item totals; otherwise use trade totals
    if (tradeSubItems.length > 0) {
      return {
        labor: tradeSubItems.reduce((sum, si) => sum + (si.laborCost || 0), 0),
        material: tradeSubItems.reduce((sum, si) => sum + (si.materialCost || 0), 0),
        subcontractor: tradeSubItems.reduce((sum, si) => sum + (si.subcontractorCost || 0), 0),
      }
    }
    return {
      labor: trade.laborCost || 0,
      material: trade.materialCost || 0,
      subcontractor: trade.subcontractorCost || 0,
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

  // Group trades by category only (no group level)
  const categoryOrder = (Object.keys(TRADE_CATEGORIES) as string[]).filter(
    (cat) => trades.some((t) => t.category === cat)
  )
  const tradesByCategory = trades.reduce((acc, trade) => {
    if (!acc[trade.category]) acc[trade.category] = []
    acc[trade.category].push(trade)
    return acc
  }, {} as Record<string, Trade[]>)

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
    // Check if this is a parent entry with split children
    const splitChildren = ((entry.type === 'material' || entry.type === 'subcontractor') && entry.invoiceNumber)
      ? actualEntries.filter(e => e.isSplitEntry && e.splitParentId === entry.id)
      : []
    
    const confirmMessage = splitChildren.length > 0
      ? `Delete this invoice and all ${splitChildren.length} split allocations (${formatCurrency(entry.amount)} total)?`
      : `Delete this ${entry.type} entry for ${formatCurrency(entry.amount)}?`
    
    if (!confirm(confirmMessage)) {
      return
    }

    // Delete split children first
    if (splitChildren.length > 0) {
      for (const child of splitChildren) {
        if (child.type === 'material') {
          await deleteMaterialEntry_Hybrid(child.id)
        } else if (child.type === 'subcontractor') {
          await deleteSubcontractorEntry_Hybrid(child.id)
        }
      }
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
        
        actuals.laborEntries?.forEach((labor: LaborEntry & { grossWages?: number; burdenAmount?: number }) => {
          entries.push({
            id: labor.id,
            type: 'labor',
            date: labor.date,
            amount: labor.totalCost,
            description: labor.description,
            category: labor.trade,
            tradeId: labor.tradeId,
            payrollPeriod: labor.date.toLocaleDateString(),
            grossWages: labor.grossWages,
            burdenAmount: labor.burdenAmount,
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
            isSplitEntry: material.isSplitEntry,
            splitParentId: material.splitParentId,
            splitAllocation: material.splitAllocation,
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

  const viewEntriesList = viewEntriesCell
    ? viewEntriesCell.generalOnly && viewEntriesCell.category
      ? actualEntries.filter(e => e.category === viewEntriesCell.category && !e.tradeId)
      : getEntriesForCell(viewEntriesCell.type!, viewEntriesCell.tradeId, viewEntriesCell.subItemId, viewEntriesCell.category)
    : []

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Dialog open={!!viewEntriesCell} onOpenChange={(open) => !open && setViewEntriesCell(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewEntriesCell?.label ?? 'Entries'}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1 min-h-0 space-y-2 pr-2">
            {viewEntriesCell?.generalOnly && (
              <p className="text-xs text-gray-600 mb-2">Invoices and costs not tied to a specific estimate line. Use Edit to link to an item if needed.</p>
            )}
            {viewEntriesList.length === 0 && <p className="text-sm text-gray-500">No entries</p>}
            {viewEntriesList.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between p-2 rounded border text-sm ${getEntryColor(entry.type)}`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getEntryIcon(entry.type)}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{entry.description}</p>
                    <p className="text-xs text-gray-600">
                      {formatDate(entry.date)}
                      {entry.vendor && ` · ${entry.vendor}`}
                      {entry.invoiceNumber && ` · Invoice: ${entry.invoiceNumber}`}
                      {entry.subcontractorName && ` · ${entry.subcontractorName}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="font-semibold">{formatCurrency(entry.amount)}</span>
                  {(entry.type === 'material' || entry.type === 'subcontractor') && !entry.isSplitEntry && (
                    <Button size="sm" variant="outline" className="h-7 px-2" title="Reassign to another project" onClick={() => { setViewEntriesCell(null); setReassignEntry({ entry, type: entry.type }); setReassignTargetId('') }}><ArrowRightLeft className="w-3 h-3" /></Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { setViewEntriesCell(null); handleEditEntry(entry) }}><Edit className="w-3 h-3" /></Button>
                  <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => { setViewEntriesCell(null); handleDeleteEntry(entry) }}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reassign entry to another project */}
      <Dialog open={reassignEntry !== null} onOpenChange={(open) => { if (!open) { setReassignEntry(null); setReassignTargetId('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reassign to project</DialogTitle>
            <p className="text-sm text-gray-500 font-normal">
              Move this {reassignEntry?.type === 'material' ? 'material' : 'subcontractor'} expense to another project. It will no longer appear under the current project.
            </p>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Label>Target project</Label>
            <Select value={reassignTargetId} onValueChange={setReassignTargetId}>
              <SelectTrigger><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                {reassignProjects.filter((p) => p.id !== project.id).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setReassignEntry(null); setReassignTargetId('') }}>Cancel</Button>
              <Button
                disabled={!reassignTargetId || reassigning}
                onClick={async () => {
                  if (!reassignEntry || !reassignTargetId) return
                  setReassigning(true)
                  try {
                    const fn = reassignEntry.type === 'material' ? reassignMaterialEntryToProject_Hybrid : reassignSubcontractorEntryToProject_Hybrid
                    const ok = await fn(reassignEntry.entry.id, reassignTargetId)
                    if (ok) {
                      setActualsRefreshKey((k) => k + 1)
                      setReassignEntry(null)
                      setReassignTargetId('')
                    } else {
                      alert('Reassign is only available when online. Please check your connection and try again.')
                    }
                  } catch (e) {
                    console.error(e)
                    alert('Failed to reassign entry.')
                  } finally {
                    setReassigning(false)
                  }
                }}
              >
                {reassigning ? 'Moving…' : 'Reassign'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* All entries modal — opened from "View all entries" (grouped) or from Labor/Material/Sub header (single type) */}
      <Dialog open={allEntriesModalType !== null} onOpenChange={(open) => !open && setAllEntriesModalType(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {allEntriesModalType === 'all' && 'All actual entries'}
              {allEntriesModalType === 'labor' && 'Labor entries'}
              {allEntriesModalType === 'material' && 'Material entries'}
              {allEntriesModalType === 'subcontractor' && 'Subcontractor entries'}
            </DialogTitle>
            <p className="text-sm text-gray-500 font-normal">
              {allEntriesModalType === 'all' ? 'Edit or assign any entry. Grouped by Labor, Material, Subcontractor.' : 'Edit or assign entries.'}
            </p>
          </DialogHeader>
          <div className="overflow-auto flex-1 min-h-0 space-y-6 pr-2">
            {actualEntries.length === 0 ? (
              <p className="text-gray-500 text-sm">No actual entries recorded yet.</p>
            ) : (
              (() => {
                const parentEntries = actualEntries.filter(e => !e.isSplitEntry)
                const labor = parentEntries.filter(e => e.type === 'labor')
                const material = parentEntries.filter(e => e.type === 'material')
                const subcontractor = parentEntries.filter(e => e.type === 'subcontractor')
                const renderEntryRow = (entry: ActualEntry) => {
                  const tradeName = entry.tradeId ? trades.find(t => t.id === entry.tradeId)?.name : null
                  const splitChildren = ((entry.type === 'material' || entry.type === 'subcontractor') && entry.invoiceNumber)
                    ? actualEntries.filter(e => e.isSplitEntry && e.splitParentId === entry.id)
                    : []
                  return (
                    <div key={entry.id}>
                      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between border rounded-lg p-3 ${getEntryColor(entry.type)}`}>
                        <div className="flex items-start gap-3 flex-1">
                          {getEntryIcon(entry.type)}
                          <div className="flex-1 space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                              <span>{formatDate(entry.date)}</span>
                              <span>•</span>
                              <span>{entry.category ? (TRADE_CATEGORIES[entry.category as keyof typeof TRADE_CATEGORIES]?.label || entry.category) : 'No category'}</span>
                              {splitChildren.length > 0 && (
                                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold">Split ({splitChildren.length})</span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-gray-900 truncate">{entry.description || entry.vendor || entry.subcontractorName || 'No description'}</p>
                            <p className="text-xs text-gray-500">{tradeName ? <span className="text-green-700 font-semibold">Linked to {tradeName}</span> : <span className="text-red-600 font-semibold">Not linked</span>}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 sm:mt-0 shrink-0 flex-wrap justify-end">
                          {entry.type === 'labor' && (entry.grossWages != null || (entry.burdenAmount != null && entry.burdenAmount > 0)) ? (
                            <div className="text-right text-sm">
                              <p className="text-gray-700">Wages: {formatCurrency(entry.grossWages ?? entry.amount)}</p>
                              <p className="text-gray-700">Burden: {formatCurrency(entry.burdenAmount ?? 0)}</p>
                              <p className="text-base font-bold text-gray-900 border-t border-gray-200 pt-0.5">Total: {formatCurrency(entry.amount)}</p>
                            </div>
                          ) : (
                            <p className="text-base font-bold text-gray-900">{formatCurrency(entry.amount)}</p>
                          )}
                          <label className="flex items-center gap-1 shrink-0 text-xs text-gray-500 cursor-pointer" title="Reconciliation (testing)">
                            <input
                              type="checkbox"
                              checked={reconciledEntryIds.has(entry.id)}
                              onChange={() => toggleReconciled(entry.id)}
                              className="rounded border-gray-400"
                            />
                            Recon
                          </label>
                          {(entry.type === 'material' || entry.type === 'subcontractor') && !entry.isSplitEntry && (
                            <Button size="sm" variant="outline" title="Reassign to another project" onClick={() => { setReassignEntry({ entry, type: entry.type }); setReassignTargetId('') }}><ArrowRightLeft className="w-3 h-3" /></Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => { setAllEntriesModalType(null); handleEditEntry(entry) }}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={() => { setAllEntriesModalType(null); handleDeleteEntry(entry) }}>Delete</Button>
                        </div>
                      </div>
                      {splitChildren.length > 0 && (
                        <div className="ml-6 mt-2 space-y-1 border-l-2 border-blue-300 pl-3">
                          {splitChildren.map((child) => (
                            <div key={child.id} className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 truncate">{child.description}</p>
                                <p className="text-xs text-gray-600">{child.tradeId ? trades.find(t => t.id === child.tradeId)?.name : null}</p>
                              </div>
                              <p className="font-semibold text-gray-900 ml-2">{formatCurrency(child.amount)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }
                if (allEntriesModalType === 'labor') {
                  return <div className="space-y-2">{labor.length === 0 ? <p className="text-gray-500 text-sm italic">No labor entries</p> : labor.map(renderEntryRow)}</div>
                }
                if (allEntriesModalType === 'material') {
                  return <div className="space-y-2">{material.length === 0 ? <p className="text-gray-500 text-sm italic">No material entries</p> : material.map(renderEntryRow)}</div>
                }
                if (allEntriesModalType === 'subcontractor') {
                  return <div className="space-y-2">{subcontractor.length === 0 ? <p className="text-gray-500 text-sm italic">No subcontractor entries</p> : subcontractor.map(renderEntryRow)}</div>
                }
                return (
                  <>
                    <section>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4" /> Labor ({labor.length})
                      </h3>
                      <div className="space-y-2">{labor.length === 0 ? <p className="text-gray-500 text-sm italic">No labor entries</p> : labor.map(renderEntryRow)}</div>
                    </section>
                    <section>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <Package className="w-4 h-4" /> Material ({material.length})
                      </h3>
                      <div className="space-y-2">{material.length === 0 ? <p className="text-gray-500 text-sm italic">No material entries</p> : material.map(renderEntryRow)}</div>
                    </section>
                    <section>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <HardHat className="w-4 h-4" /> Subcontractor ({subcontractor.length})
                      </h3>
                      <div className="space-y-2">{subcontractor.length === 0 ? <p className="text-gray-500 text-sm italic">No subcontractor entries</p> : subcontractor.map(renderEntryRow)}</div>
                    </section>
                  </>
                )
              })()
            )}
          </div>
        </DialogContent>
      </Dialog>

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

          {/* Actuals breakdown: Labor, Material, Subcontractor */}
          <Card className="bg-white shadow-lg border-slate-200">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-gray-600 mb-3">Actuals by type</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <div className="bg-blue-100 rounded-full p-2">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-blue-700 font-medium">Labor</p>
                    {(() => {
                      const laborEntries = actualEntries.filter(e => e.type === 'labor')
                      const total = laborEntries.reduce((sum, e) => sum + e.amount, 0)
                      const wages = laborEntries.reduce((sum, e) => sum + (e.grossWages ?? e.amount), 0)
                      const burden = laborEntries.reduce((sum, e) => sum + (e.burdenAmount ?? 0), 0)
                      const hasBreakdown = laborEntries.some(e => e.grossWages != null || e.burdenAmount != null)
                      if (!hasBreakdown || (burden === 0 && wages === total)) {
                        return <p className="text-lg font-bold text-gray-900">{formatCurrency(total)}</p>
                      }
                      return (
                        <div className="text-sm space-y-0.5">
                          <p className="text-gray-700">Wages: {formatCurrency(wages)}</p>
                          <p className="text-gray-700">Burden: {formatCurrency(burden)}</p>
                          <p className="text-lg font-bold text-gray-900 border-t border-blue-200 pt-1 mt-1">Total: {formatCurrency(total)}</p>
                        </div>
                      )
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 p-3">
                  <div className="bg-green-100 rounded-full p-2">
                    <Package className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-green-700 font-medium">Material</p>
                    <p className="text-lg font-bold text-gray-900">
                      {formatCurrency(actualEntries.filter(e => e.type === 'material').reduce((sum, entry) => sum + entry.amount, 0))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-orange-50 border border-orange-200 p-3">
                  <div className="bg-orange-100 rounded-full p-2">
                    <HardHat className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-orange-700 font-medium">Subcontractor</p>
                    <p className="text-lg font-bold text-gray-900">
                      {formatCurrency(actualEntries.filter(e => e.type === 'subcontractor').reduce((sum, entry) => sum + entry.amount, 0))}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

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
              <div className="mt-3 pt-3 border-t border-gray-200">
                <QuickBooksImport
                  trigger="button"
                  preSelectedProject={{
                    id: project.id,
                    name: project.name,
                    estimateId: project.estimate?.id,
                  }}
                  onSuccess={() => setActualsRefreshKey((k) => k + 1)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Debug Information removed */}

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
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle>Actuals by Category</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAllEntriesModalType('all')}
                  className="shrink-0"
                >
                  <List className="w-4 h-4 mr-1.5" />
                  View all entries
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Mobile - Cards (match EstimateBuilder card style) */}
              <div className="md:hidden space-y-4">
                {categoryOrder.map((category) => {
                  const categoryTrades = tradesByCategory[category] || []
                  const isCategoryExpanded = expandedCategories.has(category)
                  const categoryEstimate = getCategoryEstimate(category)
                  const categoryActual = getCategoryActual(category)
                  const categoryVariance = categoryActual - categoryEstimate
                  const isOver = categoryVariance > 0
                  const categoryActualBreakdown = getCategoryActualsByType(category)
                  const categoryEstimateBreakdown = getCategoryEstimateByType(category)
                  const categoryEntries = getActualsByCategory(category)
                  const unlinkedEntries = categoryEntries.filter(entry => !entry.tradeId)
                  const categoryLaborVariance = categoryActualBreakdown.labor - categoryEstimateBreakdown.labor
                  const categoryMaterialVariance = categoryActualBreakdown.material - categoryEstimateBreakdown.material
                  const categorySubVariance = categoryActualBreakdown.subcontractor - categoryEstimateBreakdown.subcontractor

                  return (
                    <Card key={category} className="border-2 border-blue-200">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full p-4 flex items-center justify-between hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">
                            {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                          </span>
                          <div className="text-left">
                            <p className="font-bold text-blue-800">
                              {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                            </p>
                            <p className="text-xs text-gray-500">
                              {categoryTrades.length} items • {getActualsByCategory(category).length} entries
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm text-gray-600">Est / Act</p>
                            <p className="font-bold text-[#34AB8A]">{formatCurrency(categoryEstimate)} / <span className={isOver ? 'text-red-600' : 'text-green-600'}>{formatCurrency(categoryActual)}</span></p>
                          </div>
                          {isCategoryExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </button>

                      {isCategoryExpanded && (
                        <div className="border-t border-blue-200 bg-blue-50 p-4">
                          {(categoryEntries.length > 0 || categoryEstimateBreakdown.labor > 0 || categoryEstimateBreakdown.material > 0 || categoryEstimateBreakdown.subcontractor > 0) && (
                                  <div className="mb-3 pb-2 border-b border-gray-300">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                      <span className="text-gray-600 font-semibold">Breakdown:</span>
                                      <span className={`px-2 py-1 rounded ${categoryEstimateBreakdown.labor > 0 || categoryActualBreakdown.labor > 0 ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'text-gray-400'}`}>
                                        👷 Labor: Est {formatCurrency(categoryEstimateBreakdown.labor)} | Act {formatCurrency(categoryActualBreakdown.labor)}
                                      </span>
                                      <span className={`px-2 py-1 rounded ${categoryEstimateBreakdown.material > 0 || categoryActualBreakdown.material > 0 ? 'bg-green-100 text-green-800 border border-green-300' : 'text-gray-400'}`}>
                                        📦 Material: Est {formatCurrency(categoryEstimateBreakdown.material)} | Act {formatCurrency(categoryActualBreakdown.material)}
                                      </span>
                                      <span className={`px-2 py-1 rounded ${categoryEstimateBreakdown.subcontractor > 0 || categoryActualBreakdown.subcontractor > 0 ? 'bg-orange-100 text-orange-800 border border-orange-300' : 'text-gray-400'}`}>
                                        👷‍♂️ Sub: Est {formatCurrency(categoryEstimateBreakdown.subcontractor)} | Act {formatCurrency(categoryActualBreakdown.subcontractor)}
                                      </span>
                                      {unlinkedEntries.length > 0 && (
                                        <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 border border-yellow-300 inline-flex items-center gap-1">
                                          📋 General ({unlinkedEntries.length}) {formatCurrency(unlinkedEntries.reduce((sum, e) => sum + e.amount, 0))}
                                          <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={(e) => { e.stopPropagation(); setViewEntriesCell({ category: category, label: `${TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category} · General (invoices not tied to a line)`, generalOnly: true }) }} title="View invoices and entries">View ({unlinkedEntries.length})</Button>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Breakdown by Type - Always show if category has any entries or estimates */}
                                {(getActualsByCategory(category).length > 0 || categoryEstimateBreakdown.labor > 0 || categoryEstimateBreakdown.material > 0 || categoryEstimateBreakdown.subcontractor > 0) && (
                                  <div className="mb-3 pb-3 border-b border-gray-200 bg-gray-50 p-3 rounded">
                                    <p className="text-sm font-semibold text-gray-800 mb-2">💰 Breakdown: Estimate vs Actual</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      <div className={`px-3 py-2 rounded-md border text-xs ${
                                        categoryEstimateBreakdown.labor > 0 || categoryActualBreakdown.labor > 0
                                          ? 'bg-blue-50 border-blue-300' 
                                          : 'bg-gray-50 border-gray-200'
                                      }`}>
                                        <div className="font-semibold mb-1.5 text-blue-900">👷 Labor</div>
                                        <div className="space-y-1 text-[10px]">
                                          <div className="flex justify-between">
                                            <span className="text-gray-600">Est:</span>
                                            <span className="font-semibold">{formatCurrency(categoryEstimateBreakdown.labor)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-gray-600">Act:</span>
                                            <span className="font-semibold">{formatCurrency(categoryActualBreakdown.labor)}</span>
                                          </div>
                                          <div className={`flex justify-between pt-1 border-t ${categoryLaborVariance > 0 ? 'text-red-600' : categoryLaborVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                            <span className="font-semibold">Var:</span>
                                            <span className="font-bold">{formatCurrency(Math.abs(categoryLaborVariance))} {categoryLaborVariance > 0 ? '⚠️' : categoryLaborVariance < 0 ? '✓' : ''}</span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className={`px-3 py-2 rounded-md border text-xs ${
                                        categoryEstimateBreakdown.material > 0 || categoryActualBreakdown.material > 0
                                          ? 'bg-green-50 border-green-300' 
                                          : 'bg-gray-50 border-gray-200'
                                      }`}>
                                        <div className="font-semibold mb-1.5 text-green-900">📦 Material</div>
                                        <div className="space-y-1 text-[10px]">
                                          <div className="flex justify-between">
                                            <span className="text-gray-600">Est:</span>
                                            <span className="font-semibold">{formatCurrency(categoryEstimateBreakdown.material)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-gray-600">Act:</span>
                                            <span className="font-semibold">{formatCurrency(categoryActualBreakdown.material)}</span>
                                          </div>
                                          <div className={`flex justify-between pt-1 border-t ${categoryMaterialVariance > 0 ? 'text-red-600' : categoryMaterialVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                            <span className="font-semibold">Var:</span>
                                            <span className="font-bold">{formatCurrency(Math.abs(categoryMaterialVariance))} {categoryMaterialVariance > 0 ? '⚠️' : categoryMaterialVariance < 0 ? '✓' : ''}</span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className={`px-3 py-2 rounded-md border text-xs ${
                                        categoryEstimateBreakdown.subcontractor > 0 || categoryActualBreakdown.subcontractor > 0
                                          ? 'bg-orange-50 border-orange-300' 
                                          : 'bg-gray-50 border-gray-200'
                                      }`}>
                                        <div className="font-semibold mb-1.5 text-orange-900">👷‍♂️ Subcontractor</div>
                                        <div className="space-y-1 text-[10px]">
                                          <div className="flex justify-between">
                                            <span className="text-gray-600">Est:</span>
                                            <span className="font-semibold">{formatCurrency(categoryEstimateBreakdown.subcontractor)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-gray-600">Act:</span>
                                            <span className="font-semibold">{formatCurrency(categoryActualBreakdown.subcontractor)}</span>
                                          </div>
                                          <div className={`flex justify-between pt-1 border-t ${categorySubVariance > 0 ? 'text-red-600' : categorySubVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                            <span className="font-semibold">Var:</span>
                                            <span className="font-bold">{formatCurrency(Math.abs(categorySubVariance))} {categorySubVariance > 0 ? '⚠️' : categorySubVariance < 0 ? '✓' : ''}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    {unlinkedEntries.length > 0 && (
                                      <div className="mt-3 px-3 py-2 rounded-md border bg-yellow-50 border-yellow-300 text-yellow-800 text-xs flex items-center justify-between gap-2">
                                        <span><span className="font-semibold">📋 General ({unlinkedEntries.length}):</span> {formatCurrency(unlinkedEntries.reduce((sum, e) => sum + e.amount, 0))}</span>
                                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-yellow-800 hover:bg-yellow-100" onClick={(e) => { e.stopPropagation(); setViewEntriesCell({ category: category, label: `${TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category} · General (invoices not tied to a line)`, generalOnly: true }) }} title="View invoices and entries">View ({unlinkedEntries.length})</Button>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="space-y-2">
                                  {categoryTrades.map((trade) => {
                                    const tradeActuals = getActualsByTrade(trade.id)
                                    const tradeSubItems = subItemsByTrade[trade.id] || []
                                    // Include sub-item actuals in trade total
                                    const subItemActuals = tradeSubItems.flatMap(si => getActualsBySubItem(si.id))
                                    const tradeActualTotal = tradeActuals.reduce((sum, entry) => sum + entry.amount, 0) + 
                                                             subItemActuals.reduce((sum, entry) => sum + entry.amount, 0)
                                    const tradeEstimate = trade.totalCost * (1 + (trade.markupPercent || 11.1) / 100)
                                    const tradeVariance = tradeActualTotal - tradeEstimate
                                    const isTradeOver = tradeVariance > 0

                                    const itemCOs = getChangeOrdersForTrade(trade.id)
                                    const varianceType = getVarianceType(trade.id, tradeVariance)
                                    const hasExpanded = expandedCOItems.has(trade.id)
                                    const isTradeExpanded = expandedTrades.has(trade.id)
                                    const hasSubItems = tradeSubItems.length > 0

                                    return (
                                      <div key={trade.id} className="bg-white rounded-lg p-3 sm:p-4 border border-gray-200">
                                        {/* Item Header */}
                                        <div className="mb-3">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {hasSubItems && (
                                              <button
                                                onClick={() => toggleTradeExpansion(trade.id)}
                                                className="p-1 hover:bg-gray-200 rounded"
                                                title={isTradeExpanded ? 'Collapse sub-items' : 'Expand sub-items'}
                                              >
                                                {isTradeExpanded ? (
                                                  <ChevronDown className="w-4 h-4" />
                                                ) : (
                                                  <ChevronUp className="w-4 h-4 rotate-180" />
                                                )}
                                              </button>
                                            )}
                                            <h4 className="font-semibold text-gray-900 text-sm sm:text-base">{trade.name}</h4>
                                            {hasSubItems && (
                                              <span className="text-xs text-gray-500">({tradeSubItems.length} sub-items)</span>
                                            )}
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

                                        {/* Trade Item Breakdown by Type - Always show if item has entries or estimates */}
                                        {(() => {
                                          // Include sub-item actuals in breakdown
                                          const subItemActuals = tradeSubItems.flatMap(si => getActualsBySubItem(si.id))
                                          const allTradeActuals = [...tradeActuals, ...subItemActuals]
                                          const tradeBreakdown = {
                                            labor: allTradeActuals.filter(e => e.type === 'labor').reduce((sum, entry) => sum + entry.amount, 0),
                                            material: allTradeActuals.filter(e => e.type === 'material').reduce((sum, entry) => sum + entry.amount, 0),
                                            subcontractor: allTradeActuals.filter(e => e.type === 'subcontractor').reduce((sum, entry) => sum + entry.amount, 0),
                                          }
                                          const tradeEstimateBreakdown = getTradeEstimateByType(trade)
                                          const itemLaborVariance = tradeBreakdown.labor - tradeEstimateBreakdown.labor
                                          const itemMaterialVariance = tradeBreakdown.material - tradeEstimateBreakdown.material
                                          const itemSubVariance = tradeBreakdown.subcontractor - tradeEstimateBreakdown.subcontractor
                                          
                                          if (tradeActuals.length === 0 && tradeEstimateBreakdown.labor === 0 && tradeEstimateBreakdown.material === 0 && tradeEstimateBreakdown.subcontractor === 0) {
                                            return null
                                          }
                                          
                                          return (
                                            <div className="mb-3 pb-3 border-b border-gray-200 bg-gray-50 p-2 rounded">
                                              <p className="text-xs font-semibold text-gray-800 mb-2">💰 Item Breakdown: Estimate vs Actual</p>
                                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <div className={`px-2 py-1.5 rounded border text-[10px] ${
                                                  tradeEstimateBreakdown.labor > 0 || tradeBreakdown.labor > 0
                                                    ? 'bg-blue-50 border-blue-200' 
                                                    : 'bg-gray-50 border-gray-200'
                                                }`}>
                                                  <div className="font-semibold mb-1 text-blue-900">👷 Labor</div>
                                                  <div className="space-y-0.5">
                                                    <div className="flex justify-between">
                                                      <span className="text-gray-600">Est:</span>
                                                      <span className="font-semibold">{formatCurrency(tradeEstimateBreakdown.labor)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                      <span className="text-gray-600">Act:</span>
                                                      <span className="font-semibold">{formatCurrency(tradeBreakdown.labor)}</span>
                                                    </div>
                                                    {allTradeActuals.filter(e => e.type === 'labor').length > 0 && (
                                                      <button type="button" onClick={() => setViewEntriesCell({ type: 'labor', tradeId: trade.id, label: `${trade.name} · Labor` })} className="flex items-center gap-0.5 text-blue-700 hover:underline mt-0.5"><List className="w-2.5 h-2.5" /> View ({allTradeActuals.filter(e => e.type === 'labor').length})</button>
                                                    )}
                                                    <div className={`flex justify-between pt-0.5 border-t ${itemLaborVariance > 0 ? 'text-red-600' : itemLaborVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                                      <span className="font-semibold">Var:</span>
                                                      <span className="font-bold">{formatCurrency(Math.abs(itemLaborVariance))} {itemLaborVariance > 0 ? '⚠️' : itemLaborVariance < 0 ? '✓' : ''}</span>
                                                    </div>
                                                  </div>
                                                </div>
                                                <div className={`px-2 py-1.5 rounded border text-[10px] ${
                                                  tradeEstimateBreakdown.material > 0 || tradeBreakdown.material > 0
                                                    ? 'bg-green-50 border-green-200' 
                                                    : 'bg-gray-50 border-gray-200'
                                                }`}>
                                                  <div className="font-semibold mb-1 text-green-900">📦 Material</div>
                                                  <div className="space-y-0.5">
                                                    <div className="flex justify-between">
                                                      <span className="text-gray-600">Est:</span>
                                                      <span className="font-semibold">{formatCurrency(tradeEstimateBreakdown.material)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                      <span className="text-gray-600">Act:</span>
                                                      <span className="font-semibold">{formatCurrency(tradeBreakdown.material)}</span>
                                                    </div>
                                                    {allTradeActuals.filter(e => e.type === 'material').length > 0 && (
                                                      <button type="button" onClick={() => setViewEntriesCell({ type: 'material', tradeId: trade.id, label: `${trade.name} · Material` })} className="flex items-center gap-0.5 text-green-800 hover:underline mt-0.5"><List className="w-2.5 h-2.5" /> View ({allTradeActuals.filter(e => e.type === 'material').length})</button>
                                                    )}
                                                    <div className={`flex justify-between pt-0.5 border-t ${itemMaterialVariance > 0 ? 'text-red-600' : itemMaterialVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                                      <span className="font-semibold">Var:</span>
                                                      <span className="font-bold">{formatCurrency(Math.abs(itemMaterialVariance))} {itemMaterialVariance > 0 ? '⚠️' : itemMaterialVariance < 0 ? '✓' : ''}</span>
                                                    </div>
                                                  </div>
                                                </div>
                                                <div className={`px-2 py-1.5 rounded border text-[10px] ${
                                                  tradeEstimateBreakdown.subcontractor > 0 || tradeBreakdown.subcontractor > 0
                                                    ? 'bg-orange-50 border-orange-200' 
                                                    : 'bg-gray-50 border-gray-200'
                                                }`}>
                                                  <div className="font-semibold mb-1 text-orange-900">👷‍♂️ Sub</div>
                                                  <div className="space-y-0.5">
                                                    <div className="flex justify-between">
                                                      <span className="text-gray-600">Est:</span>
                                                      <span className="font-semibold">{formatCurrency(tradeEstimateBreakdown.subcontractor)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                      <span className="text-gray-600">Act:</span>
                                                      <span className="font-semibold">{formatCurrency(tradeBreakdown.subcontractor)}</span>
                                                    </div>
                                                    {allTradeActuals.filter(e => e.type === 'subcontractor').length > 0 && (
                                                      <button type="button" onClick={() => setViewEntriesCell({ type: 'subcontractor', tradeId: trade.id, label: `${trade.name} · Subcontractor` })} className="flex items-center gap-0.5 text-orange-800 hover:underline mt-0.5"><List className="w-2.5 h-2.5" /> View ({allTradeActuals.filter(e => e.type === 'subcontractor').length})</button>
                                                    )}
                                                    <div className={`flex justify-between pt-0.5 border-t ${itemSubVariance > 0 ? 'text-red-600' : itemSubVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                                      <span className="font-semibold">Var:</span>
                                                      <span className="font-bold">{formatCurrency(Math.abs(itemSubVariance))} {itemSubVariance > 0 ? '⚠️' : itemSubVariance < 0 ? '✓' : ''}</span>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        })()}

                                        {/* Sub-Items */}
                                        {isTradeExpanded && hasSubItems && (
                                          <div className="mb-3 pb-3 border-b border-gray-200 space-y-2">
                                            <p className="text-xs font-semibold text-gray-700 uppercase mb-2">Sub-Items:</p>
                                            {tradeSubItems.map((subItem) => {
                                              const subItemActuals = getActualsBySubItem(subItem.id)
                                              const subItemActualTotal = subItemActuals.reduce((sum, entry) => sum + entry.amount, 0)
                                              const subItemEstimate = subItem.totalCost * (1 + (subItem.markupPercent || 11.1) / 100)
                                              const subItemVariance = subItemActualTotal - subItemEstimate
                                              
                                              return (
                                                <div key={subItem.id} className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                                                  <div className="flex items-center justify-between mb-2">
                                                    <div>
                                                      <p className="text-sm font-medium text-gray-900">{subItem.name}</p>
                                                      <p className="text-xs text-gray-600">{subItem.quantity} {subItem.unit}</p>
                                                    </div>
                                                    <div className="text-right text-xs">
                                                      <p className="text-gray-600">Est: {formatCurrency(subItemEstimate)}</p>
                                                      <p className="text-gray-600">Act: {formatCurrency(subItemActualTotal)}</p>
                                                      <p className={`font-semibold ${subItemVariance > 0 ? 'text-red-600' : subItemVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                                        Var: {formatCurrency(Math.abs(subItemVariance))} {subItemVariance > 0 ? '⚠️' : subItemVariance < 0 ? '✓' : ''}
                                                      </p>
                                                    </div>
                                                  </div>
                                                  {subItemActuals.length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-blue-200 space-y-1">
                                                      {subItemActuals.map((entry) => (
                                                        <div
                                                          key={entry.id}
                                                          className={`flex items-center justify-between p-1.5 rounded border text-xs ${getEntryColor(entry.type)}`}
                                                        >
                                                          <div className="flex items-center gap-1.5 flex-1">
                                                            {getEntryIcon(entry.type)}
                                                            <div className="flex-1">
                                                              <p className="font-medium text-gray-900">{entry.description}</p>
                                                              <p className="text-gray-600">
                                                                {formatDate(entry.date)}
                                                                {entry.vendor && ` • ${entry.vendor}`}
                                                                {entry.invoiceNumber && ` • ${entry.invoiceNumber}`}
                                                              </p>
                                                            </div>
                                                          </div>
                                                          <div className="flex items-center gap-1">
                                                            <p className="font-semibold text-gray-900">{formatCurrency(entry.amount)}</p>
                                                            {(entry.type === 'material' || entry.type === 'subcontractor') && !entry.isSplitEntry && (
                                                              <Button size="sm" variant="outline" className="h-6 px-1.5" title="Reassign to another project" onClick={() => setReassignEntry({ entry, type: entry.type })}><ArrowRightLeft className="w-3 h-3" /></Button>
                                                            )}
                                                            <Button
                                                              size="sm"
                                                              variant="outline"
                                                              onClick={() => handleEditEntry(entry)}
                                                              className="h-6 px-1.5"
                                                            >
                                                              <Edit className="w-3 h-3" />
                                                            </Button>
                                                            <Button
                                                              size="sm"
                                                              variant="destructive"
                                                              onClick={() => handleDeleteEntry(entry)}
                                                              className="h-6 px-1.5"
                                                            >
                                                              <Trash2 className="w-3 h-3" />
                                                            </Button>
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              )
                                            })}
                                          </div>
                                        )}

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
                                                    {(entry.type === 'material' || entry.type === 'subcontractor') && !entry.isSplitEntry && (
                                                      <Button size="sm" variant="outline" className="h-7 px-2" title="Reassign to another project" onClick={(e) => { e.stopPropagation(); setReassignEntry({ entry, type: entry.type }); setReassignTargetId('') }}><ArrowRightLeft className="w-3 h-3" /></Button>
                                                    )}
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
                    )}
                  </Card>
                )
              })}

                {categoryOrder.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No estimate items found. Please add items to your estimate first.
                  </div>
                )}
              </div>

              {/* Desktop - Table (match EstimateBuilder spreadsheet style) */}
              <div className="hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[1200px]">
                    <thead>
                      <tr className="border-b">
                        <th className="p-3"></th>
                        <th className="p-3"></th>
                        <th className="p-3 border-r-2 border-gray-300"></th>
                        <th className="text-center p-3 bg-blue-600 text-white border-r-2 border-blue-700" colSpan={2}>
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-2xl font-bold">Labor</span>
                            <Button type="button" variant="secondary" size="sm" className="h-7 px-2 text-xs bg-blue-500 hover:bg-blue-600 text-white border-0" onClick={(e) => { e.stopPropagation(); setAllEntriesModalType('labor') }} title="View labor entries"><List className="w-3.5 h-3.5" /></Button>
                          </div>
                        </th>
                        <th className="text-center p-3 bg-emerald-600 text-white border-r-2 border-emerald-700" colSpan={2}>
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-2xl font-bold">Material</span>
                            <Button type="button" variant="secondary" size="sm" className="h-7 px-2 text-xs bg-emerald-500 hover:bg-emerald-600 text-white border-0" onClick={(e) => { e.stopPropagation(); setAllEntriesModalType('material') }} title="View material entries"><List className="w-3.5 h-3.5" /></Button>
                          </div>
                        </th>
                        <th className="text-center p-3 bg-amber-600 text-white border-r-2 border-amber-700" colSpan={2}>
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-2xl font-bold">Subcontractor</span>
                            <Button type="button" variant="secondary" size="sm" className="h-7 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0" onClick={(e) => { e.stopPropagation(); setAllEntriesModalType('subcontractor') }} title="View subcontractor entries"><List className="w-3.5 h-3.5" /></Button>
                          </div>
                        </th>
                        <th className="p-3 border-r-2 border-gray-300"></th>
                        <th className="p-3 border-r-2 border-gray-300"></th>
                        <th className="p-3"></th>
                        <th className="p-3"></th>
                      </tr>
                      <tr className="border-b">
                        <th className="text-left p-3 bg-[#213069] text-white border-r-2 border-gray-300">Category & Items</th>
                        <th className="text-center p-3 bg-[#213069] text-white border-r-2 border-gray-300">Qty</th>
                        <th className="text-center p-3 bg-[#213069] text-white border-r-2 border-gray-300">Unit</th>
                        <th className="text-center p-3 bg-blue-700 text-white border-r-2 border-blue-800">Labor Est</th>
                        <th className="text-center p-3 bg-blue-700 text-white border-r-2 border-blue-800">Labor Act</th>
                        <th className="text-center p-3 bg-emerald-700 text-white border-r-2 border-emerald-800">Material Est</th>
                        <th className="text-center p-3 bg-emerald-700 text-white border-r-2 border-emerald-800">Material Act</th>
                        <th className="text-center p-3 bg-amber-700 text-white border-r-2 border-amber-800">Sub Est</th>
                        <th className="text-center p-3 bg-amber-700 text-white border-r-2 border-amber-800">Sub Act</th>
                        <th className="text-center p-3 bg-[#0E79C9] text-white border-r-2 border-gray-300">Total Est</th>
                        <th className="text-center p-3 bg-[#34AB8A] text-white border-r-2 border-gray-300">Total Act</th>
                        <th className="text-center p-3 bg-[#D95C00] text-white border-r-2 border-gray-300">Variance</th>
                        <th className="text-center p-3 bg-[#34AB8A] text-white">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryOrder.map((category) => {
                        const categoryTrades = tradesByCategory[category] || []
                        const isCategoryExpanded = expandedCategories.has(category)
                        const categoryEstimateBreakdown = getCategoryEstimateByType(category)
                        const categoryActualBreakdown = getCategoryActualsByType(category)
                        const categoryEstimate = getCategoryEstimate(category)
                        const categoryActual = getCategoryActual(category)
                        const categoryVariance = categoryActual - categoryEstimate

                        return (
                          <React.Fragment key={category}>
                            <tr
                              className="bg-gray-50 font-semibold cursor-pointer hover:bg-gray-100 transition-colors"
                              onClick={() => toggleCategory(category)}
                            >
                              <td className="p-3 border-b border-r-2 border-l-4 border-l-slate-400 border-gray-300 pl-8 bg-gray-50">
                                <div className="flex items-center gap-2">
                                  {isCategoryExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4 rotate-180" />}
                                  {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                                </div>
                              </td>
                              <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-gray-50"></td>
                              <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-gray-50"></td>
                              <td className="p-3 text-center border-b border-r-2 border-gray-300 font-semibold bg-blue-50">{formatCurrency(categoryEstimateBreakdown.labor)}</td>
                              <td className="p-3 text-center border-b border-r-2 border-gray-300 font-semibold bg-blue-50">{formatCurrency(categoryActualBreakdown.labor)}</td>
                              <td className="p-3 text-center border-b border-r-2 border-gray-300 font-semibold bg-emerald-50">{formatCurrency(categoryEstimateBreakdown.material)}</td>
                              <td className="p-3 text-center border-b border-r-2 border-gray-300 font-semibold bg-emerald-50">{formatCurrency(categoryActualBreakdown.material)}</td>
                              <td className="p-3 text-center border-b border-r-2 border-gray-300 font-semibold bg-amber-50">{formatCurrency(categoryEstimateBreakdown.subcontractor)}</td>
                              <td className="p-3 text-center border-b border-r-2 border-gray-300 font-semibold bg-amber-50">{formatCurrency(categoryActualBreakdown.subcontractor)}</td>
                              <td className="p-3 text-center border-b font-semibold border-r-2 border-gray-300 bg-gray-50">{formatCurrency(categoryEstimate)}</td>
                              <td className="p-3 text-center border-b font-semibold border-r-2 border-gray-300 bg-gray-50">{formatCurrency(categoryActual)}</td>
                              <td className={`p-3 text-center border-b border-r-2 border-gray-300 font-semibold bg-gray-50 ${categoryVariance > 0 ? 'text-red-600' : categoryVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                {formatCurrency(Math.abs(categoryVariance))}
                              </td>
                              <td className="p-3 text-center border-b bg-gray-50"></td>
                            </tr>
                            {isCategoryExpanded && categoryTrades.map((trade) => {
                              const tradeActuals = getActualsByTrade(trade.id)
                              const tradeSubItems = subItemsByTrade[trade.id] || []
                              const subItemActuals = tradeSubItems.flatMap(si => getActualsBySubItem(si.id))
                              const tradeActualTotal = tradeActuals.reduce((sum, entry) => sum + entry.amount, 0) + subItemActuals.reduce((sum, entry) => sum + entry.amount, 0)
                              const tradeEstimate = trade.totalCost * (1 + (trade.markupPercent || 11.1) / 100)
                              const tradeEstimateBreakdown = getTradeEstimateByType(trade)
                              const tradeActualBreakdown = {
                                labor: tradeActuals.filter(e => e.type === 'labor').reduce((s, e) => s + e.amount, 0) + subItemActuals.filter(e => e.type === 'labor').reduce((s, e) => s + e.amount, 0),
                                material: tradeActuals.filter(e => e.type === 'material').reduce((s, e) => s + e.amount, 0) + subItemActuals.filter(e => e.type === 'material').reduce((s, e) => s + e.amount, 0),
                                subcontractor: tradeActuals.filter(e => e.type === 'subcontractor').reduce((s, e) => s + e.amount, 0) + subItemActuals.filter(e => e.type === 'subcontractor').reduce((s, e) => s + e.amount, 0),
                              }
                              const tradeVariance = tradeActualTotal - tradeEstimate
                              const varianceType = getVarianceType(trade.id, tradeVariance)
                              const isTradeExpanded = expandedTrades.has(trade.id)
                              const hasSubItems = tradeSubItems.length > 0

                              return (
                                <React.Fragment key={trade.id}>
                                  <tr className="hover:bg-gray-50/80 bg-white">
                                    <td className="p-3 border-b pl-12 border-r-2 border-l-2 border-l-slate-200 border-gray-300 bg-white">
                                      <div className="flex items-center gap-2">
                                        {hasSubItems && (
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); toggleTradeExpansion(trade.id) }}
                                            className="p-1 hover:bg-gray-200 rounded"
                                            title={isTradeExpanded ? 'Collapse' : 'Expand'}
                                          >
                                            {isTradeExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4 rotate-180" />}
                                          </button>
                                        )}
                                        <span>{trade.name}</span>
                                        {hasSubItems && <span className="text-xs text-gray-500">({tradeSubItems.length} sub)</span>}
                                      </div>
                                    </td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-white">{trade.quantity}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-white">{UNIT_TYPES[trade.unit as UnitType]?.abbreviation || trade.unit}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-blue-50">{formatCurrency(tradeEstimateBreakdown.labor)}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-blue-50">
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span>{formatCurrency(tradeActualBreakdown.labor)}</span>
                                        {(() => { const entries = getEntriesForCell('labor', trade.id); return entries.length > 0 && (
                                          <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={(e) => { e.stopPropagation(); setViewEntriesCell({ type: 'labor', tradeId: trade.id, label: `${trade.name} · Labor` }) }} title="View entries"><List className="w-3 h-3 mr-0.5 inline" /> View ({entries.length})</Button>
                                        ); })()}
                                      </div>
                                    </td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-emerald-50">{formatCurrency(tradeEstimateBreakdown.material)}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-emerald-50">
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span>{formatCurrency(tradeActualBreakdown.material)}</span>
                                        {(() => { const entries = getEntriesForCell('material', trade.id); return entries.length > 0 && (
                                          <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={(e) => { e.stopPropagation(); setViewEntriesCell({ type: 'material', tradeId: trade.id, label: `${trade.name} · Material` }) }} title="View entries"><List className="w-3 h-3 mr-0.5 inline" /> View ({entries.length})</Button>
                                        ); })()}
                                      </div>
                                    </td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-amber-50">{formatCurrency(tradeEstimateBreakdown.subcontractor)}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-amber-50">
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span>{formatCurrency(tradeActualBreakdown.subcontractor)}</span>
                                        {(() => { const entries = getEntriesForCell('subcontractor', trade.id); return entries.length > 0 && (
                                          <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={(e) => { e.stopPropagation(); setViewEntriesCell({ type: 'subcontractor', tradeId: trade.id, label: `${trade.name} · Subcontractor` }) }} title="View entries"><List className="w-3 h-3 mr-0.5 inline" /> View ({entries.length})</Button>
                                        ); })()}
                                      </div>
                                    </td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-white">{formatCurrency(tradeEstimate)}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-white">{formatCurrency(tradeActualTotal)}</td>
                                    <td className={`p-3 text-center border-b border-r-2 border-gray-300 font-medium bg-white ${getVarianceColor(varianceType)}`}>
                                      {formatCurrency(Math.abs(tradeVariance))} {getVarianceIcon(varianceType)}
                                    </td>
                                    <td className="p-3 text-center border-b bg-white">
                                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setEditingEntry(null); setEntryType('material'); setShowEntryForm(true); }} className="h-7 px-2" title="Add entry">Add</Button>
                                    </td>
                                  </tr>
                                  {isTradeExpanded && hasSubItems && tradeSubItems.map((subItem) => {
                                    const siActuals = getActualsBySubItem(subItem.id)
                                    const siActualTotal = siActuals.reduce((s, e) => s + e.amount, 0)
                                    const siLaborAct = siActuals.filter(e => e.type === 'labor').reduce((s, e) => s + e.amount, 0)
                                    const siMaterialAct = siActuals.filter(e => e.type === 'material').reduce((s, e) => s + e.amount, 0)
                                    const siSubAct = siActuals.filter(e => e.type === 'subcontractor').reduce((s, e) => s + e.amount, 0)
                                    const siEstimate = subItem.totalCost * (1 + (subItem.markupPercent || 11.1) / 100)
                                    const siVariance = siActualTotal - siEstimate
                                    return (
                                      <tr key={subItem.id} className="bg-blue-50/40 hover:bg-blue-50/60">
                                        <td className="p-3 border-b pl-20 border-r-2 border-l-2 border-l-blue-200 border-gray-300 text-sm bg-blue-50/40">{subItem.name}</td>
                                        <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-blue-50/40">{subItem.quantity}</td>
                                        <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-blue-50/40">{UNIT_TYPES[subItem.unit as UnitType]?.abbreviation || subItem.unit}</td>
                                        <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-blue-50">{formatCurrency(subItem.laborCost || 0)}</td>
                                        <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-blue-50">
                                          <div className="flex flex-col items-center gap-0.5">
                                            <span>{formatCurrency(siLaborAct)}</span>
                                            {siActuals.filter(e => e.type === 'labor').length > 0 && (
                                              <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={(e) => { e.stopPropagation(); setViewEntriesCell({ type: 'labor', subItemId: subItem.id, label: `${subItem.name} · Labor` }) }} title="View entries"><List className="w-3 h-3 mr-0.5 inline" /> View</Button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-emerald-50">{formatCurrency(subItem.materialCost || 0)}</td>
                                        <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-emerald-50">
                                          <div className="flex flex-col items-center gap-0.5">
                                            <span>{formatCurrency(siMaterialAct)}</span>
                                            {siActuals.filter(e => e.type === 'material').length > 0 && (
                                              <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={(e) => { e.stopPropagation(); setViewEntriesCell({ type: 'material', subItemId: subItem.id, label: `${subItem.name} · Material` }) }} title="View entries"><List className="w-3 h-3 mr-0.5 inline" /> View</Button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-amber-50">{formatCurrency(subItem.subcontractorCost || 0)}</td>
                                        <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-amber-50">
                                          <div className="flex flex-col items-center gap-0.5">
                                            <span>{formatCurrency(siSubAct)}</span>
                                            {siActuals.filter(e => e.type === 'subcontractor').length > 0 && (
                                              <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={(e) => { e.stopPropagation(); setViewEntriesCell({ type: 'subcontractor', subItemId: subItem.id, label: `${subItem.name} · Subcontractor` }) }} title="View entries"><List className="w-3 h-3 mr-0.5 inline" /> View</Button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-blue-50/40">{formatCurrency(siEstimate)}</td>
                                        <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-blue-50/40">{formatCurrency(siActualTotal)}</td>
                                        <td className={`p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-blue-50/40 ${siVariance > 0 ? 'text-red-600' : siVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>{formatCurrency(Math.abs(siVariance))}</td>
                                        <td className="p-3 text-center border-b bg-blue-50/40"></td>
                                      </tr>
                                    )
                                  })}
                                  {isTradeExpanded && (
                                    <tr>
                                      <td colSpan={13} className="p-0 align-top bg-gray-50">
                                        <div className="px-4 py-3 border-b border-gray-200 text-sm space-y-2 max-h-64 overflow-y-auto">
                                          {tradeActuals.length > 0 && (
                                            <div>
                                              <p className="font-semibold text-gray-700 mb-1">Entries</p>
                                              {tradeActuals.map((entry) => (
                                                <div key={entry.id} className={`flex items-center justify-between py-1.5 px-2 rounded border ${getEntryColor(entry.type)}`}>
                                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    {getEntryIcon(entry.type)}
                                                    <span className="truncate">{entry.description}</span>
                                                    <span className="text-gray-500 text-xs shrink-0">{formatDate(entry.date)}</span>
                                                  </div>
                                                  <div className="flex items-center gap-1 shrink-0">
                                                    <span className="font-semibold">{formatCurrency(entry.amount)}</span>
                                                    {(entry.type === 'material' || entry.type === 'subcontractor') && !entry.isSplitEntry && (
                                                      <Button size="sm" variant="outline" className="h-6 px-1.5" title="Reassign to another project" onClick={() => { setReassignEntry({ entry, type: entry.type }); setReassignTargetId('') }}><ArrowRightLeft className="w-3 h-3" /></Button>
                                                    )}
                                                    <Button size="sm" variant="outline" className="h-6 px-1.5" onClick={() => handleEditEntry(entry)}><Edit className="w-3 h-3" /></Button>
                                                    <Button size="sm" variant="destructive" className="h-6 px-1.5" onClick={() => handleDeleteEntry(entry)}><Trash2 className="w-3 h-3" /></Button>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          {tradeActuals.length === 0 && <p className="text-gray-500 italic">No entries yet</p>}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              )
                            })}
                            {/* One row per category for general entries (invoices not tied to an estimate line) */}
                            {isCategoryExpanded && (() => {
                              const unlinkedForCategory = getActualsByCategory(category).filter(e => !e.tradeId)
                              if (unlinkedForCategory.length === 0) return null
                              const genLab = unlinkedForCategory.filter(e => e.type === 'labor').reduce((s, e) => s + e.amount, 0)
                              const genMat = unlinkedForCategory.filter(e => e.type === 'material').reduce((s, e) => s + e.amount, 0)
                              const genSub = unlinkedForCategory.filter(e => e.type === 'subcontractor').reduce((s, e) => s + e.amount, 0)
                              const genTotal = genLab + genMat + genSub
                              return (
                                <tr className="bg-yellow-50/80 hover:bg-yellow-50" onClick={(e) => e.stopPropagation()}>
                                  <td className="p-3 border-b pl-12 border-r-2 border-l-2 border-l-amber-300 border-gray-300 text-sm italic text-yellow-900 bg-yellow-50/80">— Other / General</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 bg-yellow-50/80"></td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 text-xs text-gray-500 bg-yellow-50/80">—</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-blue-50"></td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-blue-50">{formatCurrency(genLab)}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-emerald-50"></td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-emerald-50">{formatCurrency(genMat)}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-amber-50"></td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-amber-50">{formatCurrency(genSub)}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-yellow-50/80"></td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm font-medium bg-yellow-50/80">{formatCurrency(genTotal)}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm bg-yellow-50/80">—</td>
                                  <td className="p-3 text-center border-b bg-yellow-50/80">
                                    <Button size="sm" variant="ghost" className="h-6 px-1 text-xs text-yellow-800" onClick={() => setViewEntriesCell({ category, label: `${TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category} · General (invoices not tied to a line)`, generalOnly: true })} title="View invoices and entries"><List className="w-3 h-3 mr-0.5 inline" /> View ({unlinkedForCategory.length})</Button>
                                  </td>
                                </tr>
                              )
                            })()}
                          </React.Fragment>
                        )
                      })}
                      {categoryOrder.length === 0 && (
                        <tr>
                          <td colSpan={13} className="p-8 text-center text-gray-500">
                            No estimate items found. Please add items to your estimate first.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
          subItemsByTrade={subItemsByTrade}
          availableSuppliers={availableSuppliers}
          availableSubcontractors={availableSubcontractors}
          editingEntry={editingEntry}
          actualEntries={actualEntries}
          onSave={async (entry, splitAllocations) => {
            // Handle split invoices
            if ((entry.type === 'material' || entry.type === 'subcontractor') && splitAllocations && splitAllocations.length > 0) {
              if (entry.type === 'material') {
                // Create parent entry first
                const materialCategory = entry.category as Trade['category'] | undefined
                const parentEntry = await addMaterialEntry_Hybrid(project.id, {
                  date: entry.date,
                  materialName: entry.description,
                  totalCost: entry.amount,
                  category: materialCategory,
                  tradeId: entry.tradeId,
                  subItemId: entry.subItemId,
                  vendor: entry.vendor,
                  invoiceNumber: entry.invoiceNumber,
                  isSplitEntry: false,
                })

                if (!parentEntry) {
                  alert('Failed to create parent invoice entry')
                  return
                }

                // Create split entries for each allocation
                for (const allocation of splitAllocations) {
                  const allocCategory = allocation.category as Trade['category'] | undefined
                  await addMaterialEntry_Hybrid(project.id, {
                    date: entry.date,
                    materialName: `${entry.description} - ${allocation.category}${allocation.tradeId ? ' - ' + trades.find(t => t.id === allocation.tradeId)?.name : ''}${allocation.subItemId ? ' - ' + subItemsByTrade[allocation.tradeId || '']?.find(si => si.id === allocation.subItemId)?.name : ''}`,
                    totalCost: allocation.amount,
                    category: allocCategory,
                    tradeId: allocation.tradeId,
                    subItemId: allocation.subItemId,
                    vendor: entry.vendor,
                    invoiceNumber: entry.invoiceNumber,
                    isSplitEntry: true,
                    splitParentId: parentEntry.id,
                    splitAllocation: allocation.amount,
                  })
                }
              } else if (entry.type === 'subcontractor') {
                // Create parent entry first
                const subCategory = entry.category as Trade['category'] | undefined
                const parentEntry = await addSubcontractorEntry_Hybrid(project.id, {
                  subcontractorName: entry.subcontractorName || 'Unknown',
                  scopeOfWork: entry.description,
                  contractAmount: entry.amount,
                  totalPaid: entry.amount,
                  trade: subCategory as any,
                  tradeId: entry.tradeId,
                  subItemId: entry.subItemId,
                  invoiceNumber: entry.invoiceNumber,
                  isSplitEntry: false,
                })

                if (!parentEntry) {
                  alert('Failed to create parent invoice entry')
                  return
                }

                // Create split entries for each allocation
                for (const allocation of splitAllocations) {
                  const allocCategory = allocation.category as Trade['category'] | undefined
                  await addSubcontractorEntry_Hybrid(project.id, {
                    subcontractorName: entry.subcontractorName || 'Unknown',
                    scopeOfWork: `${entry.description} - ${allocation.category}${allocation.tradeId ? ' - ' + trades.find(t => t.id === allocation.tradeId)?.name : ''}${allocation.subItemId ? ' - ' + subItemsByTrade[allocation.tradeId || '']?.find(si => si.id === allocation.subItemId)?.name : ''}`,
                    contractAmount: allocation.amount,
                    totalPaid: allocation.amount,
                    trade: allocCategory as any,
                    tradeId: allocation.tradeId,
                    subItemId: allocation.subItemId,
                    invoiceNumber: entry.invoiceNumber,
                    isSplitEntry: true,
                    splitParentId: parentEntry.id,
                    splitAllocation: allocation.amount,
                  })
                }
              }

              // Reload actuals
              const actuals = await getProjectActuals_Hybrid(project.id)
              if (actuals) {
                const entries: ActualEntry[] = []
                
                actuals.laborEntries?.forEach((labor: LaborEntry & { grossWages?: number; burdenAmount?: number }) => {
                  entries.push({
                    id: labor.id,
                    type: 'labor',
                    date: labor.date,
                    amount: labor.totalCost,
                    description: labor.description,
                    category: labor.trade,
                    tradeId: labor.tradeId,
                    subItemId: labor.subItemId,
                    payrollPeriod: labor.date.toLocaleDateString(),
                    grossWages: labor.grossWages,
                    burdenAmount: labor.burdenAmount,
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
                    subItemId: material.subItemId,
                    vendor: material.vendor,
                    invoiceNumber: material.invoiceNumber,
                    isSplitEntry: material.isSplitEntry,
                    splitParentId: material.splitParentId,
                    splitAllocation: material.splitAllocation,
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
                    subItemId: sub.subItemId,
                    subcontractorName: sub.subcontractor.name,
                    invoiceNumber: (sub as any).invoiceNumber,
                    isSplitEntry: (sub as any).isSplitEntry,
                    splitParentId: (sub as any).splitParentId,
                    splitAllocation: (sub as any).splitAllocation,
                  })
                })
                
                entries.sort((a, b) => b.date.getTime() - a.date.getTime())
                setActualEntries(entries)
              }

              setShowEntryForm(false)
              setEditingEntry(null)
              return
            }

            // Save to storage based on entry type
            if (editingEntry) {
              // If converting to split invoice, delete original and create parent + splits
              if ((entry.type === 'material' || entry.type === 'subcontractor') && splitAllocations && splitAllocations.length > 0) {
                if (entry.type === 'material') {
                  // Delete the original entry
                  await deleteMaterialEntry_Hybrid(editingEntry.id)
                  
                  // Delete any existing split children
                  const existingSplitChildren = actualEntries.filter(
                    e => e.isSplitEntry && e.splitParentId === editingEntry.id
                  )
                  for (const child of existingSplitChildren) {
                    await deleteMaterialEntry_Hybrid(child.id)
                  }
                  
                  // Create parent entry
                  const materialCategory = entry.category as Trade['category'] | undefined
                  const parentEntry = await addMaterialEntry_Hybrid(project.id, {
                    date: entry.date,
                    materialName: entry.description,
                    totalCost: entry.amount,
                    category: materialCategory,
                    tradeId: entry.tradeId,
                    subItemId: entry.subItemId,
                    vendor: entry.vendor,
                    invoiceNumber: entry.invoiceNumber,
                    isSplitEntry: false,
                  })

                  if (!parentEntry) {
                    alert('Failed to create parent invoice entry')
                    return
                  }

                  // Create split entries for each allocation
                  for (const allocation of splitAllocations) {
                    const allocCategory = allocation.category as Trade['category'] | undefined
                    await addMaterialEntry_Hybrid(project.id, {
                      date: entry.date,
                      materialName: `${entry.description} - ${allocation.category}${allocation.tradeId ? ' - ' + trades.find(t => t.id === allocation.tradeId)?.name : ''}${allocation.subItemId ? ' - ' + subItemsByTrade[allocation.tradeId || '']?.find(si => si.id === allocation.subItemId)?.name : ''}`,
                      totalCost: allocation.amount,
                      category: allocCategory,
                      tradeId: allocation.tradeId,
                      subItemId: allocation.subItemId,
                      vendor: entry.vendor,
                      invoiceNumber: entry.invoiceNumber,
                      isSplitEntry: true,
                      splitParentId: parentEntry.id,
                      splitAllocation: allocation.amount,
                    })
                  }
                } else if (entry.type === 'subcontractor') {
                  // Delete the original entry
                  await deleteSubcontractorEntry_Hybrid(editingEntry.id)
                  
                  // Delete any existing split children
                  const existingSplitChildren = actualEntries.filter(
                    e => e.isSplitEntry && e.splitParentId === editingEntry.id
                  )
                  for (const child of existingSplitChildren) {
                    await deleteSubcontractorEntry_Hybrid(child.id)
                  }
                  
                  // Create parent entry
                  const subCategory = entry.category as Trade['category'] | undefined
                  const parentEntry = await addSubcontractorEntry_Hybrid(project.id, {
                    subcontractorName: entry.subcontractorName || 'Unknown',
                    scopeOfWork: entry.description,
                    contractAmount: entry.amount,
                    totalPaid: entry.amount,
                    trade: subCategory as any,
                    tradeId: entry.tradeId,
                    subItemId: entry.subItemId,
                    invoiceNumber: entry.invoiceNumber,
                    isSplitEntry: false,
                  })

                  if (!parentEntry) {
                    alert('Failed to create parent invoice entry')
                    return
                  }

                  // Create split entries for each allocation
                  for (const allocation of splitAllocations) {
                    const allocCategory = allocation.category as Trade['category'] | undefined
                    await addSubcontractorEntry_Hybrid(project.id, {
                      subcontractorName: entry.subcontractorName || 'Unknown',
                      scopeOfWork: `${entry.description} - ${allocation.category}${allocation.tradeId ? ' - ' + trades.find(t => t.id === allocation.tradeId)?.name : ''}${allocation.subItemId ? ' - ' + subItemsByTrade[allocation.tradeId || '']?.find(si => si.id === allocation.subItemId)?.name : ''}`,
                      contractAmount: allocation.amount,
                      totalPaid: allocation.amount,
                      trade: allocCategory as any,
                      tradeId: allocation.tradeId,
                      subItemId: allocation.subItemId,
                      invoiceNumber: entry.invoiceNumber,
                      isSplitEntry: true,
                      splitParentId: parentEntry.id,
                      splitAllocation: allocation.amount,
                    })
                  }
                }

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
                      subItemId: labor.subItemId,
                      payrollPeriod: labor.date.toLocaleDateString(),
                      grossWages: labor.grossWages,
                      burdenAmount: labor.burdenAmount,
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
                      subItemId: material.subItemId,
                      vendor: material.vendor,
                      invoiceNumber: material.invoiceNumber,
                      isSplitEntry: material.isSplitEntry,
                      splitParentId: material.splitParentId,
                      splitAllocation: material.splitAllocation,
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
                      subItemId: sub.subItemId,
                      subcontractorName: sub.subcontractor.name,
                      invoiceNumber: (sub as any).invoiceNumber,
                      isSplitEntry: (sub as any).isSplitEntry,
                      splitParentId: (sub as any).splitParentId,
                      splitAllocation: (sub as any).splitAllocation,
                    })
                  })
                  
                  entries.sort((a, b) => b.date.getTime() - a.date.getTime())
                  setActualEntries(entries)
                }

                setShowEntryForm(false)
                setEditingEntry(null)
                return
              }
              
              // Check if type changed - if so, delete old and create new
              const typeChanged = editingEntry && editingEntry.type !== entry.type
              
              if (typeChanged) {
                // Delete the old entry
                if (editingEntry.type === 'labor') {
                  await deleteLaborEntry_Hybrid(editingEntry.id)
                } else if (editingEntry.type === 'material') {
                  await deleteMaterialEntry_Hybrid(editingEntry.id)
                } else if (editingEntry.type === 'subcontractor') {
                  await deleteSubcontractorEntry_Hybrid(editingEntry.id)
                }
                
                // Create new entry with new type
                if (entry.type === 'labor') {
                  await addLaborEntry_Hybrid(project.id, {
                    date: entry.date,
                    description: entry.description,
                    totalCost: entry.amount,
                    trade: entry.category as any,
                    tradeId: entry.tradeId,
                    subItemId: entry.subItemId,
                  })
                } else if (entry.type === 'material') {
                  const materialCategory = entry.category as Trade['category'] | undefined
                  await addMaterialEntry_Hybrid(project.id, {
                    date: entry.date,
                    materialName: entry.description,
                    totalCost: entry.amount,
                    category: materialCategory,
                    tradeId: entry.tradeId,
                    subItemId: entry.subItemId,
                    vendor: entry.vendor,
                    invoiceNumber: entry.invoiceNumber,
                  })
                } else if (entry.type === 'subcontractor') {
                  await addSubcontractorEntry_Hybrid(project.id, {
                    subcontractorName: entry.subcontractorName || 'Unknown',
                    scopeOfWork: entry.description,
                    contractAmount: entry.amount,
                    totalPaid: entry.amount,
                    trade: entry.category as any,
                    tradeId: entry.tradeId,
                    subItemId: entry.subItemId,
                  })
                }
              } else {
                // Regular update (not converting to split, type unchanged)
                if (entry.type === 'labor') {
                  await updateLaborEntry_Hybrid(entry.id, {
                    date: entry.date,
                    description: entry.description,
                    totalCost: entry.amount,
                    tradeId: entry.tradeId,
                    subItemId: entry.subItemId,
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
                    subItemId: entry.subItemId,
                  })
                } else if (entry.type === 'subcontractor') {
                  await updateSubcontractorEntry_Hybrid(entry.id, {
                    subcontractorName: entry.subcontractorName || 'Unknown',
                    scopeOfWork: entry.description,
                    totalPaid: entry.amount,
                    tradeId: entry.tradeId,
                    subItemId: entry.subItemId,
                  })
                }
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
                  subItemId: entry.subItemId,
                })
              } else if (entry.type === 'material') {
                const materialCategory = entry.category as Trade['category'] | undefined
                await addMaterialEntry_Hybrid(project.id, {
                  date: entry.date,
                  materialName: entry.description,
                  totalCost: entry.amount,
                  category: materialCategory,
                  tradeId: entry.tradeId,
                  subItemId: entry.subItemId,
                  vendor: entry.vendor,
                  invoiceNumber: entry.invoiceNumber,
                })
              } else if (entry.type === 'subcontractor') {
                await addSubcontractorEntry_Hybrid(project.id, {
                  subcontractorName: entry.subcontractorName || 'Unknown',
                  scopeOfWork: entry.description,
                  contractAmount: entry.amount,
                  totalPaid: entry.amount,
                  trade: entry.category as any,
                  tradeId: entry.tradeId,
                  subItemId: entry.subItemId,
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
                  subItemId: labor.subItemId,
                  payrollPeriod: labor.date.toLocaleDateString(),
                  grossWages: labor.grossWages,
                  burdenAmount: labor.burdenAmount,
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
                  subItemId: material.subItemId,
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
                  subItemId: sub.subItemId,
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
  subItemsByTrade: Record<string, SubItem[]>
  availableSuppliers: Supplier[]
  availableSubcontractors: DirectorySubcontractor[]
  editingEntry: ActualEntry | null
  actualEntries: ActualEntry[] // Pass all entries to check for split children
  onSave: (entry: ActualEntry, splitAllocations?: SplitAllocation[]) => void
  onCancel: () => void
}

function ActualEntryForm({
  type,
  project,
  trades,
  subItemsByTrade,
  availableSuppliers,
  availableSubcontractors,
  editingEntry,
  actualEntries,
  onSave,
  onCancel,
}: ActualEntryFormProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  // Allow changing type when editing
  const [currentType, setCurrentType] = useState<EntryType>(type)

  const [formData, setFormData] = useState({
    date: editingEntry?.date ? new Date(editingEntry.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    amount: editingEntry?.amount?.toString() || '',
    description: editingEntry?.description || '',
    category: editingEntry?.category || '',
    tradeId: editingEntry?.tradeId || '',
    subItemId: editingEntry?.subItemId || '',
    
    // Labor
    payrollPeriod: editingEntry?.payrollPeriod || '',
    
    // Material
    vendor: editingEntry?.vendor || '',
    
    // Subcontractor
    subcontractorName: editingEntry?.subcontractorName || '',
    
    // Shared fields
    invoiceNumber: editingEntry?.invoiceNumber || '',
    isSplitInvoice: false,
  })

  const [splitAllocations, setSplitAllocations] = useState<SplitAllocation[]>([])

  // Update currentType when editingEntry changes
  React.useEffect(() => {
    if (editingEntry) {
      setCurrentType(editingEntry.type)
    } else {
      setCurrentType(type)
    }
  }, [editingEntry, type])

  // Initialize split allocations when editing an entry that has split children
  React.useEffect(() => {
    if (editingEntry && (currentType === 'material' || currentType === 'subcontractor') && editingEntry.invoiceNumber) {
      // Check if this entry has split children
      const splitChildren = actualEntries.filter(
        e => e.isSplitEntry && e.splitParentId === editingEntry.id
      )
      
      if (splitChildren.length > 0) {
        // Load existing split allocations
        const allocations: SplitAllocation[] = splitChildren.map(child => ({
          id: child.id,
          category: child.category || '',
          tradeId: child.tradeId,
          subItemId: child.subItemId,
          amount: child.amount,
        }))
        setSplitAllocations(allocations)
        setFormData(prev => ({ ...prev, isSplitInvoice: true }))
      } else if (!editingEntry.isSplitEntry) {
        // Regular entry - allow converting to split
        setSplitAllocations([])
        setFormData(prev => ({ ...prev, isSplitInvoice: false }))
      }
    } else {
      setSplitAllocations([])
      setFormData(prev => ({ ...prev, isSplitInvoice: false }))
    }
  }, [editingEntry, currentType, actualEntries])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // For split invoices, we'll handle it in the parent component
    if ((currentType === 'material' || currentType === 'subcontractor') && formData.isSplitInvoice && splitAllocations.length > 0) {
      // Validate allocations sum to total
      const totalAllocated = splitAllocations.reduce((sum, alloc) => sum + alloc.amount, 0)
      const totalAmount = parseFloat(formData.amount)
      
      if (Math.abs(totalAllocated - totalAmount) > 0.01) {
        alert(`Split allocations must sum to the total amount (${formatCurrency(totalAmount)}). Current total: ${formatCurrency(totalAllocated)}`)
        return
      }
      
      // Create a special entry that indicates this is a split invoice
      const entry: ActualEntry = {
        id: editingEntry?.id || uuidv4(),
        type: currentType,
        date: new Date(formData.date),
        amount: totalAmount,
        description: formData.description,
        category: formData.category,
        tradeId: formData.tradeId || undefined,
        subItemId: formData.subItemId || undefined,
        vendor: formData.vendor,
        invoiceNumber: formData.invoiceNumber,
        isSplitEntry: false, // This is the parent
      }
      
      // Pass split allocations to parent handler
      onSave(entry, splitAllocations)
      return
    }
    
    const entry: ActualEntry = {
      id: editingEntry?.id || uuidv4(),
      type: currentType,
      date: new Date(formData.date),
      amount: parseFloat(formData.amount),
      description: formData.description,
      category: formData.category,
      tradeId: formData.tradeId || undefined,
      subItemId: formData.subItemId || undefined,
      
      ...(currentType === 'labor' && { payrollPeriod: formData.payrollPeriod }),
      ...(currentType === 'material' && { 
        vendor: formData.vendor,
        invoiceNumber: formData.invoiceNumber 
      }),
      ...(currentType === 'subcontractor' && { 
        subcontractorName: formData.subcontractorName,
        invoiceNumber: formData.invoiceNumber
      }),
    }
    
    onSave(entry)
  }

  const addSplitAllocation = () => {
    setSplitAllocations(prev => [...prev, {
      id: uuidv4(),
      category: '',
      tradeId: undefined,
      subItemId: undefined,
      amount: 0,
    }])
  }

  const removeSplitAllocation = (id: string) => {
    setSplitAllocations(prev => prev.filter(a => a.id !== id))
  }

  const updateSplitAllocation = (id: string, updates: Partial<SplitAllocation>) => {
    setSplitAllocations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }

  const getTitle = () => {
    const action = editingEntry ? 'Edit' : 'Add'
    switch (currentType) {
      case 'labor': return `${action} Labor Entry`
      case 'material': return `${action} Material Entry`
      case 'subcontractor': return `${action} Subcontractor Entry`
    }
  }

  const getIcon = () => {
    switch (currentType) {
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

  // Get sub-items for selected trade
  const selectedTradeSubItems = formData.tradeId ? (subItemsByTrade[formData.tradeId] || []) : []

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
            {/* Entry Type Selector - only show when editing */}
            {editingEntry && (
              <div>
                <Label htmlFor="entryType">Entry Type *</Label>
                <Select
                  value={currentType}
                  onValueChange={(value: EntryType) => {
                    setCurrentType(value)
                    // Clear type-specific fields when changing type
                    if (value !== 'material') {
                      setFormData(prev => ({ ...prev, vendor: '', invoiceNumber: '', isSplitInvoice: false }))
                      setSplitAllocations([])
                    }
                    if (value !== 'subcontractor') {
                      setFormData(prev => ({ ...prev, subcontractorName: '' }))
                    }
                    if (value !== 'labor') {
                      setFormData(prev => ({ ...prev, payrollPeriod: '' }))
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="labor">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Labor
                      </div>
                    </SelectItem>
                    <SelectItem value="material">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Material
                      </div>
                    </SelectItem>
                    <SelectItem value="subcontractor">
                      <div className="flex items-center gap-2">
                        <HardHat className="w-4 h-4" />
                        Subcontractor
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  Changing the type will convert this entry. The original entry will be deleted and a new one created.
                </p>
              </div>
            )}

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
                  currentType === 'labor' ? 'e.g., Payroll Week 11' :
                  currentType === 'material' ? 'e.g., Lumber delivery' :
                  'e.g., Framing scope'
                }
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                required
              />
            </div>

            {currentType === 'material' && (
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

            {currentType === 'material' && !editingEntry?.isSplitEntry && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isSplitInvoice"
                    checked={formData.isSplitInvoice}
                    onChange={(e) => {
                      setFormData((prev: typeof formData) => ({ ...prev, isSplitInvoice: e.target.checked }))
                      if (!e.target.checked) {
                        setSplitAllocations([])
                      } else if (splitAllocations.length === 0) {
                        // If editing and converting to split, initialize with current entry as one allocation
                        if (editingEntry) {
                          setSplitAllocations([{
                            id: uuidv4(),
                            category: editingEntry.category || '',
                            tradeId: editingEntry.tradeId,
                            subItemId: editingEntry.subItemId,
                            amount: editingEntry.amount,
                          }])
                        } else {
                          // Add one allocation by default for new entries
                          addSplitAllocation()
                        }
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="isSplitInvoice" className="cursor-pointer">
                    Split invoice across multiple items/categories
                  </Label>
                </div>
                <p className="text-xs text-gray-500">
                  {editingEntry 
                    ? 'Convert this invoice to a split invoice. The current entry will be replaced with a parent entry and split allocations.'
                    : 'Use this when a single invoice contains materials for multiple trades or categories'}
                </p>
              </div>
            )}

            {currentType === 'material' && editingEntry?.isSplitEntry && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ This is a split allocation entry. To edit the split invoice, edit the parent entry instead.
                </p>
              </div>
            )}

              {currentType === 'material' && formData.isSplitInvoice && (
                <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Split Allocations</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addSplitAllocation}
                      className="text-xs"
                    >
                      <PlusCircle className="w-3 h-3 mr-1" />
                      Add Allocation
                    </Button>
                  </div>
                <div className="space-y-2">
                  {splitAllocations.map((allocation: SplitAllocation, index: number) => {
                    const allocationTrades = allocation.category 
                      ? trades.filter(t => t.category === allocation.category)
                      : []
                    const allocationSubItems = allocation.tradeId 
                      ? (subItemsByTrade[allocation.tradeId] || [])
                      : []
                    
                    return (
                      <div key={allocation.id} className="p-3 bg-white border border-gray-300 rounded space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Allocation {index + 1}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => removeSplitAllocation(allocation.id)}
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Category *</Label>
                            <Select
                              value={allocation.category}
                              onValueChange={(value) => updateSplitAllocation(allocation.id, { 
                                category: value, 
                                tradeId: undefined,
                                subItemId: undefined 
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs">
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
                          <div>
                            <Label className="text-xs">Amount *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={allocation.amount || ''}
                              onChange={(e) => updateSplitAllocation(allocation.id, { 
                                amount: parseFloat(e.target.value) || 0 
                              })}
                              className="h-8 text-xs"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        {allocation.category && allocationTrades.length > 0 && (
                          <div>
                            <Label className="text-xs">Item (Optional)</Label>
                            <Select
                              value={allocation.tradeId || 'none'}
                              onValueChange={(value) => updateSplitAllocation(allocation.id, { 
                                tradeId: value === 'none' ? undefined : value,
                                subItemId: undefined
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select item..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Apply to entire category</SelectItem>
                                {allocationTrades.map((trade) => (
                                  <SelectItem key={trade.id} value={trade.id}>
                                    {trade.name} ({trade.quantity} {trade.unit})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {allocation.tradeId && allocationSubItems.length > 0 && (
                          <div>
                            <Label className="text-xs">Sub-Item (Optional)</Label>
                            <Select
                              value={allocation.subItemId || 'none'}
                              onValueChange={(value) => updateSplitAllocation(allocation.id, { 
                                subItemId: value === 'none' ? undefined : value
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select sub-item..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Apply to entire item</SelectItem>
                                {allocationSubItems.map((subItem) => (
                                  <SelectItem key={subItem.id} value={subItem.id}>
                                    {subItem.name} ({subItem.quantity} {subItem.unit})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {(() => {
                  const allocatedTotal = splitAllocations.reduce((sum: number, a: SplitAllocation) => sum + a.amount, 0)
                  const remaining = parseFloat(formData.amount) - allocatedTotal
                  return (
                    <div className="pt-2 border-t border-blue-300">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">Total Allocated:</span>
                        <span className={Math.abs(remaining) < 0.01 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                          {formatCurrency(allocatedTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span>Remaining:</span>
                        <span className={Math.abs(remaining) < 0.01 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(remaining)}
                        </span>
                      </div>
                      {Math.abs(remaining) > 0.01 && (
                        <p className="text-xs text-red-600 mt-1">
                          ⚠️ Allocations must sum to the total invoice amount
                        </p>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {currentType === 'subcontractor' && (
              <div className="space-y-4">
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
                <div>
                  <Label htmlFor="invoiceNumber">Invoice Number</Label>
                  <Input
                    id="invoiceNumber"
                    placeholder="e.g., INV-12345"
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                  />
                </div>
                
                {!editingEntry?.isSplitEntry && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isSplitInvoiceSub"
                        checked={formData.isSplitInvoice}
                        onChange={(e) => {
                          setFormData((prev: typeof formData) => ({ ...prev, isSplitInvoice: e.target.checked }))
                          if (!e.target.checked) {
                            setSplitAllocations([])
                          } else if (splitAllocations.length === 0) {
                            // If editing and converting to split, initialize with current entry as one allocation
                            if (editingEntry) {
                              setSplitAllocations([{
                                id: uuidv4(),
                                category: editingEntry.category || '',
                                tradeId: editingEntry.tradeId,
                                subItemId: editingEntry.subItemId,
                                amount: editingEntry.amount,
                              }])
                            } else {
                              // Add one allocation by default for new entries
                              addSplitAllocation()
                            }
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="isSplitInvoiceSub" className="cursor-pointer">
                        Split invoice across multiple items/categories
                      </Label>
                    </div>
                    <p className="text-xs text-gray-500">
                      {editingEntry 
                        ? 'Convert this invoice to a split invoice. The current entry will be replaced with a parent entry and split allocations.'
                        : 'Use this when a single invoice contains work for multiple trades or categories'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {currentType === 'subcontractor' && editingEntry?.isSplitEntry && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ This is a split allocation entry. To edit the split invoice, edit the parent entry instead.
                </p>
              </div>
            )}

            {currentType === 'subcontractor' && editingEntry?.isSplitEntry && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ This is a split allocation entry. To edit the split invoice, edit the parent entry instead.
                </p>
              </div>
            )}

            {currentType === 'subcontractor' && formData.isSplitInvoice && (
              <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Split Allocations</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addSplitAllocation}
                    className="text-xs"
                  >
                    <PlusCircle className="w-3 h-3 mr-1" />
                    Add Allocation
                  </Button>
                </div>
                <div className="space-y-2">
                  {splitAllocations.map((allocation: SplitAllocation, index: number) => {
                    const allocationTrades = allocation.category 
                      ? trades.filter(t => t.category === allocation.category)
                      : []
                    const allocationSubItems = allocation.tradeId 
                      ? (subItemsByTrade[allocation.tradeId] || [])
                      : []
                    
                    return (
                      <div key={allocation.id} className="p-3 bg-white border border-gray-300 rounded space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Allocation {index + 1}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => removeSplitAllocation(allocation.id)}
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Category *</Label>
                            <Select
                              value={allocation.category}
                              onValueChange={(value) => updateSplitAllocation(allocation.id, { 
                                category: value, 
                                tradeId: undefined,
                                subItemId: undefined 
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs">
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
                          <div>
                            <Label className="text-xs">Amount *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={allocation.amount || ''}
                              onChange={(e) => updateSplitAllocation(allocation.id, { 
                                amount: parseFloat(e.target.value) || 0 
                              })}
                              className="h-8 text-xs"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        {allocation.category && allocationTrades.length > 0 && (
                          <div>
                            <Label className="text-xs">Item (Optional)</Label>
                            <Select
                              value={allocation.tradeId || 'none'}
                              onValueChange={(value) => updateSplitAllocation(allocation.id, { 
                                tradeId: value === 'none' ? undefined : value,
                                subItemId: undefined
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select item..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Apply to entire category</SelectItem>
                                {allocationTrades.map((trade) => (
                                  <SelectItem key={trade.id} value={trade.id}>
                                    {trade.name} ({trade.quantity} {trade.unit})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {allocation.tradeId && allocationSubItems.length > 0 && (
                          <div>
                            <Label className="text-xs">Sub-Item (Optional)</Label>
                            <Select
                              value={allocation.subItemId || 'none'}
                              onValueChange={(value) => updateSplitAllocation(allocation.id, { 
                                subItemId: value === 'none' ? undefined : value
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select sub-item..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Apply to entire item</SelectItem>
                                {allocationSubItems.map((subItem) => (
                                  <SelectItem key={subItem.id} value={subItem.id}>
                                    {subItem.name} ({subItem.quantity} {subItem.unit})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {(() => {
                  const allocatedTotal = splitAllocations.reduce((sum: number, a: SplitAllocation) => sum + a.amount, 0)
                  const remaining = parseFloat(formData.amount) - allocatedTotal
                  return (
                    <div className="pt-2 border-t border-blue-300">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">Total Allocated:</span>
                        <span className={Math.abs(remaining) < 0.01 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                          {formatCurrency(allocatedTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span>Remaining:</span>
                        <span className={Math.abs(remaining) < 0.01 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(remaining)}
                        </span>
                      </div>
                      {Math.abs(remaining) > 0.01 && (
                        <p className="text-xs text-red-600 mt-1">
                          ⚠️ Allocations must sum to the total invoice amount
                        </p>
                      )}
                    </div>
                  )
                })()}
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
                  onValueChange={(value) => setFormData(prev => ({ ...prev, tradeId: value === 'none' ? '' : value, subItemId: '' }))}
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

            {formData.tradeId && selectedTradeSubItems.length > 0 && (
              <div>
                <Label htmlFor="subItemId">Link to Sub-Item (Optional)</Label>
                <Select 
                  value={formData.subItemId || 'none'} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, subItemId: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sub-item or leave blank..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Apply to entire item</SelectItem>
                    {selectedTradeSubItems.map((subItem) => (
                      <SelectItem key={subItem.id} value={subItem.id}>
                        {subItem.name} ({subItem.quantity} {subItem.unit}) - {formatCurrency(subItem.totalCost)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  💡 <strong>Tip:</strong> Link to a specific sub-item for even more granular tracking (e.g., "Towel bars" within "Bath Hardware").
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

