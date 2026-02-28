// ============================================================================
// HSH GC Platform - Projects Dashboard
// ============================================================================
//
// Main dashboard for viewing and managing all projects
//

import React, { useState, useEffect, useRef } from 'react'
import { Project } from '@/types'
import type { ProjectStatus } from '@/types'
import { getAllProjects } from '@/services/projectService'
import { getProjects_Hybrid, getTradesForEstimate_Hybrid, updateProject_Hybrid } from '@/services/hybridService'
import { getProjectActuals_Hybrid } from '@/services/actualsHybridService'
import { getTradesForEstimate } from '@/services'
import { usePermissions } from '@/hooks/usePermissions'
import { isQBConnected, getQBJobTransactions } from '@/services/quickbooksService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusCircle, Search, Building2, DollarSign, FileText, Eye, ChevronDown, TrendingUp, Download, BookOpen, ClipboardList, BookMarked } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import hshLogo from '/HSH Contractor Logo - Color.png'

type ProjectSection = 'estimate' | 'actuals' | 'change-orders' | 'documents' | 'selection-book' | 'forms'

interface ProjectsDashboardProps {
  onCreateProject: () => void
  onSelectProject: (project: Project) => void
  /** Open project directly into a section (faster than project detail → section) */
  onOpenProjectSection?: (project: Project, section: ProjectSection) => void
  onOpenPlanLibrary: () => void
  onOpenItemLibrary: () => void
  onOpenDealPipeline?: () => void
  /** Open QuickBooks settings / import flow (e.g. for "X pending from QB" link) */
  onOpenQBSettings?: () => void
}

interface ProjectWithStats extends Project {
  basePriceTotal?: number
  estimatedValue?: number
  actualCosts?: number
  tradeCount?: number
}

const SECTION_BUTTONS: { section: ProjectSection; label: string; icon: React.ReactNode }[] = [
  { section: 'estimate', label: 'Estimate', icon: <BookOpen className="w-3.5 h-3.5" /> },
  { section: 'actuals', label: 'Actuals', icon: <DollarSign className="w-3.5 h-3.5" /> },
  { section: 'selection-book', label: 'Selection', icon: <BookMarked className="w-3.5 h-3.5" /> },
  { section: 'documents', label: 'Docs', icon: <FileText className="w-3.5 h-3.5" /> },
  { section: 'change-orders', label: 'COs', icon: <ClipboardList className="w-3.5 h-3.5" /> },
]

