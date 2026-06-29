// ============================================================================
// CrewShell — mobile-first layout for /crew/* (D.6.2)
// ============================================================================

import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { PageTitleProvider } from '@/contexts/PageTitleContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import hshLogo from '/HSH Contractor Logo - Color.png'
import { CommsNotificationBell } from '@/components/comms/CommsNotificationBell'

export function CrewShell() {
  const { signOut, profile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const onMeasure = /^\/crew\/projects\/[^/]+\/measure$/.test(location.pathname)
  const onDetail = /^\/crew\/projects\//.test(location.pathname) && !onMeasure
  const headerTitle = onMeasure ? 'Measure' : onDetail ? 'Job detail' : 'My jobs'

  return (
    <PageTitleProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
            <button
              type="button"
              className="flex min-w-0 items-center gap-2"
              onClick={() => navigate('/crew')}
            >
              <img src={hshLogo} alt="HSH" className="h-8 w-auto shrink-0" />
              <span className="truncate text-sm font-semibold">{headerTitle}</span>
            </button>
            <div className="flex items-center gap-1">
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
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
          <Outlet />
        </main>
      </div>
    </PageTitleProvider>
  )
}
