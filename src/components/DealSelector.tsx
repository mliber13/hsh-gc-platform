// ============================================================================
// DealSelector — left-side header dropdown for picking the current deal
// ============================================================================
//
// Mirror of ProjectSelector, gated on the Deals workspace. Visible when the
// active workspace is Deals. Shows the current deal name (when on
// /deals/workspace/:dealId) or "All deals" (when on /deals). Opens a dropdown
// of all deals; selecting navigates to that deal's workspace route.
//
// Hidden entirely on workspace-agnostic Settings routes (/library, /quickbooks,
// /contacts, /sow, /feedback) — those pages have no deal context.
//

import { useEffect, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { Briefcase, ChevronsUpDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import type { Deal } from '@/types/deal'
import { fetchDeals } from '@/services/dealService'
import { useActiveWorkspace } from '@/hooks/useActiveWorkspace'
import { cn } from '@/lib/utils'

const SETTINGS_PREFIXES = [
  '/library',
  '/quickbooks',
  '/contacts',
  '/sow',
  '/feedback',
]

function isSettingsPath(pathname: string): boolean {
  return SETTINGS_PREFIXES.some((p) => pathname.startsWith(p))
}

export function DealSelector() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace } = useActiveWorkspace()
  const dealMatch = useMatch('/deals/workspace/:dealId')
  const currentDealId = dealMatch?.params.dealId

  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  // Lazy-load deal list the first time the dropdown opens (or on demand)
  const loadDeals = async () => {
    if (hasLoaded || loading) return
    setLoading(true)
    try {
      const list = await fetchDeals()
      setDeals(list)
      setHasLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  // Keep the current deal label fresh: if URL has :dealId, find it
  const currentDeal = currentDealId
    ? deals.find((d) => d.id === currentDealId)
    : null

  // Pre-load list when on a deal route so the label resolves immediately
  useEffect(() => {
    if (currentDealId && !hasLoaded) {
      void loadDeals()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDealId])

  // Hide selector when not in Deals workspace OR on Settings routes
  if (workspace !== 'deals' || isSettingsPath(location.pathname)) {
    return null
  }

  const label =
    currentDeal?.deal_name ?? (currentDealId ? 'Loading…' : 'All deals')

  return (
    <DropdownMenu onOpenChange={(open: boolean) => { if (open) void loadDeals() }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-[18rem] gap-2 px-2 text-sm font-medium"
        >
          <Briefcase className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-h-96 overflow-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {loading ? 'Loading deals…' : 'Jump to deal'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/deals')} className="gap-2">
          <Briefcase className="size-4 text-muted-foreground" />
          <span>All deals</span>
        </DropdownMenuItem>
        {deals.length > 0 && <DropdownMenuSeparator />}
        {deals.map((deal) => (
          <DropdownMenuItem
            key={deal.id}
            onClick={() => navigate(`/deals/workspace/${deal.id}`)}
            className={cn(
              'flex flex-col items-start gap-0.5',
              deal.id === currentDealId && 'bg-accent',
            )}
          >
            <span className="text-sm font-medium truncate w-full">
              {deal.deal_name}
            </span>
            {deal.location && (
              <span className="text-xs text-muted-foreground truncate w-full">
                {deal.location}
              </span>
            )}
          </DropdownMenuItem>
        ))}
        {hasLoaded && deals.length === 0 && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            No deals yet
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
