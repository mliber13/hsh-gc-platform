// ============================================================================
// ProjectSelector — header dropdown for the current project (GC or Drywall)
// ============================================================================
//
// Projects workspace: current GC project on /projects/:id/* (unchanged).
// Drywall workspace: current drywall project on /drywall/projects/:id/* only
// (hidden on /drywall list and workspace-agnostic Settings routes).
//
// Future: deal/tenant selectors for the other workspaces.
//

import { useEffect, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { Building2, ChevronsUpDown, Hammer } from 'lucide-react'
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
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import type { DrywallProjectListItem } from '@/types/drywall'
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

function isDrywallProjectRoute(pathname: string): boolean {
  return /^\/drywall\/projects\/[^/]+/.test(pathname)
}

export function ProjectSelector() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace } = useActiveWorkspace()

  const projectMatch = useMatch('/projects/:projectId/*')
  const projectIndexMatch = useMatch('/projects/:projectId')
  const currentProjectId =
    projectMatch?.params.projectId ?? projectIndexMatch?.params.projectId

  const drywallProjectMatch = useMatch('/drywall/projects/:projectId/*')
  const drywallProjectIndexMatch = useMatch('/drywall/projects/:projectId')
  const currentDrywallProjectId =
    drywallProjectMatch?.params.projectId ?? drywallProjectIndexMatch?.params.projectId

  const [projects, setProjects] = useState<Project[]>([])
  const [drywallProjects, setDrywallProjects] = useState<DrywallProjectListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasLoadedGc, setHasLoadedGc] = useState(false)
  const [hasLoadedDrywall, setHasLoadedDrywall] = useState(false)

  const isGc = workspace === 'projects'
  const isDrywall = workspace === 'drywall'

  if (isSettingsPath(location.pathname)) {
    return null
  }

  if (isDrywall && !isDrywallProjectRoute(location.pathname)) {
    return null
  }

  if (!isGc && !isDrywall) {
    return null
  }

  const loadGcProjects = async () => {
    if (hasLoadedGc || loading) return
    setLoading(true)
    try {
      const list = await getProjects_Hybrid()
      setProjects(list)
      setHasLoadedGc(true)
    } finally {
      setLoading(false)
    }
  }

  const loadDrywallProjects = async () => {
    if (hasLoadedDrywall || loading) return
    setLoading(true)
    try {
      const list = await fetchDrywallProjects()
      setDrywallProjects(list)
      setHasLoadedDrywall(true)
    } finally {
      setLoading(false)
    }
  }

  const loadProjects = () => {
    if (isGc) void loadGcProjects()
    if (isDrywall) void loadDrywallProjects()
  }

  const currentGcProject = currentProjectId
    ? projects.find((p) => p.id === currentProjectId)
    : null

  const currentDrywallProject = currentDrywallProjectId
    ? drywallProjects.find((p) => p.id === currentDrywallProjectId)
    : null

  useEffect(() => {
    if (isGc && currentProjectId && !hasLoadedGc) {
      void loadGcProjects()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGc, currentProjectId, hasLoadedGc])

  useEffect(() => {
    if (isDrywall && currentDrywallProjectId && !hasLoadedDrywall) {
      void loadDrywallProjects()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrywall, currentDrywallProjectId, hasLoadedDrywall])

  const Icon = isDrywall ? Hammer : Building2

  const label = isDrywall
    ? (currentDrywallProject?.name ??
      (currentDrywallProjectId ? 'Loading…' : 'Drywall projects'))
    : (currentGcProject?.name ?? (currentProjectId ? 'Loading…' : 'All projects'))

  const menuLabel = isDrywall
    ? loading && !hasLoadedDrywall
      ? 'Loading drywall projects…'
      : 'Jump to drywall project'
  : loading && !hasLoadedGc
      ? 'Loading projects…'
      : 'Jump to project'

  const activeId = isDrywall ? currentDrywallProjectId : currentProjectId

  return (
    <DropdownMenu onOpenChange={(open: boolean) => { if (open) loadProjects() }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-[18rem] gap-2 px-2 text-sm font-medium"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-h-96 overflow-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {menuLabel}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isGc && (
          <>
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
                  project.id === activeId && 'bg-accent',
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
            {hasLoadedGc && projects.length === 0 && (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                No projects yet
              </DropdownMenuItem>
            )}
          </>
        )}
        {isDrywall && (
          <>
            <DropdownMenuItem onClick={() => navigate('/drywall')} className="gap-2">
              <Hammer className="size-4 text-muted-foreground" />
              <span>All drywall projects</span>
            </DropdownMenuItem>
            {drywallProjects.length > 0 && <DropdownMenuSeparator />}
            {drywallProjects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => navigate(`/drywall/projects/${project.id}/info`)}
                className={cn(
                  'flex flex-col items-start gap-0.5',
                  project.id === activeId && 'bg-accent',
                )}
              >
                <span className="text-sm font-medium truncate w-full">
                  {project.name}
                </span>
                {project.client && (
                  <span className="text-xs text-muted-foreground truncate w-full">
                    {project.client}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
            {hasLoadedDrywall && drywallProjects.length === 0 && (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                No drywall projects yet
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
