// ============================================================================
// AppSidebar — workspace-aware persistent sidebar
// ============================================================================
//
// Three workspaces, each with its own nav structure per
// docs/DESIGN_LANGUAGE.md §5.4. The active workspace is sourced from
// useActiveWorkspace (URL-derived with localStorage fallback).
//
// Project-scoped routes (Estimates, Actuals, etc.) need a project context to
// produce a working URL. When no project is selected, those nav items are
// disabled with a tooltip nudging the user to pick a project from the header
// selector first.
//

import { useEffect, useState } from 'react'
import { NavLink, useLocation, useMatch, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Briefcase,
  Calculator,
  Calendar,
  ClipboardList,
  DollarSign,
  FileText,
  Kanban,
  LayoutDashboard,
  Library,
  LineChart,
  Link2,
  ListChecks,
  PieChart,
  Plus,
  Receipt,
  Settings,
  TrendingUp,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { useActiveWorkspace, Workspace } from '@/hooks/useActiveWorkspace'
import { Project } from '@/types'
import { getProjects_Hybrid } from '@/services/hybridService'
import { cn } from '@/lib/utils'
import { SidebarUserMenu } from './SidebarUserMenu'

// ----------------------------------------------------------------------------
// Nav item types
// ----------------------------------------------------------------------------

type NavItem = {
  label: string
  to: string
  icon: typeof LayoutDashboard
  /** Match function for active state (defaults to exact path match) */
  matchPath?: string
  /** Active when the URL's ?tab=<value> matches this. Used for deals nav. */
  matchTab?: string
  /** Active only when pathname exactly matches `to` AND there is no query
   *  string. Used for the top-level Deals "Dashboard" so it stops being
   *  active once the user picks a tab (?tab=...). */
  matchExactNoQuery?: boolean
  /** When true and no project is selected, render disabled */
  requiresProject?: boolean
}

type NavGroup = {
  label: string
  items: NavItem[]
}

// ----------------------------------------------------------------------------
// Per-workspace nav definitions
// ----------------------------------------------------------------------------

function projectsNav(projectId: string | undefined): NavGroup[] {
  const p = projectId ? `/projects/${projectId}` : null
  return [
    {
      label: 'Modules',
      items: [
        { label: 'Dashboard', to: '/', icon: LayoutDashboard, matchPath: '/' },
        {
          label: 'Estimates',
          to: p ? `${p}/estimate` : '#',
          icon: Calculator,
          matchPath: '/projects/:projectId/estimate',
          requiresProject: true,
        },
        {
          label: 'Actuals',
          to: p ? `${p}/actuals` : '#',
          icon: DollarSign,
          matchPath: '/projects/:projectId/actuals',
          requiresProject: true,
        },
        {
          label: 'Forms',
          to: p ? `${p}/forms` : '#',
          icon: FileText,
          matchPath: '/projects/:projectId/forms',
          requiresProject: true,
        },
        {
          label: 'Schedule',
          to: p ? `${p}/schedule` : '#',
          icon: Calendar,
          matchPath: '/projects/:projectId/schedule',
          requiresProject: true,
        },
        {
          label: 'Selections',
          to: p ? `${p}/selection-book` : '#',
          icon: ListChecks,
          matchPath: '/projects/:projectId/selection-book',
          requiresProject: true,
        },
        {
          label: 'Docs',
          to: p ? `${p}/documents` : '#',
          icon: FileText,
          matchPath: '/projects/:projectId/documents',
          requiresProject: true,
        },
        {
          label: 'Change Orders',
          to: p ? `${p}/change-orders` : '#',
          icon: ClipboardList,
          matchPath: '/projects/:projectId/change-orders',
          requiresProject: true,
        },
        {
          label: 'Purchase Orders',
          to: p ? `${p}/purchase-orders` : '#',
          icon: Receipt,
          matchPath: '/projects/:projectId/purchase-orders',
          requiresProject: true,
        },
        {
          label: 'QuickBooks',
          to: '/quickbooks/settings',
          icon: Receipt,
          matchPath: '/quickbooks/settings',
        },
      ],
    },
    {
      label: 'Reports',
      items: [
        // Budget Reports + Analytics are placeholders for future report-generation
        // surfaces. Currently render as disabled "Coming soon" — owner explicitly
        // wants Budget Reports as a future home for actual report generation,
        // distinct from the existing Actuals page (which lives in Modules).
        {
          label: 'Budget Reports',
          to: '#',
          icon: PieChart,
        },
        {
          label: 'Analytics',
          to: '#',
          icon: BarChart3,
        },
      ],
    },
  ]
}

function dealsNav(dealId: string | undefined): NavGroup[] {
  // Tab-driven items live inside DealWorkspace and are activated via ?tab=<x>.
  // When a deal is in the URL, preserve it; otherwise fall through to
  // /deals/workspace (DealWorkspace picks the most-recent deal). We point
  // tabs at /deals/workspace specifically — not /deals — because /deals is
  // the dedicated Deals dashboard.
  const base = dealId ? `/deals/workspace/${dealId}` : '/deals/workspace'
  const tab = (t: string) => `${base}?tab=${t}`

  return [
    {
      // Top-level Dashboard sits above the Deal Analysis group; takes the
      // user to the Deals dashboard at /deals.
      label: '',
      items: [
        { label: 'Dashboard', to: '/deals', icon: LayoutDashboard, matchExactNoQuery: true },
      ],
    },
    {
      label: 'Deal Analysis',
      items: [
        // "Overview" maps to the in-page Dashboard tab (Projected Profit /
        // MOIC / Deal Snapshot / ProForma Memo).
        { label: 'Overview', to: tab('dashboard'), icon: LayoutDashboard, matchTab: 'dashboard' },
        { label: 'Assumptions', to: tab('assumptions'), icon: ClipboardList, matchTab: 'assumptions' },
        { label: 'Phase Pro Forma', to: tab('phase-pro-forma'), icon: Calendar, matchTab: 'phase-pro-forma' },
        { label: 'Cash Flow', to: tab('cash-flow'), icon: TrendingUp, matchTab: 'cash-flow' },
        { label: 'Investor Returns', to: tab('investor-returns'), icon: Wallet, matchTab: 'investor-returns' },
        { label: 'Public Sector', to: tab('public-sector'), icon: Briefcase, matchTab: 'public-sector' },
        { label: 'Analysis & Insights', to: tab('analysis'), icon: LineChart, matchTab: 'analysis' },
        // Documents has no in-page tab yet; placeholder per design language §5.4.
        { label: 'Documents', to: '#', icon: FileText },
      ],
    },
  ]
}

const tenantsNav: NavGroup[] = [
  {
    label: 'Pipeline',
    items: [
      { label: 'Pipeline', to: '/tenants', icon: Kanban, matchPath: '/tenants' },
      { label: 'Tenants', to: '/tenants', icon: UsersRound },
    ],
  },
]

const settingsNav: NavGroup = {
  label: 'Settings',
  items: [
    { label: 'Item Library', to: '/library/estimates', icon: Library },
    { label: 'Plan Library', to: '/library/plans', icon: FileText },
    { label: 'SOW Management', to: '/sow', icon: ClipboardList },
    { label: 'Contact Directory', to: '/contacts', icon: UsersRound },
    { label: 'Feedback', to: '/feedback', icon: Settings },
    { label: 'QuickBooks', to: '/quickbooks/settings', icon: Link2 },
  ],
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

function navForWorkspace(
  ws: Workspace,
  currentProjectId: string | undefined,
  currentDealId: string | undefined,
): NavGroup[] {
  switch (ws) {
    case 'projects':
      return [...projectsNav(currentProjectId), settingsNav]
    case 'deals':
      return [...dealsNav(currentDealId), settingsNav]
    case 'tenants':
      return [...tenantsNav, settingsNav]
  }
}

export function AppSidebar() {
  const { workspace } = useActiveWorkspace()
  const projectMatch = useMatch('/projects/:projectId/*')
  const projectIndexMatch = useMatch('/projects/:projectId')
  const currentProjectId =
    projectMatch?.params.projectId ?? projectIndexMatch?.params.projectId

  const dealMatch = useMatch('/deals/workspace/:dealId')
  const currentDealId = dealMatch?.params.dealId

  // For "requiresProject" nav items: if no project in URL but the user has
  // any projects at all, we'll fall back to "the most recent project" so the
  // nav links work from the dashboard. If they have zero projects, links stay
  // disabled.
  const [recentProjectId, setRecentProjectId] = useState<string | undefined>(
    undefined,
  )

  useEffect(() => {
    if (workspace !== 'projects' || currentProjectId) return
    void getProjects_Hybrid().then((list) => {
      if (list && list.length > 0) {
        setRecentProjectId(list[0].id)
      }
    })
  }, [workspace, currentProjectId])

  const effectiveProjectId = currentProjectId ?? recentProjectId
  const groups = navForWorkspace(workspace, effectiveProjectId, currentDealId)

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <BrandHeader />
        <PrimaryAction workspace={workspace} />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {groups.map((group, idx) => (
          <SidebarGroup key={`${group.label}-${idx}`}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavLinkItem
                    key={`${item.label}-${item.to}`}
                    item={item}
                    hasProject={!!effectiveProjectId}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserMenu />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

// ----------------------------------------------------------------------------
// Pieces
// ----------------------------------------------------------------------------

/** Workspace-specific primary CTA in the sidebar header (e.g. "+ New Project").
 * Hidden when the sidebar is collapsed to icon-only mode. */
function PrimaryAction({ workspace }: { workspace: Workspace }) {
  const navigate = useNavigate()

  if (workspace === 'projects') {
    return (
      <div className="px-1 group-data-[collapsible=icon]:hidden">
        <Button
          onClick={() => navigate('/projects/new')}
          size="sm"
          className="w-full justify-start gap-2"
        >
          <Plus className="size-4" />
          New Project
        </Button>
      </div>
    )
  }

  if (workspace === 'deals') {
    // Sidebar nav signals "open create modal" via /deals?new=1; DealWorkspace
    // listens for the param and opens its existing modal.
    return (
      <div className="px-1 group-data-[collapsible=icon]:hidden">
        <Button
          onClick={() => navigate('/deals?new=1')}
          size="sm"
          className="w-full justify-start gap-2"
        >
          <Plus className="size-4" />
          New Deal
        </Button>
      </div>
    )
  }

  return null
}

function BrandHeader() {
  const navigate = useNavigate()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          onClick={() => navigate('/')}
          className="data-[active=true]:bg-transparent"
        >
          <span className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold">
            HSH
          </span>
          <div className="grid flex-1 text-left leading-tight">
            <span className="truncate font-semibold">HSH GC Platform</span>
            <span className="truncate text-xs text-sidebar-foreground/70">
              Contractor + Home Builders
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function NavLinkItem({
  item,
  hasProject,
}: {
  item: NavItem
  hasProject: boolean
}) {
  const location = useLocation()
  const Icon = item.icon
  const disabled = item.requiresProject && !hasProject
  const isHashOnly = item.to === '#'

  if (disabled || isHashOnly) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-disabled
          className="cursor-not-allowed opacity-50"
          tooltip={
            disabled
              ? 'Pick a project from the header selector first'
              : 'Coming soon'
          }
        >
          <Icon className="size-4" />
          <span>{item.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  // For tab-driven items (deals nav), active state is "we're on a /deals*
  // path AND the active ?tab matches this item's matchTab". NavLink's default
  // isActive ignores the query string, so do this manually.
  const activeClass = 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
  if (item.matchTab) {
    const params = new URLSearchParams(location.search)
    const isActive =
      location.pathname.startsWith('/deals') &&
      params.get('tab') === item.matchTab
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={item.label}>
          <NavLink to={item.to} className={cn(isActive && activeClass)}>
            <Icon className="size-4" />
            <span>{item.label}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  // Top-level "Dashboard" needs to deactivate as soon as a tab is selected
  // (otherwise both Dashboard and Overview light up on /deals?tab=dashboard).
  if (item.matchExactNoQuery) {
    const isActive =
      location.pathname === item.to && location.search === ''
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={item.label}>
          <NavLink to={item.to} className={cn(isActive && activeClass)}>
            <Icon className="size-4" />
            <span>{item.label}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.label}>
        <NavLink
          to={item.to}
          end={item.to === '/' || item.to === '/deals' || item.to === '/tenants'}
          className={({ isActive }) => cn(isActive && activeClass)}
        >
          <Icon className="size-4" />
          <span>{item.label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
