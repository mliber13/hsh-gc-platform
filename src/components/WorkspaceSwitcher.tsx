// ============================================================================
// WorkspaceSwitcher — top-right dropdown-pill for switching workspaces
// ============================================================================
//
// Vercel team-switcher style: shows current workspace name + chevron, opens
// a popover with the three workspace options (Projects / Deals / Tenants).
// Selecting persists to localStorage and navigates to the workspace home.
//

import { Briefcase, Building2, ChevronsUpDown, Check, Users } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useActiveWorkspace, Workspace } from '@/hooks/useActiveWorkspace'
import { cn } from '@/lib/utils'

type WorkspaceMeta = {
  id: Workspace
  label: string
  description: string
  icon: typeof Briefcase
}

const WORKSPACES: WorkspaceMeta[] = [
  {
    id: 'projects',
    label: 'Projects',
    description: 'Active builds + estimates',
    icon: Building2,
  },
  {
    id: 'deals',
    label: 'Deals',
    description: 'Pipeline + pro forma',
    icon: Briefcase,
  },
  {
    id: 'tenants',
    label: 'Tenants',
    description: 'Tenant pipeline',
    icon: Users,
  },
]

export function WorkspaceSwitcher() {
  const { workspace, setWorkspace } = useActiveWorkspace()
  const active = WORKSPACES.find((w) => w.id === workspace) ?? WORKSPACES[0]
  const ActiveIcon = active.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 rounded-full pl-2 pr-3 text-sm font-medium"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
            <ActiveIcon className="size-3" />
          </span>
          <span>{active.label}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Switch workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {WORKSPACES.map((ws) => {
          const Icon = ws.icon
          const isActive = ws.id === workspace
          return (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => setWorkspace(ws.id)}
              className="gap-2"
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-md',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-medium">{ws.label}</span>
                <span className="text-xs text-muted-foreground">
                  {ws.description}
                </span>
              </div>
              {isActive && <Check className="size-4 text-muted-foreground" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
