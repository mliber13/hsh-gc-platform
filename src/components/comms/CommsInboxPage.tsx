import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronRight, MessagesSquare, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { fetchRecentComms, type CommsFeedEntry } from '@/services/commsFeedService'

type Props = {
  variant: 'operator' | 'crew'
}

function roleBadgeClass(role: string): string {
  if (role === 'crew') return 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
  if (role === 'sub') return 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
  return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
}

function roleLabel(role: string): string {
  if (role === 'crew') return 'Crew'
  if (role === 'sub') return 'Sub'
  return 'Office'
}

function formatAt(at: string): string {
  try {
    return format(parseISO(at), 'MMM d · h:mm a')
  } catch {
    return at
  }
}

export function CommsInboxPage({ variant }: Props) {
  usePageTitle('Messages')
  const navigate = useNavigate()
  const [entries, setEntries] = useState<CommsFeedEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await fetchRecentComms(150))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openProject = (projectId: string) => {
    navigate(variant === 'crew' ? `/crew/projects/${projectId}` : `/drywall/projects/${projectId}/info`)
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <MessagesSquare className="size-5 text-primary" />
          Messages
        </h1>
        <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => void load()}>
          <RefreshCw className="size-4" />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Recent messages across {variant === 'crew' ? 'your jobs' : 'all jobs'}. Tap one to open the job.
      </p>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
          <MessagesSquare className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <Card
              key={`${e.projectId}-${e.entryId}`}
              className="cursor-pointer transition-colors hover:bg-muted/30 active:bg-muted/50"
              onClick={() => openProject(e.projectId)}
            >
              <CardContent className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{e.projectName}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                        roleBadgeClass(e.authorRole),
                      )}
                    >
                      {roleLabel(e.authorRole)}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {formatAt(e.at)}
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">{e.author}:</span>{' '}
                    <span className="text-muted-foreground">{e.body}</span>
                  </p>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
