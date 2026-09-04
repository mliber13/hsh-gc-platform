import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, ChevronRight, ExternalLink, MessagesSquare, RefreshCw, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { fetchRecentComms, type CommsFeedEntry } from '@/services/commsFeedService'
import { fetchCommsUnreadSummary, markProjectCommsRead } from '@/services/commsReadStateService'
import {
  fetchProjectComms,
  laneKeyOf,
  postProjectComms,
  type CommsAudience,
  type ProjectCommsMessage,
} from '@/services/projectCommsService'

type Props = {
  variant: 'operator' | 'crew'
}

type Thread = {
  /** projectId + lane — one conversation, not one project. */
  key: string
  projectId: string
  projectName: string
  laneKey: string
  audience: CommsAudience
  audiencePersonId: string | null
  laneLabel: string | null
  latestAt: string
  latestAuthor: string
  latestBody: string
  count: number
  unread: number
}

function laneKeyOfEntry(e: CommsFeedEntry): string {
  return e.audience === 'crew' ? `crew:${e.audiencePersonId ?? 'unknown'}` : e.audience
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
  const { user } = useAuth()

  const [entries, setEntries] = useState<CommsFeedEntry[]>([])
  const [unreadByProject, setUnreadByProject] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [sortOrder, setSortOrder] = useState<'recent' | 'unread'>('recent')

  const [selected, setSelected] = useState<Thread | null>(null)
  const [thread, setThread] = useState<ProjectCommsMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)

  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, summary] = await Promise.all([
        fetchRecentComms(300),
        fetchCommsUnreadSummary({ scope: variant }).catch(() => ({ totalUnread: 0, byProject: [] })),
      ])
      setEntries(rows)
      setUnreadByProject(new Map(summary.byProject.map((p) => [p.projectId, p.unreadCount])))
    } finally {
      setLoading(false)
    }
  }, [variant])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const threads = useMemo(() => {
    // A conversation is a lane within a project, so the office sees one row per
    // crew member rather than one mixed row per job.
    const laneName = new Map<string, string>()
    for (const e of entries) {
      if (e.audience !== 'crew' || e.authorRole === 'operator') continue
      const k = `${e.projectId}::${laneKeyOfEntry(e)}`
      if (!laneName.has(k)) laneName.set(k, e.author)
    }

    const map = new Map<string, Thread>()
    for (const e of entries) {
      const laneKey = laneKeyOfEntry(e)
      const key = `${e.projectId}::${laneKey}`
      const cur = map.get(key)
      if (!cur) {
        map.set(key, {
          key,
          projectId: e.projectId,
          projectName: e.projectName,
          laneKey,
          audience: e.audience,
          audiencePersonId: e.audiencePersonId,
          laneLabel:
            e.audience === 'job'
              ? 'Everyone on this job'
              : e.audience === 'office'
                ? 'Office only'
                : variant === 'crew'
                  ? null
                  : (laneName.get(key) ?? 'Crew member'),
          latestAt: e.at,
          latestAuthor: e.author,
          latestBody: e.body,
          count: 1,
          unread: 0,
        })
      } else {
        cur.count++
      }
    }
    const list = [...map.values()]
    list.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())

    // The read watermark is per project, so credit the project's unread count to
    // its most recently active lane rather than badging every lane on the job.
    const claimed = new Set<string>()
    for (const t of list) {
      if (claimed.has(t.projectId)) continue
      claimed.add(t.projectId)
      t.unread = unreadByProject.get(t.projectId) ?? 0
    }

    list.sort((a, b) => {
      if (sortOrder === 'unread' && (a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1
      return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
    })
    return list
  }, [entries, unreadByProject, sortOrder, variant])

  const openThread = async (t: Thread) => {
    setSelected(t)
    setThread([])
    setReplyBody('')
    setThreadLoading(true)
    try {
      const rows = await fetchProjectComms(t.projectId)
      setThread(rows.filter((m) => laneKeyOf(m) === t.laneKey))
      await markProjectCommsRead(t.projectId).catch(() => {})
      setUnreadByProject((prev) => {
        const next = new Map(prev)
        next.set(t.projectId, 0)
        return next
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the conversation')
    } finally {
      setThreadLoading(false)
    }
  }

  const backToList = () => {
    setSelected(null)
    void loadList()
  }

  const openProject = (projectId: string) => {
    navigate(variant === 'crew' ? `/crew/projects/${projectId}` : `/drywall/projects/${projectId}/info`)
  }

  const handleReply = async () => {
    if (!selected || !replyBody.trim()) return
    setSending(true)
    try {
      await postProjectComms({
        projectId: selected.projectId,
        body: replyBody,
        audience: selected.audience,
        audiencePersonId: selected.audiencePersonId,
      })
      setReplyBody('')
      const rows = await fetchProjectComms(selected.projectId)
      setThread(rows.filter((m) => laneKeyOf(m) === selected.laneKey))
      await markProjectCommsRead(selected.projectId).catch(() => {})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send reply')
    } finally {
      setSending(false)
    }
  }

  // ── Thread detail view ──────────────────────────────────────────────
  if (selected) {
    const ordered = [...thread].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={backToList}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{selected.projectName}</h1>
            {selected.laneLabel ? (
              <p className="truncate text-xs text-muted-foreground">{selected.laneLabel}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-muted-foreground"
            onClick={() => openProject(selected.projectId)}
          >
            <ExternalLink className="size-3.5" />
            Open job
          </Button>
        </div>

        {threadLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : ordered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <div className="space-y-3">
            {ordered.map((m) => (
              <div key={m.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{m.author}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatAt(m.at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
              </div>
            ))}
          </div>
        )}

        <div className="sticky bottom-0 mt-auto flex items-end gap-2 border-t bg-background pt-2">
          <Textarea
            rows={2}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder={
              selected.audience === 'office'
                ? 'Add an internal note…'
                : `Reply to ${selected.laneLabel ?? selected.projectName}…`
            }
            className="flex-1"
          />
          <Button
            type="button"
            className="h-9 gap-1"
            onClick={() => void handleReply()}
            disabled={sending || !replyBody.trim()}
          >
            <Send className="size-4" />
            {sending ? '…' : 'Send'}
          </Button>
        </div>
      </div>
    )
  }

  // ── Thread list view ────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {variant === 'crew' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Back to jobs"
              onClick={() => navigate('/crew')}
            >
              <ArrowLeft className="size-4" />
            </Button>
          ) : null}
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <MessagesSquare className="size-5 text-primary" />
            Messages
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Sort"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value === 'unread' ? 'unread' : 'recent')}
          >
            <option value="recent">Recent activity</option>
            <option value="unread">Unread first</option>
          </select>
          <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => void loadList()}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : threads.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
          <MessagesSquare className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <Card
              key={t.key}
              className={cn(
                'cursor-pointer transition-colors hover:bg-muted/30 active:bg-muted/50',
                t.unread > 0 && 'border-primary/40',
              )}
              onClick={() => void openThread(t)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{t.projectName}</span>
                    {t.laneLabel ? (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t.laneLabel}
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {formatAt(t.latestAt)}
                    </span>
                    {t.unread > 0 ? (
                      <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        {t.unread}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    <span className="font-medium text-foreground/80">{t.latestAuthor}:</span> {t.latestBody}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
