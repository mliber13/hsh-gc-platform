import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { MessageSquarePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CommsRoleBadge } from '@/components/comms/CommsRoleBadge'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import {
  formatCommsReadReceiptLabel,
  formatCommsReadReceiptTooltip,
  readersForCommsEntry,
} from '@/lib/drywall/commsReadReceiptDisplay'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import {
  fetchProjectCrewReadState,
  markProjectCommsRead,
  type ProjectCrewReadState,
} from '@/services/commsReadStateService'
import {
  addCommsLogEntry,
  DrywallProjectPermissionError,
  fetchDrywallCommsLog,
} from '@/services/drywallProjectsService'
import { getCurrentUserProfile } from '@/services/userService'
import type { DrywallCommsLogEntry } from '@/types/drywall'

const COMMS_REFRESH_MS = 60_000

interface CommsLogPanelProps {
  projectId: string
}

function CommsReadReceipt({
  entryAt,
  crewReadState,
}: {
  entryAt: string
  crewReadState: ProjectCrewReadState[]
}) {
  const readers = useMemo(
    () => readersForCommsEntry(entryAt, crewReadState),
    [entryAt, crewReadState],
  )
  const label = formatCommsReadReceiptLabel(readers)

  if (!label) return null

  const tooltip = formatCommsReadReceiptTooltip(readers)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p className="mt-2 text-xs text-muted-foreground cursor-default">{label}</p>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs whitespace-pre-line text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export function CommsLogPanel({ projectId }: CommsLogPanelProps) {
  const { user } = useAuth()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  const [entries, setEntries] = useState<DrywallCommsLogEntry[]>([])
  const [crewReadState, setCrewReadState] = useState<ProjectCrewReadState[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [authorName, setAuthorName] = useState('Unknown')

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true)
      try {
        const [rows, readers] = await Promise.all([
          fetchDrywallCommsLog(projectId),
          fetchProjectCrewReadState(projectId),
        ])
        setEntries(rows)
        setCrewReadState(readers)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Failed to load comms log')
      } finally {
        if (!options?.silent) setLoading(false)
      }
    },
    [projectId],
  )

  useEffect(() => {
    void load()
    const intervalId = window.setInterval(() => {
      void load({ silent: true })
    }, COMMS_REFRESH_MS)
    return () => window.clearInterval(intervalId)
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

  const handleAdd = async () => {
    if (readOnly || !body.trim()) return
    setSaving(true)
    try {
      const entry = await addCommsLogEntry(
        projectId,
        body,
        authorName,
        user?.id,
      )
      setEntries((prev) => [entry, ...prev])
      setBody('')
      toast.success('Entry added')
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to add entry')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquarePlus className="h-5 w-5 text-primary" />
          Comms Log
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Notes on customer/crew comms — appended only, latest at top
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Log a call, site visit, or customer note…"
              rows={3}
              disabled={saving}
            />
            <Button
              type="button"
              onClick={() => void handleAdd()}
              disabled={saving || !body.trim()}
            >
              {saving ? 'Adding…' : 'Add Entry'}
            </Button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comms logged yet.</p>
        ) : (
          <ul className="space-y-4">
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
                <CommsReadReceipt entryAt={entry.at} crewReadState={crewReadState} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
