// ============================================================================
// useActiveWorkspace — derive current workspace from URL + localStorage
// ============================================================================
//
// Workspace = which top-level domain the user is operating in: Projects,
// Deals, or Tenants. Drives the sidebar nav and the workspace switcher.
//
// Source-of-truth strategy:
//   1. URL is authoritative if pathname implies a workspace
//      (/, /projects/* → projects; /deals/* → deals; /tenants/* → tenants)
//   2. Otherwise (workspace-agnostic Settings paths like /library/*,
//      /quickbooks/*, /contacts, /sow, /feedback) fall back to localStorage
//      so we preserve "what was the user just doing" context.
//   3. setActiveWorkspace(ws) updates localStorage AND navigates to the
//      workspace's home route.
//

import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export type Workspace = 'projects' | 'deals' | 'tenants'

const STORAGE_KEY = 'hsh:activeWorkspace'

const WORKSPACE_HOME: Record<Workspace, string> = {
  projects: '/',
  deals: '/deals',
  tenants: '/tenants',
}

/** Map a pathname to a workspace, or null if it's workspace-agnostic. */
function workspaceFromPath(pathname: string): Workspace | null {
  if (pathname.startsWith('/deals')) return 'deals'
  if (pathname.startsWith('/tenants')) return 'tenants'
  if (pathname === '/' || pathname.startsWith('/projects')) return 'projects'
  // /library/*, /quickbooks/*, /contacts, /sow, /feedback are workspace-agnostic
  return null
}

function readStoredWorkspace(): Workspace {
  if (typeof window === 'undefined') return 'projects'
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === 'projects' || raw === 'deals' || raw === 'tenants') return raw
  return 'projects'
}

export function useActiveWorkspace(): {
  workspace: Workspace
  setWorkspace: (ws: Workspace) => void
} {
  const location = useLocation()
  const navigate = useNavigate()
  const [stored, setStored] = useState<Workspace>(readStoredWorkspace)

  // Keep localStorage in sync whenever URL implies a workspace
  useEffect(() => {
    const fromPath = workspaceFromPath(location.pathname)
    if (fromPath && fromPath !== stored) {
      setStored(fromPath)
      window.localStorage.setItem(STORAGE_KEY, fromPath)
    }
  }, [location.pathname, stored])

  const fromPath = workspaceFromPath(location.pathname)
  const workspace: Workspace = fromPath ?? stored

  const setWorkspace = useCallback(
    (ws: Workspace) => {
      setStored(ws)
      window.localStorage.setItem(STORAGE_KEY, ws)
      navigate(WORKSPACE_HOME[ws])
    },
    [navigate],
  )

  return { workspace, setWorkspace }
}
