// ============================================================================
// Estimate Builder Component
// ============================================================================
//
// Main component for building estimates, matching the Excel "Estimate Book" structure
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import hshLogo from '/HSH Contractor Logo - Color.png'
import { PrintableReport, ReportDepth } from './PrintableReport'
import {
  Project,
  Estimate,
  Trade,
  SubItem,
  TradeInput,
  UnitType,
  Subcontractor as DirectorySubcontractor,
  TRADE_CATEGORIES,
  CATEGORY_GROUPS,
  CATEGORY_TO_GROUP,
  getCategoryGroup,
  UNIT_TYPES,
  DEFAULT_VALUES,
  PROJECT_TYPES,
  ESTIMATE_STATUS,
  getEstimateStatusLabel,
  getEstimateStatusBadgeClass,
} from '@/types'
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
} from '@/services/supabaseService'
import { isOnlineMode } from '@/lib/supabase'
import { QuoteRequestForm } from './QuoteRequestForm'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fetchSubcontractors } from '@/services/partnerDirectoryService'
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
  // State
  const [projectData, setProjectData] = useState<Project | null>(project || null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [editingTrade, setEditingTrade] = useState<TradeFormData | null>(null)
  const [isAddingTrade, setIsAddingTrade] = useState(false)
  const [markupPercent, setMarkupPercent] = useState(11.1)
  const [contingencyPercent, setContingencyPercent] = useState(10)
  const [showPrintReport, setShowPrintReport] = useState(false)
  const [reportDepth, setReportDepth] = useState<ReportDepth>('full')
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [showApplyTemplateDialog, setShowApplyTemplateDialog] = useState(false)
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([])
  const [selectedTemplateToApply, setSelectedTemplateToApply] = useState<string>('')
  const [showQuoteRequestForm, setShowQuoteRequestForm] = useState(false)
  const [selectedTradeForQuote, setSelectedTradeForQuote] = useState<Trade | null>(null)
  const [availableSubcontractors, setAvailableSubcontractors] = useState<DirectorySubcontractor[]>([])
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set())
  const [editingSubItem, setEditingSubItem] = useState<{ tradeId: string; subItem?: SubItem } | null>(null)
  const [subItemsByTrade, setSubItemsByTrade] = useState<Record<string, SubItem[]>>({})
  const [showBulkMarkupDialog, setShowBulkMarkupDialog] = useState(false)
  const [bulkMarkupPercent, setBulkMarkupPercent] = useState(markupPercent.toString())

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
          laborCost: subItemData.laborCost!,
          laborRate: subItemData.laborRate,
          laborHours: subItemData.laborHours,
          materialCost: subItemData.materialCost!,
          materialRate: subItemData.materialRate,
          subcontractorCost: subItemData.subcontractorCost!,
          isSubcontracted: subItemData.isSubcontracted || false,
          wasteFactor: subItemData.wasteFactor || 10,
          markupPercent: subItemData.markupPercent,
        })
      } else {
        // Create new sub-item
        updatedSubItem = await createSubItemInDB(
          tradeId,
          projectData.estimate.id,
          {
            name: subItemData.name!,
            description: subItemData.description,
            quantity: subItemData.quantity || 0,
            unit: subItemData.unit || 'each',
            laborCost: subItemData.laborCost || 0,
            laborRate: subItemData.laborRate,
            laborHours: subItemData.laborHours,
            materialCost: subItemData.materialCost || 0,
            materialRate: subItemData.materialRate,
            subcontractorCost: subItemData.subcontractorCost || 0,
            isSubcontracted: subItemData.isSubcontracted || false,
            wasteFactor: subItemData.wasteFactor || 10,
            markupPercent: subItemData.markupPercent,
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
      const refreshedTrades = await getTradesForEstimate_Hybrid(projectData.estimate.id)
      setTrades(refreshedTrades)
      setMarkupPercent(newMarkup)
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

      // Add each trade to the database using hybrid service
      console.log('💾 Adding trades to database...')
      for (const templateTrade of templateTrades) {
        console.log('  Adding trade:', templateTrade.name)
        await addTrade_Hybrid(projectData.estimate.id, {
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
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <div className="p-2 sm:p-4 lg:p-6 xl:p-8">
        <div className="w-full space-y-4 sm:space-y-6">
          {/* Header Section with integrated back button */}
          <ProjectHeader
            project={projectData}
            onUpdate={handleProjectUpdate}
            onBack={onBack}
          />

        {/* Summary Section */}
        <SummarySection 
          totals={totals} 
          onContingencyChange={setContingencyPercent}
          onPrintReport={handlePrintReport}
          onSaveAsTemplate={() => setShowSaveTemplateDialog(true)}
          onApplyTemplate={handleOpenApplyTemplate}
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
          onRequestQuote={(trade) => {
            setSelectedTradeForQuote(trade)
            setShowQuoteRequestForm(true)
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

        {/* Quote Request Form */}
        {showQuoteRequestForm && projectData && (
          <QuoteRequestForm
            project={projectData}
            trade={selectedTradeForQuote}
            onClose={() => {
              setShowQuoteRequestForm(false)
              setSelectedTradeForQuote(null)
            }}
            onSuccess={() => {
              // Emails are now sent automatically in QuoteRequestForm
              // Just close the form
              setShowQuoteRequestForm(false)
              setSelectedTradeForQuote(null)
            }}
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
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                  <p className="font-semibold text-blue-900 mb-1">Template Info:</p>
                  <ul className="text-blue-800 space-y-1">
                    <li>• {trades.length} line items will be saved</li>
                    <li>• Default markup: {markupPercent.toFixed(1)}%</li>
                    <li>• Default contingency: {contingencyPercent.toFixed(1)}%</li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveAsTemplate}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
                  >
                    <Save className="w-4 h-4 mr-2" />
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
                    placeholder="11.1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This will update the markup percentage for all {trades.length} cost item(s) in this estimate.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleBulkUpdateMarkup}
                    className="flex-1 bg-gradient-to-r from-[#D95C00] to-[#C04F00] hover:from-[#C04F00] hover:to-[#A93226]"
                  >
                    <Percent className="w-4 h-4 mr-2" />
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
                    <p className="text-sm text-gray-500 mt-2">
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
                      <p className="text-xs text-gray-600 mt-2">
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
                      console.log('🖱️ Button physically clicked')
                      handleApplyTemplate()
                    }}
                    disabled={!selectedTemplateToApply || availableTemplates.length === 0}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600"
                  >
                    <FileText className="w-4 h-4 mr-2" />
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
      </div>
      
      {/* Mobile Back Button - Fixed at bottom */}
      {onBack && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg z-40">
          <Button
            onClick={onBack}
            variant="outline"
            className="border-gray-300 hover:bg-gray-50 w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {project ? 'Back to Project Detail' : 'Back to Projects'}
          </Button>
        </div>
      )}
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
      {/* Mobile Header - Matches Project Detail Style */}
      <header className="sm:hidden bg-white shadow-md border-b border-gray-200">
        <div className="px-4 py-4">
          <div className="flex items-center space-x-3">
            <img src={hshLogo} alt="HSH Contractor" className="h-16 w-auto" />
            <div className="flex-1">
              <div className="flex flex-col gap-2 mb-1">
                <h1 className="text-lg font-bold text-gray-900">{project.name}</h1>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)} w-fit`}>
                  {project.status.replace('-', ' ').toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-gray-600">
                Plan: {project.metadata?.isCustomPlan || !project.metadata?.planId ? (
                  <>
                    Custom
                    <span className="ml-1 text-xs bg-[#0E79C9] text-white px-1.5 py-0.5 rounded">Custom</span>
                  </>
                ) : (
                  project.metadata.planId
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop Header - Card Style with Full Details */}
      <Card className="hidden sm:block bg-gradient-to-br from-gray-50 to-white text-gray-900 border border-gray-200 shadow-lg">
        <CardHeader className="pb-3 sm:pb-6">
          <div className="space-y-2 sm:space-y-4">
            <div className="flex items-center justify-center gap-2 sm:gap-4 lg:gap-6">
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
                <h2 className="text-xl sm:text-4xl lg:text-5xl font-bold text-gray-900">Estimate Book</h2>
            </div>
          </div>
          
            {/* Back Button - Desktop Only */}
          {onBack && (
              <div className="hidden sm:flex justify-center">
              <Button
                onClick={onBack}
                variant="outline"
                  size="sm"
                  className="border-gray-300 hover:bg-gray-50 w-full max-w-md text-xs sm:text-sm"
              >
                  <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                {project ? 'Back to Project Detail' : 'Back to Projects'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
          <div className="space-y-2 sm:space-y-3">
            {/* Row 1: Project Name | Plan ID | Project Type | Project Location */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-x-2 sm:gap-x-4 gap-y-2 sm:gap-y-3">
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Project Name</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm">{project.name}</p>
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Plan ID</Label>
                <div className="flex items-center gap-1 sm:gap-2">
                  {project.metadata?.isCustomPlan || !project.metadata?.planId ? (
                    <>
                      <p className="text-gray-900 font-semibold text-xs sm:text-sm">Custom</p>
                      <span className="text-xs bg-[#0E79C9] text-white px-1 sm:px-2 py-0.5 rounded">
                        Custom
                      </span>
                    </>
                  ) : (
                    <p className="text-gray-900 font-semibold text-xs sm:text-sm">{project.metadata.planId}</p>
                  )}
                </div>
              {project.metadata?.planOptions && project.metadata.planOptions.length > 0 && (
                <div className="mt-1">
                  {project.metadata.planOptions.map((option: string) => (
                    <span 
                      key={option}
                        className="inline-block text-xs bg-purple-50 text-purple-700 px-1 sm:px-2 py-0.5 sm:py-1 rounded mr-1"
                    >
                      {option}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Type</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm capitalize">{project.type.replace('-', ' ')}</p>
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Location</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm">
                {project.address?.street || 'Not set'}
                {project.city && `, ${project.city}`}
                {project.state && `, ${project.state}`}
                {project.zipCode && ` ${project.zipCode}`}
              </p>
            </div>
            </div>
            
            {/* Row 2: Start Date | End Date | Status | Created */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-x-2 sm:gap-x-4 gap-y-2 sm:gap-y-3">
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Start Date</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm">
                {project.startDate ? project.startDate.toLocaleDateString() : 'Not set'}
              </p>
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">End Date</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm">
                {project.endDate ? project.endDate.toLocaleDateString() : 'Not set'}
              </p>
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Status</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm capitalize">{project.status.replace('-', ' ')}</p>
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Created</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm">{project.createdAt.toLocaleDateString()}</p>
            </div>
            </div>

          </div>
      </CardContent>
    </Card>
    </>
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
}

function SummarySection({ totals, onContingencyChange, onPrintReport, onSaveAsTemplate, onApplyTemplate }: SummarySectionProps) {
  const [isEditingContingency, setIsEditingContingency] = useState(false)
  const [tempContingency, setTempContingency] = useState(totals.contingencyPercent)
  const [showPrintMenu, setShowPrintMenu] = useState(false)
  
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatPercent = (percent: number) => `${percent.toFixed(1)}%`
  
  const handleContingencySave = () => {
    onContingencyChange(tempContingency)
    setIsEditingContingency(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Estimate Summary</CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={onApplyTemplate}
              variant="outline"
              size="sm"
              className="border-purple-500 text-purple-500 hover:bg-purple-500 hover:text-white"
            >
              <FileText className="w-4 h-4 mr-2" />
              Apply Template
            </Button>
            <Button
              onClick={onSaveAsTemplate}
              variant="outline"
              size="sm"
              className="border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              Save as Template
            </Button>
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
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-10 min-w-[200px]">
                <div className="p-2">
                  <p className="text-xs font-semibold text-gray-700 mb-2 px-2">Select Detail Level:</p>
                  <button
                    onClick={() => {
                      onPrintReport('summary')
                      setShowPrintMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                  >
                    📊 Summary Only
                    <p className="text-xs text-gray-500">Category totals</p>
                  </button>
                  <button
                    onClick={() => {
                      onPrintReport('category')
                      setShowPrintMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                  >
                    📋 Category Detail
                    <p className="text-xs text-gray-500">Subtotals by category</p>
                  </button>
                  <button
                    onClick={() => {
                      onPrintReport('full')
                      setShowPrintMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                  >
                    📄 Full Detail
                    <p className="text-xs text-gray-500">Every line item</p>
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-[#213069] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-xs sm:text-sm opacity-90">Base Price Total</p>
            <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totals.basePriceTotal)}</p>
          </div>
          <div 
            className="bg-[#D95C00] text-white p-4 rounded-lg text-center shadow-lg cursor-pointer hover:bg-[#C04F00] transition-colors"
            onClick={() => {
              setIsEditingContingency(true)
              setTempContingency(totals.contingencyPercent)
            }}
          >
            <p className="text-xs sm:text-sm opacity-90">
              Contingency ({formatPercent(totals.contingencyPercent)})
              <span className="ml-1">✏️</span>
            </p>
            <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totals.contingency)}</p>
          </div>
          
          {/* Contingency Edit Dialog */}
          {isEditingContingency && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-sm">
                <CardHeader>
                  <CardTitle>Edit Contingency %</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="mobile-contingency">Contingency Percentage</Label>
                    <Input
                      id="mobile-contingency"
                      type="number"
                      step="0.1"
                      value={tempContingency}
                      onChange={(e) => setTempContingency(parseFloat(e.target.value) || 0)}
                      className="text-lg"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleContingencySave}
                      className="flex-1 bg-[#D95C00] hover:bg-[#C04F00]"
                    >
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
  onClearAll: () => void
  onBulkUpdateMarkup?: () => void
  onRequestQuote?: (trade: Trade) => void
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
  onRequestQuote, 
  defaultMarkupPercent,
  expandedTrades,
  subItemsByTrade,
  onToggleTradeExpansion,
  onAddSubItem,
  onEditSubItem,
  onDeleteSubItem,
}: TradeTableProps) {
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>Estimate Breakdown</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            {trades.length > 0 && (
              <>
                <Button 
                  onClick={onClearAll}
                  variant="outline"
                  size="sm"
                  className="border-red-500 text-red-600 hover:bg-red-50 hover:border-red-600 w-full sm:w-auto"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
                {onBulkUpdateMarkup && (
                  <Button 
                    onClick={onBulkUpdateMarkup}
                    variant="outline"
                    size="sm"
                    className="border-[#D95C00] text-[#D95C00] hover:bg-[#D95C00] hover:text-white w-full sm:w-auto"
                  >
                    <Percent className="w-4 h-4 mr-2" />
                    Bulk Markup
                  </Button>
                )}
              </>
            )}
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
              Add Cost Item
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile View - Accordion Style */}
        <div className="md:hidden space-y-2">
          {Object.keys(groupedTrades).length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No cost items added yet. Click "Add Cost Item" to get started.
            </div>
          ) : (
            Object.entries(groupedTrades).map(([group, groupCategories]) => {
              const groupTotal = Object.values(groupCategories).flat().reduce((sum, t) => sum + t.totalCost, 0)
              const groupMarkup = Object.values(groupCategories).flat().reduce((sum, t) => sum + t.totalCost * ((t.markupPercent || defaultMarkupPercent) / 100), 0)
              const groupEstimated = groupTotal + groupMarkup
              const isGroupExpanded = expandedCategories.has(`group_${group}`)

              return (
                <Card key={group} className="border-2 border-blue-200">
                  <button
                    onClick={() => toggleCategory(`group_${group}`)}
                    className="w-full p-4 flex items-center justify-between hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {CATEGORY_GROUPS[group as keyof typeof CATEGORY_GROUPS]?.icon || '📦'}
                      </span>
                      <div className="text-left">
                        <p className="font-bold text-blue-800">
                          {CATEGORY_GROUPS[group as keyof typeof CATEGORY_GROUPS]?.label || group}
                        </p>
                        <p className="text-xs text-gray-500">{Object.values(groupCategories).flat().length} items</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Total</p>
                        <p className="font-bold text-[#34AB8A]">{formatCurrency(groupEstimated)}</p>
                      </div>
                      {isGroupExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  {isGroupExpanded && (
                    <div className="border-t border-blue-200 bg-blue-50 p-3 space-y-3">
                      {Object.entries(groupCategories).map(([category, categoryTrades]) => {
                        const isCategoryExpanded = expandedCategories.has(category)
                        const categoryTotal = categoryTrades.reduce((sum, t) => sum + t.totalCost, 0)
                        const categoryMarkup = categoryTrades.reduce((sum, t) => sum + t.totalCost * ((t.markupPercent || defaultMarkupPercent) / 100), 0)
                        const categoryEstimated = categoryTotal + categoryMarkup

                        return (
                          <div key={category} className="bg-white rounded-lg border border-gray-200">
                            <button
                              onClick={() => toggleCategory(category)}
                              className="w-full p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-lg">
                                  {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                                </span>
                                <div className="text-left">
                                  <p className="font-semibold text-gray-900">
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
                                {isCategoryExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </div>
                            </button>

                            {isCategoryExpanded && (
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
                            <div>
                              <span className="text-gray-500">Subcontractor:</span>
                              <span className="ml-1 font-medium">{formatCurrency(trade.subcontractorCost)}</span>
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
                            {onRequestQuote && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => onRequestQuote(trade)}
                                className="flex-1 border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white"
                              >
                                <Mail className="w-3 h-3 mr-1" />
                                Quote
                              </Button>
                            )}
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
                          </div>
                        )
                      })}
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
            <table className="w-full border-collapse min-w-[1400px]">
            <thead>
              <tr className="border-b">
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3 border-r-2 border-gray-300"></th>
                <th className="text-center p-3 text-[#913E00] text-3xl font-bold border-r-2 border-gray-300" colSpan={2}>Material</th>
                <th className="text-center p-3 text-[#913E00] text-3xl font-bold border-r-2 border-gray-300" colSpan={2}>Labor</th>
                <th className="text-center p-3 text-[#D95C00] text-3xl font-bold border-r-2 border-gray-300" colSpan={2}>Subcontractor</th>
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
              {Object.entries(groupedTrades).map(([group, groupCategories]) => {
                const isGroupExpanded = expandedCategories.has(`group_${group}`)
                const groupTotal = Object.values(groupCategories).flat().reduce((sum, t) => sum + t.totalCost, 0)
                const groupMaterialTotal = Object.values(groupCategories).flat().reduce((sum, t) => sum + t.materialCost, 0)
                const groupLaborTotal = Object.values(groupCategories).flat().reduce((sum, t) => sum + t.laborCost, 0)
                const groupSubcontractorTotal = Object.values(groupCategories).flat().reduce((sum, t) => sum + t.subcontractorCost, 0)
                const groupMarkupTotal = Object.values(groupCategories).flat().reduce((sum, t) => sum + t.totalCost * ((t.markupPercent || defaultMarkupPercent) / 100), 0)
                const groupFinalTotal = Object.values(groupCategories).flat().reduce((sum, t) => sum + t.totalCost * (1 + (t.markupPercent || defaultMarkupPercent) / 100), 0)
                
                return (
                  <React.Fragment key={group}>
                    {/* Group Header Row */}
                    <tr 
                      className="bg-blue-50 font-bold cursor-pointer hover:bg-blue-100 transition-colors border-b-2 border-blue-200"
                      onClick={() => toggleCategory(`group_${group}`)}
                    >
                      <td className="p-3 border-b border-r-2 border-gray-300">
                        <div className="flex items-center gap-2">
                          {isGroupExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4 rotate-180" />}
                          <span className="text-blue-800">{CATEGORY_GROUPS[group as keyof typeof CATEGORY_GROUPS]?.label || group}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300"></td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300"></td>
                      <td className="p-3 text-center border-b"></td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300 font-bold text-blue-800">{formatCurrency(groupMaterialTotal)}</td>
                      <td className="p-3 text-center border-b"></td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300 font-bold text-blue-800">{formatCurrency(groupLaborTotal)}</td>
                      <td className="p-3 text-center border-b"></td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300 font-bold text-blue-800">{formatCurrency(groupSubcontractorTotal)}</td>
                      <td className="p-3 text-center border-b font-bold border-r-2 border-gray-300 text-blue-800">{formatCurrency(groupTotal)}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300 text-gray-500">-</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300 font-bold text-blue-800">{formatCurrency(groupMarkupTotal)}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300 text-gray-500">-</td>
                      <td className="p-3 text-center border-b font-bold border-r-2 border-gray-300 text-blue-800">{formatCurrency(groupFinalTotal)}</td>
                      <td className="p-3 text-center border-b"></td>
                    </tr>
                    
                    {/* Category rows within group */}
                    {isGroupExpanded && Object.entries(groupCategories).map(([category, categoryTrades]) => {
                      const isCategoryExpanded = expandedCategories.has(category)
                      
                      return (
                        <React.Fragment key={category}>
                          <tr 
                            className="bg-gray-50 font-semibold cursor-pointer hover:bg-gray-100 transition-colors"
                            onClick={() => toggleCategory(category)}
                          >
                            <td className="p-3 border-b border-r-2 border-gray-300 pl-8">
                              <div className="flex items-center gap-2">
                                {isCategoryExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4 rotate-180" />}
                                {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                              </div>
                            </td>
                            <td className="p-3 text-center border-b border-r-2 border-gray-300"></td>
                            <td className="p-3 text-center border-b border-r-2 border-gray-300"></td>
                            <td className="p-3 text-center border-b"></td>
                            <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.materialCost, 0))}</td>
                            <td className="p-3 text-center border-b"></td>
                            <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.laborCost, 0))}</td>
                            <td className="p-3 text-center border-b"></td>
                            <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.subcontractorCost, 0))}</td>
                            <td className="p-3 text-center border-b font-bold border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost, 0))}</td>
                            <td className="p-3 text-center border-b border-r-2 border-gray-300 text-gray-500">-</td>
                            <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost * ((t.markupPercent || defaultMarkupPercent) / 100), 0))}</td>
                            <td className="p-3 text-center border-b border-r-2 border-gray-300 text-gray-500">-</td>
                            <td className="p-3 text-center border-b font-bold border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost * (1 + (t.markupPercent || defaultMarkupPercent) / 100), 0))}</td>
                            <td className="p-3 text-center border-b"></td>
                          </tr>
                          {isCategoryExpanded && categoryTrades.map((trade) => {
                            const isTradeExpanded = expandedTrades.has(trade.id)
                            const tradeSubItems = subItemsByTrade[trade.id] || []
                            const hasSubItems = tradeSubItems.length > 0
                            
                            return (
                              <React.Fragment key={trade.id}>
                                <tr className="hover:bg-gray-50">
                                  <td className="p-3 border-b pl-12 border-r-2 border-gray-300">
                                    <div className="flex items-center gap-2">
                                      {hasSubItems && (
                                        <button
                                          onClick={() => onToggleTradeExpansion(trade.id)}
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
                                      <span>{trade.name}</span>
                                      {hasSubItems && (
                                        <span className="text-xs text-gray-500">({tradeSubItems.length} sub-items)</span>
                                      )}
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getEstimateStatusBadgeClass(trade.estimateStatus || 'budget')}`}>
                                        {ESTIMATE_STATUS[trade.estimateStatus || 'budget']?.icon} {getEstimateStatusLabel(trade.estimateStatus || 'budget')}
                                      </span>
                                      {trade.quoteFileUrl && (
                                        <span className="text-blue-600" title="Quote PDF attached">
                                          <FileText className="w-4 h-4" />
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300">{trade.quantity}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300">{UNIT_TYPES[trade.unit]?.abbreviation || trade.unit}</td>
                                  <td className="p-3 text-center border-b">{trade.materialRate ? formatCurrency(trade.materialRate) : '-'}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.materialCost)}</td>
                                  <td className="p-3 text-center border-b">{trade.laborRate ? formatCurrency(trade.laborRate) : '-'}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.laborCost)}</td>
                                  <td className="p-3 text-center border-b">{trade.subcontractorRate ? formatCurrency(trade.subcontractorRate) : '-'}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.subcontractorCost)}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.totalCost)}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300">{(trade.markupPercent || defaultMarkupPercent).toFixed(1)}%</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.totalCost * ((trade.markupPercent || defaultMarkupPercent) / 100))}</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300">{(((trade.markupPercent || defaultMarkupPercent) / (100 + (trade.markupPercent || defaultMarkupPercent))) * 100).toFixed(1)}%</td>
                                  <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.totalCost * (1 + (trade.markupPercent || defaultMarkupPercent) / 100))}</td>
                                  <td className="p-3 text-center border-b">
                                    <div className="flex gap-1 flex-wrap">
                                      <Button size="sm" variant="outline" onClick={() => onEditTrade(trade)}>Edit</Button>
                                      {isOnlineMode() && (
                                        <Button 
                                          size="sm" 
                                          variant="outline"
                                          onClick={() => onAddSubItem(trade.id)}
                                          title="Add sub-item"
                                        >
                                          <PlusCircle className="w-3 h-3 mr-1" />
                                          Sub-item
                                        </Button>
                                      )}
                                      {onRequestQuote && (
                                        <Button 
                                          size="sm" 
                                          variant="outline"
                                          onClick={() => onRequestQuote(trade)}
                                          className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white"
                                        >
                                          <Mail className="w-3 h-3 mr-1" />
                                          Quote
                                        </Button>
                                      )}
                                      <Button size="sm" variant="destructive" onClick={() => onDeleteTrade(trade.id)}>Delete</Button>
                                    </div>
                                  </td>
                                </tr>
                                {isTradeExpanded && tradeSubItems.map((subItem: SubItem) => (
                                  <tr key={subItem.id} className="bg-blue-50 hover:bg-blue-100">
                                    <td className="p-3 border-b pl-20 border-r-2 border-gray-300">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm">{subItem.name}</span>
                                      </div>
                                    </td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm">{subItem.quantity}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm">{(UNIT_TYPES[subItem.unit as UnitType]?.abbreviation) || subItem.unit}</td>
                                    <td className="p-3 text-center border-b text-sm">{subItem.materialRate ? formatCurrency(subItem.materialRate) : '-'}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm">{formatCurrency(subItem.materialCost)}</td>
                                    <td className="p-3 text-center border-b text-sm">{subItem.laborRate ? formatCurrency(subItem.laborRate) : '-'}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm">{formatCurrency(subItem.laborCost)}</td>
                                    <td className="p-3 text-center border-b text-sm">{subItem.subcontractorRate ? formatCurrency(subItem.subcontractorRate) : '-'}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm">{formatCurrency(subItem.subcontractorCost)}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm font-semibold">{formatCurrency(subItem.totalCost)}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm">{(subItem.markupPercent || defaultMarkupPercent).toFixed(1)}%</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm">{formatCurrency(subItem.totalCost * ((subItem.markupPercent || defaultMarkupPercent) / 100))}</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm">{(((subItem.markupPercent || defaultMarkupPercent) / (100 + (subItem.markupPercent || defaultMarkupPercent))) * 100).toFixed(1)}%</td>
                                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-sm font-semibold">{formatCurrency(subItem.totalCost * (1 + (subItem.markupPercent || defaultMarkupPercent) / 100))}</td>
                                    <td className="p-3 text-center border-b">
                                      <div className="flex gap-1">
                                        <Button size="sm" variant="outline" onClick={() => onEditSubItem(trade.id, subItem)}>Edit</Button>
                                        <Button size="sm" variant="destructive" onClick={() => onDeleteSubItem(subItem.id, trade.id)}>Delete</Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
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
                  <td colSpan={15} className="p-8 text-center text-gray-500">
                    No cost items added yet. Click "Add Cost Item" to get started.
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
  onSave: (data: TradeFormData) => Promise<void>
  onCancel: () => void
  isAdding: boolean
  projectId: string
  availableSubcontractors: DirectorySubcontractor[]
}

function TradeForm({ trade, onSave, onCancel, isAdding, projectId, availableSubcontractors }: TradeFormProps) {
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
                            return {
                              ...prev,
                              name: template.name,
                              unit: template.defaultUnit,
                              isSubcontracted: template.isSubcontracted,
                              materialRate: template.defaultMaterialRate,
                              laborRate: template.defaultLaborRate,
                              subcontractorCost: template.defaultSubcontractorCost || 0,
                              materialCost: (template.defaultMaterialRate || 0) * qty,
                              laborCost: (template.defaultLaborRate || 0) * qty,
                            }
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
                      
                      return {
                        ...prev,
                        quantity: qty,
                        materialCost: newMaterialCost,
                        laborCost: newLaborCost,
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
              Use quote request feature to get quotes from subcontractors in your directory
            </p>

              <div>
              <Label htmlFor="markupPercent">Markup % (for this item)</Label>
                <Input
                id="markupPercent"
                  type="number"
                step="0.1"
                value={formData.markupPercent || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, markupPercent: parseFloat(e.target.value) || 0 }))}
                placeholder="e.g., 11.1"
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
  })

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="subItemQuantity">Quantity</Label>
                <Input
                  id="subItemQuantity"
                  type="number"
                  step="0.01"
                  value={formData.quantity || 0}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div>
              <Label htmlFor="subItemMarkupPercent">Markup %</Label>
              <Input
                id="subItemMarkupPercent"
                type="number"
                step="0.1"
                value={formData.markupPercent || defaultMarkupPercent}
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
