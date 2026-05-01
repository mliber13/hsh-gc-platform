// ============================================================================
// HSH GC Platform - Schedule Builder
// ============================================================================
//
// Manage project schedule with auto-generation from estimate items
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Project, Trade, ScheduleItem, ProjectSchedule, ScheduleItemType } from '@/types'
import { getTradesForEstimate_Hybrid, updateProject_Hybrid } from '@/services/hybridService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTradeCategories } from '@/contexts/TradeCategoriesContext'
import { getCategoryAccentLeftBorderStyle } from '@/lib/categoryAccent'
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  CalendarDays,
  Clock,
  PlayCircle,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Link2,
  Briefcase,
  HardHat,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  List,
} from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  isWithinInterval,
  startOfDay,
  endOfDay,
  addDays,
} from 'date-fns'
import { toLocalDate, toLocalEndOfDay, getItemColsForWeek as getItemColsForWeekUtil } from '@/lib/scheduleCalendarUtils'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { toast } from 'sonner'

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
  const { byKey } = useTradeCategories()
  const [trades, setTrades] = useState<Trade[]>([])
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([])
  const [projectStartDate, setProjectStartDate] = useState<Date>(project.startDate || new Date())
  const [projectEndDate, setProjectEndDate] = useState<Date>(project.endDate || new Date())
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [scheduleView, setScheduleView] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => project.startDate ? new Date(project.startDate) : new Date())
  const [editingItemId, setEditingItemId] = useState<string | null>(null)

  // Centered title in the AppHeader
  usePageTitle('Schedule')

  // Load trades and initialize schedule (async when using hybrid)
  useEffect(() => {
    let cancelled = false
    if (project) {
      ;(async () => {
        const loadedTrades = await getTradesForEstimate_Hybrid(project.estimate.id)
        if (cancelled) return
        setTrades(loadedTrades)

        if (project.schedule && project.schedule.items.length > 0) {
          setScheduleItems(project.schedule.items)
          setProjectStartDate(project.schedule.startDate)
          setProjectEndDate(project.schedule.endDate)
        } else {
          generateScheduleFromTrades(loadedTrades)
        }
      })()
      return () => { cancelled = true }
    }
  }, [project?.id])

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
          type: 'field',
          name: trade.name,
          description: trade.description,
          trade: trade.category,
          estimateTradeId: trade.id,
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
      setHasUnsavedChanges(true)
    }
  }

  const handleAddOfficeItem = () => {
    const lastEnd = scheduleItems.length > 0
      ? new Date(scheduleItems[scheduleItems.length - 1].endDate)
      : new Date(projectStartDate)
    lastEnd.setDate(lastEnd.getDate() + 1)
    const startDate = new Date(lastEnd)
    const duration = 1
    const endDate = new Date(lastEnd)
    endDate.setDate(endDate.getDate() + duration)
    setScheduleItems(items => [...items, {
      id: uuidv4(),
      scheduleId: '',
      type: 'office',
      name: 'New office task',
      startDate,
      endDate,
      duration,
      predecessorIds: [],
      status: 'not-started',
      percentComplete: 0,
    }])
    setHasUnsavedChanges(true)
  }

  const handleRemoveScheduleItem = (itemId: string) => {
    if (!confirm('Remove this schedule item?')) return
    setScheduleItems(items => items.filter(i => i.id !== itemId))
    setHasUnsavedChanges(true)
    // If the removed item was open in the edit dialog, close it.
    if (editingItemId === itemId) setEditingItemId(null)
  }

  const handleUpdateScheduleItem = (itemId: string, updates: Partial<ScheduleItem>) => {
    setScheduleItems(items => {
      const updatedItems = items.map(item => {
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

      // If duration or end date changed, cascade to dependent items
      if (updates.duration !== undefined || updates.startDate !== undefined) {
        cascadeDateChanges(updatedItems, itemId)
      }

      return updatedItems
    })
    
    // Mark as having unsaved changes
    setHasUnsavedChanges(true)
  }

  // Cascade date changes to dependent items
  const cascadeDateChanges = (items: ScheduleItem[], changedItemId: string) => {
    const changedItem = items.find(i => i.id === changedItemId)
    if (!changedItem) return

    // Find items that depend on this one
    const dependentItems = items.filter(item => 
      item.predecessorIds.includes(changedItemId)
    )

    dependentItems.forEach(dependent => {
      // Update start date to 1 day after predecessor ends
      const newStartDate = new Date(changedItem.endDate)
      newStartDate.setDate(newStartDate.getDate() + 1)
      
      dependent.startDate = newStartDate
      
      // Recalculate end date
      const newEndDate = new Date(newStartDate)
      newEndDate.setDate(newEndDate.getDate() + dependent.duration)
      dependent.endDate = newEndDate

      // Recursively cascade to items that depend on this one
      cascadeDateChanges(items, dependent.id)
    })
  }

  const handleAutoCalculateDates = () => {
    if (!confirm('Auto-calculate start dates based on predecessors? This will adjust dates for items with dependencies.')) {
      return
    }

    setScheduleItems(items => {
      const updatedItems = [...items]
      
      // Process each item
      updatedItems.forEach(item => {
        if (item.predecessorIds.length > 0) {
          // Find the predecessor
          const predecessor = updatedItems.find(i => i.id === item.predecessorIds[0])
          
          if (predecessor && predecessor.endDate) {
            // Start this item 1 day after predecessor ends
            const newStartDate = new Date(predecessor.endDate)
            newStartDate.setDate(newStartDate.getDate() + 1)
            
            item.startDate = newStartDate
            
            // Recalculate end date
            const newEndDate = new Date(newStartDate)
            newEndDate.setDate(newEndDate.getDate() + item.duration)
            item.endDate = newEndDate
          }
        }
      })
      
      return updatedItems
    })
    
    setHasUnsavedChanges(true)
  }

  const handleSaveSchedule = async () => {
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

    const updated = await updateProject_Hybrid(project.id, { schedule })
    if (updated) {
      setHasUnsavedChanges(false)
      toast.success('Schedule saved')
    } else {
      toast.error('Failed to save schedule. Please try again.')
    }
  }

  // Auto-save changes after a delay
  useEffect(() => {
    if (hasUnsavedChanges && scheduleItems.length > 0) {
      const timer = setTimeout(() => {
        handleSaveSchedule()
      }, 2000) // Auto-save after 2 seconds of no changes

      return () => clearTimeout(timer)
    }
  }, [scheduleItems, hasUnsavedChanges])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const getStatusColor = (status: ScheduleItem['status']) => {
    switch (status) {
      case 'complete': return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
      case 'in-progress': return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      case 'delayed': return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
      default: return 'bg-muted/40 text-muted-foreground border-border/60'
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

  // Calendar: get schedule items that overlap a given day (used for any day-scoped logic)
  const getItemsForDay = (day: Date): ScheduleItem[] => {
    const d = startOfDay(day)
    return scheduleItems.filter((item) => {
      const start = toLocalDate(item.startDate)
      const end = toLocalEndOfDay(item.endDate)
      return isWithinInterval(d, { start, end })
    })
  }

  // Calendar: build grid of days for current month (including leading/trailing from adjacent months)
  const calendarStart = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 0 })
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  const weekRows = Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, i) => calendarDays.slice(i * 7, (i + 1) * 7))
  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const getItemColsForWeek = (item: ScheduleItem, weekIdx: number) =>
    getItemColsForWeekUtil(calendarStart, item, weekIdx)

  // Editable form body for a schedule item. Used by both the List view (one
  // per item) and the calendar's edit Dialog (single item, opened by clicking
  // a calendar bar). Keeps a single source of truth for fields + handlers.
  const renderItemEditBody = (item: ScheduleItem) => (
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${(item.type ?? 'field') === 'office' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>
              {(item.type ?? 'field') === 'office' ? <Briefcase className="w-3 h-3" /> : <HardHat className="w-3 h-3" />}
              {(item.type ?? 'field') === 'office' ? 'Office' : 'Field'}
            </span>
            <Input
              value={item.name}
              onChange={(e) => handleUpdateScheduleItem(item.id, { name: e.target.value })}
              className="font-semibold text-foreground h-8 max-w-md border-border/60"
              placeholder="Item name"
            />
            {item.predecessorIds.length > 0 && (
              <span className="flex items-center gap-1 text-xs bg-violet-500/15 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded">
                <Link2 className="w-3 h-3" />
                Has Dependency
              </span>
            )}
            {item.estimateTradeId && (
              <span className="text-xs text-muted-foreground">
                Linked: {trades.find(t => t.id === item.estimateTradeId)?.name ?? '—'}
              </span>
            )}
          </div>
          {(item.trade != null) && (
            <p className="text-xs text-muted-foreground">
              {byKey[item.trade]?.label || item.trade}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 shrink-0"
          onClick={() => handleRemoveScheduleItem(item.id)}
          aria-label="Remove schedule item"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        <div>
          <Label htmlFor={`type-${item.id}`} className="text-xs">Type</Label>
          <Select
            value={item.type ?? 'field'}
            onValueChange={(value: ScheduleItemType) => handleUpdateScheduleItem(item.id, { type: value })}
          >
            <SelectTrigger className="text-sm" id={`type-${item.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="field">Field</SelectItem>
              <SelectItem value="office">Office</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(item.type ?? 'field') === 'office' && (
          <div className="col-span-2">
            <Label htmlFor={`trade-${item.id}`} className="text-xs">Related trade (optional)</Label>
            <Select
              value={item.estimateTradeId ?? 'none'}
              onValueChange={(value) => handleUpdateScheduleItem(item.id, {
                estimateTradeId: value === 'none' ? undefined : value,
                trade: value === 'none' ? undefined : trades.find(t => t.id === value)?.category,
              })}
            >
              <SelectTrigger className="text-sm" id={`trade-${item.id}`}>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {trades.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
        <Label htmlFor={`predecessors-${item.id}`} className="text-xs">
          Predecessors (must complete before this starts)
        </Label>
        <Select
          value={item.predecessorIds.length > 0 ? item.predecessorIds[0] : 'none'}
          onValueChange={(value) => {
            if (value === 'none') {
              handleUpdateScheduleItem(item.id, { predecessorIds: [] })
            } else {
              handleUpdateScheduleItem(item.id, { predecessorIds: [value] })
            }
          }}
        >
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="No predecessor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None - Can start immediately</SelectItem>
            {scheduleItems
              .filter(otherItem => otherItem.id !== item.id)
              .map((otherItem) => (
                <SelectItem key={otherItem.id} value={otherItem.id}>
                  {otherItem.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {item.predecessorIds.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Depends on: {scheduleItems.find(si => si.id === item.predecessorIds[0])?.name}
          </p>
        )}
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
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Top action strip — back link only */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Project Overview
        </button>
      </div>

      {/* Unsaved Changes Banner */}
      {hasUnsavedChanges && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Auto-saving in progress…
              </p>
              <p className="text-xs text-muted-foreground">
                Changes will be saved automatically in 2 seconds, or click "Save Schedule" to save immediately.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards — rail-accent pattern */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="relative overflow-hidden border-border/60 bg-card/50">
          <div className="absolute inset-y-0 left-0 w-1 bg-sky-500" aria-hidden />
          <CardContent className="p-4 pl-5">
            <p className="mb-1 text-xs text-muted-foreground">Start Date</p>
            <p className="text-xl font-semibold tabular-nums">{projectStartDate.toLocaleDateString()}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-border/60 bg-card/50">
          <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" aria-hidden />
          <CardContent className="p-4 pl-5">
            <p className="mb-1 text-xs text-muted-foreground">End Date</p>
            <p className="text-xl font-semibold tabular-nums">{projectEndDate.toLocaleDateString()}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-border/60 bg-card/50">
          <div className="absolute inset-y-0 left-0 w-1 bg-violet-500" aria-hidden />
          <CardContent className="p-4 pl-5">
            <p className="mb-1 text-xs text-muted-foreground">Total Duration</p>
            <p className="text-xl font-semibold tabular-nums">{totalDays} days</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-border/60 bg-card/50">
          <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
          <CardContent className="p-4 pl-5">
            <p className="mb-1 text-xs text-muted-foreground">Progress</p>
            <p className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {percentComplete.toFixed(0)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button onClick={handleSaveSchedule}>
          <CheckCircle className="size-4" />
          {hasUnsavedChanges ? 'Save Schedule (Unsaved Changes)' : 'Save Schedule'}
        </Button>
        <Button onClick={handleAutoCalculateDates} variant="outline">
          <Link2 className="size-4" />
          Auto-Calculate Dates
        </Button>
        <Button onClick={handleRegenerateSchedule} variant="outline">
          <RefreshCw className="size-4" />
          Regenerate from Estimate
        </Button>
      </div>

      {/* Schedule Items — flat section pattern */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Schedule Items</h2>
          <div className="flex items-center gap-2">
            <Button onClick={handleAddOfficeItem} size="sm">
              <Plus className="size-4" />
              Add Item
            </Button>
          {scheduleItems.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setScheduleView('list')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    scheduleView === 'list'
                      ? 'bg-card text-foreground shadow'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <List className="size-4" />
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleView('calendar')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    scheduleView === 'calendar'
                      ? 'bg-card text-foreground shadow'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <CalendarDays className="size-4" />
                  Calendar
                </button>
              </div>
              {scheduleView === 'calendar' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCalendarMonth(new Date())}
                  >
                    Today
                  </Button>
                  <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 px-1 py-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="min-w-[140px] text-center text-sm font-medium">
                      {format(calendarMonth, 'MMMM yyyy')}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                      aria-label="Next month"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card/50 p-4">
              {scheduleItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CalendarIcon className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">No Schedule Items</p>
                  <p>Add items to your estimate first, then click "Regenerate from Estimate"</p>
                </div>
              ) : scheduleView === 'calendar' ? (
                <div className="overflow-x-auto overflow-y-visible">
                  <p className="text-xs text-muted-foreground mb-2">One bar per schedule item (spans across its days). Bars appear under the week they belong to.</p>
                  <div className="min-w-[600px]">
                    {/* One 7-column grid: header then per-week date row + bar rows so bars align under that week */}
                    <div className="grid grid-cols-7 border-b border-border/60">
                      {weekDayNames.map((name) => (
                        <div key={name} className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase border-r border-border/60 last:border-r-0">
                          {name}
                        </div>
                      ))}
                      {weekRows.map((row, weekIdx) => {
                        // Precompute which items actually have columns in this week
                        const itemsForWeek = scheduleItems
                          .map((item) => ({
                            item,
                            cols: getItemColsForWeek(item, weekIdx),
                          }))
                          .filter(({ cols }) => cols.length > 0)

                        return (
                          <React.Fragment key={`week-${weekIdx}`}>
                            {/* Date row for this week */}
                            {row.map((day) => (
                              <div
                                key={day.toISOString()}
                                className={`min-h-[48px] border-r border-border/60 last:border-r-0 p-1.5 flex flex-col ${!isSameMonth(day, calendarMonth) ? 'bg-muted/30' : 'bg-card'}`}
                              >
                                <div
                                  className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${!isSameMonth(day, calendarMonth) ? 'text-muted-foreground' : isToday(day) ? 'bg-rose-500 text-white' : 'text-foreground'}`}
                                >
                                  {format(day, 'd')}
                                </div>
                              </div>
                            ))}
                            {/* Bar segments for this week, one row per schedule item that actually spans this week */}
                            {itemsForWeek.map(({ item, cols }) => {
                              const start = toLocalDate(item.startDate)
                              const end = toLocalDate(item.endDate)
                              const accent = getCategoryAccentLeftBorderStyle(item.trade ?? '')
                              const isOffice = (item.type ?? 'field') === 'office'
                              const weekStart = addDays(calendarStart, weekIdx * 7)
                              const weekEnd = addDays(weekStart, 6)
                              const isStartWeek = isWithinInterval(start, { start: weekStart, end: weekEnd })
                              return (
                                <React.Fragment key={`${item.id}-w${weekIdx}`}>
                                  {[0, 1, 2, 3, 4, 5, 6].map((c) => {
                                    const filled = cols.includes(c)
                                    const isLeftEdge = filled && (c === 0 || !cols.includes(c - 1))
                                    const showName = isStartWeek && filled && c === cols[0]
                                    return (
                                      <div
                                        key={c}
                                        className={cn(
                                          'h-9 flex items-center border-r border-b border-border/60 last:border-r-0 px-1.5 py-0.5',
                                          filled ? (isOffice ? 'bg-muted/60' : 'bg-amber-500/15') : 'bg-transparent',
                                          filled && 'cursor-pointer transition-opacity hover:opacity-80',
                                        )}
                                        style={{
                                          borderLeft: filled && isLeftEdge ? `4px solid ${accent.borderLeftColor}` : undefined,
                                          borderRadius: filled && isLeftEdge && c > 0 ? 0 : filled && !cols.includes(c + 1) ? '0 4px 4px 0' : 0,
                                        }}
                                        title={filled ? `${item.name} • ${format(start, 'MMM d')} – ${format(end, 'MMM d')} • Click to edit` : undefined}
                                        onClick={filled ? () => setEditingItemId(item.id) : undefined}
                                      >
                                        {showName && (
                                          <span className="text-xs font-medium text-foreground truncate block">{item.name}</span>
                                        )}
                                      </div>
                                    )
                                  })}
                                </React.Fragment>
                              )
                            })}
                          </React.Fragment>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {scheduleItems.map((item) => (
                    <Card key={item.id} className="border-2 border-l-4" style={getCategoryAccentLeftBorderStyle(item.trade ?? '')}>
                      <CardContent className="pt-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          {renderItemEditBody(item)}
                          <div className="flex sm:flex-col gap-2">
                            <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(item.status)}`}>
                              {getStatusIcon(item.status)}
                              {item.status.replace('-', ' ').toUpperCase()}
                            </div>
                            <div className="text-sm text-muted-foreground">
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
        </div>
      </section>

      {/* Edit dialog — opened by clicking a calendar bar. Reuses the same
          form body the List view renders so there's a single source of truth
          for fields + handlers. Auto-save still applies via handleUpdateScheduleItem. */}
      <Dialog
        open={editingItemId !== null}
        onOpenChange={(open) => { if (!open) setEditingItemId(null) }}
      >
        <DialogContent className="sm:max-w-2xl border-border/60 bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Edit Schedule Item</DialogTitle>
          </DialogHeader>
          {(() => {
            const editingItem = scheduleItems.find((i) => i.id === editingItemId)
            if (!editingItem) return null
            return renderItemEditBody(editingItem)
          })()}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingItemId(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

