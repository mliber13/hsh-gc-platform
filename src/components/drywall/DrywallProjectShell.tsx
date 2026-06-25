import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/contexts/PageTitleContext'
import {
  DRYWALL_STATUS_LABELS,
  drywallStatusBadgeLabel,
  normalizeDrywallProjectStatus,
  type DrywallStageRouteKey,
} from '@/types/drywall'
import { fetchDrywallProjectById } from '@/services/drywallProjectsService'

const STAGE_ROUTES: { key: DrywallStageRouteKey; path: string; label: string }[] = [
  { key: 'info', path: 'info', label: DRYWALL_STATUS_LABELS['project-info'] },
  { key: 'quote', path: 'quote', label: DRYWALL_STATUS_LABELS.quote },
  { key: 'schedule', path: 'schedule', label: 'Schedule' },
  { key: 'field', path: 'field', label: DRYWALL_STATUS_LABELS['field-measurement'] },
  { key: 'order', path: 'order', label: DRYWALL_STATUS_LABELS.order },
  { key: 'production', path: 'production', label: DRYWALL_STATUS_LABELS.production },
  { key: 'closeout', path: 'closeout', label: 'Closeout' },
]

const STATUS_BADGE_CLASS: Record<string, string> = {
  'project-info': 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  quote: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'field-measurement': 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  order: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  production: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  'production-complete':
    'border-emerald-600/30 bg-emerald-600/10 text-emerald-900 dark:text-emerald-100',
  closed: 'border-slate-600/30 bg-slate-600/10 text-slate-800 dark:text-slate-200',
}

function statusBadgeClass(status: string): string {
  const key = normalizeDrywallProjectStatus(status)
  return STATUS_BADGE_CLASS[key] ?? STATUS_BADGE_CLASS['project-info']
}

export function DrywallProjectShell() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [projectName, setProjectName] = useState<string>('Drywall Project')
  const [projectStatus, setProjectStatus] = useState<string>('project-info')
  const [loading, setLoading] = useState(true)
  const [wideContent, setWideContent] = useState(false)

  usePageTitle(projectName ? `Drywall — ${projectName}` : 'Drywall Project')

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    void fetchDrywallProjectById(projectId)
      .then((project) => {
        if (cancelled) return
        if (project) {
          setProjectName(project.name)
          setProjectStatus(normalizeDrywallProjectStatus(project.status))
        } else {
          navigate('/drywall', { replace: true })
        }
      })
      .catch(() => {
        if (!cancelled) navigate('/drywall', { replace: true })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, navigate])

  if (!projectId) {
    return null
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'space-y-6',
        wideContent
          ? 'w-full max-w-none px-4 pb-6 md:px-5'
          : 'mx-auto max-w-6xl p-4 md:p-6',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 mt-0.5"
            onClick={() => navigate('/drywall')}
            aria-label="Back to drywall projects"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{projectName}</h1>
              <span
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  statusBadgeClass(projectStatus),
                )}
              >
                {drywallStatusBadgeLabel(projectStatus)}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Drywall workflow — open any stage; prerequisites are warnings only (Option B).
            </p>
          </div>
        </div>
      </div>

      <nav
        aria-label="Drywall workflow stages"
        className="flex flex-wrap gap-2 border-b border-border pb-4"
      >
        {STAGE_ROUTES.map((stage) => (
          <NavLink
            key={stage.key}
            to={`/drywall/projects/${projectId}/${stage.path}`}
            className={({ isActive }) =>
              cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )
            }
          >
            {stage.label}
          </NavLink>
        ))}
      </nav>

      <Outlet
        context={{ projectId, projectName, projectStatus, setProjectName, setProjectStatus, setWideContent }}
      />
    </div>
  )
}

export type DrywallProjectShellContext = {
  projectId: string
  projectName: string
  projectStatus: string
  setProjectName: (name: string) => void
  setProjectStatus: (status: string) => void
  setWideContent?: (wide: boolean) => void
}

