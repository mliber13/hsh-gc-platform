import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Hammer, PlusCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { ReopenProjectConfirmDialog } from '@/components/drywall/ReopenProjectConfirmDialog'
import {
  createDrywallProject,
  DrywallProjectPermissionError,
  fetchDrywallProjects,
} from '@/services/drywallProjectsService'
import {
  DRYWALL_STATUS_LABELS,
  type DrywallProjectListItem,
  type DrywallProjectStatus,
} from '@/types/drywall'

const STATUS_PILL: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  'project-info': {
    bg: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/30',
    dot: 'bg-sky-500',
  },
  quote: {
    bg: 'bg-violet-500/15',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/30',
    dot: 'bg-violet-500',
  },
  'field-measurement': {
    bg: 'bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/30',
    dot: 'bg-amber-500',
  },
  order: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  complete: {
    bg: 'bg-slate-500/15',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/30',
    dot: 'bg-slate-500',
  },
}

function StatusPill({ status }: { status: string }) {
  const key = status in STATUS_PILL ? status : 'project-info'
  const v = STATUS_PILL[key]
  const label =
    (DRYWALL_STATUS_LABELS as Record<string, string>)[status] ?? status.replace(/-/g, ' ')
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
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

export function DrywallProjectsListPage() {
  usePageTitle('Drywall Projects')
  const navigate = useNavigate()
  const { effectiveRole } = usePermissions()
  const canWrite = canWriteDrywallProject(effectiveRole)

  const [projects, setProjects] = useState<DrywallProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [reopenProjectId, setReopenProjectId] = useState<string | null>(null)

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

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    let rows = projects
    if (!showCompleted) {
      rows = rows.filter((p) => p.status !== 'complete')
    }
    if (!q) return rows
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q),
    )
  }, [projects, searchQuery, showCompleted])

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
          <Button onClick={() => void handleCreate()} disabled={creating} className="shrink-0">
            <PlusCircle className="mr-2 h-4 w-4" />
            {creating ? 'Creating…' : 'New Drywall Project'}
          </Button>
        )}
      </div>

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
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Show completed projects
        </label>
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
        <div className="grid gap-3">
          {filtered.map((project) => {
            const isComplete = project.status === 'complete'
            return (
              <div
                key={project.id}
                className="rounded-lg border border-border bg-card/50 p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <button
                    type="button"
                    onClick={() => navigate(`/drywall/projects/${project.id}/info`)}
                    className="text-left min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    <div className="space-y-1">
                      <p className="font-medium truncate">{project.name}</p>
                      {project.client && (
                        <p className="text-sm text-muted-foreground truncate">{project.client}</p>
                      )}
                      {project.address && (
                        <p className="text-sm text-muted-foreground truncate">{project.address}</p>
                      )}
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <StatusPill status={project.status as DrywallProjectStatus} />
                    <span className="text-xs text-muted-foreground">
                      Updated {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
                    </span>
                    {showCompleted && isComplete && canWrite && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setReopenProjectId(project.id)}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
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
    </div>
  )
}
