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
import { PlusCircle, Search, Building2, Calendar, DollarSign, FileText, Eye, ChevronDown, TrendingUp, Download, Filter, ArrowUpDown } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface ProjectsDashboardProps {
  onCreateProject: () => void
  onSelectProject: (project: Project) => void
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

export function ProjectsDashboard({ onCreateProject, onSelectProject, onOpenPlanLibrary, onOpenItemLibrary, onOpenDealPipeline, onOpenQBSettings }: ProjectsDashboardProps) {
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
            const markup = trade.markupPercent || 11.1
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
      const markup = trade.markupPercent || 11.1
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      estimating: 'bg-blue-100 text-blue-800',
      'in-progress': 'bg-orange-100 text-orange-800',
      complete: 'bg-green-100 text-green-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
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



  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-20 sm:h-24 lg:h-28 w-auto" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Projects Dashboard</h1>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 hidden sm:block">Manage your construction projects</p>
              </div>
            </div>
            
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 sm:pb-8">
        {/* Action cards - compact */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {canCreate && (
            <Card className="bg-gradient-to-br from-[#0E79C9] to-[#0A5A96] text-white hover:shadow-lg transition-shadow cursor-pointer border-none hidden sm:block">
              <CardContent className="pt-4 pb-4 px-4">
                <button onClick={onCreateProject} className="w-full text-left">
                  <div className="flex flex-col items-center justify-center py-3 sm:py-4">
                    <div className="bg-white/20 rounded-full p-1.5 sm:p-2 mb-1 sm:mb-2">
                      <PlusCircle className="w-6 sm:w-8 h-6 sm:h-8" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold mb-0.5">Create New Project</h3>
                    <p className="text-white/80 text-center text-sm hidden sm:block">Start a new construction project</p>
                  </div>
                </button>
              </CardContent>
            </Card>
          )}

          <Card className="bg-gradient-to-br from-[#D95C00] to-[#B34C00] text-white hover:shadow-lg transition-shadow cursor-pointer border-none hidden sm:block">
            <CardContent className="pt-4 pb-4 px-4">
              <button onClick={onOpenPlanLibrary} className="w-full text-left">
                <div className="flex flex-col items-center justify-center py-3 sm:py-4">
                  <div className="bg-white/20 rounded-full p-1.5 sm:p-2 mb-1 sm:mb-2">
                    <FileText className="w-6 sm:w-8 h-6 sm:h-8" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold mb-0.5">Plan Library</h3>
                  <p className="text-white/80 text-center text-sm hidden sm:block">Manage plan templates</p>
                </div>
              </button>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[#34AB8A] to-[#2a8d6f] text-white hover:shadow-lg transition-shadow cursor-pointer border-none hidden sm:block">
            <CardContent className="pt-4 pb-4 px-4">
              <button onClick={onOpenItemLibrary} className="w-full text-left">
                <div className="flex flex-col items-center justify-center py-3 sm:py-4">
                  <div className="bg-white/20 rounded-full p-1.5 sm:p-2 mb-1 sm:mb-2">
                    <DollarSign className="w-6 sm:w-8 h-6 sm:h-8" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold mb-0.5">Item Library</h3>
                  <p className="text-white/80 text-center text-sm hidden sm:block">Manage default rates</p>
                </div>
              </button>
            </CardContent>
          </Card>

          {onOpenDealPipeline && (
            <Card className="bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white hover:shadow-lg transition-shadow cursor-pointer border-none hidden sm:block">
              <CardContent className="pt-4 pb-4 px-4">
                <button onClick={onOpenDealPipeline} className="w-full text-left">
                  <div className="flex flex-col items-center justify-center py-3 sm:py-4">
                    <div className="bg-white/20 rounded-full p-1.5 sm:p-2 mb-1 sm:mb-2">
                      <TrendingUp className="w-6 sm:w-8 h-6 sm:h-8" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold mb-0.5">Deal Pipeline</h3>
                    <p className="text-white/80 text-center text-sm hidden sm:block">Manage deals before they become projects</p>
                  </div>
                </button>
              </CardContent>
            </Card>
          )}

          {/* Stats Cards */}
        </div>

        {/* QuickBooks pending - primary link to import flow */}
        {qbPendingCount !== null && qbPendingCount > 0 && onOpenQBSettings && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-green-800">
                You have <strong>{qbPendingCount}</strong> pending transaction{qbPendingCount !== 1 ? 's' : ''} from QuickBooks.
              </span>
              <Button onClick={onOpenQBSettings} variant="outline" size="sm" className="border-green-300 text-green-800 hover:bg-green-100">
                <Download className="w-4 h-4 mr-1" />
                Import
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active Projects</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {projects.filter(p => p.status === 'in-progress').length}
                  </p>
                </div>
                <div className="bg-orange-100 rounded-full p-3">
                  <Building2 className="w-8 h-8 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Projects</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{projects.length}</p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder="Search projects by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-lg"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px] h-9">
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
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-gray-500" />
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[200px] h-9">
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
          </CardContent>
        </Card>

        {/* Projects List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Your Projects</span>
              <span className="text-sm font-normal text-gray-600">
                {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && projects.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0E79C9]"></div>
                <p className="mt-4 text-gray-500">Loading projects...</p>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg mb-2">
                  {searchQuery ? 'No projects found' : 'No projects yet'}
                </p>
                <p className="text-gray-500 mb-6">
                  {searchQuery ? 'Try adjusting your search' : canCreate ? 'Create your first project to get started' : 'No projects yet'}
                </p>
                {!searchQuery && canCreate && (
                  <Button
                    onClick={onCreateProject}
                    className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226]"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
                )}
                {!searchQuery && isViewer && (
                  <div className="flex items-center justify-center gap-2 text-gray-600">
                    <Eye className="w-5 h-5" />
                    <span>You have view-only access</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => onSelectProject(project)}
                    className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-lg hover:border-[#0E79C9] transition-all cursor-pointer bg-white"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold text-gray-900">{project.name}</h3>
                          <div className="relative" ref={statusMenuProjectId === project.id ? statusMenuRef : undefined}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isViewer) return
                                setStatusMenuProjectId(prev => prev === project.id ? null : project.id)
                              }}
                              disabled={!!updatingStatusId}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-opacity ${getStatusColor(project.status)} ${!isViewer ? 'hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 cursor-pointer' : 'cursor-default'} ${updatingStatusId === project.id ? 'opacity-60' : ''}`}
                              title={isViewer ? undefined : 'Click to change status'}
                            >
                              {updatingStatusId === project.id ? '…' : project.status.replace('-', ' ').toUpperCase()}
                            </button>
                            {statusMenuProjectId === project.id && (
                              <div className="absolute left-0 top-full mt-1 z-10 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                                {STATUS_OPTIONS.map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleStatusChange(project, opt.value)
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg ${project.status === opt.value ? 'bg-gray-50 font-medium' : ''}`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          <p className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            {typeof project.address === 'string' ? project.address : project.address?.street || 'No address'}
                            {project.city && `, ${project.city}`}
                            {project.state && `, ${project.state}`}
                          </p>
                          {project.metadata?.isCustomPlan || !project.metadata?.planId ? (
                            <p className="flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              Plan: Custom
                              <span className="text-xs bg-[#0E79C9] text-white px-1.5 py-0.5 rounded">
                                Custom
                              </span>
                            </p>
                          ) : (
                            <p className="flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              Plan: {project.metadata.planId}
                            </p>
                          )}
                          <p className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Created: {project.createdAt.toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-left sm:text-right sm:ml-4 space-y-2 w-full sm:w-auto min-w-0">
                        {(() => {
                          const base = project.basePriceTotal ?? 0
                          const est = project.estimatedValue ?? 0
                          const actual = project.actualCosts ?? 0
                          const maxVal = Math.max(base, est, actual, 1)
                          const barMinPct = 2
                          const baseBarPct = base > 0 ? (base / maxVal) * 100 : barMinPct
                          const estBarPct = est > 0 ? (est / maxVal) * 100 : barMinPct
                          const actualBarPct = actual > 0 ? (actual / maxVal) * 100 : barMinPct
                          const barContainerClass = 'w-full max-w-[180px] h-2.5 rounded overflow-hidden bg-gray-100 shrink-0'
                          return (
                            <>
                              <div
                                className="grid gap-x-2 gap-y-1.5 items-center"
                                style={{ gridTemplateColumns: '5.5rem minmax(0, 11rem) 1fr' }}
                              >
                                <span className="text-sm text-gray-600">Base Price</span>
                                <div className={barContainerClass}>
                                  <div
                                    style={{ width: `${baseBarPct}%` }}
                                    className={`h-full shrink-0 min-w-0 rounded-l ${base > 0 ? 'bg-slate-200' : 'bg-gray-200'}`}
                                    title="Base Price Total"
                                  />
                                </div>
                                <span className="text-base sm:text-lg font-bold text-gray-800 tabular-nums text-right">
                                  {formatCurrency(base)}
                                </span>
                                <span className="text-sm text-gray-600">Total Est.</span>
                                <div className={barContainerClass}>
                                  <div
                                    style={{ width: `${estBarPct}%` }}
                                    className={`h-full shrink-0 min-w-0 rounded-l ${est > 0 ? 'bg-blue-200' : 'bg-gray-200'}`}
                                    title="Total Estimated"
                                  />
                                </div>
                                <span className="text-xl sm:text-2xl font-bold text-[#0E79C9] tabular-nums text-right">
                                  {formatCurrency(est)}
                                </span>
                                <span className="text-sm text-gray-600">Actual to Date</span>
                                <div className={barContainerClass}>
                                  <div
                                    style={{ width: `${actualBarPct}%` }}
                                    className={`h-full shrink-0 min-w-0 rounded-l ${actual > 0 ? 'bg-emerald-200' : 'bg-gray-200'}`}
                                    title="Actual Cost to Date"
                                  />
                                </div>
                                <span className="text-lg sm:text-xl font-bold text-[#34AB8A] tabular-nums text-right">
                                  {formatCurrency(actual)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500">
                                {project.tradeCount || 0} {project.tradeCount === 1 ? 'item' : 'items'}
                              </p>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mobile Action Menu - Fixed at bottom */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
          {showMobileActions && (
            <div className="border-b border-gray-200 p-2 bg-gray-50 max-h-80 overflow-y-auto">
              <div className="space-y-1">
                {canCreate && (
                  <button
                    onClick={() => {
                      onCreateProject()
                      setShowMobileActions(false)
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                  >
                    <div className="bg-[#0E79C9] text-white rounded-full p-2">
                      <PlusCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">New Project</p>
                      <p className="text-xs text-gray-500">Start a new construction project</p>
                    </div>
                  </button>
                )}
                <button
                  onClick={() => {
                    onOpenPlanLibrary()
                    setShowMobileActions(false)
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                >
                  <div className="bg-[#D95C00] text-white rounded-full p-2">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Plan Library</p>
                    <p className="text-xs text-gray-500">Manage plan templates</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    onOpenItemLibrary()
                    setShowMobileActions(false)
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                >
                  <div className="bg-[#34AB8A] text-white rounded-full p-2">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Item Library</p>
                    <p className="text-xs text-gray-500">Manage default rates</p>
                  </div>
                </button>
                {onOpenDealPipeline && (
                  <button
                    onClick={() => {
                      onOpenDealPipeline()
                      setShowMobileActions(false)
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white rounded-lg flex items-center gap-3 transition-colors"
                  >
                    <div className="bg-[#0E79C9] text-white rounded-full p-2">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Deal Pipeline</p>
                      <p className="text-xs text-gray-500">Manage deals before projects</p>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="p-3">
            <Button
              onClick={() => setShowMobileActions(!showMobileActions)}
              className="w-full bg-gradient-to-r from-[#0E79C9] to-[#0A5A96] hover:from-[#0A5A96] hover:to-[#084577] text-white h-12"
            >
              <span className="flex items-center justify-center gap-2">
                Actions
                <ChevronDown className={`w-5 h-5 transition-transform ${showMobileActions ? 'rotate-180' : ''}`} />
              </span>
            </Button>
          </div>
        </div>
      </main>

    </div>
  )
}

