import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ExternalLink, MessagesSquare, RefreshCw, Reply, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { fetchRecentComms, type CommsFeedEntry } from '@/services/commsFeedService'
import { addCommsLogEntry } from '@/services/drywallProjectsService'
import { getCurrentUserProfile } from '@/services/userService'

type Props = {
  variant: 'operator' | 'crew'
}

const FILTER_ALL = 'all'

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

const selectClassName =
  'h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground'

export function CommsInboxPage({ variant }: Props) {
  usePageTitle('Messages')
  const navigate = useNavigate()
  const { user } = useAuth()
  const [entries, setEntries] = useState<CommsFeedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [authorName, setAuthorName] = useState('Unknown')

  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)
  const [roleFilter, setRoleFilter] = useState(FILTER_ALL)

  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)

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

  useEffect(() => {
    void getCurrentUserProfile().then((profile) => {
      if (profile?.full_name?.trim()) setAuthorName(profile.full_name.trim())
      else if (user?.email) setAuthorName(user.email)
    })
  }, [user?.email])

  const openProject = (projectId: string) => {
    navigate(variant === 'crew' ? `/crew/projects/${projectId}` : `/drywall/projects/${projectId}/info`)
  }

  const projectOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const e of entries) if (!byId.has(e.projectId)) byId.set(e.projectId, e.projectName)
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])

  const roleOptions = useMemo(() => {
    const present = new Set(entries.map((e) => e.authorRole))
    return ['operator', 'crew', 'sub'].filter((r) => present.has(r))
  }, [entries])

  const displayed = useMemo(() => {
    const list = entries.filter((e) => {
      if (projectFilter !== FILTER_ALL && e.projectId !== projectFilter) return false
      if (roleFilter !== FILTER_ALL && e.authorRole !== roleFilter) return false
      return true
    })
    list.sort((a, b) => {
      const cmp = new Date(a.at).getTime() - new Date(b.at).getTime()
      return sortOrder === 'newest' ? -cmp : cmp
    })
    return list
  }, [entries, projectFilter, roleFilter, sortOrder])

  const startReply = (entryId: string) => {
    setReplyingTo((cur) => (cur === entryId ? null : entryId))
    setReplyBody('')
  }

  const handleReply = async (projectId: string) => {
    if (!replyBody.trim()) return
    setSending(true)
    try {
      await addCommsLogEntry(projectId, replyBody, authorName, user?.id)
      setReplyBody('')
      setReplyingTo(null)
      toast.success('Reply sent')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send reply')
    } finally {
      setSending(false)
    }
  }

  const filtersActive = projectFilter !== FILTER_ALL || roleFilter !== FILTER_ALL

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

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
        <select
          aria-label="Job"
          className={selectClassName}
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value={FILTER_ALL}>All jobs</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Sender"
          className={selectClassName}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value={FILTER_ALL}>All senders</option>
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort"
          className={selectClassName}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value === 'oldest' ? 'oldest' : 'newest')}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
          <MessagesSquare className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {filtersActive ? 'No messages match these filters.' : 'No messages yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((e) => {
            const isReplying = replyingTo === e.entryId
            return (
              <Card key={`${e.projectId}-${e.entryId}`}>
                <CardContent className="space-y-2 p-3">
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

                  <div className="flex items-center gap-2 pt-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => startReply(e.entryId)}
                    >
                      <Reply className="size-3.5" />
                      Reply
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs text-muted-foreground"
                      onClick={() => openProject(e.projectId)}
                    >
                      <ExternalLink className="size-3.5" />
                      Open job
                    </Button>
                  </div>

                  {isReplying ? (
                    <div className="space-y-2 border-t pt-2">
                      <Textarea
                        rows={2}
                        autoFocus
                        value={replyBody}
                        onChange={(ev) => setReplyBody(ev.target.value)}
                        placeholder={`Reply to ${e.projectName}…`}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => setReplyingTo(null)}
                          disabled={sending}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => void handleReply(e.projectId)}
                          disabled={sending || !replyBody.trim()}
                        >
                          <Send className="size-3.5" />
                          {sending ? 'Sending…' : 'Send'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
