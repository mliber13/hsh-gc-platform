// ============================================================================
// Deals Dashboard
// ============================================================================
//
// Dashboard list view for the Deals workspace. Renders inside the AppLayout
// shell at /deals (sidebar + AppHeader handle workspace nav + deal selector).
// Mirrors ProjectsDashboard's pattern: summary cards above a searchable +
// filterable list of deals.
//
// Data layer: fetchDeals() once on mount. No progressive stat enhancement
// because deals don't have estimates/actuals like projects do — the deal's
// own fields (projected_cost, status, unit_count) are sufficient.
//

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { Briefcase, PlusCircle, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { fetchDeals } from '@/services/dealService'
import type { Deal, DealStatus } from '@/types/deal'
import { CreateDealDialog } from './CreateDealDialog'

// ----------------------------------------------------------------------------
// Status pill recipe (per playbook §7)
// ----------------------------------------------------------------------------

const STATUS_LABEL: Record<DealStatus, string> = {
  'early-stage': 'Early Stage',
  'concept-pre-funding': 'Concept / Pre-Funding',
  'very-early': 'Very Early',
  'pending-docs': 'Pending Docs',
  'active-pipeline': 'Active Pipeline',
  custom: 'Custom',
}

const STATUS_PILL: Record<DealStatus, { bg: string; text: string; border: string; dot: string }> = {
  'active-pipeline': {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  'pending-docs': {
    bg: 'bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/30',
    dot: 'bg-amber-500',
  },
  'early-stage': {
    bg: 'bg-violet-500/15',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/30',
    dot: 'bg-violet-500',
  },
  'concept-pre-funding': {
    bg: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/30',
    dot: 'bg-sky-500',
  },
  'very-early': {
    bg: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/30',
    dot: 'bg-sky-500',
  },
  custom: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-border',
    dot: 'bg-muted-foreground',
  },
}

function StatusPill({ status, customLabel }: { status: DealStatus; customLabel?: string | null }) {
  const v = STATUS_PILL[status]
  const label = status === 'custom' && customLabel ? customLabel : STATUS_LABEL[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        v.bg,
        v.text,
        v.border,
      )}
    >
      <span className={cn('size-1.5 rounded-full', v.dot)} />
      {label}
    </span>
  )
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export function DealsDashboard() {
  usePageTitle('Deals')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('newest')
  const [createOpen, setCreateOpen] = useState(false)

  // Load deals on mount
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchDeals().then((rows) => {
      if (cancelled) return
      setDeals(rows)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Open create modal when arriving via ?new=1 (sidebar "+ New Deal"
  // button), then strip the param so refresh doesn't reopen.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreateOpen(true)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('new')
          return next
        },
        { replace: true },
      )
    }
  }, [searchParams, setSearchParams])

  const handleDealCreated = (deal: Deal) => {
    // Add to list optimistically + navigate into the new deal's workspace
    setDeals((prev) => [deal, ...prev])
    navigate(`/deals/workspace/${deal.id}`)
  }

  // Filter + sort
  const filteredDeals = deals
    .filter((d) => {
      const q = searchQuery.toLowerCase().trim()
      if (!q) return true
      return (
        d.deal_name.toLowerCase().includes(q) ||
        (d.location ?? '').toLowerCase().includes(q)
      )
    })
    .filter((d) => statusFilter === 'all' || d.status === statusFilter)
    .slice()
    .sort((a, b) => {
      const dateMs = (s: string | undefined | null) => (s ? new Date(s).getTime() : 0)
      switch (sortBy) {
        case 'name-asc':
          return a.deal_name.localeCompare(b.deal_name, undefined, { sensitivity: 'base' })
        case 'name-desc':
          return b.deal_name.localeCompare(a.deal_name, undefined, { sensitivity: 'base' })
        case 'oldest':
          return dateMs(a.created_at) - dateMs(b.created_at)
        case 'cost-desc':
          return (b.projected_cost ?? 0) - (a.projected_cost ?? 0)
        case 'cost-asc':
          return (a.projected_cost ?? 0) - (b.projected_cost ?? 0)
        case 'start-asc':
          return dateMs(a.expected_start_date) - dateMs(b.expected_start_date)
        case 'newest':
        default:
          return dateMs(b.created_at) - dateMs(a.created_at)
      }
    })

  // Summary stats
  const totalDeals = deals.length
  const activeCount = deals.filter((d) => d.status === 'active-pipeline').length
  const totalProjectedCost = deals.reduce((sum, d) => sum + (d.projected_cost ?? 0), 0)
  const convertedCount = deals.filter((d) => d.converted_to_projects).length

  const formatCurrencyCompact = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Total Deals" value={String(totalDeals)} rail="bg-violet-500" />
        <SummaryCard label="Active Pipeline" value={String(activeCount)} rail="bg-emerald-500" />
        <SummaryCard
          label="Total Projected Cost"
          value={formatCurrencyCompact(totalProjectedCost)}
          rail="bg-sky-500"
          valueClass="text-sky-600 dark:text-sky-400"
        />
        <SummaryCard
          label="Converted to Projects"
          value={String(convertedCount)}
          rail="bg-emerald-500"
          valueClass={
            convertedCount > 0
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
            placeholder="Search by name or location…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-card/50"
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-card/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active-pipeline">Active Pipeline</SelectItem>
              <SelectItem value="pending-docs">Pending Docs</SelectItem>
              <SelectItem value="early-stage">Early Stage</SelectItem>
              <SelectItem value="concept-pre-funding">Concept / Pre-Funding</SelectItem>
              <SelectItem value="very-early">Very Early</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
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
              <SelectItem value="cost-desc">Projected cost: high → low</SelectItem>
              <SelectItem value="cost-asc">Projected cost: low → high</SelectItem>
              <SelectItem value="start-asc">Expected start: soonest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Deals list */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Your Deals
            <span className="ml-2 text-xs text-muted-foreground/70">
              {filteredDeals.length} deal
              {filteredDeals.length !== 1 ? 's' : ''}
            </span>
          </h2>
        </div>

        {loading ? (
          <Card className="border-border/60 bg-card/50">
            <CardContent className="py-12 text-center">
              <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Loading deals…</p>
            </CardContent>
          </Card>
        ) : filteredDeals.length === 0 ? (
          <Card className="border-border/60 bg-card/50">
            <CardContent className="py-12 text-center">
              <Briefcase className="mx-auto mb-3 size-12 text-muted-foreground/50" />
              <p className="font-medium">
                {searchQuery || statusFilter !== 'all' ? 'No deals match' : 'No deals yet'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search or filter'
                  : 'Create your first deal to get started'}
              </p>
              {!searchQuery && statusFilter === 'all' && (
                <Button onClick={() => setCreateOpen(true)} size="sm" className="mt-4">
                  <PlusCircle className="size-4" />
                  Create Deal
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredDeals.map((deal) => (
              <DealRow
                key={deal.id}
                deal={deal}
                onOpen={() => navigate(`/deals/workspace/${deal.id}`)}
                formatCurrency={formatCurrencyCompact}
              />
            ))}
          </div>
        )}
      </section>

      <CreateDealDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleDealCreated}
      />
    </div>
  )
}

