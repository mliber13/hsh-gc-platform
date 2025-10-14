// ============================================================================
// HSH GC Platform - Schedule Builder
// ============================================================================
//
// Manage project schedule with auto-generation from estimate items
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Project, Trade, ScheduleItem, ProjectSchedule } from '@/types'
import { getTradesForEstimate, updateProject } from '@/services'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TRADE_CATEGORIES } from '@/types'
import {
  ArrowLeft,
  Calendar,
  Clock,
  PlayCircle,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface ScheduleBuilderProps {
  project: Project
  onBack: () => void
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function ScheduleBuilder({ project, onBack }: ScheduleBuilderProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([])
  const [projectStartDate, setProjectStartDate] = useState<Date>(project.startDate || new Date())
  const [projectEndDate, setProjectEndDate] = useState<Date>(project.endDate || new Date())

  // Load trades and initialize schedule
  useEffect(() => {
    if (project) {
      const loadedTrades = getTradesForEstimate(project.estimate.id)
      setTrades(loadedTrades)

      // Load existing schedule or auto-generate
      if (project.schedule && project.schedule.items.length > 0) {
        setScheduleItems(project.schedule.items)
        setProjectStartDate(project.schedule.startDate)
        setProjectEndDate(project.schedule.endDate)
      } else {
        // Auto-generate schedule items from trades
        generateScheduleFromTrades(loadedTrades)
      }
    }
  }, [project])

  const generateScheduleFromTrades = (tradeList: Trade[]) => {
    // Group trades by category
    const grouped = tradeList.reduce((acc, trade) => {
      if (!acc[trade.category]) {
        acc[trade.category] = []
      }
      acc[trade.category].push(trade)
      return acc
    }, {} as Record<string, Trade[]>)

    // Generate schedule items (one per trade item)
    let currentDate = new Date(projectStartDate)
    const items: ScheduleItem[] = []
    
    Object.entries(grouped).forEach(([category, categoryTrades], categoryIndex) => {
      categoryTrades.forEach((trade, tradeIndex) => {
        const startDate = new Date(currentDate)
        const duration = 5 // Default 5 days per item
        const endDate = new Date(currentDate)
        endDate.setDate(endDate.getDate() + duration)

        items.push({
          id: uuidv4(),
          scheduleId: '', // Will be set when schedule is created
          name: trade.name,
          description: trade.description,
          trade: trade.category,
          startDate,
          endDate,
          duration,
          predecessorIds: [], // Can be set manually
          status: 'not-started',
          percentComplete: 0,
        })

        // Move to next item (add 1 day buffer between items)
        currentDate = new Date(endDate)
        currentDate.setDate(currentDate.getDate() + 1)
      })
    })

    setScheduleItems(items)
    
    // Update project end date based on schedule
    if (items.length > 0) {
      const lastItem = items[items.length - 1]
      setProjectEndDate(lastItem.endDate)
    }
  }

  const handleRegenerateSchedule = () => {
    if (confirm('This will regenerate the schedule from your estimate items. Any manual changes will be lost. Continue?')) {
      generateScheduleFromTrades(trades)
    }
  }

  const handleUpdateScheduleItem = (itemId: string, updates: Partial<ScheduleItem>) => {
    setScheduleItems(items =>
      items.map(item => {
        if (item.id === itemId) {
          const updated = { ...item, ...updates }
          
          // Recalculate end date if duration or start date changed
          if (updates.duration !== undefined || updates.startDate !== undefined) {
            const startDate = updates.startDate || item.startDate
            const duration = updates.duration || item.duration
            const endDate = new Date(startDate)
            endDate.setDate(endDate.getDate() + duration)
            updated.endDate = endDate
          }
          
          return updated
        }
        return item
      })
    )
  }

  const handleSaveSchedule = () => {
    const schedule: ProjectSchedule = {
      projectId: project.id,
      startDate: projectStartDate,
      endDate: projectEndDate,
      duration: Math.ceil((projectEndDate.getTime() - projectStartDate.getTime()) / (1000 * 60 * 60 * 24)),
      items: scheduleItems,
      milestones: [],
      percentComplete: scheduleItems.reduce((sum, item) => sum + item.percentComplete, 0) / (scheduleItems.length || 1),
      daysElapsed: Math.ceil((new Date().getTime() - projectStartDate.getTime()) / (1000 * 60 * 60 * 24)),
      daysRemaining: Math.ceil((projectEndDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
      isOnSchedule: true,
      daysAheadBehind: 0,
    }

    updateProject(project.id, { schedule })
    alert('✅ Schedule saved successfully!')
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const getStatusColor = (status: ScheduleItem['status']) => {
    switch (status) {
      case 'complete': return 'bg-green-100 text-green-800 border-green-300'
      case 'in-progress': return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'delayed': return 'bg-red-100 text-red-800 border-red-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusIcon = (status: ScheduleItem['status']) => {
    switch (status) {
      case 'complete': return <CheckCircle className="w-4 h-4" />
      case 'in-progress': return <PlayCircle className="w-4 h-4" />
      case 'delayed': return <AlertCircle className="w-4 h-4" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  const totalDays = scheduleItems.reduce((sum, item) => sum + item.duration, 0)
  const completedDays = scheduleItems
    .filter(item => item.status === 'complete')
    .reduce((sum, item) => sum + item.duration, 0)
  const percentComplete = totalDays > 0 ? (completedDays / totalDays) * 100 : 0

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <div className="p-2 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Header */}
          <ScheduleBuilderHeader project={project} onBack={onBack} />

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Start Date</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">
                      {projectStartDate.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="bg-blue-100 rounded-full p-3">
                    <Calendar className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">End Date</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">
                      {projectEndDate.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="bg-orange-100 rounded-full p-3">
                    <Calendar className="w-8 h-8 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Duration</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">
                      {totalDays} days
                    </p>
                  </div>
                  <div className="bg-purple-100 rounded-full p-3">
                    <Clock className="w-8 h-8 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Progress</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">
                      {percentComplete.toFixed(0)}%
                    </p>
                  </div>
                  <div className="bg-green-100 rounded-full p-3">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleSaveSchedule}
              className="flex-1 sm:flex-none bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Save Schedule
            </Button>
            <Button
              onClick={handleRegenerateSchedule}
              variant="outline"
              className="flex-1 sm:flex-none border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate from Estimate
            </Button>
          </div>

          {/* Schedule Items */}
          <Card>
            <CardHeader>
              <CardTitle>Schedule Items</CardTitle>
            </CardHeader>
            <CardContent>
              {scheduleItems.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">No Schedule Items</p>
                  <p>Add items to your estimate first, then click "Regenerate from Estimate"</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {scheduleItems.map((item, index) => (
                    <Card key={item.id} className="border-2">
                      <CardContent className="pt-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xl">
                                {TRADE_CATEGORIES[item.trade as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                              </span>
                              <div>
                                <h4 className="font-semibold text-gray-900">{item.name}</h4>
                                <p className="text-xs text-gray-500">
                                  {TRADE_CATEGORIES[item.trade as keyof typeof TRADE_CATEGORIES]?.label || item.trade}
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                              <div>
                                <Label htmlFor={`start-${item.id}`} className="text-xs">Start Date</Label>
                                <Input
                                  id={`start-${item.id}`}
                                  type="date"
                                  value={item.startDate instanceof Date && !isNaN(item.startDate.getTime()) 
                                    ? item.startDate.toISOString().split('T')[0] 
                                    : new Date().toISOString().split('T')[0]}
                                  onChange={(e) => handleUpdateScheduleItem(item.id, { 
                                    startDate: new Date(e.target.value) 
                                  })}
                                  className="text-sm"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`duration-${item.id}`} className="text-xs">Duration (days)</Label>
                                <Input
                                  id={`duration-${item.id}`}
                                  type="number"
                                  value={item.duration}
                                  onChange={(e) => handleUpdateScheduleItem(item.id, { 
                                    duration: parseInt(e.target.value) || 1 
                                  })}
                                  className="text-sm"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`status-${item.id}`} className="text-xs">Status</Label>
                                <Select
                                  value={item.status}
                                  onValueChange={(value: any) => handleUpdateScheduleItem(item.id, { status: value })}
                                >
                                  <SelectTrigger className="text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="not-started">Not Started</SelectItem>
                                    <SelectItem value="in-progress">In Progress</SelectItem>
                                    <SelectItem value="complete">Complete</SelectItem>
                                    <SelectItem value="delayed">Delayed</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="mt-3">
                              <Label htmlFor={`progress-${item.id}`} className="text-xs">
                                Progress: {item.percentComplete}%
                              </Label>
                              <Input
                                id={`progress-${item.id}`}
                                type="range"
                                min="0"
                                max="100"
                                value={item.percentComplete}
                                onChange={(e) => handleUpdateScheduleItem(item.id, { 
                                  percentComplete: parseInt(e.target.value) 
                                })}
                                className="w-full"
                              />
                            </div>
                          </div>

                          <div className="flex sm:flex-col gap-2">
                            <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(item.status)}`}>
                              {getStatusIcon(item.status)}
                              {item.status.replace('-', ' ').toUpperCase()}
                            </div>
                            <div className="text-sm text-gray-600">
                              <p className="font-semibold">
                                End: {item.endDate instanceof Date && !isNaN(item.endDate.getTime()) 
                                  ? item.endDate.toLocaleDateString() 
                                  : 'N/A'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile Back Button */}
      {onBack && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg z-40">
          <Button onClick={onBack} variant="outline" className="border-gray-300 hover:bg-gray-50 w-full">
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

interface ScheduleBuilderHeaderProps {
  project: Project
  onBack?: () => void
}

function ScheduleBuilderHeader({ project, onBack }: ScheduleBuilderHeaderProps) {
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
                <h1 className="text-lg font-bold text-gray-900">Project Schedule</h1>
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
                <h2 className="text-xl sm:text-4xl lg:text-5xl font-bold text-gray-900">Project Schedule</h2>
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

