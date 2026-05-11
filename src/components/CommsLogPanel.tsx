import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LogCommsModal } from '@/components/LogCommsModal'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  fetchCommsForProject,
  fetchCommsForScheduleItem,
} from '@/services/communicationLogService'
import type {
  CommunicationLogEntry,
  CommLogChannel,
  CommLogDirection,
} from '@/types/communicationLog'

type CommsFilter = 'project' | 'item'

interface CommsLogPanelProps {
  open: boolean
  onClose: () => void
  projectId: string
  scheduleItem?: { id: string; name: string } | null
}

const channelIconMap: Record<CommLogChannel, typeof Phone> = {
  phone: Phone,
  sms: MessageSquare,
  email: Mail,
  'in-app': MessageCircle,
  system: Bot,
}

function directionLabel(direction: CommLogDirection) {
  if (direction === 'inbound') return 'inbound'
  if (direction === 'outbound') return 'outbound'
  return 'system'
}

function DirectionIcon({ direction }: { direction: CommLogDirection }) {
  if (direction === 'inbound') return <ArrowLeft className="size-3.5" />
  if (direction === 'outbound') return <ArrowRight className="size-3.5" />
  return <Bot className="size-3.5" />
}

function relativeTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${formatDistanceToNow(date, { addSuffix: true })}`
}

export function CommsLogPanel({
  open,
  onClose,
  projectId,
  scheduleItem = null,
}: CommsLogPanelProps) {
  const [filter, setFilter] = useState<CommsFilter>('project')
  const [entries, setEntries] = useState<CommunicationLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [profileNames, setProfileNames] = useState<Record<string, string>>({})
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setFilter(scheduleItem ? 'item' : 'project')
  }, [open, scheduleItem?.id])

  useEffect(() => {
    if (!open) return
    if (filter === 'item' && !scheduleItem) {
      setFilter('project')
      return
    }

    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        const nextEntries =
          filter === 'item' && scheduleItem
            ? await fetchCommsForScheduleItem(scheduleItem.id)
            : await fetchCommsForProject(projectId)

        if (cancelled) return
        setEntries(nextEntries)

        const profileIds = Array.from(
          new Set(nextEntries.map((entry) => entry.author_user_id).filter(Boolean)),
        ) as string[]
        const companyIds = Array.from(
          new Set(nextEntries.map((entry) => entry.author_company_id).filter(Boolean)),
        ) as string[]

        const [profilesResult, companiesResult] = await Promise.all([
          profileIds.length > 0
            ? supabase
              .from('profiles')
              .select('id, full_name, email')
              .in('id', profileIds)
            : Promise.resolve({ data: [], error: null }),
          companyIds.length > 0
            ? supabase
              .from('subcontractors')
              .select('id, name')
              .in('id', companyIds)
            : Promise.resolve({ data: [], error: null }),
        ])

        if (profilesResult.error) throw profilesResult.error
        if (companiesResult.error) throw companiesResult.error
        if (cancelled) return

        setProfileNames(
          Object.fromEntries(
            (profilesResult.data ?? []).map((profile: any) => [
              profile.id,
              profile.full_name || profile.email || 'User',
            ]),
          ),
        )
        setCompanyNames(
          Object.fromEntries(
            (companiesResult.data ?? []).map((company: any) => [
              company.id,
              company.name || 'Company',
            ]),
          ),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load communications.'
        toast.error(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, filter, projectId, scheduleItem?.id])

  const activeScheduleItemId = filter === 'item' ? scheduleItem?.id ?? null : null

  const visibleTitle = useMemo(() => {
    if (filter === 'item' && scheduleItem) return `Communications: ${scheduleItem.name}`
    return 'Communications'
  }, [filter, scheduleItem])

  const getAuthorName = (entry: CommunicationLogEntry) => {
    if (entry.author_user_id && profileNames[entry.author_user_id]) {
      return profileNames[entry.author_user_id]
    }
    if (entry.author_company_id && companyNames[entry.author_company_id]) {
      return companyNames[entry.author_company_id]
    }
    return entry.author_label || 'System'
  }

  const handleCreated = (entry: CommunicationLogEntry) => {
    const shouldPrepend =
      filter === 'project' ||
      (filter === 'item' && entry.schedule_item_id === scheduleItem?.id)

    if (entry.author_user_id && !profileNames[entry.author_user_id]) {
      setProfileNames((current) => ({ ...current, [entry.author_user_id as string]: 'You' }))
    }
    if (entry.author_company_id && !companyNames[entry.author_company_id]) {
      setCompanyNames((current) => ({ ...current, [entry.author_company_id as string]: 'Company' }))
    }

    if (shouldPrepend) {
      setEntries((current) => [entry, ...current])
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <SheetContent side="right" className="w-full gap-0 border-border/60 p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b border-border/60 p-4 pr-10">
          <SheetTitle>{visibleTitle}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {filter === 'item' && scheduleItem
              ? 'Showing communication entries for this schedule item.'
              : 'Showing communication entries for the whole project.'}
          </p>
        </SheetHeader>

        <div className="border-b border-border/60 p-4">
          <div className="grid grid-cols-2 rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setFilter('project')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filter === 'project'
                  ? 'bg-card text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              All items
            </button>
            <button
              type="button"
              disabled={!scheduleItem}
              onClick={() => scheduleItem && setFilter('item')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filter === 'item'
                  ? 'bg-card text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground',
                !scheduleItem && 'cursor-not-allowed opacity-50 hover:text-muted-foreground',
              )}
            >
              This item
            </button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading communications...
            </div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No communications logged yet.
            </div>
          ) : (
            <div>
              {entries.map((entry) => {
                const Icon = channelIconMap[entry.channel]
                return (
                  <article key={entry.id} className="border-b border-border/60 p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-full bg-muted p-2 text-muted-foreground">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {getAuthorName(entry)}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <DirectionIcon direction={entry.direction} />
                              <span>{directionLabel(entry.direction)}</span>
                              <span>·</span>
                              <span>{entry.channel}</span>
                            </div>
                          </div>
                          <time className="shrink-0 text-xs text-muted-foreground">
                            {relativeTimestamp(entry.created_at)}
                          </time>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {entry.body}
                        </p>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <SheetFooter className="border-t border-border/60 p-4">
          <Button type="button" onClick={() => setLogModalOpen(true)}>
            <Plus className="size-4" />
            Log entry
          </Button>
        </SheetFooter>

        <LogCommsModal
          open={logModalOpen}
          onClose={() => setLogModalOpen(false)}
          onCreated={handleCreated}
          projectId={projectId}
          scheduleItemId={activeScheduleItemId}
        />
      </SheetContent>
    </Sheet>
  )
}
