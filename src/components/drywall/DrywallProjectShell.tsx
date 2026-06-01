import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/contexts/PageTitleContext'
import {
  DRYWALL_STATUS_LABELS,
  type DrywallProjectStatus,
} from '@/types/drywall'
import { fetchDrywallProjectById } from '@/services/drywallProjectsService'

const STAGE_ROUTES: { key: DrywallProjectStatus; path: string; label: string }[] = [
  { key: 'project-info', path: 'info', label: DRYWALL_STATUS_LABELS['project-info'] },
  { key: 'quote', path: 'quote', label: DRYWALL_STATUS_LABELS.quote },
  { key: 'field-measurement', path: 'field', label: DRYWALL_STATUS_LABELS['field-measurement'] },
  { key: 'order', path: 'order', label: DRYWALL_STATUS_LABELS.order },
]

export function DrywallProjectShell() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [projectName, setProjectName] = useState<string>('Drywall Project')
  const [loading, setLoading] = useState(true)

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
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
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
            <h1 className="text-2xl font-semibold tracking-tight">{projectName}</h1>
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

      <Outlet context={{ projectId, projectName, setProjectName }} />
    </div>
  )
}

export type DrywallProjectShellContext = {
  projectId: string
  projectName: string
  setProjectName: (name: string) => void
}
