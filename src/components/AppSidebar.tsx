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
import { NavLink, useMatch, useNavigate } from 'react-router-dom'
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
  Receipt,
  Settings,
  TrendingUp,
  UsersRound,
  Wallet,
} from 'lucide-react'
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
        {
          label: 'Budget Reports',
          to: p ? `${p}/actuals` : '#',
          icon: PieChart,
          requiresProject: true,
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

const dealsNav: NavGroup[] = [
  {
    label: 'Deal Analysis',
    items: [
      { label: 'Dashboard', to: '/deals', icon: LayoutDashboard, matchPath: '/deals' },
      { label: 'Assumptions', to: '/deals', icon: ClipboardList },
      { label: 'Phase Pro Forma', to: '/deals', icon: Calendar },
      { label: 'Cash Flow', to: '/deals', icon: TrendingUp },
      { label: 'Investor Returns', to: '/deals', icon: Wallet },
      { label: 'Public Sector', to: '/deals', icon: Briefcase },
    ],
  },
  {
    label: 'Analysis & Insights',
    items: [
      { label: 'Analysis & Insights', to: '/deals', icon: LineChart },
      { label: 'Documents', to: '/deals', icon: FileText },
    ],
  },
]

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
): NavGroup[] {
  switch (ws) {
    case 'projects':
      return [...projectsNav(currentProjectId), settingsNav]
    case 'deals':
      return [...dealsNav, settingsNav]
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
  const groups = navForWorkspace(workspace, effectiveProjectId)

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <BrandHeader />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {groups.map((group, idx) => (
          <SidebarGroup key={`${group.label}-${idx}`}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
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

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.label}>
        <NavLink
          to={item.to}
          end={item.to === '/' || item.to === '/deals' || item.to === '/tenants'}
          className={({ isActive }) =>
            cn(isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium')
          }
        >
          <Icon className="size-4" />
          <span>{item.label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
