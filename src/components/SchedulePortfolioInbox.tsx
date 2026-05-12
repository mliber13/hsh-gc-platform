import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Bot,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  fetchRecentInboxEntries,
  type InboxEntry,
} from '@/services/communicationLogService'

interface SchedulePortfolioInboxProps {
  onEntryClick: (entry: InboxEntry) => void
  refreshKey?: number
}

const channelIconMap: Record<InboxEntry['channel'], typeof Phone> = {
  phone: Phone,
  sms: MessageSquare,
  email: Mail,
  'in-app': MessageCircle,
  system: Bot,
}

function directionArrow(direction: InboxEntry['direction']) {
  if (direction === 'inbound') return '←'
  if (direction === 'outbound') return '→'
  return ''
}

function relativeTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatDistanceToNow(date, { addSuffix: true })
}

export function SchedulePortfolioInbox({
  onEntryClick,
  refreshKey = 0,
}: SchedulePortfolioInboxProps) {
  const [entries, setEntries] = useState<InboxEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [manualRefreshKey, setManualRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    const loadEntries = async () => {
      setLoading(true)
      try {
        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const nextEntries = await fetchRecentInboxEntries(sinceIso)
        if (!cancelled) setEntries(nextEntries)
      } catch (error) {
        console.error('Failed to load comms inbox', error)
        if (!cancelled) {
          setEntries([])
          toast.error('Could not load comms inbox.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadEntries()
    return () => {
      cancelled = true
    }
  }, [refreshKey, manualRefreshKey])

  return (
    <div className="flex h-full min-h-0 flex-col bg-card/30">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Comms inbox</h2>
          <p className="text-xs text-muted-foreground">Last 24 hours</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setManualRefreshKey((key) => key + 1)}
          aria-label="Refresh comms inbox"
          disabled={loading}
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, idx) => (
              <div key={idx} className="rounded-lg border border-border/50 p-3">
                <div className="flex gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            No comms in the last 24 hours.
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const Icon = channelIconMap[entry.channel]
              const arrow = directionArrow(entry.direction)
              const itemName = entry.schedule_item_name ?? '(job-level)'

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onEntryClick(entry)}
                  title={entry.schedule_item_id ? 'Open schedule item' : 'Open project schedule'}
                  className="w-full rounded-lg border border-transparent p-3 text-left transition-colors hover:border-border/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {entry.project_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {itemName}
                          </p>
                        </div>
                        <time className="shrink-0 text-[11px] text-muted-foreground">
                          {relativeTimestamp(entry.created_at)}
                        </time>
                      </div>

                      <p className="line-clamp-2 text-xs leading-relaxed text-foreground">
                        {arrow && <span className="mr-1 text-muted-foreground">{arrow}</span>}
                        {entry.body}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        — {entry.author_label}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
