// ============================================================================
// ProjectScope — parent route component for /projects/:projectId/*
// ============================================================================
//
// Fetches the project by URL param and provides it to nested route components
// via Outlet context. Re-fetches on pathname change to keep totals fresh as
// the user navigates between subroutes (Estimate → Actuals → Schedule etc.),
// matching the pre-migration App.tsx behavior.
//

import { useCallback, useEffect, useState } from 'react'
import {
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom'
import { Project } from '@/types'
import { getProject_Hybrid } from '@/services/hybridService'

type ProjectContextValue = {
  project: Project
  setProject: (p: Project) => void
  refresh: () => Promise<void>
}

export function ProjectScope() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!projectId) return
    const fresh = await getProject_Hybrid(projectId)
    if (fresh) setProject(fresh)
  }, [projectId])

  // Initial load + reload whenever projectId changes (different project)
  useEffect(() => {
    if (!projectId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getProject_Hybrid(projectId).then((p) => {
      if (cancelled) return
      if (!p) {
        navigate('/', { replace: true })
        return
      }
      setProject(p)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [projectId, navigate])

  // Refresh on subroute change (e.g. /estimate -> /actuals) to mirror legacy
  // App.tsx behavior. Only triggered when project is already loaded; the
  // initial load is handled by the projectId effect above.
  useEffect(() => {
    if (project && projectId === project.id) {
      void refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading project…
      </div>
    )
  }
  if (!project) return null

  const ctx: ProjectContextValue = { project, setProject, refresh }
  return <Outlet context={ctx} />
}

/** Hook for child routes under /projects/:projectId/* to access the loaded project. */
export function useProjectContext(): ProjectContextValue {
  return useOutletContext<ProjectContextValue>()
}
