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
  // The landing. Every stage already had its own route and rendered one at a time, so what
  // the project page lacked was not navigation but a view of where the job stands without
  // clicking seven tabs to find out (Mark, 2026-10-02).
  { key: 'overview', path: '', label: 'Overview' },
  { key: 'info', path: 'info', label: DRYWALL_STATUS_LABELS['project-info'] },
  { key: 'quote', path: 'quote', label: DRYWALL_STATUS_LABELS.quote },
  { key: 'schedule', path: 'schedule', label: 'Schedule' },
  { key: 'field', path: 'field', label: DRYWALL_STATUS_LABELS['field-measurement'] },
  { key: 'order', path: 'order', label: DRYWALL_STATUS_LABELS.order },
  // Change orders get their own stage rather than living inside the quote. Measured: all 16
  // live change orders sit on jobs already in production, so they are a build-time activity
  // and the quote is the wrong moment to go looking for them.
  { key: 'change-orders', path: 'change-orders', label: 'Change Orders' },
  // Production and Closeout were near-twins — three of five tiles were the same component.
  // One money screen now, with the status on it (Mark, 2026-09-30).
  { key: 'financials', path: 'financials', label: 'Financials' },
  { key: 'files', path: 'files', label: 'Photos & Files' },
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
  const [projectAddress, setProjectAddress] = useState<string>('')
  const [projectStatus, setProjectStatus] = useState<string>('project-info')
  const [projectLegacy, setProjectLegacy] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [wideContent, setWideContent] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

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
          setProjectAddress(project.address ?? '')
          setProjectStatus(normalizeDrywallProjectStatus(project.status))
          // The shell already paid for the whole row to read three fields. Handing the blob
          // down lets the Overview derive every stage summary from this one read instead of
          // fetching the same project again per tile.
          setProjectLegacy(project.legacy ?? {})
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
  }, [projectId, navigate, reloadToken])

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
            to={
              stage.path
                ? `/drywall/projects/${projectId}/${stage.path}`
                : `/drywall/projects/${projectId}`
            }
            end={stage.path === ''}
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
        context={{
          projectId,
          projectName,
          projectAddress,
          projectStatus,
          projectLegacy,
          reloadProject: () => setReloadToken((n) => n + 1),
          setProjectName,
          setProjectStatus,
          setWideContent,
        }}
      />
    </div>
  )
}

export type DrywallProjectShellContext = {
  projectId: string
  projectName: string
  projectAddress: string
  projectStatus: string
  /**
   * The project's `metadata.legacy` from the shell's own read — **for display only.**
   *
   * Deliberately published WITHOUT the row's `updated_at`. Every blob write is guarded on a
   * page-held timestamp, and a shell-level one would go stale the moment any stage saved,
   * so a writer reaching for it would either false-conflict or, worse, overwrite. Stages
   * that write still load the project themselves and own their own timestamp.
   *
   * Null until the first read lands.
   */
  projectLegacy: Record<string, unknown> | null
  /** Re-read the project, for a surface that only reads and wants to see a stage's save. */
  reloadProject: () => void
  setProjectName: (name: string) => void
  setProjectStatus: (status: string) => void
  setWideContent?: (wide: boolean) => void
}

