// ============================================================================
// Estimate Builder Component
// ============================================================================
//
// Main component for building estimates, matching the Excel "Estimate Book" structure
//

import React, { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { PrintableReport, ReportDepth } from './PrintableReport'
import { usePageTitle } from '@/contexts/PageTitleContext'
import {
  Project,
  Estimate,
  Trade,
  SubItem,
  TradeInput,
  UnitType,
  Subcontractor as DirectorySubcontractor,
  UNIT_TYPES,
  DEFAULT_VALUES,
  PROJECT_TYPES,
  ESTIMATE_STATUS,
  getEstimateStatusLabel,
  getEstimateStatusBadgeClass,
} from '@/types'
import { useTradeCategories } from '@/contexts/TradeCategoriesContext'
import {
  addTrade,
  updateTrade,
  deleteTrade,
  recalculateEstimate,
  getTradesForEstimate,
  getItemTemplatesByCategory,
  createEstimateTemplate,
} from '@/services'
import {
  getAllEstimateTemplates,
  applyTemplateToEstimate,
} from '@/services/estimateTemplateService'
import {
  createProject_Hybrid,
  getProject_Hybrid,
  updateProject_Hybrid,
  addTrade_Hybrid,
  updateTrade_Hybrid,
  deleteTrade_Hybrid,
  deleteAllTrades_Hybrid,
  getTradesForEstimate_Hybrid,
} from '@/services/hybridService'
import {
  fetchSubItemsForTrade,
  createSubItemInDB,
  updateSubItemInDB,
  deleteSubItemFromDB,
  updateEstimateTotalsInDB,
} from '@/services/supabaseService'
import { isOnlineMode } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProjectInfoCard } from '@/components/project/ProjectInfoCard'
import { fetchSubcontractors } from '@/services/partnerDirectoryService'
import { CreatePOModal } from './CreatePOModal'
import { getCategoryAccentColor } from '@/lib/categoryAccent'
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
  ChevronRight,
  ArrowLeft,
  Printer,
  Save,
  Mail
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
  estimateStatus?: 'budget' | 'quoted' | 'approved'
  quoteVendor?: string
  quoteDate?: Date
  quoteReference?: string
  quoteFileUrl?: string
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function EstimateBuilder({ project, onSave, onBack }: EstimateBuilderProps) {
  const { categories, byKey } = useTradeCategories()
  // State
  const [projectData, setProjectData] = useState<Project | null>(project || null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [editingTrade, setEditingTrade] = useState<TradeFormData | null>(null)
  const [isAddingTrade, setIsAddingTrade] = useState(false)
  const [markupPercent, setMarkupPercent] = useState(20)
  const [contingencyPercent, setContingencyPercent] = useState(10)
  const [showPrintReport, setShowPrintReport] = useState(false)
  const [reportDepth, setReportDepth] = useState<ReportDepth>('full')
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [showApplyTemplateDialog, setShowApplyTemplateDialog] = useState(false)
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([])
  const [selectedTemplateToApply, setSelectedTemplateToApply] = useState<string>('')
  const [availableSubcontractors, setAvailableSubcontractors] = useState<DirectorySubcontractor[]>([])
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set())
  const [editingSubItem, setEditingSubItem] = useState<{ tradeId: string; subItem?: SubItem } | null>(null)
  const [subItemsByTrade, setSubItemsByTrade] = useState<Record<string, SubItem[]>>({})
  const [showBulkMarkupDialog, setShowBulkMarkupDialog] = useState(false)
  const [bulkMarkupPercent, setBulkMarkupPercent] = useState(markupPercent.toString())
  const [showCreatePO, setShowCreatePO] = useState(false)

  // Centered title in the AppHeader
  usePageTitle('Estimate Book')

  // Initialize project if none provided
  useEffect(() => {
    if (!projectData) {
      const initializeProject = async () => {
        const newProject = await createProject_Hybrid({
          name: 'New Project',
          client: { name: 'New Client' },
          type: 'residential-new-build',
        })
        setProjectData(newProject)
      }
      initializeProject()
    }
  }, [projectData])

  // Load sub-items when trades change (if not already included)
  useEffect(() => {
    if (trades.length > 0) {
      const subItemsMap: Record<string, SubItem[]> = {}
      for (const trade of trades) {
        // Use subItems from trade if available, otherwise fetch them
        if (trade.subItems && trade.subItems.length > 0) {
          subItemsMap[trade.id] = trade.subItems
        } else if (isOnlineMode()) {
          // Fetch sub-items if not already included
          fetchSubItemsForTrade(trade.id).then(subItems => {
            subItemsMap[trade.id] = subItems
            setSubItemsByTrade(prev => ({ ...prev, ...subItemsMap }))
          })
        }
      }
      // Update state with sub-items from trades
      if (Object.keys(subItemsMap).length > 0) {
        setSubItemsByTrade(prev => ({ ...prev, ...subItemsMap }))
      }
    }
  }, [trades])

  // Load trades when project changes
  useEffect(() => {
    if (projectData) {
      getTradesForEstimate_Hybrid(projectData.estimate.id).then(loadedTrades => {
        setTrades(loadedTrades)
      })
    }
  }, [projectData])

  useEffect(() => {
    const loadSubcontractors = async () => {
      try {
        const subs = await fetchSubcontractors({ includeInactive: false })
        setAvailableSubcontractors(subs)
      } catch (error) {
        console.warn('Unable to load subcontractor directory for estimate builder:', error)
      }
    }

    loadSubcontractors()
  }, [])

  // Update estimate totals whenever trades, markup, or contingency change
  useEffect(() => {
    if (!projectData) return
    
    const totals = calculateTotals()
    
    // Check if totals have actually changed
    const currentTotals = projectData.estimate.totals
    const hasChanged = !currentTotals ||
      currentTotals.basePriceTotal !== totals.basePriceTotal ||
      currentTotals.contingency !== totals.contingency ||
      currentTotals.grossProfitTotal !== totals.grossProfitTotal ||
      currentTotals.totalEstimated !== totals.totalEstimated ||
      currentTotals.marginOfProfit !== totals.marginOfProfit
    
    if (hasChanged) {
      // Update the estimate in storage with the new totals
      const updatedEstimate = {
        ...projectData.estimate,
        totals: {
          basePriceTotal: totals.basePriceTotal,
          contingency: totals.contingency,
          grossProfitTotal: totals.grossProfitTotal,
          totalEstimated: totals.totalEstimated,
          marginOfProfit: totals.marginOfProfit,
        },
        subtotal: totals.basePriceTotal,
        overhead: 0,
        profit: totals.grossProfitTotal,
        contingency: totals.contingency,
        totalEstimate: totals.totalEstimated,
        updatedAt: new Date(),
      }
      
      // Update project with new estimate
      updateProject_Hybrid(projectData.id, {
        id: projectData.id,
        estimate: updatedEstimate,
      }).then(updated => {
        if (updated) {
          setProjectData(updated)
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, markupPercent, contingencyPercent])

  // ----------------------------------------------------------------------------
  // Event Handlers
  // ----------------------------------------------------------------------------

  const handleProjectUpdate = async (updates: Partial<Project>) => {
    if (!projectData) return

    const updated = await updateProject_Hybrid(projectData.id, {
      id: projectData.id,
      ...updates,
    } as any)
    if (updated) {
      setProjectData(updated)
      onSave?.(updated)
    }
  }

  const handleAddTrade = () => {
    setEditingTrade({
      category: 'planning' as any,
      name: '',
      quantity: 1,
      unit: 'each',
      laborCost: 0,
      materialCost: 0,
      subcontractorCost: 0,
      isSubcontracted: false,
      wasteFactor: DEFAULT_VALUES.WASTE_FACTOR,
      markupPercent: markupPercent,
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
      subcontractorRate: trade.subcontractorRate,
      isSubcontracted: trade.isSubcontracted,
      wasteFactor: trade.wasteFactor,
      markupPercent: trade.markupPercent || markupPercent,
      notes: trade.notes,
      isEditing: true,
    })
    setIsAddingTrade(false)
  }

  const handleSaveTrade = async (tradeData: TradeFormData) => {
    if (!projectData) {
      console.error('No project data available')
      return
    }

    console.log('Saving trade:', tradeData)

    try {
      let updatedTrade: Trade

      if (isAddingTrade) {
        // Add new trade
        console.log('Adding new trade to estimate:', projectData.estimate.id)
        updatedTrade = await addTrade_Hybrid(projectData.estimate.id, tradeData)
        console.log('Trade added successfully:', updatedTrade)
        setTrades(prev => [...prev, updatedTrade])
      } else {
        // Update existing trade
        if (!tradeData.id) {
          console.error('No trade ID for update')
          return
        }
        
        console.log('Updating trade:', tradeData.id)
        const result = await updateTrade_Hybrid(tradeData.id, tradeData)
        if (!result) {
          console.error('Failed to update trade')
          return
        }
        updatedTrade = result
        console.log('Trade updated successfully:', updatedTrade)
        setTrades(prev => prev.map(t => t.id === tradeData.id ? updatedTrade! : t))
      }

      // Reload trades from storage to ensure we have the latest
      const reloadedTrades = await getTradesForEstimate_Hybrid(projectData.estimate.id)
      console.log('Reloaded trades from storage:', reloadedTrades)
      setTrades(reloadedTrades)

      // Project data will be updated through trade storage
      // Just refresh the local state
      setProjectData({ ...projectData, updatedAt: new Date() })

      setEditingTrade(null)
      setIsAddingTrade(false)
    } catch (error) {
      console.error('Error saving trade:', error)
    }
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

  const handleAddSubItem = (tradeId: string) => {
    setEditingSubItem({ tradeId })
  }

  const handleEditSubItem = (tradeId: string, subItem: SubItem) => {
    setEditingSubItem({ tradeId, subItem })
  }

  const handleSaveSubItem = async (tradeId: string, subItemData: Partial<SubItem>) => {
    if (!projectData) return

    try {
      let updatedSubItem: SubItem | null
      
      if (editingSubItem?.subItem) {
        // Update existing sub-item
        updatedSubItem = await updateSubItemInDB(editingSubItem.subItem.id, {
          name: subItemData.name!,
          description: subItemData.description,
          quantity: subItemData.quantity!,
          unit: subItemData.unit!,
          laborCost: subItemData.laborCost ?? 0,
          laborRate: subItemData.laborRate,
          laborHours: subItemData.laborHours,
          materialCost: subItemData.materialCost ?? 0,
          materialRate: subItemData.materialRate,
          subcontractorCost: subItemData.subcontractorCost ?? 0,
          isSubcontracted: subItemData.isSubcontracted || false,
          wasteFactor: subItemData.wasteFactor || 10,
          markupPercent: subItemData.markupPercent,
          selectionOnly: subItemData.selectionOnly,
          selection: subItemData.selection,
        })
      } else {
        // Create new sub-item
        updatedSubItem = await createSubItemInDB(
          tradeId,
          projectData.estimate.id,
          {
            name: subItemData.name!,
            description: subItemData.description,
            quantity: subItemData.quantity ?? 0,
            unit: subItemData.unit || 'each',
            laborCost: subItemData.laborCost ?? 0,
            laborRate: subItemData.laborRate,
            laborHours: subItemData.laborHours,
            materialCost: subItemData.materialCost ?? 0,
            materialRate: subItemData.materialRate,
            subcontractorCost: subItemData.subcontractorCost ?? 0,
            isSubcontracted: subItemData.isSubcontracted || false,
            wasteFactor: subItemData.wasteFactor || 10,
            markupPercent: subItemData.markupPercent,
            selectionOnly: subItemData.selectionOnly,
            selection: subItemData.selection,
          }
        )
      }

      if (updatedSubItem) {
        // Reload sub-items for this trade
        const subItems = await fetchSubItemsForTrade(tradeId)
        setSubItemsByTrade(prev => ({ ...prev, [tradeId]: subItems }))
        
        // Reload trades to get updated totals
        const refreshedTrades = await getTradesForEstimate_Hybrid(projectData.estimate.id)
        setTrades(refreshedTrades)
        
        setEditingSubItem(null)
      }
    } catch (error) {
      console.error('Error saving sub-item:', error)
      alert('Failed to save sub-item. Please try again.')
    }
  }

  const handleDeleteSubItem = async (subItemId: string, tradeId: string) => {
    if (!confirm('Are you sure you want to delete this sub-item?')) return

    try {
      const success = await deleteSubItemFromDB(subItemId)
      if (success) {
        // Reload sub-items for this trade
        const subItems = await fetchSubItemsForTrade(tradeId)
        setSubItemsByTrade(prev => ({ ...prev, [tradeId]: subItems }))
        
        // Reload trades to get updated totals
        if (projectData) {
          const refreshedTrades = await getTradesForEstimate_Hybrid(projectData.estimate.id)
          setTrades(refreshedTrades)
        }
      }
    } catch (error) {
      console.error('Error deleting sub-item:', error)
      alert('Failed to delete sub-item. Please try again.')
    }
  }

  const handleDeleteTrade = async (tradeId: string) => {
    if (!projectData) return

    const deleted = await deleteTrade_Hybrid(tradeId)
    if (deleted) {
      setTrades(prev => prev.filter(t => t.id !== tradeId))
      
      // Update project data
      // Update local state
      setProjectData({ ...projectData, updatedAt: new Date() })
    }
  }

  const handleBulkUpdateMarkup = async () => {
    if (!projectData) return

    const newMarkup = parseFloat(bulkMarkupPercent)
    if (isNaN(newMarkup) || newMarkup < 0) {
      alert('Please enter a valid markup percentage')
      return
    }

    try {
      // Update all trades
      const updatePromises = trades.map(trade => 
        updateTrade_Hybrid(trade.id, { markupPercent: newMarkup })
      )

      await Promise.all(updatePromises)

      // Reload trades
      let refreshedTrades = await getTradesForEstimate_Hybrid(projectData.estimate.id)
      
      // Fix any trades that have incorrect totalCost (0 or wrong value)
      // This fixes trades that were affected by the previous bug
      const fixPromises = refreshedTrades.map(async (trade) => {
        const calculatedTotalCost = trade.laborCost + trade.materialCost + trade.subcontractorCost
        // If totalCost is 0 or significantly different, fix it in the database
        if (trade.totalCost === 0 || Math.abs(trade.totalCost - calculatedTotalCost) > 0.01) {
          // Update in database to fix it permanently
          await updateTrade_Hybrid(trade.id, {
            laborCost: trade.laborCost,
            materialCost: trade.materialCost,
            subcontractorCost: trade.subcontractorCost,
          })
          // Return trade with corrected totalCost
          return { ...trade, totalCost: calculatedTotalCost }
        }
        return trade
      })
      
      // Wait for all fixes to complete
      const tradesWithCorrectTotals = await Promise.all(fixPromises)
      
      // Use corrected trades for calculations and state
      setTrades(tradesWithCorrectTotals)
      setMarkupPercent(newMarkup)
      
      // Manually calculate and update totals immediately using corrected trades
      const basePriceTotal = tradesWithCorrectTotals.reduce((sum, trade) => sum + trade.totalCost, 0)
      const contingency = basePriceTotal * (contingencyPercent / 100)
      const grossProfitTotal = tradesWithCorrectTotals.reduce((sum, trade) => {
        const itemMarkup = trade.markupPercent || newMarkup
        const markup = trade.totalCost * (itemMarkup / 100)
        return sum + markup
      }, 0)
      const totalEstimated = basePriceTotal + contingency + grossProfitTotal
      const marginOfProfit = totalEstimated > 0 ? (grossProfitTotal / totalEstimated) * 100 : 0
      
      const updatedEstimate = {
        ...projectData.estimate,
        totals: {
          basePriceTotal,
          contingency,
          grossProfitTotal,
          totalEstimated,
          marginOfProfit,
        },
        subtotal: basePriceTotal,
        overhead: 0,
        profit: grossProfitTotal,
        contingency: contingency,
        totalEstimate: totalEstimated,
        updatedAt: new Date(),
      }
      
      // Update project with new estimate totals
      const updated = await updateProject_Hybrid(projectData.id, {
        id: projectData.id,
        estimate: updatedEstimate,
      })
      
      if (updated) {
        setProjectData(updated)
      }
      
      setShowBulkMarkupDialog(false)
      alert(`Successfully updated markup to ${newMarkup.toFixed(1)}% for all ${trades.length} item(s).`)
    } catch (error) {
      console.error('Error updating bulk markup:', error)
      alert('Failed to update markup. Please try again.')
    }
  }

  const handleClearAll = async () => {
    if (!projectData) return

    const tradeCount = trades.length
    if (tradeCount === 0) {
      alert('There are no cost items to clear.')
      return
    }

    const confirmed = confirm(
      `Are you sure you want to delete all ${tradeCount} cost item(s) from this estimate?\n\nThis action cannot be undone.`
    )

    if (!confirmed) return

    try {
      const success = await deleteAllTrades_Hybrid(projectData.estimate.id)
      if (success) {
        setTrades([])
        setSubItemsByTrade({})
        setProjectData({ ...projectData, updatedAt: new Date() })
        alert(`Successfully cleared all ${tradeCount} cost item(s) from the estimate.`)
      } else {
        alert('Failed to clear all cost items. Please try again.')
      }
    } catch (error) {
      console.error('Error clearing all trades:', error)
      alert('Failed to clear all cost items. Please try again.')
    }
  }

  const handleCancelEdit = () => {
    setEditingTrade(null)
    setIsAddingTrade(false)
  }

  const handleAddDefaultCategories = async () => {
    if (!projectData) return

    const defaultCategories = [
      'planning', 'site-prep', 'excavation-foundation', 'utilities', 'water-sewer',
      'rough-framing', 'windows-doors', 'exterior-finishes', 'roofing', 'masonry-paving',
      'porches-decks', 'insulation', 'plumbing', 'electrical', 'hvac', 'drywall',
      'interior-finishes', 'kitchen', 'bath', 'appliances'
    ]

    try {
      // Create and save each trade to the database
      const newTrades: Trade[] = []
      for (let i = 0; i < defaultCategories.length; i++) {
        const category = defaultCategories[i]
        const tradeInput: TradeInput = {
          category: category as any,
          name: `${byKey[category]?.label || category} - To Be Determined`,
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
          markupPercent: markupPercent,
          notes: '',
        }
        
        const savedTrade = await addTrade_Hybrid(projectData.estimate.id, tradeInput)
        newTrades.push(savedTrade)
      }

      // Reload trades from database to get all trades
      const refreshedTrades = await getTradesForEstimate_Hybrid(projectData.estimate.id)
      setTrades(refreshedTrades)

      // Update local state
      setProjectData({ ...projectData, updatedAt: new Date() })
      
      alert(`Successfully added ${newTrades.length} default category items.`)
    } catch (error) {
      console.error('Error adding default categories:', error)
      alert('Failed to add default categories. Please try again.')
    }
  }

  // ----------------------------------------------------------------------------
  // Calculations
  // ----------------------------------------------------------------------------

  const calculateTotals = () => {
    const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
    const contingency = basePriceTotal * (contingencyPercent / 100)
    const grossProfitTotal = trades.reduce((sum, trade) => {
      // Calculate gross profit for each trade using per-item markup
      const itemMarkup = trade.markupPercent || markupPercent
      const markup = trade.totalCost * (itemMarkup / 100)
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
      markupPercent,
      contingencyPercent,
    }
  }

  const totals = calculateTotals()

  // Persist estimate totals to Supabase when they change (online mode only)
  const lastSyncedTotalsRef = useRef<string | null>(null)
  useEffect(() => {
    if (!projectData) return
    if (!isOnlineMode()) return

    const estimateId = projectData.estimate.id
    const syncTotals = {
      basePriceTotal: totals.basePriceTotal,
      contingency: totals.contingency,
      grossProfitTotal: totals.grossProfitTotal,
      totalEstimated: totals.totalEstimated,
      marginOfProfit: totals.marginOfProfit,
    }
    const serialized = JSON.stringify({ estimateId, ...syncTotals })
    if (serialized === lastSyncedTotalsRef.current) return
    lastSyncedTotalsRef.current = serialized

    updateEstimateTotalsInDB(estimateId, syncTotals).catch((err) => {
      console.error('Error syncing estimate totals to Supabase:', err)
    })
  }, [
    projectData,
    totals.basePriceTotal,
    totals.contingency,
    totals.grossProfitTotal,
    totals.totalEstimated,
    totals.marginOfProfit,
  ])

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  if (!projectData) {
    return <div>Loading...</div>
  }

  const handlePrintReport = (selectedDepth: ReportDepth) => {
    setReportDepth(selectedDepth)
    setShowPrintReport(true)
  }

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name')
      return
    }

    if (trades.length === 0) {
      alert('Cannot save an empty estimate as a template')
      return
    }

    try {
      const template = await createEstimateTemplate({
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        trades,
        defaultMarkupPercent: markupPercent,
        defaultContingencyPercent: contingencyPercent,
      })

      alert(`Template "${template.name}" saved successfully!`)
      setShowSaveTemplateDialog(false)
      setTemplateName('')
      setTemplateDescription('')
    } catch (error) {
      console.error('Error saving template:', error)
      alert('Failed to save template')
    }
  }

  const handleOpenApplyTemplate = async () => {
    const templates = await getAllEstimateTemplates()
    setAvailableTemplates(templates)
    setShowApplyTemplateDialog(true)
  }

  const handleApplyTemplate = async () => {
    console.log('🔵 Apply Template clicked', { selectedTemplateToApply, projectData: projectData?.id })
    
    if (!selectedTemplateToApply) {
      alert('Please select a template')
      return
    }

    if (!projectData) {
      console.error('❌ No project data')
      alert('Error: No project data found')
      return
    }

    // Confirm with user if there are existing trades
    if (trades.length > 0) {
      const confirmed = window.confirm(
        `This estimate currently has ${trades.length} trade(s). Applying a template will ADD the template's trades to your existing trades. Continue?`
      )
      if (!confirmed) {
        console.log('⚠️ User cancelled')
        return
      }
    }

    try {
      console.log('📋 Applying template:', selectedTemplateToApply)
      
      // Apply template creates new trades from the template
      const templateTrades = await applyTemplateToEstimate(selectedTemplateToApply, projectData.estimate.id)
      console.log('✅ Template trades created:', templateTrades.length)
      
      if (templateTrades.length === 0) {
        alert('Template has no trades to apply')
        return
      }

      // Add each trade to the database using hybrid service; then create sub-items from template when online
      console.log('💾 Adding trades to database...')
      for (const templateTrade of templateTrades) {
        console.log('  Adding trade:', templateTrade.name)
        const created = await addTrade_Hybrid(projectData.estimate.id, {
          category: templateTrade.category,
          name: templateTrade.name,
          description: templateTrade.description,
          quantity: templateTrade.quantity,
          unit: templateTrade.unit,
          laborCost: templateTrade.laborCost,
          laborRate: templateTrade.laborRate,
          laborHours: templateTrade.laborHours,
          materialCost: templateTrade.materialCost,
          materialRate: templateTrade.materialRate,
          subcontractorCost: templateTrade.subcontractorCost,
          isSubcontracted: templateTrade.isSubcontracted,
          wasteFactor: templateTrade.wasteFactor,
          markupPercent: templateTrade.markupPercent,
          notes: templateTrade.notes,
        })
        if (created && isOnlineMode() && templateTrade.subItems?.length) {
          for (let i = 0; i < templateTrade.subItems.length; i++) {
            const sub = templateTrade.subItems[i]
            await createSubItemInDB(created.id, projectData.estimate.id, {
              name: sub.name ?? '',
              description: sub.description,
              quantity: sub.quantity ?? 0,
              unit: sub.unit ?? 'each',
              laborCost: sub.laborCost ?? 0,
              laborRate: sub.laborRate,
              laborHours: sub.laborHours,
              materialCost: sub.materialCost ?? 0,
              materialRate: sub.materialRate,
              subcontractorCost: sub.subcontractorCost ?? 0,
              subcontractorRate: sub.subcontractorRate,
              isSubcontracted: sub.isSubcontracted ?? false,
              wasteFactor: sub.wasteFactor ?? 10,
              markupPercent: sub.markupPercent,
              sortOrder: sub.sortOrder ?? i,
              selectionOnly: sub.selectionOnly,
              selection: sub.selection,
            })
          }
        }
      }

      // Reload trades to show the new ones
      console.log('🔄 Reloading trades...')
      const updatedTrades = await getTradesForEstimate_Hybrid(projectData.estimate.id)
      setTrades(updatedTrades)
      console.log('✅ Trades reloaded:', updatedTrades.length)

      alert(`Successfully applied template! Added ${templateTrades.length} trade(s).`)
      setShowApplyTemplateDialog(false)
      setSelectedTemplateToApply('')
    } catch (error) {
      console.error('❌ Error applying template:', error)
      alert(`Failed to apply template: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Top action strip — back link only; primary actions live inside SummarySection */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Project Overview
        </button>
      </div>

      {/* Project Info card — 8-cell grid (Name / Plan / Type / Location / Start / End / Status / Created) */}
      {projectData && <ProjectInfoCard project={projectData} />}

        {/* Summary Section */}
        <SummarySection 
          totals={totals} 
          onContingencyChange={setContingencyPercent}
          onPrintReport={handlePrintReport}
          onSaveAsTemplate={() => setShowSaveTemplateDialog(true)}
          onApplyTemplate={handleOpenApplyTemplate}
          onCreatePO={() => setShowCreatePO(true)}
        />

        {/* Main Trade Table */}
        <TradeTable
          trades={trades}
          onEditTrade={handleEditTrade}
          onDeleteTrade={handleDeleteTrade}
          onAddTrade={handleAddTrade}
          onAddDefaultCategories={handleAddDefaultCategories}
          onClearAll={handleClearAll}
          onBulkUpdateMarkup={() => {
            setBulkMarkupPercent(markupPercent.toString())
            setShowBulkMarkupDialog(true)
          }}
          defaultMarkupPercent={markupPercent}
          expandedTrades={expandedTrades}
          subItemsByTrade={subItemsByTrade}
          onToggleTradeExpansion={toggleTradeExpansion}
          onAddSubItem={handleAddSubItem}
          onEditSubItem={handleEditSubItem}
          onDeleteSubItem={handleDeleteSubItem}
        />

        {/* Trade Form Modal */}
        {editingTrade && projectData && (
          <TradeForm
            trade={editingTrade}
            onSave={handleSaveTrade}
            onCancel={handleCancelEdit}
            isAdding={isAddingTrade}
            projectId={projectData.id}
            availableSubcontractors={availableSubcontractors}
          />
        )}

        {/* Create PO Modal */}
        {showCreatePO && projectData && (
          <CreatePOModal
            projectId={projectData.id}
            trades={trades}
            subItemsByTrade={subItemsByTrade}
            availableSubcontractors={availableSubcontractors}
            onClose={() => setShowCreatePO(false)}
            onSuccess={() => setShowCreatePO(false)}
          />
        )}

        {/* Sub-Item Form */}
        {editingSubItem && projectData && (
          <SubItemForm
            tradeId={editingSubItem.tradeId}
            subItem={editingSubItem.subItem}
            estimateId={projectData.estimate.id}
            onSave={handleSaveSubItem}
            onCancel={() => setEditingSubItem(null)}
            isAdding={!editingSubItem.subItem}
            defaultMarkupPercent={markupPercent}
          />
        )}

        {/* Print Report */}
        {showPrintReport && projectData && (
          <PrintableReport
            project={projectData}
            trades={trades}
            reportType="estimate"
            depth={reportDepth}
            onClose={() => setShowPrintReport(false)}
          />
        )}

        {/* Save as Template Dialog */}
        {showSaveTemplateDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Save Estimate as Template</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="template-name">Template Name *</Label>
                  <Input
                    id="template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Standard 3BR Remodel"
                  />
                </div>
                <div>
                  <Label htmlFor="template-description">Description</Label>
                  <Input
                    id="template-description"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="rounded border border-border bg-muted/40 p-3 text-sm">
                  <p className="mb-1 font-semibold">Template Info:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• {trades.length} line items will be saved</li>
                    <li>• Default markup: {markupPercent.toFixed(1)}%</li>
                    <li>• Default contingency: {contingencyPercent.toFixed(1)}%</li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveAsTemplate} className="flex-1">
                    <Save className="size-4" />
                    Save Template
                  </Button>
                  <Button
                    onClick={() => {
                      setShowSaveTemplateDialog(false)
                      setTemplateName('')
                      setTemplateDescription('')
                    }}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Bulk Markup Dialog */}
        {showBulkMarkupDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Update Markup for All Items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="bulk-markup">Markup Percentage *</Label>
                  <Input
                    id="bulk-markup"
                    type="number"
                    step="0.1"
                    value={bulkMarkupPercent}
                    onChange={(e) => setBulkMarkupPercent(e.target.value)}
                    placeholder="20"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    This will update the markup percentage for all {trades.length} cost item(s) in this estimate.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleBulkUpdateMarkup} className="flex-1">
                    <Percent className="size-4" />
                    Update All Items
                  </Button>
                  <Button
                    onClick={() => setShowBulkMarkupDialog(false)}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Apply Template Dialog */}
        {showApplyTemplateDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Apply Estimate Template</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="template-select">Select Template *</Label>
                  {availableTemplates.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No estimate templates available. Create one by clicking "Save as Template" on an existing estimate.
                    </p>
                  ) : (
                    <>
                      <Select value={selectedTemplateToApply} onValueChange={setSelectedTemplateToApply}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name} ({template.trades.length} items)
                              {template.description && ` - ${template.description}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-xs text-muted-foreground">
                        The template's trades will be added to your current estimate.
                        {trades.length > 0 && ` You currently have ${trades.length} trade(s).`}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleApplyTemplate()
                    }}
                    disabled={!selectedTemplateToApply || availableTemplates.length === 0}
                    className="flex-1"
                  >
                    <FileText className="size-4" />
                    Apply Template
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowApplyTemplateDialog(false)
                      setSelectedTemplateToApply('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
    </div>
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
    markupPercent: number
    contingencyPercent: number
  }
  onContingencyChange: (value: number) => void
  onPrintReport: (depth: ReportDepth) => void
  onSaveAsTemplate: () => void
  onApplyTemplate: () => void
  onCreatePO?: () => void
}

function SummarySection({ totals, onContingencyChange, onPrintReport, onSaveAsTemplate, onApplyTemplate, onCreatePO }: SummarySectionProps) {
  const [isEditingContingency, setIsEditingContingency] = useState(false)
  const [tempContingency, setTempContingency] = useState(totals.contingencyPercent)

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatPercent = (percent: number) => `${percent.toFixed(1)}%`

  const handleContingencySave = () => {
    onContingencyChange(tempContingency)
    setIsEditingContingency(false)
  }

  // 5-card stat row matching v0's estimate-summary.tsx
  const stats = [
    {
      label: 'Base Price Total',
      value: formatCurrency(totals.basePriceTotal),
      rail: 'bg-sky-500',
      valueClass: '',
      onClick: undefined as (() => void) | undefined,
    },
    {
      label: `Contingency (${formatPercent(totals.contingencyPercent)})`,
      value: formatCurrency(totals.contingency),
      rail: 'bg-amber-500',
      valueClass: '',
      onClick: () => {
        setTempContingency(totals.contingencyPercent)
        setIsEditingContingency(true)
      },
    },
    {
      label: 'Gross Profit Total',
      value: formatCurrency(totals.grossProfitTotal),
      rail: 'bg-emerald-500',
      valueClass: '',
      onClick: undefined,
    },
    {
      label: 'Margin of Profit',
      value: formatPercent(totals.marginOfProfit),
      rail: 'bg-violet-500',
      valueClass: '',
      onClick: undefined,
    },
    {
      label: 'Total Estimated',
      value: formatCurrency(totals.totalEstimated),
      rail: 'bg-rose-500',
      valueClass: 'text-rose-600 dark:text-rose-400',
      highlight: true,
      onClick: undefined,
    },
  ]

  return (
    <section className="space-y-4">
      {/* Section header — title + action buttons (Create PO / Apply Template / Save as Template / Export PDF) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Estimate Summary</h2>
        <div className="flex flex-wrap items-center gap-2">
          {onCreatePO && (
            <Button onClick={onCreatePO} variant="outline" size="sm">
              <ClipboardList className="size-4" />
              Create PO
            </Button>
          )}
          <Button onClick={onApplyTemplate} variant="outline" size="sm">
            <FileText className="size-4" />
            Apply Template
          </Button>
          <Button onClick={onSaveAsTemplate} variant="outline" size="sm">
            <Save className="size-4" />
            Save as Template
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Printer className="size-4" />
                Export PDF
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => onPrintReport('summary')}>
                <div className="flex flex-col">
                  <span>Summary Only</span>
                  <span className="text-xs text-muted-foreground">Category totals</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPrintReport('category')}>
                <div className="flex flex-col">
                  <span>Category Detail</span>
                  <span className="text-xs text-muted-foreground">Subtotals by category</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPrintReport('full')}>
                <div className="flex flex-col">
                  <span>Full Detail</span>
                  <span className="text-xs text-muted-foreground">Every line item</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 5-card stat grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className={cn(
              'relative overflow-hidden border-border/60',
              stat.highlight ? 'bg-card border-border' : 'bg-card/50',
              stat.onClick && 'cursor-pointer transition-colors hover:bg-card',
            )}
            onClick={stat.onClick}
          >
            <div className={cn('absolute inset-y-0 left-0 w-1', stat.rail)} aria-hidden />
            <CardContent className="p-4 pl-5">
              <p className="mb-1 text-xs text-muted-foreground">{stat.label}</p>
              <p
                className={cn(
                  'text-xl font-semibold tabular-nums',
                  stat.valueClass || 'text-foreground',
                )}
              >
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Contingency edit dialog */}
      {isEditingContingency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm border-border bg-card">
            <CardHeader>
              <CardTitle>Edit Contingency %</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="contingency-pct">Contingency Percentage</Label>
                <Input
                  id="contingency-pct"
                  type="number"
                  step="0.1"
                  value={tempContingency}
                  onChange={(e) => setTempContingency(parseFloat(e.target.value) || 0)}
                  className="text-lg"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleContingencySave} className="flex-1">
                  Save
                </Button>
                <Button
                  onClick={() => setIsEditingContingency(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
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
  onClearAll: () => void
  onBulkUpdateMarkup?: () => void
  defaultMarkupPercent: number
  expandedTrades: Set<string>
  subItemsByTrade: Record<string, SubItem[]>
  onToggleTradeExpansion: (tradeId: string) => void
  onAddSubItem: (tradeId: string) => void
  onEditSubItem: (tradeId: string, subItem: SubItem) => void
  onDeleteSubItem: (subItemId: string, tradeId: string) => void
}

function TradeTable({ 
  trades, 
  onEditTrade, 
  onDeleteTrade, 
  onAddTrade, 
  onAddDefaultCategories, 
  onClearAll,
  onBulkUpdateMarkup,
  defaultMarkupPercent,
  expandedTrades,
  subItemsByTrade,
  onToggleTradeExpansion,
  onAddSubItem,
  onEditSubItem,
  onDeleteSubItem,
}: TradeTableProps) {
  const { categories, byKey } = useTradeCategories()
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

  // Group trades by category only (no group level); include custom categories not in list
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
  }, {} as Record<string, Trade[]>)

  return (
    <section className="space-y-4">
      {/* Section header — title + actions (Clear All / Bulk Markup / Add Default Categories / Add Cost Item) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Estimate Breakdown</h2>
        <div className="flex flex-wrap items-center gap-2">
          {trades.length > 0 && (
            <>
              <Button
                onClick={onClearAll}
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Clear All
              </Button>
              {onBulkUpdateMarkup && (
                <Button onClick={onBulkUpdateMarkup} variant="outline" size="sm">
                  <Percent className="size-4" />
                  Bulk Markup
                </Button>
              )}
            </>
          )}
          <Button onClick={onAddDefaultCategories} variant="outline" size="sm">
            <Package className="size-4" />
            Add Default Categories
          </Button>
          <Button onClick={onAddTrade} size="sm">
            <PlusCircle className="size-4" />
            Add Cost Item
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card/50">
        {/* Mobile View - Accordion Style */}
        <div className="md:hidden space-y-2 p-2">
          {categoryOrder.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No cost items added yet. Click "Add Cost Item" to get started.
            </div>
          ) : (
            categoryOrder.map((category) => {
              const categoryTrades = tradesByCategory[category] || []
              const isCategoryExpanded = expandedCategories.has(category)
              const categoryTotal = categoryTrades.reduce((sum, t) => sum + t.totalCost, 0)
              const categoryMarkup = categoryTrades.reduce((sum, t) => sum + t.totalCost * ((t.markupPercent || defaultMarkupPercent) / 100), 0)
              const categoryEstimated = categoryTotal + categoryMarkup

              return (
                <div key={category} className="flex overflow-hidden rounded-lg border border-border/60 bg-card">
                  <div
                    className="w-1 shrink-0"
                    style={{ backgroundColor: getCategoryAccentColor(category) }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronRight
                          className={cn(
                            'size-4 text-muted-foreground transition-transform',
                            isCategoryExpanded && 'rotate-90',
                          )}
                        />
                        <div className="text-left">
                          <p className="font-semibold">
                            {byKey[category]?.label || category}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {categoryTrades.length} items
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(categoryEstimated)}
                        </p>
                      </div>
                    </button>

                    {isCategoryExpanded && (
                      <div className="space-y-3 border-t border-border/60 bg-muted/20 p-3">
                        {categoryTrades.map((trade) => (
                          <div
                            key={trade.id}
                            className="rounded-lg border border-border/60 bg-card p-3"
                          >
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <h4 className="font-semibold">{trade.name}</h4>
                              <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(trade.totalCost * 1.111)}
                              </p>
                            </div>

                            <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Qty:</span>
                                <span className="ml-1 font-medium">
                                  {trade.quantity} {UNIT_TYPES[trade.unit]?.abbreviation}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Base:</span>
                                <span className="ml-1 font-medium">
                                  {formatCurrency(trade.totalCost)}
                                </span>
                                {trade.budgetTotalCost != null && trade.budgetTotalCost !== trade.totalCost && (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    Budget: {formatCurrency(trade.budgetTotalCost)}
                                  </span>
                                )}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Material:</span>
                                <span className="ml-1 font-medium">
                                  {formatCurrency(trade.materialCost)}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Labor:</span>
                                <span className="ml-1 font-medium">
                                  {formatCurrency(trade.laborCost)}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Subcontractor:</span>
                                <span className="ml-1 font-medium">
                                  {formatCurrency(trade.subcontractorCost)}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onEditTrade(trade)}
                                className="flex-1"
                              >
                                <Edit className="size-3" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => onDeleteTrade(trade.id)}
                                className="flex-1"
                              >
                                <Trash2 className="size-3" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Desktop View - Table */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[1400px] text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="p-2"></th>
                <th className="p-2"></th>
                <th className="p-2 border-r border-border/60"></th>
                <th className="p-2 text-center text-xs font-semibold text-muted-foreground bg-muted/30 border-r border-border/60" colSpan={2}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-sky-500" />
                    Material
                  </span>
                </th>
                <th className="p-2 text-center text-xs font-semibold text-muted-foreground bg-muted/30 border-r border-border/60" colSpan={2}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-amber-500" />
                    Labor
                  </span>
                </th>
                <th className="p-2 text-center text-xs font-semibold text-muted-foreground bg-muted/30 border-r border-border/60" colSpan={2}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-teal-500" />
                    Subcontractor
                  </span>
                </th>
                <th className="p-2 border-r border-border/60"></th>
                <th className="p-2"></th>
                <th className="p-2"></th>
                <th className="p-2"></th>
                <th className="p-2"></th>
                <th className="p-2"></th>
                <th className="p-2"></th>
              </tr>
              <tr className="border-b border-border/60 bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="p-2 text-left border-r border-border/60">Category &amp; Items</th>
                <th className="p-2 text-center border-r border-border/60">Qty</th>
                <th className="p-2 text-center border-r border-border/60">Unit</th>
                <th className="p-2 text-center">Unit Cost</th>
                <th className="p-2 text-center border-r border-border/60">Cost</th>
                <th className="p-2 text-center">Unit Cost</th>
                <th className="p-2 text-center border-r border-border/60">Cost</th>
                <th className="p-2 text-center">Unit Cost</th>
                <th className="p-2 text-center border-r border-border/60">Cost</th>
                <th className="p-2 text-center border-r border-border/60">Base Price</th>
                <th className="p-2 text-center border-r border-border/60">Markup</th>
                <th className="p-2 text-center border-r border-border/60">Gross Profit</th>
                <th className="p-2 text-center border-r border-border/60">Margin</th>
                <th className="p-2 text-center border-r border-border/60">Total Estimated</th>
                <th className="p-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categoryOrder.map((category) => {
                const categoryTrades = tradesByCategory[category] || []
                const isCategoryExpanded = expandedCategories.has(category)
                const categoryTotal = categoryTrades.reduce((sum, t) => sum + t.totalCost, 0)
                const categoryMaterialTotal = categoryTrades.reduce((sum, t) => sum + t.materialCost, 0)
                const categoryLaborTotal = categoryTrades.reduce((sum, t) => sum + t.laborCost, 0)
                const categorySubcontractorTotal = categoryTrades.reduce((sum, t) => sum + t.subcontractorCost, 0)
                const categoryMarkupTotal = categoryTrades.reduce((sum, t) => sum + t.totalCost * ((t.markupPercent || defaultMarkupPercent) / 100), 0)
                const categoryFinalTotal = categoryTrades.reduce((sum, t) => sum + t.totalCost * (1 + (t.markupPercent || defaultMarkupPercent) / 100), 0)

                return (
                  <React.Fragment key={category}>
                    {/* Category Header Row */}
                    <tr
                      className="cursor-pointer bg-muted/30 font-medium transition-colors hover:bg-muted/50"
                      onClick={() => toggleCategory(category)}
                    >
                      <td
                        className="p-2 pl-4 border-b border-r border-border/60"
                        style={{
                          borderLeftWidth: 3,
                          borderLeftStyle: 'solid',
                          borderLeftColor: getCategoryAccentColor(category),
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={cn(
                              'size-4 text-muted-foreground transition-transform',
                              isCategoryExpanded && 'rotate-90',
                            )}
                          />
                          {byKey[category]?.label || category}
                        </div>
                      </td>
                      <td className="p-2 text-center border-b border-r border-border/60"></td>
                      <td className="p-2 text-center border-b border-r border-border/60"></td>
                      <td className="p-2 text-center border-b"></td>
                      <td className="p-2 text-center border-b border-r border-border/60 font-medium tabular-nums text-sky-600 dark:text-sky-400">
                        {formatCurrency(categoryMaterialTotal)}
                      </td>
                      <td className="p-2 text-center border-b"></td>
                      <td className="p-2 text-center border-b border-r border-border/60 font-medium tabular-nums text-amber-600 dark:text-amber-400">
                        {formatCurrency(categoryLaborTotal)}
                      </td>
                      <td className="p-2 text-center border-b"></td>
                      <td className="p-2 text-center border-b border-r border-border/60 font-medium tabular-nums text-teal-600 dark:text-teal-400">
                        {formatCurrency(categorySubcontractorTotal)}
                      </td>
                      <td className="p-2 text-center border-b border-r border-border/60 font-semibold tabular-nums">
                        {formatCurrency(categoryTotal)}
                      </td>
                      <td className="p-2 text-center border-b border-r border-border/60 text-muted-foreground">-</td>
                      <td className="p-2 text-center border-b border-r border-border/60 font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(categoryMarkupTotal)}
                      </td>
                      <td className="p-2 text-center border-b border-r border-border/60 text-muted-foreground">-</td>
                      <td className="p-2 text-center border-b border-r border-border/60 font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                        {formatCurrency(categoryFinalTotal)}
                      </td>
                      <td className="p-2 text-center border-b"></td>
                    </tr>

                    {/* Trade rows within category */}
                    {isCategoryExpanded && categoryTrades.map((trade) => {
                      const isTradeExpanded = expandedTrades.has(trade.id)
                      const tradeSubItems = subItemsByTrade[trade.id] || []
                      const hasSubItems = tradeSubItems.length > 0
                      const tradeMarkup = trade.markupPercent || defaultMarkupPercent

                      return (
                        <React.Fragment key={trade.id}>
                          <tr className="bg-card transition-colors hover:bg-muted/20">
                            <td className="p-2 pl-10 border-b border-r border-border/60">
                              <div className="flex flex-wrap items-center gap-2">
                                {hasSubItems && (
                                  <button
                                    onClick={() => onToggleTradeExpansion(trade.id)}
                                    className="rounded p-0.5 transition-colors hover:bg-accent"
                                    title={isTradeExpanded ? 'Collapse sub-items' : 'Expand sub-items'}
                                  >
                                    <ChevronRight
                                      className={cn(
                                        'size-3.5 text-muted-foreground transition-transform',
                                        isTradeExpanded && 'rotate-90',
                                      )}
                                    />
                                  </button>
                                )}
                                <span>{trade.name}</span>
                                {hasSubItems && (
                                  <span className="text-xs text-muted-foreground">
                                    ({tradeSubItems.length} sub-items)
                                  </span>
                                )}
                                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getEstimateStatusBadgeClass(trade.estimateStatus || 'budget')}`}>
                                  {ESTIMATE_STATUS[trade.estimateStatus || 'budget']?.icon}{' '}
                                  {getEstimateStatusLabel(trade.estimateStatus || 'budget')}
                                </span>
                                {trade.quoteFileUrl && (
                                  <span
                                    className="text-sky-600 dark:text-sky-400"
                                    title="Quote PDF attached"
                                  >
                                    <FileText className="size-4" />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-2 text-center border-b border-r border-border/60 tabular-nums">{trade.quantity}</td>
                            <td className="p-2 text-center border-b border-r border-border/60 text-muted-foreground">{UNIT_TYPES[trade.unit]?.abbreviation || trade.unit}</td>
                            <td className="p-2 text-center border-b tabular-nums text-sky-600/80 dark:text-sky-400/80">{trade.materialRate ? formatCurrency(trade.materialRate) : '-'}</td>
                            <td className="p-2 text-center border-b border-r border-border/60 tabular-nums text-sky-600 dark:text-sky-400">{formatCurrency(trade.materialCost)}</td>
                            <td className="p-2 text-center border-b tabular-nums text-amber-600/80 dark:text-amber-400/80">{trade.laborRate ? formatCurrency(trade.laborRate) : '-'}</td>
                            <td className="p-2 text-center border-b border-r border-border/60 tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(trade.laborCost)}</td>
                            <td className="p-2 text-center border-b tabular-nums text-teal-600/80 dark:text-teal-400/80">{trade.subcontractorRate ? formatCurrency(trade.subcontractorRate) : '-'}</td>
                            <td className="p-2 text-center border-b border-r border-border/60 tabular-nums text-teal-600 dark:text-teal-400">{formatCurrency(trade.subcontractorCost)}</td>
                            <td className="p-2 text-center border-b border-r border-border/60 tabular-nums">
                              {formatCurrency(trade.totalCost)}
                              {trade.budgetTotalCost != null && trade.budgetTotalCost !== trade.totalCost && (
                                <span className="block text-xs text-muted-foreground">
                                  Budget: {formatCurrency(trade.budgetTotalCost)}
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-center border-b border-r border-border/60 tabular-nums">{tradeMarkup.toFixed(1)}%</td>
                            <td className="p-2 text-center border-b border-r border-border/60 tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(trade.totalCost * (tradeMarkup / 100))}</td>
                            <td className="p-2 text-center border-b border-r border-border/60 tabular-nums">{((tradeMarkup / (100 + tradeMarkup)) * 100).toFixed(1)}%</td>
                            <td className="p-2 text-center border-b border-r border-border/60 tabular-nums font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(trade.totalCost * (1 + tradeMarkup / 100))}</td>
                            <td className="p-2 text-center border-b">
                              <div className="flex flex-wrap justify-center gap-1">
                                <Button size="sm" variant="outline" onClick={() => onEditTrade(trade)}>Edit</Button>
                                {isOnlineMode() && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onAddSubItem(trade.id)}
                                    title="Add sub-item"
                                  >
                                    <PlusCircle className="size-3" />
                                    Sub-item
                                  </Button>
                                )}
                                <Button size="sm" variant="destructive" onClick={() => onDeleteTrade(trade.id)}>Delete</Button>
                              </div>
                            </td>
                          </tr>
                          {isTradeExpanded && tradeSubItems.map((subItem: SubItem) => {
                            const subMarkup = subItem.markupPercent ?? defaultMarkupPercent
                            return (
                              <tr key={subItem.id} className="bg-muted/10 transition-colors hover:bg-muted/20">
                                <td className="p-2 pl-16 border-b border-r border-border/60">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm">{subItem.name}</span>
                                    {subItem.selectionOnly && (
                                      <span
                                        className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                                        title="This line is for selections only; it does not affect the trade total."
                                      >
                                        Selection only
                                      </span>
                                    )}
                                    {Boolean((subItem.selection as any)?.includeInSchedule) && (
                                      <span
                                        className="rounded bg-violet-500/15 px-1.5 py-0.5 text-xs text-violet-600 dark:text-violet-400"
                                        title="Included in Selection Schedules export."
                                      >
                                        In schedules
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 text-center border-b border-r border-border/60 text-sm tabular-nums">{subItem.quantity}</td>
                                <td className="p-2 text-center border-b border-r border-border/60 text-sm text-muted-foreground">{(UNIT_TYPES[subItem.unit as UnitType]?.abbreviation) || subItem.unit}</td>
                                <td className="p-2 text-center border-b text-sm tabular-nums text-sky-600/60 dark:text-sky-400/60">{subItem.selectionOnly ? '-' : (subItem.materialRate ? formatCurrency(subItem.materialRate) : '-')}</td>
                                <td className="p-2 text-center border-b border-r border-border/60 text-sm tabular-nums text-sky-600/80 dark:text-sky-400/80">{subItem.selectionOnly ? '-' : formatCurrency(subItem.materialCost)}</td>
                                <td className="p-2 text-center border-b text-sm tabular-nums text-amber-600/60 dark:text-amber-400/60">{subItem.selectionOnly ? '-' : (subItem.laborRate ? formatCurrency(subItem.laborRate) : '-')}</td>
                                <td className="p-2 text-center border-b border-r border-border/60 text-sm tabular-nums text-amber-600/80 dark:text-amber-400/80">{subItem.selectionOnly ? '-' : formatCurrency(subItem.laborCost)}</td>
                                <td className="p-2 text-center border-b text-sm tabular-nums text-teal-600/60 dark:text-teal-400/60">{subItem.selectionOnly ? '-' : (subItem.subcontractorRate ? formatCurrency(subItem.subcontractorRate) : '-')}</td>
                                <td className="p-2 text-center border-b border-r border-border/60 text-sm tabular-nums text-teal-600/80 dark:text-teal-400/80">{subItem.selectionOnly ? '-' : formatCurrency(subItem.subcontractorCost)}</td>
                                <td className="p-2 text-center border-b border-r border-border/60 text-sm tabular-nums">{subItem.selectionOnly ? '-' : formatCurrency(subItem.totalCost)}</td>
                                <td className="p-2 text-center border-b border-r border-border/60 text-sm tabular-nums">{subItem.selectionOnly ? '-' : `${subMarkup.toFixed(1)}%`}</td>
                                <td className="p-2 text-center border-b border-r border-border/60 text-sm tabular-nums text-emerald-600/80 dark:text-emerald-400/80">{subItem.selectionOnly ? '-' : formatCurrency(subItem.totalCost * (subMarkup / 100))}</td>
                                <td className="p-2 text-center border-b border-r border-border/60 text-sm tabular-nums">{subItem.selectionOnly ? '-' : `${((subMarkup / (100 + subMarkup)) * 100).toFixed(1)}%`}</td>
                                <td className="p-2 text-center border-b border-r border-border/60 text-sm tabular-nums font-medium text-rose-600/80 dark:text-rose-400/80">{subItem.selectionOnly ? '-' : formatCurrency(subItem.totalCost * (1 + subMarkup / 100))}</td>
                                <td className="p-2 text-center border-b">
                                  <div className="flex justify-center gap-1">
                                    <Button size="sm" variant="outline" onClick={() => onEditSubItem(trade.id, subItem)}>Edit</Button>
                                    <Button size="sm" variant="destructive" onClick={() => onDeleteSubItem(subItem.id, trade.id)}>Delete</Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </React.Fragment>
                      )
                    })}
                  </React.Fragment>
                )
              })}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={15} className="p-8 text-center text-muted-foreground">
                    No cost items added yet. Click "Add Cost Item" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------------
// Trade Form Component
// ----------------------------------------------------------------------------

interface TradeFormProps {
  trade: TradeFormData
  onSave: (data: TradeFormData) => Promise<void>
  onCancel: () => void
  isAdding: boolean
  projectId: string
  availableSubcontractors: DirectorySubcontractor[]
}

function TradeForm({ trade, onSave, onCancel, isAdding, projectId, availableSubcontractors }: TradeFormProps) {
  const { categories } = useTradeCategories()
  const [formData, setFormData] = useState<TradeFormData>(trade)
  const [itemTemplates, setItemTemplates] = useState<any[]>([])

  const subcontractorOptions = React.useMemo(
    () =>
      availableSubcontractors
        .filter((sub) => sub.isActive)
        .map((sub) => ({
          id: sub.id,
          name: sub.name,
          trade: sub.trade,
        })),
    [availableSubcontractors]
  )

  const quoteVendorSelectValue = React.useMemo(() => {
    if (!formData.quoteVendor) return 'manual'
    const match = subcontractorOptions.find(
      (sub) => sub.name.toLowerCase() === formData.quoteVendor?.toLowerCase()
    )
    return match?.id || 'manual'
  }, [formData.quoteVendor, subcontractorOptions])

  // Load item templates when category changes
  React.useEffect(() => {
    if (formData.category) {
      getItemTemplatesByCategory(formData.category).then(templates => {
        setItemTemplates(templates)
      })
    }
  }, [formData.category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Auto-set isSubcontracted based on whether there's a subcontractor cost
    // This maintains backward compatibility with existing data structures
    const dataToSave = {
      ...formData,
      isSubcontracted: (formData.subcontractorCost || 0) > 0,
    }
    await onSave(dataToSave)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">{isAdding ? 'Add Cost Item' : 'Edit Cost Item'}</CardTitle>
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
                    {categories.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="name">Item Name *</Label>
                <div className="space-y-2">
                  {itemTemplates.length > 0 && (
                    <Select 
                      value="__template__"
                      onValueChange={(value) => {
                        // Find the selected template
                        const template = itemTemplates.find(t => t.name === value)
                        
                        if (template) {
                          // Use template defaults
                          setFormData(prev => {
                            const qty = prev.quantity || 1
                            const hasSubRate = template.defaultSubcontractorRate != null && template.defaultSubcontractorRate > 0
                            const subRateFromTemplate = template.defaultSubcontractorRate ?? 0
                            const subCostFromRate = subRateFromTemplate * qty
                            const subCost = hasSubRate ? subCostFromRate : (template.defaultSubcontractorCost ?? 0)
                            const subRateDisplay = hasSubRate
                              ? subRateFromTemplate
                              : (qty > 0 && (template.defaultSubcontractorCost ?? 0) > 0
                                  ? (template.defaultSubcontractorCost ?? 0) / qty
                                  : 0)
                            const next: TradeFormData = {
                              ...prev,
                              name: template.name,
                              unit: template.defaultUnit,
                              isSubcontracted: template.isSubcontracted,
                              materialRate: template.defaultMaterialRate,
                              laborRate: template.defaultLaborRate,
                              subcontractorRate: subRateDisplay,
                              subcontractorCost: subCost,
                              materialCost: (template.defaultMaterialRate || 0) * qty,
                              laborCost: (template.defaultLaborRate || 0) * qty,
                            }
                            // If the item template has default sub-items, we could hook them up here in future
                            // by opening the sub-item editor or pre-populating sub-items for this trade.
                            return next
                          })
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Load from template..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__template__">Load from template...</SelectItem>
                        {itemTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.name}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    id="name"
                    placeholder="Type item name..."
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => {
                    const qty = parseFloat(e.target.value) || 0
                    setFormData(prev => {
                      // Recalculate costs if rates are already set
                      const newMaterialCost = prev.materialRate ? qty * prev.materialRate : prev.materialCost
                      const newLaborCost = prev.laborRate ? qty * prev.laborRate : prev.laborCost
                      const newSubcontractorCost = prev.subcontractorRate ? qty * prev.subcontractorRate : prev.subcontractorCost
                      
                      return {
                        ...prev,
                        quantity: qty,
                        materialCost: newMaterialCost,
                        laborCost: newLaborCost,
                        subcontractorCost: newSubcontractorCost,
                      }
                    })
                  }}
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
            </div>


            {/* Estimate Status Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="estimateStatus">Estimate Status</Label>
                <Select 
                  value={formData.estimateStatus || 'budget'} 
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    estimateStatus: value as any,
                    // Clear quote fields when switching to budget
                    quoteVendor: value === 'budget' ? undefined : prev.quoteVendor,
                    quoteDate: value === 'budget' ? undefined : prev.quoteDate,
                    quoteReference: value === 'budget' ? undefined : prev.quoteReference,
                    quoteFileUrl: value === 'budget' ? undefined : prev.quoteFileUrl,
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTIMATE_STATUS).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.icon} {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Quote fields - only show when status is quoted or approved */}
              {(formData.estimateStatus === 'quoted' || formData.estimateStatus === 'approved') && (
                <div className="space-y-2">
                  <Label htmlFor="quoteVendor">Quote Vendor/Subcontractor</Label>
                  {subcontractorOptions.length > 0 && (
                    <Select
                      value={quoteVendorSelectValue}
                      onValueChange={(value) => {
                        if (value === 'manual') {
                          setFormData((prev) => ({ ...prev, quoteVendor: '' }))
                          return
                        }
                        const selected = subcontractorOptions.find((sub) => sub.id === value)
                        setFormData((prev) => ({ ...prev, quoteVendor: selected?.name || '' }))
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select subcontractor..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual entry...</SelectItem>
                        {subcontractorOptions.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.name}
                            {sub.trade ? ` • ${sub.trade}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    id="quoteVendor"
                    value={formData.quoteVendor || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, quoteVendor: e.target.value }))}
                    placeholder="Enter vendor name"
                  />
                  {subcontractorOptions.length === 0 && (
                    <p className="text-xs text-gray-500">
                      Add subcontractors in the Partner Directory to make selection faster.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Additional quote fields */}
            {(formData.estimateStatus === 'quoted' || formData.estimateStatus === 'approved') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quoteDate">Quote Date</Label>
                  <Input
                    id="quoteDate"
                    type="date"
                    value={formData.quoteDate ? formData.quoteDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      quoteDate: e.target.value ? new Date(e.target.value) : undefined 
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="quoteReference">Quote Reference/Number</Label>
                  <Input
                    id="quoteReference"
                    value={formData.quoteReference || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, quoteReference: e.target.value }))}
                    placeholder="Enter quote number"
                  />
                </div>
              </div>
            )}

            {/* Quote PDF Upload */}
            {(formData.estimateStatus === 'quoted' || formData.estimateStatus === 'approved') && (
              <div>
                <Label htmlFor="quoteFile">Quote PDF Document</Label>
                <div className="space-y-2">
                  <Input
                    id="quoteFile"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        try {
                          // Import the upload function
                          const { uploadQuotePDF } = await import('@/services/supabaseService')
                          const fileUrl = await uploadQuotePDF(file, projectId, formData.id || 'temp')
                          if (fileUrl) {
                            setFormData(prev => ({ ...prev, quoteFileUrl: fileUrl }))
                          } else {
                            alert('Failed to upload file. Please try again.')
                          }
                        } catch (error) {
                          console.error('Error uploading file:', error)
                          alert('Error uploading file. Please try again.')
                        }
                      }
                    }}
                  />
                  {formData.quoteFileUrl && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <FileText className="w-4 h-4" />
                      <span>Quote document attached</span>
                      <a 
                        href={formData.quoteFileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View PDF
                      </a>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Upload the actual quote PDF for reference (max 10MB)
                </p>
              </div>
            )}

            {/* Material Costs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            {/* Labor Costs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            {/* Subcontractor Costs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="subcontractorRate">Subcontractor Unit Cost</Label>
                <Input
                  id="subcontractorRate"
                  type="number"
                  step="0.01"
                  value={formData.subcontractorRate || ''}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0
                    const cost = rate * formData.quantity
                    setFormData(prev => ({ ...prev, subcontractorRate: rate, subcontractorCost: cost }))
                  }}
                  placeholder="Enter unit cost"
                />
              </div>
              <div>
                <Label htmlFor="subcontractorCost">Subcontractor Cost</Label>
                <Input
                  id="subcontractorCost"
                  type="number"
                  step="0.01"
                  value={formData.subcontractorCost}
                  onChange={(e) => {
                    const cost = parseFloat(e.target.value) || 0
                    const rate = formData.quantity > 0 ? cost / formData.quantity : 0
                    setFormData(prev => ({ ...prev, subcontractorCost: cost, subcontractorRate: rate }))
                  }}
                  placeholder="Total cost"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enter subcontractor cost for this line (e.g. from a quote or PO).
            </p>

            {/* Item-level Selection (e.g. siding, gutters, soffit) */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="tradeIncludeInSchedule"
                checked={Boolean((formData.selection as any)?.includeInSchedule)}
                onChange={(e) => {
                  const checked = e.target.checked
                  setFormData(prev => {
                    const previousSelection = (prev.selection as Record<string, unknown> | undefined) || {}
                    const summaryValue = previousSelection.summary
                    const nextSelection = checked
                      ? { ...previousSelection, includeInSchedule: true }
                      : summaryValue
                        ? { ...previousSelection, summary: summaryValue }
                        : undefined
                    return { ...prev, selection: nextSelection }
                  })
                }}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="tradeIncludeInSchedule" className="font-normal cursor-pointer">
                Include this cost item in Selection Schedules
              </Label>
            </div>
            <div>
              <Label htmlFor="tradeSelection">Selection (optional)</Label>
              <Input
                id="tradeSelection"
                value={((formData.selection as any)?.summary as string) || ''}
                onChange={(e) => {
                  const summary = e.target.value
                  setFormData(prev => ({
                    ...prev,
                    selection: summary
                      ? { ...(prev.selection as any), summary }
                      : ((prev.selection as any)?.includeInSchedule
                          ? { includeInSchedule: true }
                          : undefined),
                  }))
                }}
                placeholder="e.g., James Hardie lap siding, Color: Arctic White"
              />
              <p className="text-xs text-gray-500 mt-1">
                High-level selection for this cost item (product/system and color). Use this when the whole line shares one selection.
              </p>
            </div>

              <div>
              <Label htmlFor="markupPercent">Markup % (for this item)</Label>
                <Input
                id="markupPercent"
                  type="number"
                step="0.1"
                value={formData.markupPercent || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, markupPercent: parseFloat(e.target.value) || 0 }))}
                placeholder="e.g., 20"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave blank to use default markup percentage
              </p>
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
                {isAdding ? 'Add Cost Item' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Sub-Item Form Component
// ----------------------------------------------------------------------------

interface SubItemFormProps {
  tradeId: string
  estimateId: string
  subItem?: SubItem
  onSave: (tradeId: string, data: Partial<SubItem>) => Promise<void>
  onCancel: () => void
  isAdding: boolean
  defaultMarkupPercent: number
}

function SubItemForm({ tradeId, estimateId, subItem, onSave, onCancel, isAdding, defaultMarkupPercent }: SubItemFormProps) {
  const [formData, setFormData] = useState<Partial<SubItem>>({
    name: subItem?.name || '',
    description: subItem?.description || '',
    quantity: subItem?.quantity || 0,
    unit: subItem?.unit || 'each',
    laborCost: subItem?.laborCost || 0,
    laborRate: subItem?.laborRate || 0,
    laborHours: subItem?.laborHours || 0,
    materialCost: subItem?.materialCost || 0,
    materialRate: subItem?.materialRate || 0,
    subcontractorCost: subItem?.subcontractorCost || 0,
    subcontractorRate: subItem?.subcontractorRate || 0,
    isSubcontracted: subItem?.isSubcontracted || false,
    wasteFactor: subItem?.wasteFactor || 10,
    markupPercent: subItem?.markupPercent || defaultMarkupPercent,
    notes: subItem?.notes || '',
    selectionOnly: subItem?.selectionOnly ?? false,
    selection: subItem?.selection,
  })
  const selectionOnly = formData.selectionOnly ?? false
  const includeInSelectionSchedules = Boolean((formData.selection as any)?.includeInSchedule)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      alert('Please enter a name for the sub-item')
      return
    }
    await onSave(tradeId, formData)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">{isAdding ? 'Add Sub-Item' : 'Edit Sub-Item'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="subItemName">Sub-Item Name *</Label>
              <Input
                id="subItemName"
                value={formData.name || ''}
                onChange={(e) => setFormData((prev: Partial<SubItem>) => ({ ...prev, name: e.target.value }))}
                required
                placeholder="e.g., Towel bars, Recessed lights"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="subItemSelectionOnly"
                checked={selectionOnly}
                onChange={(e) => {
                  const checked = e.target.checked
                  setFormData((prev: Partial<SubItem>) => ({
                    ...prev,
                    selectionOnly: checked,
                    ...(checked
                      ? {
                          laborCost: 0,
                          laborRate: 0,
                          laborHours: 0,
                          materialCost: 0,
                          materialRate: 0,
                          subcontractorCost: 0,
                          subcontractorRate: 0,
                        }
                      : {}),
                  }))
                }}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="subItemSelectionOnly" className="font-normal cursor-pointer">
                Selection only (no cost — e.g. paint color per room, fixture choice)
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="subItemIncludeInSchedule"
                checked={includeInSelectionSchedules}
                onChange={(e) => {
                  const checked = e.target.checked
                  setFormData((prev: Partial<SubItem>) => {
                    const previousSelection = (prev.selection as Record<string, unknown> | undefined) || {}
                    const summaryValue = previousSelection.summary
                    const nextSelection = checked
                      ? { ...previousSelection, includeInSchedule: true }
                      : summaryValue
                        ? { ...previousSelection, summary: summaryValue }
                        : undefined
                    return { ...prev, selection: nextSelection }
                  })
                }}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="subItemIncludeInSchedule" className="font-normal cursor-pointer">
                Include in Selection Schedules (keeps cost fields active)
              </Label>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${selectionOnly ? 'opacity-60 pointer-events-none' : ''}`}>
              <div>
                <Label htmlFor="subItemQuantity">Quantity</Label>
                <Input
                  id="subItemQuantity"
                  type="number"
                  step="0.01"
                  value={formData.quantity ?? 0}
                  onChange={(e) => {
                    const qty = parseFloat(e.target.value) || 0
                    setFormData((prev: Partial<SubItem>) => ({
                      ...prev,
                      quantity: qty,
                      materialCost: (prev.materialRate || 0) * qty,
                      laborCost: (prev.laborRate || 0) * qty,
                    }))
                  }}
                />
              </div>
              <div>
                <Label htmlFor="subItemUnit">Unit</Label>
                <Select
                  value={formData.unit || 'each'}
                  onValueChange={(value) => setFormData((prev: Partial<SubItem>) => ({ ...prev, unit: value as UnitType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(UNIT_TYPES).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.label} ({value.abbreviation})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${selectionOnly ? 'opacity-60 pointer-events-none' : ''}`}>
              <div>
                <Label htmlFor="subItemMaterialRate">Material Unit Cost</Label>
                <Input
                  id="subItemMaterialRate"
                  type="number"
                  step="0.01"
                  value={formData.materialRate || ''}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0
                    const cost = rate * (formData.quantity || 0)
                    setFormData((prev: Partial<SubItem>) => ({ ...prev, materialRate: rate, materialCost: cost }))
                  }}
                />
              </div>
              <div>
                <Label htmlFor="subItemMaterialCost">Material Cost</Label>
                <Input
                  id="subItemMaterialCost"
                  type="number"
                  step="0.01"
                  value={formData.materialCost || 0}
                  onChange={(e) => {
                    const cost = parseFloat(e.target.value) || 0
                    const rate = (formData.quantity || 0) > 0 ? cost / (formData.quantity || 0) : 0
                    setFormData((prev: Partial<SubItem>) => ({ ...prev, materialCost: cost, materialRate: rate }))
                  }}
                />
              </div>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${selectionOnly ? 'opacity-60 pointer-events-none' : ''}`}>
              <div>
                <Label htmlFor="subItemLaborRate">Labor Unit Cost</Label>
                <Input
                  id="subItemLaborRate"
                  type="number"
                  step="0.01"
                  value={formData.laborRate || ''}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0
                    const cost = rate * (formData.quantity || 0)
                    setFormData((prev: Partial<SubItem>) => ({ ...prev, laborRate: rate, laborCost: cost }))
                  }}
                />
              </div>
              <div>
                <Label htmlFor="subItemLaborCost">Labor Cost</Label>
                <Input
                  id="subItemLaborCost"
                  type="number"
                  step="0.01"
                  value={formData.laborCost || 0}
                  onChange={(e) => {
                    const cost = parseFloat(e.target.value) || 0
                    const rate = (formData.quantity || 0) > 0 ? cost / (formData.quantity || 0) : 0
                    setFormData((prev: Partial<SubItem>) => ({ ...prev, laborCost: cost, laborRate: rate }))
                  }}
                />
              </div>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${selectionOnly ? 'opacity-60 pointer-events-none' : ''}`}>
              <div>
                <Label htmlFor="subItemSubcontractorRate">Subcontractor Unit Cost</Label>
                <Input
                  id="subItemSubcontractorRate"
                  type="number"
                  step="0.01"
                  value={formData.subcontractorRate || ''}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0
                    const cost = rate * (formData.quantity || 0)
                    setFormData((prev: Partial<SubItem>) => ({ ...prev, subcontractorRate: rate, subcontractorCost: cost }))
                  }}
                />
              </div>
              <div>
                <Label htmlFor="subItemSubcontractorCost">Subcontractor Cost</Label>
                <Input
                  id="subItemSubcontractorCost"
                  type="number"
                  step="0.01"
                  value={formData.subcontractorCost || 0}
                  onChange={(e) => {
                    const cost = parseFloat(e.target.value) || 0
                    const rate = (formData.quantity || 0) > 0 ? cost / (formData.quantity || 0) : 0
                    setFormData((prev: Partial<SubItem>) => ({ ...prev, subcontractorCost: cost, subcontractorRate: rate }))
                  }}
                />
              </div>
            </div>

            <div className={selectionOnly ? 'opacity-60 pointer-events-none' : ''}>
              <Label htmlFor="subItemMarkupPercent">Markup %</Label>
              <Input
                id="subItemMarkupPercent"
                type="number"
                step="0.1"
                value={formData.markupPercent ?? defaultMarkupPercent}
                onChange={(e) => setFormData((prev: Partial<SubItem>) => ({ ...prev, markupPercent: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div>
                <Label htmlFor="subItemDescription">Description</Label>
              <Input
                id="subItemDescription"
                value={formData.description || ''}
                onChange={(e) => setFormData((prev: Partial<SubItem>) => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="subItemNotes">Notes</Label>
              <Input
                id="subItemNotes"
                value={formData.notes || ''}
                onChange={(e) => setFormData((prev: Partial<SubItem>) => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            {/* Selection summary for this sub-item (especially when Selection only is checked) */}
            <div>
              <Label htmlFor="subItemSelection">Selection (optional)</Label>
              <Input
                id="subItemSelection"
                value={((formData.selection as any)?.summary as string) || ''}
                onChange={(e) => {
                  const summary = e.target.value
                  setFormData((prev: Partial<SubItem>) => ({
                    ...prev,
                    selection: summary
                      ? { ...(prev.selection as any), summary }
                      : ((prev.selection as any)?.includeInSchedule
                          ? { includeInSchedule: true }
                          : undefined),
                  }))
                }}
                placeholder="e.g., Sherwin-Williams Agreeable Gray – walls; Extra White – trim"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use this to capture the specific selection for this sub-item (room/fixture/color), especially when marked as Selection only.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226] text-white">
                {isAdding ? 'Add Sub-Item' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
