import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/contexts/AuthContext'
import { isOnlineMode } from '@/lib/supabase'
import { fetchCommsUnreadSummary } from '@/services/commsReadStateService'
import type { CommsUnreadEntry } from '@/types/crew'
import { cn } from '@/lib/utils'

const POLL_MS = 60_000

interface CommsNotificationBellProps {
  scope?: 'operator' | 'crew'
}

export function CommsNotificationBell({ scope = 'operator' }: CommsNotificationBellProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [totalUnread, setTotalUnread] = useState(0)
  const [byProject, setByProject] = useState<CommsUnreadEntry[]>([])

  const refresh = useCallback(async () => {
    if (!isOnlineMode() || !user) {
      setTotalUnread(0)
      setByProject([])
      return
    }
    try {
      const summary = await fetchCommsUnreadSummary({ scope })
      setTotalUnread(summary.totalUnread)
      setByProject(summary.byProject)
    } catch {
      /* keep last known counts */
    }
  }, [scope, user])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  if (!isOnlineMode() || !user) return null

  const navigateToProject = (projectId: string) => {
    setOpen(false)
    if (scope === 'crew') {
      navigate(`/crew/projects/${projectId}`)
    } else {
      navigate(`/drywall/projects/${projectId}/info`)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0" aria-label="Unread messages">
          <Bell className="size-5" />
          {totalUnread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">Unread messages</div>
        {byProject.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No unread messages</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {byProject.map((row) => (
              <li key={row.projectId}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm',
                    'hover:bg-muted/60',
                  )}
                  onClick={() => navigateToProject(row.projectId)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{row.projectName}</span>
                  <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {row.unreadCount}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