export function ProjectsDashboard({ onCreateProject, onSelectProject, onOpenProjectSection, onOpenPlanLibrary, onOpenItemLibrary, onOpenDealPipeline, onOpenQBSettings }: ProjectsDashboardProps) {
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('newest')
  const [showMobileActions, setShowMobileActions] = useState(false)
  const [qbPendingCount, setQbPendingCount] = useState<number | null>(null)
  const [statusMenuProjectId, setStatusMenuProjectId] = useState<string | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const { canCreate, isViewer } = usePermissions()

  // Close status dropdown when clicking outside
  useEffect(() => {
    if (statusMenuProjectId === null) return
    const handleClick = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuProjectId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [statusMenuProjectId])

  useEffect(() => {
    const loadQBPending = async () => {
      try {
        if (await isQBConnected()) {
          const { transactions } = await getQBJobTransactions()
          setQbPendingCount(transactions.length)
        } else {
          setQbPendingCount(null)
        }
      } catch {
        setQbPendingCount(null)
      }
    }
    loadQBPending()
  }, [])

  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true)
      
      // First, load projects immediately (fast)
      const allProjects = await getProjects_Hybrid()
      
      // Show projects immediately without stats
      setProjects(allProjects.map(p => ({ ...p, basePriceTotal: 0, estimatedValue: 0, actualCosts: 0, tradeCount: 0 })))
      setLoading(false)
      
      // Then load stats in the background (progressive enhancement)
      // Combine trade fetching to avoid duplicate calls
      const projectsWithStats = await Promise.all(
        allProjects.map(async (project) => {
          // Fetch trades once and use for estimated value and trade count
          const [trades, actuals] = await Promise.all([
            getTradesForEstimate_Hybrid(project.estimate.id),
            getProjectActuals_Hybrid(project.id)
          ])
          
          const tradeCount = trades.length
          // Base price from estimate book first (totals.basePriceTotal or subtotal), else sum trades
          const baseFromTrades = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
          const basePriceTotal =
            project.estimate?.totals?.basePriceTotal ??
            (project.estimate?.subtotal != null && project.estimate.subtotal > 0 ? project.estimate.subtotal : null) ??
            baseFromTrades
          const grossProfitTotal = trades.reduce((sum, trade) => {
            const markup = trade.markupPercent || 20
            return sum + (trade.totalCost * (markup / 100))
          }, 0)
          const contingency = (project.estimate?.totals?.contingency != null ? project.estimate.totals.contingency : basePriceTotal * 0.10)
          const calculatedTotal = basePriceTotal + grossProfitTotal + contingency
          const fromBook = project.estimate?.totals?.totalEstimated ?? project.estimate?.totalEstimate
          const estimatedValue = (typeof fromBook === 'number' && fromBook > 0) ? fromBook : calculatedTotal
          const actualCosts = actuals?.totalActualCost || 0
          
          return { 
            ...project, 
            basePriceTotal, 
            estimatedValue, 
            actualCosts, 
            tradeCount 
          }
        })
      )
      
      // Update with stats once loaded
      setProjects(projectsWithStats)
    }
    loadProjects()
  }, [])

  // Calculate estimated value for a project from its trades (kept for compatibility)
  const calculateEstimatedValue = async (project: Project): Promise<number> => {
    const trades = await getTradesForEstimate_Hybrid(project.estimate.id)
    const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
    const grossProfitTotal = trades.reduce((sum, trade) => {
      const markup = trade.markupPercent || 20
      return sum + (trade.totalCost * (markup / 100))
    }, 0)
    const contingency = basePriceTotal * 0.10 // 10% default
    return basePriceTotal + grossProfitTotal + contingency
  }

  const calculateTradeCount = async (project: Project): Promise<number> => {
    const trades = await getTradesForEstimate_Hybrid(project.estimate.id)
    return trades.length
  }

  // Calculate actual costs for a project from actuals entries
  const calculateActualCosts = async (project: Project): Promise<number> => {
    const actuals = await getProjectActuals_Hybrid(project.id)
    if (!actuals) return 0
    return actuals.totalActualCost || 0
  }

  const addressSearchStr = (addr: ProjectWithStats['address']): string => {
    if (!addr) return ''
    if (typeof addr === 'string') return addr
    return 'street' in addr ? (addr.street ?? '') : ''
  }
  const filteredProjects = projects
    .filter(project =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      addressSearchStr(project.address).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.city ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter(project => statusFilter === 'all' || project.status === statusFilter)
    .slice()
    .sort((a, b) => {
      const dateMs = (d: Date | string | undefined) => (d instanceof Date ? d.getTime() : d ? new Date(d as string).getTime() : 0)
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'name-desc':
          return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' })
        case 'oldest':
          return dateMs(a.createdAt) - dateMs(b.createdAt)
        case 'newest':
        default:
          return dateMs(b.createdAt) - dateMs(a.createdAt)
        case 'estimate-desc':
          return (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0)
        case 'estimate-asc':
          return (a.estimatedValue ?? 0) - (b.estimatedValue ?? 0)
        case 'actual-desc':
          return (b.actualCosts ?? 0) - (a.actualCosts ?? 0)
        case 'actual-asc':
          return (a.actualCosts ?? 0) - (b.actualCosts ?? 0)
      }
    })

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const getStatusStyles = (status: string) => {
    const borders: Record<string, string> = {
      estimating: 'border-l-[#0E79C9]',
      'in-progress': 'border-l-[#D95C00]',
      complete: 'border-l-[#15803D]',
    }
    return `bg-gray-100 text-gray-700 border-l-4 ${borders[status] || 'border-l-gray-400'}`
  }

  /** Status colors for left bar + top border (same palette as header: blue, orange, green, purple). */
  const getStatusAccentColor = (status: string): string => {
    const colors: Record<string, string> = {
      estimating: '#0E79C9',   // blue (aligns with New Project button)
      'in-progress': '#D95C00', // orange (aligns with Plan Library)
      complete: '#15803D',      // green (aligns with Estimate Library)
    }
    return colors[status] ?? '#9ca3af' // gray-400 fallback
  }

  const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
    { value: 'estimating', label: 'Estimating' },
    { value: 'in-progress', label: 'In progress' },
    { value: 'complete', label: 'Complete' },
  ]

  const handleStatusChange = async (project: ProjectWithStats, newStatus: ProjectStatus) => {
    if (newStatus === project.status) {
      setStatusMenuProjectId(null)
      return
    }
    setUpdatingStatusId(project.id)
    setStatusMenuProjectId(null)
    try {
      const updated = await updateProject_Hybrid(project.id, { status: newStatus })
      if (updated) {
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...updated, basePriceTotal: project.basePriceTotal, estimatedValue: project.estimatedValue, actualCosts: project.actualCosts, tradeCount: project.tradeCount } : p))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setUpdatingStatusId(null)
    }
  }



  const activeCount = projects.filter(p => p.status === 'in-progress').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Slim app bar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <img src={hshLogo} alt="HSH Contractor" className="h-16 sm:h-20 lg:h-24 w-auto shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-900 truncate">Projects Dashboard</h1>
                <p className="text-xs text-gray-500 hidden sm:block">
                  {activeCount} active · {projects.length} total
                </p>
              </div>
            </div>
            <nav className="hidden sm:flex items-center gap-1 shrink-0">
              {canCreate && (
                <Button onClick={onCreateProject} size="sm" className="bg-[#0E79C9] hover:bg-[#0A5A96] text-white">
                  <PlusCircle className="w-4 h-4 mr-1.5" />
                  New Project
                </Button>
              )}
              <Button
                onClick={onOpenPlanLibrary}
                variant="ghost"
                size="sm"
                className="bg-[#D95C00] text-white hover:bg-[#C04F00]"
              >
                Plan Library
              </Button>
              <Button
                onClick={onOpenItemLibrary}
                variant="ghost"
                size="sm"
                className="bg-[#15803D] text-white hover:bg-[#166534]"
              >
                Estimate Library
              </Button>
              {onOpenDealPipeline && (
                <Button
                  onClick={onOpenDealPipeline}
                  variant="ghost"
                  size="sm"
                  className="bg-[#6D28D9] text-white hover:bg-[#5B21B6]"
                >
                  Deal Pipeline
                </Button>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-8">
        {/* QuickBooks pending - slim one-line */}
        {qbPendingCount !== null && qbPendingCount > 0 && onOpenQBSettings && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 py-2.5 px-4 rounded-lg border border-emerald-200 bg-emerald-50/80">
            <span className="text-sm text-emerald-800">
              <strong>{qbPendingCount}</strong> pending transaction{qbPendingCount !== 1 ? 's' : ''} from QuickBooks
            </span>
            <Button onClick={onOpenQBSettings} variant="outline" size="sm" className="border-emerald-300 text-emerald-800 hover:bg-emerald-100 shrink-0">
              <Download className="w-4 h-4 mr-1" />
              Import
            </Button>
          </div>
        )}

        {/* Search + filters toolbar */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search by name or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-base bg-white border-gray-200"
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-10 bg-white border-gray-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="estimating">Estimating</SelectItem>
                <SelectItem value="bidding">Bidding</SelectItem>
                <SelectItem value="awarded">Awarded</SelectItem>
                <SelectItem value="in-progress">In progress</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px] h-10 bg-white border-gray-200">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name-asc">Name A–Z</SelectItem>
                <SelectItem value="name-desc">Name Z–A</SelectItem>
                <SelectItem value="estimate-desc">Est. value: high → low</SelectItem>
                <SelectItem value="estimate-asc">Est. value: low → high</SelectItem>
                <SelectItem value="actual-desc">Actual costs: high → low</SelectItem>
                <SelectItem value="actual-asc">Actual costs: low → high</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Projects List */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between text-lg">
              <span>Your Projects</span>
              <span className="text-sm font-normal text-gray-500">
                {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading && projects.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-[#0E79C9]"></div>
                <p className="mt-4 text-gray-500 text-sm">Loading projects...</p>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-700 font-medium mb-1">
                  {searchQuery ? 'No projects found' : 'No projects yet'}
                </p>
                <p className="text-gray-500 text-sm mb-6">
                  {searchQuery ? 'Try adjusting your search' : canCreate ? 'Create your first project to get started' : 'No projects yet'}
                </p>
                {!searchQuery && canCreate && (
                  <Button onClick={onCreateProject} size="sm" className="bg-[#0E79C9] hover:bg-[#0A5A96]">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
                )}
                {!searchQuery && isViewer && (
                  <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
                    <Eye className="w-4 h-4" />
                    <span>View-only access</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredProjects.map((project) => {
                  const base = project.basePriceTotal ?? 0
                  const est = project.estimatedValue ?? 0
                  const actual = project.actualCosts ?? 0
                  return (
                    <div
                      key={project.id}
                      onClick={() => onSelectProject(project)}
                      className="flex rounded-lg overflow-hidden hover:bg-gray-50/80 transition-colors cursor-pointer -mx-1 first:[&>*:last-child]:pt-0 border-t"
                      style={{ borderTopColor: getStatusAccentColor(project.status) }}
                    >
                      <div
                        className="shrink-0 w-1.5 rounded-l-md"
                        style={{ backgroundColor: getStatusAccentColor(project.status) }}
                        aria-hidden
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 sm:py-5 flex-1 min-w-0 px-3 sm:px-4 rounded-r-lg items-center text-center sm:text-left">
                      <div className="w-full sm:w-[300px] sm:shrink-0 min-w-0">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                          <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{project.name}</h3>
                          <div className="relative" ref={statusMenuProjectId === project.id ? statusMenuRef : undefined}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isViewer) return
                                setStatusMenuProjectId(prev => prev === project.id ? null : project.id)
                              }}
                              disabled={!!updatingStatusId}
                              className={`px-2.5 py-0.5 rounded text-xs font-medium transition-opacity ${getStatusStyles(project.status)} ${!isViewer ? 'hover:ring-1 hover:ring-gray-300 cursor-pointer' : 'cursor-default'} ${updatingStatusId === project.id ? 'opacity-60' : ''}`}
                              title={isViewer ? undefined : 'Change status'}
                            >
                              {updatingStatusId === project.id ? '…' : project.status.replace('-', ' ')}
                            </button>
                            {statusMenuProjectId === project.id && (
                              <div className="absolute left-0 top-full mt-1 z-10 min-w-[140px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                                {STATUS_OPTIONS.map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleStatusChange(project, opt.value)
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 first:rounded-t-md last:rounded-b-md ${project.status === opt.value ? 'bg-gray-50 font-medium' : ''}`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-sm sm:text-base text-gray-500 truncate">
                          {typeof project.address === 'string' ? project.address : project.address?.street || 'No address'}
                          {project.city && ` · ${project.city}`}
                          {project.state && `, ${project.state}`}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
                          {project.metadata?.isCustomPlan || !project.metadata?.planId ? 'Custom plan' : `Plan: ${project.metadata.planId}`}
                          {' · '}
                          {project.createdAt.toLocaleDateString()}
                          {project.tradeCount != null && project.tradeCount > 0 && ` · ${project.tradeCount} items`}
                        </p>
                      </div>
                      {onOpenProjectSection && (
                        <div className="w-full sm:w-[320px] sm:shrink-0 flex flex-wrap sm:flex-nowrap items-center justify-center sm:justify-start gap-1 py-1 sm:py-1.5 sm:pl-7" onClick={(e) => e.stopPropagation()}>
                          {SECTION_BUTTONS.map(({ section, label, icon }) => (
                            <button
                              key={section}
                              type="button"
                              onClick={() => onOpenProjectSection(project, section)}
                              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900 border border-transparent hover:border-gray-300 transition-colors whitespace-nowrap"
                              title={section === 'change-orders' ? 'Change orders' : section === 'selection-book' ? 'Selection book' : section === 'documents' ? 'Project documents' : section === 'estimate' ? 'Estimate book' : section === 'actuals' ? 'Project actuals' : 'Forms'}
                            >
                              {icon}
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 sm:min-w-[24px]" aria-hidden />
                      <div className="flex items-baseline gap-4 sm:gap-6 shrink-0 text-center min-w-0 sm:w-[320px] sm:justify-end">
                        <div className="sm:w-[100px] sm:text-center">
                          <p className="text-xs text-gray-500">Base</p>
                          <p className="text-base sm:text-lg font-semibold text-sky-700 tabular-nums">{formatCurrency(base)}</p>
                        </div>
                        <div className="sm:w-[100px] sm:text-center">
                          <p className="text-xs text-gray-500">Est.</p>
                          <p className="text-base sm:text-lg font-semibold text-gray-900 tabular-nums">{formatCurrency(est)}</p>
                        </div>
                        <div className="sm:w-[100px] sm:text-center">
                          <p className="text-xs text-gray-500">Actual</p>
                          <p className="text-base sm:text-lg font-semibold text-emerald-700 tabular-nums">{formatCurrency(actual)}</p>
                        </div>
                      </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mobile: bottom action bar */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-pb">
          {showMobileActions && (
            <div className="border-b border-gray-100 px-3 py-2 bg-gray-50 max-h-72 overflow-y-auto">
              {canCreate && (
                <button
                  onClick={() => { onCreateProject(); setShowMobileActions(false) }}
                  className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-white border border-[#0E79C9]/20 bg-[#0E79C9]/5"
                >
                  <PlusCircle className="w-5 h-5 text-[#0E79C9]" />
                  <div>
                    <p className="font-medium text-gray-900">New Project</p>
                    <p className="text-xs text-gray-500">Start a new project</p>
                  </div>
                </button>
              )}
              <button onClick={() => { onOpenPlanLibrary(); setShowMobileActions(false) }} className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-white text-gray-700">
                <FileText className="w-5 h-5 text-gray-400" />
                <span className="font-medium">Plan Library</span>
              </button>
              <button onClick={() => { onOpenItemLibrary(); setShowMobileActions(false) }} className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-white text-gray-700">
                <DollarSign className="w-5 h-5 text-gray-400" />
                <span className="font-medium">Estimate Library</span>
              </button>
              {onOpenDealPipeline && (
                <button onClick={() => { onOpenDealPipeline(); setShowMobileActions(false) }} className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-white text-gray-700">
                  <TrendingUp className="w-5 h-5 text-gray-400" />
                  <span className="font-medium">Deal Pipeline</span>
                </button>
              )}
            </div>
          )}
          <div className="p-2">
            <Button
              onClick={() => setShowMobileActions(!showMobileActions)}
              variant="outline"
              className="w-full h-11 border-gray-200 bg-white hover:bg-gray-50"
            >
              <span className="flex items-center justify-center gap-2 text-gray-700">
                Actions
                <ChevronDown className={`w-4 h-4 transition-transform ${showMobileActions ? 'rotate-180' : ''}`} />
              </span>
            </Button>
          </div>
        </div>
      </main>

    </div>
  )
}

