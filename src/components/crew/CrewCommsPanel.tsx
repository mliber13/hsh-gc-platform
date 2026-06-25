import { useCallback, useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { CommsRoleBadge } from '@/components/comms/CommsRoleBadge'
import { useAuth } from '@/contexts/AuthContext'
import { markProjectCommsRead } from '@/services/commsReadStateService'
import {
  addCommsLogEntry,
  DrywallProjectPermissionError,
  fetchDrywallCommsLog,
} from '@/services/drywallProjectsService'
import { getCurrentUserProfile } from '@/services/userService'
import type { DrywallCommsLogEntry } from '@/types/drywall'

interface CrewCommsPanelProps {
  projectId: string
  readOnly?: boolean
}

export function CrewCommsPanel({ projectId, readOnly = false }: CrewCommsPanelProps) {
  const { user } = useAuth()
  const [entries, setEntries] = useState<DrywallCommsLogEntry[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [authorName, setAuthorName] = useState('Unknown')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchDrywallCommsLog(projectId)
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

  useEffect(() => {
    void getCurrentUserProfile().then((profile) => {
      if (profile?.full_name?.trim()) {
        setAuthorName(profile.full_name.trim())
      } else if (user?.email) {
        setAuthorName(user.email)
      }
    })
  }, [user?.email])

  const handleSend = async () => {
    if (readOnly || !body.trim()) return
    setSaving(true)
    try {
      await addCommsLogEntry(projectId, body, authorName, user?.id)
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
              placeholder="Message the office or crew on this job…"
              rows={3}
              disabled={saving}
            />
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
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{entry.author}</span>
                  <CommsRoleBadge role={entry.authorRole} />
                  {' • '}
                  <time
                    dateTime={entry.at}
                    title={format(new Date(entry.at), 'MMM d, yyyy h:mm a')}
                  >
                    {formatDistanceToNow(new Date(entry.at), { addSuffix: true })}
                  </time>
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