// ----------------------------------------------------------------------------
// Pieces
// ----------------------------------------------------------------------------

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

function DealRow({
  deal,
  onOpen,
  formatCurrency,
}: {
  deal: Deal
  onOpen: () => void
  formatCurrency: (n: number) => string
}) {
  const expectedStart = deal.expected_start_date
    ? new Date(deal.expected_start_date).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <Card
      className="cursor-pointer border-border/60 bg-card/50 transition-colors hover:bg-muted/30"
      onClick={onOpen}
    >
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{deal.deal_name}</h3>
            <StatusPill status={deal.status} customLabel={deal.custom_status} />
            {deal.converted_to_projects && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Converted
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {deal.location && <span className="truncate">{deal.location}</span>}
            {(deal.unit_count ?? 0) > 0 && <span>· {deal.unit_count} units</span>}
            <span>· {deal.custom_type || deal.type}</span>
            {expectedStart && <span>· Start {expectedStart}</span>}
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Projected
            </span>
            <span
              className={cn(
                'text-sm font-semibold tabular-nums',
                (deal.projected_cost ?? 0) > 0
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-muted-foreground',
              )}
            >
              {(deal.projected_cost ?? 0) > 0 ? formatCurrency(deal.projected_cost!) : '—'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
          >
            Open
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
