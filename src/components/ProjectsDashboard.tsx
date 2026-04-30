// ============================================================================
// Projects Dashboard
// ============================================================================
//
// Dashboard list view for the Projects workspace. Renders inside the AppLayout
// shell (sidebar + AppHeader handle workspace nav + project selector +
// workspace switcher), so this file focuses on the project list itself plus
// summary cards, search/filters, and per-project rows.
//
// Data layer (load projects → progressively load stats → status inline-edit
// → QB pending count) preserved 1:1 from the pre-shell version. View layer
// rebuilt to match the v0 design language: token-driven colors, status pills
// with violet/emerald/sky/amber recipe, summary cards above the list.
//

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Building2,
  Download,
  Eye,
  PlusCircle,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Project, ProjectStatus } from '@/types'
import { usePermissions } from '@/hooks/usePermissions'
import { usePageTitle } from '@/contexts/PageTitleContext'
import {
  getProjects_Hybrid,
  getTradesForEstimate_Hybrid,
  updateProject_Hybrid,
} from '@/services/hybridService'
import { getProjectActuals_Hybrid } from '@/services/actualsHybridService'
import { isQBConnected, getQBJobTransactions } from '@/services/quickbooksService'
import {
  ProjectCard,
  ProjectSection,
  ProjectWithStats,
} from './dashboard/ProjectCard'

interface ProjectsDashboardProps {
  onCreateProject: () => void
  onSelectProject: (project: Project) => void
  /** Open project directly into a section (faster than project detail → section) */
  onOpenProjectSection?: (project: Project, section: ProjectSection) => void
  /** Header workspace switcher replaces these but the route layer still passes
   * them — accept and ignore for now to keep the prop interface stable. */
  onOpenDealWorkspace?: () => void
  onOpenTenantPipeline?: () => void
  /** Open QuickBooks settings / import flow (e.g. for "X pending from QB" link) */
  onOpenQBSettings?: () => void
}

// ============================================================================
// Component
// ============================================================================

