import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { Lock, MessageSquarePlus, Megaphone, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import { DrywallProjectPermissionError } from '@/services/drywallProjectsService'
import { fetchTeam } from '@/services/hrTeamService'
import {
  fetchProjectComms,
  groupIntoLanes,
  postProjectComms,
  type CommsAudience,
  type CommsLane,
  type ProjectCommsMessage,
} from '@/services/projectCommsService'
import { fetchScheduleItemsForDrywallProject } from '@/services/scheduleService'

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

function laneIcon(audience: CommsAudience) {
  if (audience === 'office') return <Lock className="size-3.5 shrink-0" />
  if (audience === 'job') return <Megaphone className="size-3.5 shrink-0" />
  return <User className="size-3.5 shrink-0" />
}

function laneHint(lane: CommsLane): string {
  if (lane.audience === 'office') return 'Internal note. No one in the field can see this.'
  if (lane.audience === 'job') return 'Goes to everyone assigned to this job.'
  return `Private between the office and ${lane.label}.`
}

export function CommsLogPanel({ projectId }: CommsLogPanelProps) {
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  const [messages, setMessages] = useState<ProjectCommsMessage[]>([])
  const [crewReadState, setCrewReadState] = useState<ProjectCrewReadState[]>([])
  const [nameByPersonId, setNameByPersonId] = useState<Map<string, string>>(new Map())
  const [assignedPersonIds, setAssignedPersonIds] = useState<string[]>([])
  const [activeLaneKey, setActiveLaneKey] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true)
      try {
        const [rows, readers] = await Promise.all([
          fetchProjectComms(projectId),
          fetchProjectCrewReadState(projectId),
        ])
        setMessages(rows)
        setCrewReadState(readers)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Failed to load messages')
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

  // Roster names + who is assigned, so the office can open a lane with someone
  // who hasn't messaged yet.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [team, items] = await Promise.all([
          fetchTeam(),
          fetchScheduleItemsForDrywallProject(projectId),
        ])
        if (cancelled) return
        const map = new Map<string, string>()
        for (const person of [...team.employees, ...team.contractors1099]) {
          if (person.id && person.name) map.set(person.id, person.name)
        }
        setNameByPersonId(map)
        setAssignedPersonIds([
          ...new Set(items.flatMap((item) => item.assigned_persons ?? [])),
        ])
      } catch {
        /* lane labels fall back to the author name */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const nameFor = useCallback(
    (personId: string) => nameByPersonId.get(personId),
    [nameByPersonId],
  )

  const lanes = useMemo(() => {
    const existing = groupIntoLanes(messages, nameFor)
    const seen = new Set(existing.map((l) => l.key))
    const extra: CommsLane[] = []

    // Always offer the broadcast and internal lanes.
    for (const audience of ['job', 'office'] as const) {
      if (!seen.has(audience)) {
        extra.push({
          key: audience,
          audience,
          personId: null,
          label: audience === 'job' ? 'Job-wide' : 'Office only',
          messages: [],
          lastAt: null,
        })
      }
    }
    // Offer a lane for each assigned crew member with no traffic yet.
    for (const personId of assignedPersonIds) {
      const key = `crew:${personId}`
      if (seen.has(key)) continue
      extra.push({
        key,
        audience: 'crew',
        personId,
        label: nameFor(personId) ?? 'Crew member',
        messages: [],
        lastAt: null,
      })
    }
    return [...existing, ...extra]
  }, [messages, nameFor, assignedPersonIds])

  // Default to the lane with the newest traffic so incoming messages are seen.
  useEffect(() => {
    if (activeLaneKey && lanes.some((l) => l.key === activeLaneKey)) return
    setActiveLaneKey(lanes[0]?.key ?? 'office')
  }, [lanes, activeLaneKey])

  const activeLane = lanes.find((l) => l.key === activeLaneKey) ?? lanes[0] ?? null

  const handleAdd = async () => {
    if (readOnly || !body.trim() || !activeLane) return
    setSaving(true)
    try {
      const entry = await postProjectComms({
        projectId,
        body,
        audience: activeLane.audience,
        audiencePersonId: activeLane.personId,
      })
      setMessages((prev) => [entry, ...prev])
      setBody('')
      toast.success(
        activeLane.audience === 'office'
          ? 'Note added'
          : `Sent to ${activeLane.label}`,
      )
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquarePlus className="h-5 w-5 text-primary" />
          Messages
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Each crew member has a private line to the office. Use Job-wide to reach
          everyone on the job; Office only stays internal.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {lanes.map((lane) => {
            const isActive = lane.key === activeLane?.key
            return (
              <button
                key={lane.key}
                type="button"
                onClick={() => setActiveLaneKey(lane.key)}
                aria-pressed={isActive}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {laneIcon(lane.audience)}
                <span className="whitespace-nowrap">{lane.label}</span>
                {lane.messages.length > 0 ? (
                  <span className={isActive ? 'opacity-80' : 'opacity-60'}>
                    {lane.messages.length}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {!readOnly && activeLane && (
          <div className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                activeLane.audience === 'office'
                  ? 'Log a call, site visit, or internal note…'
                  : `Message ${activeLane.label}…`
              }
              rows={3}
              disabled={saving}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button
                type="button"
                onClick={() => void handleAdd()}
                disabled={saving || !body.trim()}
              >
                {saving
                  ? 'Sending…'
                  : activeLane.audience === 'office'
                    ? 'Add note'
                    : 'Send'}
              </Button>
              <p className="text-xs text-muted-foreground">{laneHint(activeLane)}</p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !activeLane || activeLane.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {activeLane?.audience === 'office'
              ? 'No internal notes yet.'
              : 'No messages in this conversation yet.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {activeLane.messages.map((entry) => (
              <li key={entry.id} className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{entry.author}</span>
                  {' • '}
                  <time
                    dateTime={entry.at}
                    title={format(new Date(entry.at), 'MMM d, yyyy h:mm a')}
                  >
                    {formatDistanceToNow(new Date(entry.at), { addSuffix: true })}
                  </time>
                </p>
                <p className="mt-2 text-sm whitespace-pre-wrap">{entry.body}</p>
                {activeLane.audience !== 'office' ? (
                  <CommsReadReceipt entryAt={entry.at} crewReadState={crewReadState} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
