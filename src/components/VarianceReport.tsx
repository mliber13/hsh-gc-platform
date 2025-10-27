// ============================================================================
// HSH GC Platform - Variance Report
// ============================================================================
//
// Compare estimated vs actual costs to track project performance
// Shows variance by category and provides budget status
//

import React, { useState, useEffect } from 'react'
import { Project, Trade } from '@/types'
import { getTradesForEstimate_Hybrid, getProjectActuals_Hybrid } from '@/services/hybridService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TRADE_CATEGORIES, CATEGORY_GROUPS, getCategoryGroup } from '@/types'
import { 
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  FileText,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  BarChart3,
} from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface VarianceReportProps {
  project: Project
  onBack: () => void
}

interface CategoryVariance {
  category: string
  estimated: number
  actual: number
  variance: number
  variancePercent: number
  trades: Trade[]
}

interface GroupVariance {
  group: string
  estimated: number
  actual: number
  variance: number
  variancePercent: number
  categories: CategoryVariance[]
}

interface TradeVariance {
  trade: Trade
  estimated: number
  actual: number
  variance: number
  variancePercent: number
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function VarianceReport({ project, onBack }: VarianceReportProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [categoryVariances, setCategoryVariances] = useState<CategoryVariance[]>([])
  const [groupVariances, setGroupVariances] = useState<GroupVariance[]>([])
  const [totalEstimated, setTotalEstimated] = useState(0)
  const [totalActual, setTotalActual] = useState(0)
  const [totalVariance, setTotalVariance] = useState(0)
  const [totalVariancePercent, setTotalVariancePercent] = useState(0)

  // Load trades and calculate variance
  useEffect(() => {
    const loadData = async () => {
      if (project) {
        const loadedTrades = await getTradesForEstimate_Hybrid(project.estimate.id)
        setTrades(loadedTrades)

        // Get actuals
        const actuals = await getProjectActuals_Hybrid(project.id)

      // Calculate total estimated (with markup and contingency)
      const basePriceTotal = loadedTrades.reduce((sum, trade) => sum + trade.totalCost, 0)
      const grossProfitTotal = loadedTrades.reduce((sum, trade) => {
        const markup = trade.markupPercent || 11.1
        return sum + (trade.totalCost * (markup / 100))
      }, 0)
      const contingency = basePriceTotal * 0.10
      const estimated = basePriceTotal + grossProfitTotal + contingency
      setTotalEstimated(estimated)

      // Calculate total actual
      const actual = actuals?.totalActualCost || 0
      setTotalActual(actual)

      // Calculate variance
      const variance = actual - estimated
      const variancePercent = estimated > 0 ? (variance / estimated) * 100 : 0
      setTotalVariance(variance)
      setTotalVariancePercent(variancePercent)

      // Group trades by category and calculate variance
      const categoryMap = new Map<string, CategoryVariance>()
      
      loadedTrades.forEach(trade => {
        const tradeEstimated = trade.totalCost * (1 + (trade.markupPercent || 11.1) / 100)
        
        // Get actual costs for this trade
        const tradeActual = actuals 
          ? [
              ...(actuals.laborEntries?.filter(e => e.tradeId === trade.id) || []),
              ...(actuals.materialEntries?.filter(e => e.tradeId === trade.id) || []),
              ...(actuals.subcontractorEntries?.filter(e => e.tradeId === trade.id) || []),
            ].reduce((sum, entry) => {
              if ('totalCost' in entry) return sum + entry.totalCost
              if ('totalPaid' in entry) return sum + entry.totalPaid
              return sum
            }, 0)
          : 0

        if (!categoryMap.has(trade.category)) {
          categoryMap.set(trade.category, {
            category: trade.category,
            estimated: 0,
            actual: 0,
            variance: 0,
            variancePercent: 0,
            trades: [],
          })
        }

        const categoryData = categoryMap.get(trade.category)!
        categoryData.estimated += tradeEstimated
        categoryData.actual += tradeActual
        categoryData.trades.push(trade)
      })

      // Calculate variance for each category
      const variances = Array.from(categoryMap.values()).map(cat => {
        const variance = cat.actual - cat.estimated
        const variancePercent = cat.estimated > 0 ? (variance / cat.estimated) * 100 : 0
        return {
          ...cat,
          variance,
          variancePercent,
        }
      })

      setCategoryVariances(variances)

      // Group categories by group and calculate group variances
      const groupMap = new Map<string, GroupVariance>()
      
      variances.forEach(categoryVariance => {
        const category = categoryVariance.category
        const group = loadedTrades.find(t => t.category === category)?.group || getCategoryGroup(category as any)
        
        if (!groupMap.has(group)) {
          groupMap.set(group, {
            group,
            estimated: 0,
            actual: 0,
            variance: 0,
            variancePercent: 0,
            categories: [],
          })
        }
        
        const groupData = groupMap.get(group)!
        groupData.estimated += categoryVariance.estimated
        groupData.actual += categoryVariance.actual
        groupData.categories.push(categoryVariance)
      })
      
      // Calculate group variances
      const groupVariances = Array.from(groupMap.values()).map(group => {
        const variance = group.actual - group.estimated
        const variancePercent = group.estimated > 0 ? (variance / group.estimated) * 100 : 0
        return {
          ...group,
          variance,
          variancePercent,
        }
      })

      setGroupVariances(groupVariances)
      }
    }
    
    loadData()
  }, [project])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatPercent = (percent: number) => {
    const sign = percent > 0 ? '+' : ''
    return `${sign}${percent.toFixed(1)}%`
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

  const getBudgetStatus = () => {
    if (totalActual === 0) return { label: 'No Actuals', color: 'bg-gray-100 text-gray-800' }
    if (Math.abs(totalVariancePercent) < 5) return { label: 'On Track', color: 'bg-green-100 text-green-800' }
    if (totalVariance > 0) return { label: 'Over Budget', color: 'bg-red-100 text-red-800' }
    return { label: 'Under Budget', color: 'bg-blue-100 text-blue-800' }
  }

  const budgetStatus = getBudgetStatus()

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <div className="p-2 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Header */}
          <VarianceReportHeader project={project} onBack={onBack} />

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Estimated</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {formatCurrency(totalEstimated)}
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
                    <p className="text-sm text-gray-600">Total Actual</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {formatCurrency(totalActual)}
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
                      totalVariance > 0 ? 'text-red-600' : totalVariance < 0 ? 'text-green-600' : 'text-gray-900'
                    }`}>
                      {formatCurrency(Math.abs(totalVariance))}
                    </p>
                    <p className={`text-sm font-medium mt-1 ${
                      totalVariance > 0 ? 'text-red-600' : totalVariance < 0 ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {formatPercent(totalVariancePercent)}
                    </p>
                  </div>
                  <div className={`rounded-full p-3 ${
                    totalVariance > 0 ? 'bg-red-100' : totalVariance < 0 ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    {totalVariance > 0 ? <TrendingUp className="w-8 h-8 text-red-600" /> :
                     totalVariance < 0 ? <TrendingDown className="w-8 h-8 text-green-600" /> :
                     <Minus className="w-8 h-8 text-gray-600" />}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Budget Status</p>
                    <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-2 ${budgetStatus.color}`}>
                      {budgetStatus.label}
                    </div>
                  </div>
                  <div className={`rounded-full p-3 ${
                    budgetStatus.label === 'Over Budget' ? 'bg-red-100' :
                    budgetStatus.label === 'Under Budget' ? 'bg-blue-100' :
                    budgetStatus.label === 'On Track' ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    {budgetStatus.label === 'Over Budget' ? <AlertTriangle className="w-8 h-8 text-red-600" /> :
                     budgetStatus.label === 'On Track' ? <CheckCircle className="w-8 h-8 text-green-600" /> :
                     <BarChart3 className="w-8 h-8 text-gray-600" />}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Variance by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Variance by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {totalActual === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">No Actual Costs Yet</p>
                  <p>Add entries in Project Actuals to see variance analysis</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Group Rollup Section */}
                  {groupVariances.map((groupVar) => {
                    const isGroupExpanded = expandedCategories.has(`group_${groupVar.group}`)
                    const isOver = groupVar.variance > 0
                    const isUnder = groupVar.variance < 0

                    return (
                      <Card key={groupVar.group} className="border-2 border-blue-200 bg-blue-50">
                        <button
                          onClick={() => toggleCategory(`group_${groupVar.group}`)}
                          className="w-full p-4 flex items-center justify-between hover:bg-blue-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">
                              {CATEGORY_GROUPS[groupVar.group as keyof typeof CATEGORY_GROUPS]?.icon || '📦'}
                            </span>
                            <div className="text-left">
                              <p className="font-bold text-blue-800">
                                {CATEGORY_GROUPS[groupVar.group as keyof typeof CATEGORY_GROUPS]?.label || groupVar.group}
                              </p>
                              <p className="text-xs text-blue-600">
                                {groupVar.categories.length} categories
                              </p>
                            </div>
                          </div>
                          
                          {/* Three Column Display */}
                          <div className="flex items-center gap-6">
                            <div className="text-right min-w-[120px]">
                              <p className="text-xs text-gray-600">Estimated</p>
                              <p className="font-bold text-blue-800">{formatCurrency(groupVar.estimated)}</p>
                            </div>
                            <div className="text-right min-w-[120px]">
                              <p className="text-xs text-gray-600">Actual</p>
                              <p className="font-bold text-blue-800">{formatCurrency(groupVar.actual)}</p>
                            </div>
                            <div className="text-right min-w-[140px]">
                              <p className="text-xs text-gray-600">Variance</p>
                              <div className="flex items-center justify-end gap-2">
                                <p className={`font-bold ${isOver ? 'text-red-600' : isUnder ? 'text-green-600' : 'text-blue-800'}`}>
                                  {formatCurrency(Math.abs(groupVar.variance))}
                                </p>
                                {isOver && <span className="text-red-600">⚠️</span>}
                                {isUnder && <span className="text-green-600">✅</span>}
                              </div>
                              <p className={`text-xs font-medium ${isOver ? 'text-red-600' : isUnder ? 'text-green-600' : 'text-gray-600'}`}>
                                {formatPercent(groupVar.variancePercent)}
                              </p>
                            </div>
                            <div className="flex items-center">
                              {isGroupExpanded ? <ChevronUp className="w-5 h-5 text-blue-600" /> : <ChevronDown className="w-5 h-5 text-blue-600" />}
                            </div>
                          </div>
                        </button>

                        {isGroupExpanded && (
                          <div className="border-t border-blue-200 bg-white p-4">
                            <div className="space-y-3">
                              {groupVar.categories.map((categoryVar) => {
                                const isCategoryExpanded = expandedCategories.has(categoryVar.category)
                                const isOver = categoryVar.variance > 0
                                const isUnder = categoryVar.variance < 0

                                return (
                                  <Card key={categoryVar.category} className="border border-gray-200">
                                    <button
                                      onClick={() => toggleCategory(categoryVar.category)}
                                      className="w-full p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="text-lg">
                                          {TRADE_CATEGORIES[categoryVar.category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                                        </span>
                                        <div className="text-left">
                                          <p className="font-semibold text-gray-900">
                                            {TRADE_CATEGORIES[categoryVar.category as keyof typeof TRADE_CATEGORIES]?.label || categoryVar.category}
                                          </p>
                                          <p className="text-xs text-gray-500">
                                            {categoryVar.trades.length} items
                                          </p>
                                        </div>
                                      </div>
                                      
                                      {/* Three Column Display */}
                                      <div className="flex items-center gap-6">
                                        <div className="text-right min-w-[120px]">
                                          <p className="text-xs text-gray-600">Estimated</p>
                                          <p className="font-semibold text-gray-900">{formatCurrency(categoryVar.estimated)}</p>
                                        </div>
                                        <div className="text-right min-w-[120px]">
                                          <p className="text-xs text-gray-600">Actual</p>
                                          <p className="font-semibold text-gray-900">{formatCurrency(categoryVar.actual)}</p>
                                        </div>
                                        <div className="text-right min-w-[140px]">
                                          <p className="text-xs text-gray-600">Variance</p>
                                          <div className="flex items-center justify-end gap-2">
                                            <p className={`font-semibold ${isOver ? 'text-red-600' : isUnder ? 'text-green-600' : 'text-gray-900'}`}>
                                              {formatCurrency(Math.abs(categoryVar.variance))}
                                            </p>
                                            {isOver && <span className="text-red-600">⚠️</span>}
                                            {isUnder && <span className="text-green-600">✅</span>}
                                          </div>
                                          <p className={`text-xs font-medium ${isOver ? 'text-red-600' : isUnder ? 'text-green-600' : 'text-gray-600'}`}>
                                            {formatPercent(categoryVar.variancePercent)}
                                          </p>
                                        </div>
                                        <div className="flex items-center">
                                          {isCategoryExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </div>
                                      </div>
                                    </button>

                                    {isCategoryExpanded && (
                                      <div className="border-t border-gray-200 bg-gray-50 p-3">
                                        <div className="space-y-2">
                                          {categoryVar.trades.map((trade) => {
                                            const tradeEstimated = trade.totalCost * (1 + (trade.markupPercent || 11.1) / 100)
                                            const tradeActual = 0 // This would need to be calculated from actuals
                                            const tradeVariance = tradeActual - tradeEstimated
                                            const tradeVariancePercent = tradeEstimated > 0 ? (tradeVariance / tradeEstimated) * 100 : 0

                                            return (
                                              <div key={trade.id} className="bg-white rounded-lg p-3 border border-gray-200">
                                                <div className="flex items-center justify-between mb-2">
                                                  <h4 className="font-medium text-gray-900">{trade.name}</h4>
                                                  <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                      <p className="text-xs text-gray-600">Estimated</p>
                                                      <p className="font-medium text-gray-900">{formatCurrency(tradeEstimated)}</p>
                                                    </div>
                                                    <div className="text-right">
                                                      <p className="text-xs text-gray-600">Actual</p>
                                                      <p className="font-medium text-gray-900">{formatCurrency(tradeActual)}</p>
                                                    </div>
                                                    <div className="text-right">
                                                      <p className="text-xs text-gray-600">Variance</p>
                                                      <p className={`font-medium ${tradeVariance > 0 ? 'text-red-600' : tradeVariance < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                                        {formatCurrency(Math.abs(tradeVariance))}
                                                      </p>
                                                      <p className={`text-xs ${tradeVariance > 0 ? 'text-red-600' : tradeVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                                        {formatPercent(tradeVariancePercent)}
                                                      </p>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </Card>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </Card>
                    )
                  })}
                  
                  {/* Original Category Variances (for backward compatibility) */}
                  {categoryVariances.filter(cv => !groupVariances.some(gv => gv.categories.includes(cv))).map((categoryVar) => {
                    const isExpanded = expandedCategories.has(categoryVar.category)
                    const isOver = categoryVar.variance > 0
                    const isUnder = categoryVar.variance < 0

                    return (
                      <Card key={categoryVar.category} className="border-2">
                        <button
                          onClick={() => toggleCategory(categoryVar.category)}
                          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">
                              {TRADE_CATEGORIES[categoryVar.category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                            </span>
                            <div className="text-left">
                              <p className="font-bold text-gray-900">
                                {TRADE_CATEGORIES[categoryVar.category as keyof typeof TRADE_CATEGORIES]?.label || categoryVar.category}
                              </p>
                              <p className="text-xs text-gray-500">
                                {categoryVar.trades.length} items
                              </p>
                            </div>
                          </div>
                          
                          {/* Three Column Display */}
                          <div className="flex items-center gap-6">
                            <div className="text-right min-w-[120px]">
                              <p className="text-xs text-gray-600">Estimated</p>
                              <p className="font-bold text-gray-900">{formatCurrency(categoryVar.estimated)}</p>
                            </div>
                            <div className="text-right min-w-[120px]">
                              <p className="text-xs text-gray-600">Actual</p>
                              <p className="font-bold text-gray-900">{formatCurrency(categoryVar.actual)}</p>
                            </div>
                            <div className="text-right min-w-[140px]">
                              <p className="text-xs text-gray-600">Variance</p>
                              <div className="flex items-center justify-end gap-2">
                                <p className={`font-bold ${isOver ? 'text-red-600' : isUnder ? 'text-green-600' : 'text-gray-900'}`}>
                                  {formatCurrency(Math.abs(categoryVar.variance))}
                                </p>
                                {isOver && <span className="text-red-600">⚠️</span>}
                                {isUnder && <span className="text-green-600">✓</span>}
                              </div>
                              <p className={`text-xs ${isOver ? 'text-red-600' : isUnder ? 'text-green-600' : 'text-gray-600'}`}>
                                {formatPercent(categoryVar.variancePercent)}
                              </p>
                            </div>
                            {isExpanded ? <ChevronUp className="w-5 h-5 ml-2" /> : <ChevronDown className="w-5 h-5 ml-2" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50 p-4">
                            <div className="space-y-3">
                              {categoryVar.trades.map((trade) => {
                                const tradeEstimated = trade.totalCost * (1 + (trade.markupPercent || 11.1) / 100)
                                
                                // Get actuals for this specific trade (simplified for now)
                                const tradeActual = 0 // TODO: Calculate from loaded actuals

                                const tradeVariance = tradeActual - tradeEstimated
                                const tradeVariancePercent = tradeEstimated > 0 ? (tradeVariance / tradeEstimated) * 100 : 0
                                const isTradeOver = tradeVariance > 0
                                const isTradeUnder = tradeVariance < 0

                                return (
                                  <div key={trade.id} className="bg-white rounded-lg p-4 border border-gray-200">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <h4 className="font-semibold text-gray-900">{trade.name}</h4>
                                        <p className="text-sm text-gray-600">
                                          {trade.quantity} {trade.unit}
                                        </p>
                                      </div>
                                      
                                      <div className="flex gap-6 text-sm">
                                        <div className="text-right min-w-[100px]">
                                          <p className="text-xs text-gray-600">Estimated</p>
                                          <p className="font-bold text-gray-900">{formatCurrency(tradeEstimated)}</p>
                                        </div>
                                        <div className="text-right min-w-[100px]">
                                          <p className="text-xs text-gray-600">Actual</p>
                                          <p className="font-bold text-gray-900">{formatCurrency(tradeActual)}</p>
                                        </div>
                                        <div className="text-right min-w-[120px]">
                                          <p className="text-xs text-gray-600">Variance</p>
                                          <div className="flex items-center justify-end gap-2">
                                            <p className={`font-bold ${isTradeOver ? 'text-red-600' : isTradeUnder ? 'text-green-600' : 'text-gray-900'}`}>
                                              {formatCurrency(Math.abs(tradeVariance))}
                                            </p>
                                            {isTradeOver && <span className="text-red-600">⚠️</span>}
                                            {isTradeUnder && <span className="text-green-600">✓</span>}
                                          </div>
                                          <p className={`text-xs ${isTradeOver ? 'text-red-600' : isTradeUnder ? 'text-green-600' : 'text-gray-600'}`}>
                                            {formatPercent(tradeVariancePercent)}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </Card>
                    )
                  })}

                  {categoryVariances.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      No estimate items found.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

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

interface VarianceReportHeaderProps {
  project: Project
  onBack?: () => void
}

function VarianceReportHeader({ project, onBack }: VarianceReportHeaderProps) {
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
                <h1 className="text-lg font-bold text-gray-900">Variance Report</h1>
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
                <h2 className="text-xl sm:text-4xl lg:text-5xl font-bold text-gray-900">Variance Report</h2>
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