export function ProjectsDashboard({
  onCreateProject,
  onSelectProject,
  onOpenProjectSection,
  onOpenQBSettings,
}: ProjectsDashboardProps) {
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('newest')
  const [qbPendingCount, setQbPendingCount] = useState<number | null>(null)
  const [statusMenuProjectId, setStatusMenuProjectId] = useState<string | null>(
    null,
  )
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const { canCreate, isViewer } = usePermissions()

  // Centered title in the AppHeader
  usePageTitle('Dashboard')

  // Close status dropdown on outside click
  useEffect(() => {
    if (statusMenuProjectId === null) return
    const handleClick = (e: MouseEvent) => {
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(e.target as Node)
      ) {
        setStatusMenuProjectId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [statusMenuProjectId])

  // QB pending count
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
    void loadQBPending()
  }, [])

  // Project list + progressive stats loading
  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true)
      const allProjects = await getProjects_Hybrid()
      // Show projects immediately (without stats) for fast first paint
      setProjects(
        allProjects.map((p) => ({
          ...p,
          basePriceTotal: 0,
          estimatedValue: 0,
          actualCosts: 0,
          tradeCount: 0,
        })),
      )
      setLoading(false)

      // Then enhance with stats in the background
      const projectsWithStats = await Promise.all(
        allProjects.map(async (project) => {
          const [trades, actuals] = await Promise.all([
            getTradesForEstimate_Hybrid(project.estimate.id),
            getProjectActuals_Hybrid(project.id),
          ])

          const tradeCount = trades.length
          const baseFromTrades = trades.reduce(
            (sum, trade) => sum + trade.totalCost,
            0,
          )
          const basePriceTotal =
            project.estimate?.totals?.basePriceTotal ??
            (project.estimate?.subtotal != null && project.estimate.subtotal > 0
              ? project.estimate.subtotal
              : null) ??
            baseFromTrades
          const grossProfitTotal = trades.reduce((sum, trade) => {
            const markup = trade.markupPercent || 20
            return sum + trade.totalCost * (markup / 100)
          }, 0)
          const contingency =
            project.estimate?.totals?.contingency != null
              ? project.estimate.totals.contingency
              : basePriceTotal * 0.1
          const calculatedTotal = basePriceTotal + grossProfitTotal + contingency
          const fromBook =
            project.estimate?.totals?.totalEstimated ??
            project.estimate?.totalEstimate
          const estimatedValue =
            typeof fromBook === 'number' && fromBook > 0
              ? fromBook
              : calculatedTotal
          const actualCosts = actuals?.totalActualCost || 0

          return {
            ...project,
            basePriceTotal,
            estimatedValue,
            actualCosts,
            tradeCount,
          }
        }),
      )

      setProjects(projectsWithStats)
    }
    void loadProjects()
  }, [])

  const handleStatusChange = async (
    project: ProjectWithStats,
    newStatus: ProjectStatus,
  ) => {
    if (newStatus === project.status) {
      setStatusMenuProjectId(null)
      return
    }
    setUpdatingStatusId(project.id)
    setStatusMenuProjectId(null)
    try {
      const updated = await updateProject_Hybrid(project.id, { status: newStatus })
      if (updated) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  ...updated,
                  basePriceTotal: project.basePriceTotal,
                  estimatedValue: project.estimatedValue,
                  actualCosts: project.actualCosts,
                  tradeCount: project.tradeCount,
                }
              : p,
          ),
        )
      }
    } catch (e) {
      console.error(e)
    } finally {
      setUpdatingStatusId(null)
    }
  }

  // Filter + sort
  const addressSearchStr = (addr: ProjectWithStats['address']): string => {
    if (!addr) return ''
    if (typeof addr === 'string') return addr
    return 'street' in addr ? (addr.street ?? '') : ''
  }

  const filteredProjects = projects
    .filter(
      (project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        addressSearchStr(project.address)
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        (project.city ?? '').toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .filter((project) => statusFilter === 'all' || project.status === statusFilter)
    .slice()
    .sort((a, b) => {
      const dateMs = (d: Date | string | undefined) =>
        d instanceof Date ? d.getTime() : d ? new Date(d as string).getTime() : 0
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'name-desc':
          return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' })
        case 'oldest':
          return dateMs(a.createdAt) - dateMs(b.createdAt)
        case 'estimate-desc':
          return (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0)
        case 'estimate-asc':
          return (a.estimatedValue ?? 0) - (b.estimatedValue ?? 0)
        case 'actual-desc':
          return (b.actualCosts ?? 0) - (a.actualCosts ?? 0)
        case 'actual-asc':
          return (a.actualCosts ?? 0) - (b.actualCosts ?? 0)
        case 'newest':
        default:
          return dateMs(b.createdAt) - dateMs(a.createdAt)
      }
    })

  // Summary stats
  const estimatingCount = projects.filter((p) => p.status === 'estimating').length
  const inProgressCount = projects.filter((p) => p.status === 'in-progress').length
  const totalEstimated = projects.reduce(
    (sum, p) => sum + (p.estimatedValue ?? 0),
    0,
  )
  const totalActual = projects.reduce((sum, p) => sum + (p.actualCosts ?? 0), 0)

  const formatCurrencyCompact = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* QuickBooks pending banner (when connected + has pending) */}
      {qbPendingCount !== null && qbPendingCount > 0 && onOpenQBSettings && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5">
          <span className="text-sm text-emerald-700 dark:text-emerald-300">
            <strong>{qbPendingCount}</strong> pending transaction
            {qbPendingCount !== 1 ? 's' : ''} from QuickBooks
          </span>
          <Button
            onClick={onOpenQBSettings}
            variant="outline"
            size="sm"
            className="shrink-0 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
          >
            <Download className="size-4" />
            Import
          </Button>
        </div>
      )}

      {/* Summary cards — counts + dollar totals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="Estimating"
          value={String(estimatingCount)}
          rail="bg-violet-500"
        />
        <SummaryCard
          label="In Progress"
          value={String(inProgressCount)}
          rail="bg-emerald-500"
        />
        <SummaryCard
          label="Total Estimated"
          value={formatCurrencyCompact(totalEstimated)}
          rail="bg-sky-500"
          valueClass="text-sky-600 dark:text-sky-400"
        />
        <SummaryCard
          label="Total Actual"
          value={formatCurrencyCompact(totalActual)}
          rail="bg-emerald-500"
          valueClass={
            totalActual > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground'
          }
        />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name or address…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-card/50"
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] bg-card/50">
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
            <SelectTrigger className="w-[180px] bg-card/50">
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

      {/* Projects list */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Your Projects
            <span className="ml-2 text-xs text-muted-foreground/70">
              {filteredProjects.length} project
              {filteredProjects.length !== 1 ? 's' : ''}
            </span>
          </h2>
        </div>

        {loading && projects.length === 0 ? (
          <Card className="border-border/60 bg-card/50">
            <CardContent className="py-12 text-center">
              <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <p className="mt-4 text-sm text-muted-foreground">
                Loading projects…
              </p>
            </CardContent>
          </Card>
        ) : filteredProjects.length === 0 ? (
          <Card className="border-border/60 bg-card/50">
            <CardContent className="py-12 text-center">
              <Building2 className="mx-auto mb-3 size-12 text-muted-foreground/50" />
              <p className="font-medium">
                {searchQuery ? 'No projects found' : 'No projects yet'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchQuery
                  ? 'Try adjusting your search'
                  : canCreate
                    ? 'Create your first project to get started'
                    : 'No projects yet'}
              </p>
              {!searchQuery && canCreate && (
                <Button onClick={onCreateProject} size="sm" className="mt-4">
                  <PlusCircle className="size-4" />
                  Create Project
                </Button>
              )}
              {!searchQuery && isViewer && (
                <p className="mt-3 inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                  <Eye className="size-4" />
                  View-only access
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div
            ref={statusMenuRef}
            className="flex flex-col gap-2"
          >
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onSelect={onSelectProject}
                onOpenSection={onOpenProjectSection}
                statusMenuOpen={statusMenuProjectId === project.id}
                onToggleStatusMenu={() =>
                  setStatusMenuProjectId((prev) =>
                    prev === project.id ? null : project.id,
                  )
                }
                onChangeStatus={handleStatusChange}
                isUpdatingStatus={updatingStatusId === project.id}
                isViewer={isViewer}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ============================================================================
// Pieces
// ============================================================================

function SummaryCard({
  label,
  value,
  rail,
  valueClass,
}: {
  label: string
  value: string
  rail: string
  valueClass?: string
}) {
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/50">
      <div className={cn('absolute inset-y-0 left-0 w-1', rail)} aria-hidden />
      <CardContent className="p-4 pl-5">
        <p className="mb-1 text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            'text-xl font-semibold tabular-nums',
            valueClass ?? 'text-foreground',
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
