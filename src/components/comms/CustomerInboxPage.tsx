import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, ChevronRight, MessagesSquare, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  fetchCustomerThread,
  fetchCustomerThreads,
  sendCustomerMessage,
  type CustomerMessage,
  type CustomerThread,
} from '@/services/customerCommsService'

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '').slice(-10)
  if (d.length !== 10) return phone
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function formatAt(at: string): string {
  try {
    return format(parseISO(at), 'MMM d · h:mm a')
  } catch {
    return at
  }
}

export function CustomerInboxPage() {
  usePageTitle('Customer messages')
  const [threads, setThreads] = useState<CustomerThread[]>([])
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<CustomerThread | null>(null)
  const [messages, setMessages] = useState<CustomerMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      setThreads(await fetchCustomerThreads())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const openThread = async (t: CustomerThread) => {
    setSelected(t)
    setMessages([])
    setReplyBody('')
    setThreadLoading(true)
    try {
      setMessages(await fetchCustomerThread(t.contactPhone))
    } finally {
      setThreadLoading(false)
    }
  }

  const backToList = () => {
    setSelected(null)
    void loadList()
  }

  // Reply needs a job to tag/send against — use the newest tagged project in the thread.
  const replyProjectId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].projectId) return messages[i].projectId
    }
    return selected?.latestProjectId ?? null
  }, [messages, selected])

  const handleReply = async () => {
    if (!selected || !replyBody.trim()) return
    if (!replyProjectId) {
      toast.error('Tag one of these messages to a job first, then reply.')
      return
    }
    setSending(true)
    try {
      await sendCustomerMessage({
        projectId: replyProjectId,
        phone: selected.contactPhone,
        name: selected.contactName ?? undefined,
        body: replyBody,
      })
      setReplyBody('')
      setMessages(await fetchCustomerThread(selected.contactPhone))
      toast.success('Message sent')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  // ── Thread detail ──────────────────────────────────────────────
  if (selected) {
    const title = selected.contactName?.trim() || formatPhone(selected.contactPhone)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={backToList}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
            {selected.contactName ? (
              <p className="text-xs text-muted-foreground">{formatPhone(selected.contactPhone)}</p>
            ) : null}
          </div>
        </div>

        {threadLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                  m.direction === 'inbound'
                    ? 'bg-muted'
                    : 'ml-auto bg-primary text-primary-foreground',
                )}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p
                  className={cn(
                    'mt-1 text-[10px]',
                    m.direction === 'inbound'
                      ? 'text-muted-foreground'
                      : 'text-primary-foreground/70',
                  )}
                >
                  {formatAt(m.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="sticky bottom-0 mt-auto flex items-end gap-2 border-t bg-background pt-2">
          <Textarea
            rows={2}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder={`Reply to ${title}…`}
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

  // ── Thread list ────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <MessagesSquare className="size-5 text-primary" />
          Customer messages
        </h1>
        <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => void loadList()}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : threads.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
          <MessagesSquare className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No customer messages yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <Card
              key={t.contactPhone}
              className="cursor-pointer transition-colors hover:bg-muted/30 active:bg-muted/50"
              onClick={() => void openThread(t)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {t.contactName?.trim() || formatPhone(t.contactPhone)}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {formatAt(t.latestAt)}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {t.latestDirection === 'outbound' ? 'You: ' : ''}
                    {t.latestBody}
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
