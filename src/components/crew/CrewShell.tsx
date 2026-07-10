// ============================================================================
// CrewShell — mobile-first layout for /crew/* (D.6.2)
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronsUpDown, LogOut } from 'lucide-react'
import { PageTitleProvider } from '@/contexts/PageTitleContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { isCrewRole } from '@/lib/rbac'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { fetchTeam } from '@/services/hrTeamService'
import hshLogo from '/HSH Contractor Logo - Color.png'
import { CommsNotificationBell } from '@/components/comms/CommsNotificationBell'

type ViewAsOption = { id: string; name: string }

export function CrewShell() {
  const { signOut, profile } = useAuth()
  const { effectiveRole } = usePermissions()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isOperator = !isCrewRole(effectiveRole)
  const viewAsPersonId = isOperator ? searchParams.get('as') : null

  const [viewAsOptions, setViewAsOptions] = useState<ViewAsOption[]>([])

  useEffect(() => {
    if (!isOperator) return
    let cancelled = false
    void fetchTeam()
      .then((team) => {
        if (cancelled) return
        const options: ViewAsOption[] = []
        for (const e of team.employees) {
          const name = e.name?.trim()
          if (name) options.push({ id: e.id, name })
        }
        for (const c of team.contractors1099) {
          const name = c.name?.trim()
          if (name) options.push({ id: c.id, name })
        }
        options.sort((a, b) => a.name.localeCompare(b.name))
        setViewAsOptions(options)
      })
      .catch((e) => {
        console.warn('fetchTeam for View as:', e)
      })
    return () => {
      cancelled = true
    }
  }, [isOperator])

  const viewAsName = useMemo(() => {
    if (!viewAsPersonId) return null
    return viewAsOptions.find((o) => o.id === viewAsPersonId)?.name ?? 'crew member'
  }, [viewAsOptions, viewAsPersonId])

  const onMeasure = /^\/crew\/projects\/[^/]+\/measure$/.test(location.pathname)
  const onDetail = /^\/crew\/projects\//.test(location.pathname) && !onMeasure
  const headerTitle = onMeasure ? 'Measure' : onDetail ? 'Job detail' : 'My jobs'

  const setViewAs = (personId: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (personId) next.set('as', personId)
    else next.delete('as')
    setSearchParams(next, { replace: true })
  }

  const homePath = viewAsPersonId
    ? `/crew?as=${encodeURIComponent(viewAsPersonId)}`
    : '/crew'

  return (
    <PageTitleProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
            <button
              type="button"
              className="flex min-w-0 items-center gap-2"
              onClick={() => navigate(homePath)}
            >
              <img src={hshLogo} alt="HSH" className="h-8 w-auto shrink-0" />
              <span className="truncate text-sm font-semibold">{headerTitle}</span>
            </button>
            <div className="flex items-center gap-1">
              {isOperator ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 max-w-[11rem] gap-1 text-xs">
                      <span className="truncate">
                        {viewAsPersonId ? `View as ${viewAsName}` : 'View as'}
                      </span>
                      <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
                    <DropdownMenuLabel>View as crew member</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {viewAsPersonId ? (
                      <>
                        <DropdownMenuItem onClick={() => setViewAs(null)}>Clear</DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    ) : null}
                    {viewAsOptions.length === 0 ? (
                      <DropdownMenuItem disabled>No team members</DropdownMenuItem>
                    ) : (
                      viewAsOptions.map((option) => (
                        <DropdownMenuItem
                          key={option.id}
                          onClick={() => setViewAs(option.id)}
                          className={option.id === viewAsPersonId ? 'bg-muted' : undefined}
                        >
                          {option.name}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <CommsNotificationBell scope="crew" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="shrink-0">
                    {profile?.full_name?.split(' ')[0] ?? 'Account'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void signOut()}>
                    <LogOut className="mr-2 size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {viewAsPersonId ? (
            <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-950 dark:text-amber-100">
              Viewing as {viewAsName} — read-only preview
            </div>
          ) : null}
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
          <Outlet />
        </main>
      </div>
    </PageTitleProvider>
  )
}
