import {
  ClipboardList,
  Clock,
  FileText,
  FolderOpen,
  Receipt,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProjectActivityEvent } from '@/types/projectActivity'

interface RecentActivityCardProps {
  /** Pre-sorted newest-first by timestamp */
  events: ProjectActivityEvent[]
  loading: boolean
  onSelectEvent: (event: ProjectActivityEvent) => void
}

/** "12s", "3m", "2h", "5d", "Apr 12" -- keeps the column compact. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, Math.floor((now - then) / 1000))
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

const EVENT_VISUALS = {
  'change-order': {
    Icon: ClipboardList,
    iconClassName: 'text-rose-500',
    bgClassName: 'bg-rose-500/15',
  },
  'purchase-order': {
    Icon: Receipt,
    iconClassName: 'text-teal-500',
    bgClassName: 'bg-teal-500/15',
  },
  document: {
    Icon: FolderOpen,
    iconClassName: 'text-indigo-500',
    bgClassName: 'bg-indigo-500/15',
  },
  form: {
    Icon: FileText,
    iconClassName: 'text-orange-500',
    bgClassName: 'bg-orange-500/15',
  },
} as const

export function RecentActivityCard({
  events,
  loading,
  onSelectEvent,
}: RecentActivityCardProps) {
  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-10 text-center">
            <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Loading activity...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-10 text-center">
            <Clock className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="font-medium">No recent activity</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Activity will appear here as change orders, POs, documents, and forms are
              added.
            </p>
          </div>
        ) : (
          <div className="max-h-[28rem] divide-y divide-border/40 overflow-y-auto">
            {events.map((event) => {
              const visual = EVENT_VISUALS[event.type]
              const Icon = visual.Icon
              return (
                <button
                  key={event.id}
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                  onClick={() => onSelectEvent(event)}
                >
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full ${visual.bgClassName}`}
                  >
                    <Icon className={`size-3.5 ${visual.iconClassName}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm text-foreground">{event.title}</p>
                    {event.detail ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {event.detail}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                    {timeAgo(event.timestamp)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

