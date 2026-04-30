// ============================================================================
// ProjectSelector — left-side header dropdown for picking the current project
// ============================================================================
//
// Visible when the active workspace is Projects. Shows the current project
// name (when on /projects/:id/*) or "Select a project" (when on /). Opens a
// dropdown of all projects; selecting navigates to that project's detail page.
//
// Hidden entirely on workspace-agnostic Settings routes (/library, /quickbooks,
// /contacts, /sow, /feedback) — those pages have no project context.
//
// Future: deal/tenant selectors for the other workspaces. Phase 1 covers
// Projects only.
//

import { useEffect, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { Building2, ChevronsUpDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Project } from '@/types'
import { getProjects_Hybrid } from '@/services/hybridService'
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

export function ProjectSelector() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace } = useActiveWorkspace()
  const projectMatch = useMatch('/projects/:projectId/*')
  const projectIndexMatch = useMatch('/projects/:projectId')
  const currentProjectId =
    projectMatch?.params.projectId ?? projectIndexMatch?.params.projectId

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  // Lazy-load project list the first time the dropdown opens (or on demand)
  const loadProjects = async () => {
    if (hasLoaded || loading) return
    setLoading(true)
    try {
      const list = await getProjects_Hybrid()
      setProjects(list)
      setHasLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  // Keep the current project label fresh: if URL has :projectId, find it
  const currentProject = currentProjectId
    ? projects.find((p) => p.id === currentProjectId)
    : null

  // Pre-load list when on a project route so the label resolves immediately
  useEffect(() => {
    if (currentProjectId && !hasLoaded) {
      void loadProjects()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId])

  // Hide selector when not in Projects workspace OR on Settings routes
  if (workspace !== 'projects' || isSettingsPath(location.pathname)) {
    return null
  }

  const label = currentProject?.name ?? (currentProjectId ? 'Loading…' : 'All projects')

  return (
    <DropdownMenu onOpenChange={(open: boolean) => { if (open) void loadProjects() }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-[18rem] gap-2 px-2 text-sm font-medium"
        >
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-h-96 overflow-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {loading ? 'Loading projects…' : 'Jump to project'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/')} className="gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <span>All projects (Dashboard)</span>
        </DropdownMenuItem>
        {projects.length > 0 && <DropdownMenuSeparator />}
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => navigate(`/projects/${project.id}`)}
            className={cn(
              'flex flex-col items-start gap-0.5',
              project.id === currentProjectId && 'bg-accent',
            )}
          >
            <span className="text-sm font-medium truncate w-full">
              {project.name}
            </span>
            {project.address?.street && (
              <span className="text-xs text-muted-foreground truncate w-full">
                {project.address.street}
                {project.address.city ? ` · ${project.address.city}` : ''}
              </span>
            )}
          </DropdownMenuItem>
        ))}
        {hasLoaded && projects.length === 0 && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            No projects yet
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
