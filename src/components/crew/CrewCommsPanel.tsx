import { useCallback, useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { markProjectCommsRead } from '@/services/commsReadStateService'
import { DrywallProjectPermissionError } from '@/services/drywallProjectsService'
import {
  fetchProjectComms,
  postProjectComms,
  type ProjectCommsMessage,
} from '@/services/projectCommsService'

interface CrewCommsPanelProps {
  projectId: string
  readOnly?: boolean
  /** Text to pre-fill into the message box when prefillToken changes. */
  prefillText?: string
  /** Bump this to (re-)apply prefillText — lets the same text re-prefill if user clicks again. */
  prefillToken?: number
}

export function CrewCommsPanel({
  projectId,
  readOnly = false,
  prefillText,
  prefillToken,
}: CrewCommsPanelProps) {
  const [entries, setEntries] = useState<ProjectCommsMessage[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchProjectComms(projectId)
      setEntries(rows)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void markProjectCommsRead(projectId).catch(() => {
      /* non-fatal */
    })
  }, [projectId])

  // Pre-fill the textarea when parent passes a new prefillToken (e.g. "request more materials").
  useEffect(() => {
    if (prefillToken == null || !prefillText) return
    setBody(prefillText)
  }, [prefillToken, prefillText])

  const handleSend = async () => {
    if (readOnly || !body.trim()) return
    setSaving(true)
    try {
      await postProjectComms({ projectId, body })
      setBody('')
      await load()
      await markProjectCommsRead(projectId)
      toast.success('Message sent')
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to send message')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4" />
          Messages
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly ? (
          <div className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message the office about this job…"
              rows={3}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Goes to the office only. Other crew on this job can&rsquo;t see it.
            </p>
            <Button
              type="button"
              onClick={() => void handleSend()}
              disabled={saving || !body.trim()}
              className="w-full sm:w-auto"
            >
              {saving ? 'Sending…' : 'Send'}
            </Button>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-lg border bg-muted/20 p-3">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{entry.author}</span>
                  <span aria-hidden>•</span>
                  <time
                    dateTime={entry.at}
                    title={format(new Date(entry.at), 'MMM d, yyyy h:mm a')}
                  >
                    {formatDistanceToNow(new Date(entry.at), { addSuffix: true })}
                  </time>
                  {entry.audience === 'job' ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      Everyone on this job
                    </span>
                  ) : null}
                </p>
                <p className="mt-2 text-sm whitespace-pre-wrap">{entry.body}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
