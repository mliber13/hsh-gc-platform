import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Hammer, PlusCircle, Search, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { DrywallProjectCard } from '@/components/drywall/DrywallProjectCard'
import { DrywallProjectsStatsStrip } from '@/components/drywall/DrywallProjectsStatsStrip'
import { PoIntakeDialog } from '@/components/drywall/intake/PoIntakeDialog'
import { ReopenProjectConfirmDialog } from '@/components/drywall/ReopenProjectConfirmDialog'
import {
  createDrywallProject,
  DrywallProjectPermissionError,
  fetchDrywallProjects,
  updateDrywallProjectStatus,
} from '@/services/drywallProjectsService'
import type { DrywallProjectListItem, DrywallProjectStatus } from '@/types/drywall'
import {
  DRYWALL_LIST_STATUS_FILTER_OPTIONS,
  isDrywallProjectClosed,
  normalizeDrywallProjectStatus,
} from '@/types/drywall'

export function DrywallProjectsListPage() {
  usePageTitle('Drywall Projects')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { effectiveRole } = usePermissions()
  const canWrite = canWriteDrywallProject(effectiveRole)
  const isViewer = !canWrite

  const [projects, setProjects] = useState<DrywallProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [poIntakeOpen, setPoIntakeOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [reopenProjectId, setReopenProjectId] = useState<string | null>(null)
  const [statusMenuProjectId, setStatusMenuProjectId] = useState<string | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)

  const statusFilter =
    (searchParams.get('status') as (typeof DRYWALL_LIST_STATUS_FILTER_OPTIONS)[number]['value']) ??
    'active'

  const setStatusFilter = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === 'active') next.delete('status')
      else next.set('status', value)
      return next
    })
  }

  const reloadProjects = () => {
    void fetchDrywallProjects()
      .then(setProjects)
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Failed to refresh projects')
      })
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchDrywallProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load drywall projects')
          setProjects([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    let rows = projects
    if (statusFilter === 'active') {
      rows = rows.filter((p) => !isDrywallProjectClosed(p.status))
    } else if (statusFilter !== 'all') {
      rows = rows.filter(
        (p) => normalizeDrywallProjectStatus(p.status) === statusFilter,
      )
    }
    if (!q) return rows
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q),
    )
  }, [projects, searchQuery, statusFilter])

  const handleCreate = async () => {
    if (!canWrite) return
    setCreating(true)
    try {
      const id = await createDrywallProject()
      navigate(`/drywall/projects/${id}/info`)
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to create project')
      }
    } finally {
      setCreating(false)
    }
  }

  const handleStatusChange = async (
    project: DrywallProjectListItem,
    newStatus: DrywallProjectStatus,
  ) => {
    if (newStatus === project.status) {
      setStatusMenuProjectId(null)
      return
    }
    setUpdatingStatusId(project.id)
    setStatusMenuProjectId(null)
    try {
      await updateDrywallProjectStatus(project.id, newStatus)
      setProjects((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? { ...p, status: newStatus, updatedAt: new Date() }
            : p,
        ),
      )
      toast.success('Status updated.')
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to update status')
      }
    } finally {
      setUpdatingStatusId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Hammer className="h-7 w-7 text-primary" />
            Drywall Projects
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Drywall-scoped jobs and dual-view projects with quote work — including new projects
            before quote content is entered.
          </p>
        </div>
        {canWrite && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={creating} className="shrink-0">
                <PlusCircle className="mr-2 h-4 w-4" />
                {creating ? 'Creating…' : 'New Drywall Project'}
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleCreate()}>
                New from scratch
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPoIntakeOpen(true)}>
                Create from PO
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!loading && projects.length > 0 && <DrywallProjectsStatsStrip projects={filtered} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, client, or address…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-card/50"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px] bg-card/50">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {DRYWALL_LIST_STATUS_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
          <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Hammer className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium">No drywall projects yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {projects.length === 0
                  ? 'No drywall-scoped projects yet. Create one to get started.'
                  : 'No projects match your search.'}
              </p>
            </div>
            {canWrite && projects.length === 0 && (
              <Button variant="outline" onClick={() => void handleCreate()} disabled={creating}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Drywall Project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div ref={statusMenuRef} className="flex flex-col gap-2">
          {filtered.map((project) => (
            <DrywallProjectCard
              key={project.id}
              project={project}
              onSelect={(p) => navigate(`/drywall/projects/${p.id}/info`)}
              statusMenuOpen={statusMenuProjectId === project.id}
              onToggleStatusMenu={() =>
                setStatusMenuProjectId((prev) =>
                  prev === project.id ? null : project.id,
                )
              }
              onChangeStatus={(p, status) => void handleStatusChange(p, status)}
              isUpdatingStatus={updatingStatusId === project.id}
              isViewer={isViewer}
              showReopen={isDrywallProjectClosed(project.status)}
              onReopen={(p) => setReopenProjectId(p.id)}
            />
          ))}
        </div>
      )}

      <ReopenProjectConfirmDialog
        open={Boolean(reopenProjectId)}
        onOpenChange={(open) => {
          if (!open) setReopenProjectId(null)
        }}
        projectId={reopenProjectId ?? ''}
        onReopened={reloadProjects}
      />

      <PoIntakeDialog
        open={poIntakeOpen}
        onOpenChange={setPoIntakeOpen}
        onCreated={(id) => navigate(`/drywall/projects/${id}/info`)}
      />
    </div>
  )
}
