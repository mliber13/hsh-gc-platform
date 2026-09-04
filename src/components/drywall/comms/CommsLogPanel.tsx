import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { Forward, Layers, Lock, MessageSquarePlus, Megaphone, User } from 'lucide-react'
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
  laneKeyOf,
  postProjectComms,
  type CommsAudience,
  type CommsLane,
  type ProjectCommsMessage,
} from '@/services/projectCommsService'
import { fetchScheduleItemsForDrywallProject } from '@/services/scheduleService'
import {
  ForwardMessageDialog,
  JOB_WIDE_KEY,
  type ForwardRecipientOption,
} from '@/components/drywall/comms/ForwardMessageDialog'

const COMMS_REFRESH_MS = 60_000

/**
 * The office reads the whole job in one stream by default. Lanes gate what the
 * FIELD sees; they were never meant to make the office click through six
 * conversations to catch up on a job.
 */
const ALL_KEY = '__all__'

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

/**
 * An empty lane should say what the lane is for. "No messages yet" on a lane
 * nobody has ever used reads like something is broken.
 */
function laneEmptyText(lane: CommsLane): string {
  if (lane.audience === 'office') {
    return 'No internal notes yet. Anything you write here stays in the office.'
  }
  if (lane.audience === 'job') {
    return 'Nothing has gone out to the whole job yet. Post here to reach everyone assigned to it.'
  }
  return `No messages with ${lane.label} yet. Anything you post here is private between the two of you.`
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
  const [forwarding, setForwarding] = useState<ProjectCommsMessage | null>(null)

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
    // Sort the whole set, not just the lanes that have traffic — otherwise an
    // empty Job-wide lane gets appended after Office only and the chip order
    // shifts as conversations start.
    const order: Record<CommsAudience, number> = { crew: 0, job: 1, office: 2 }
    return [...existing, ...extra].sort((a, b) => {
      if (a.audience !== b.audience) return order[a.audience] - order[b.audience]
      return (b.lastAt ?? '').localeCompare(a.lastAt ?? '')
    })
  }, [messages, nameFor, assignedPersonIds])

  // Open on the whole job; drop into a lane to reply.
  useEffect(() => {
    if (activeLaneKey === ALL_KEY) return
    if (activeLaneKey && lanes.some((l) => l.key === activeLaneKey)) return
    setActiveLaneKey(ALL_KEY)
  }, [lanes, activeLaneKey])

  const isAllView = activeLaneKey === ALL_KEY
  const activeLane = isAllView
    ? null
    : (lanes.find((l) => l.key === activeLaneKey) ?? lanes[0] ?? null)
  const visibleMessages = isAllView ? messages : (activeLane?.messages ?? [])

  /** Which conversation a message sits in — shown as a jump-to badge in All. */
  const laneLabelFor = useCallback(
    (m: ProjectCommsMessage) => {
      if (m.audience === 'job') return 'Job-wide'
      if (m.audience === 'office') return 'Office only'
      return (m.audiencePersonId ? nameFor(m.audiencePersonId) : null) ?? m.author
    },
    [nameFor],
  )

  // Everyone on the roster can receive a forward, not just the crew assigned to
  // this job — the common case is routing a message to someone about to start.
  const forwardRecipients = useMemo<ForwardRecipientOption[]>(() => {
    const assigned = new Set(assignedPersonIds)
    return [...nameByPersonId.entries()].map(([personId, name]) => ({
      personId,
      name,
      assigned: assigned.has(personId),
    }))
  }, [nameByPersonId, assignedPersonIds])

  /**
   * Destinations each message has already been forwarded to, keyed by the source
   * message id. Values are person ids, or 'job' for the broadcast lane. Drives
   * both the "Forwarded to ..." note and the picker's already-sent state, so the
   * office can see where something went before sending it again.
   */
  const forwardedDestinations = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const m of messages) {
      if (!m.forwardedFromId) continue
      const dest = m.audience === 'job' ? JOB_WIDE_KEY : m.audiencePersonId
      if (!dest) continue
      const set = map.get(m.forwardedFromId) ?? new Set<string>()
      set.add(dest)
      map.set(m.forwardedFromId, set)
    }
    return map
  }, [messages])

  const describeDestinations = useCallback(
    (destinations: Set<string>) =>
      [...destinations].map((d) =>
        d === JOB_WIDE_KEY ? 'everyone on this job' : (nameFor(d) ?? 'a crew member'),
      ),
    [nameFor],
  )

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
          <button
            type="button"
            onClick={() => setActiveLaneKey(ALL_KEY)}
            aria-pressed={isAllView}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isAllView
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            <Layers className="size-3.5 shrink-0" />
            <span className="whitespace-nowrap">All</span>
            {messages.length > 0 ? (
              <span className={isAllView ? 'opacity-80' : 'opacity-60'}>{messages.length}</span>
            ) : null}
          </button>
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

        {isAllView ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Everything on this job, newest first. Pick a conversation above — or tap
            a tag below — to reply in it.
          </p>
        ) : null}

        {!readOnly && !isAllView && activeLane && (
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
        ) : visibleMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAllView
              ? 'No messages on this job yet.'
              : activeLane
                ? laneEmptyText(activeLane)
                : 'No messages yet.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {visibleMessages.map((entry) => {
              const alreadySent = describeDestinations(
                forwardedDestinations.get(entry.forwardedFromId ?? entry.id) ?? new Set(),
              )
              return (
                <li key={entry.id} className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-start gap-2">
                    <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{entry.author}</span>
                      <span aria-hidden>•</span>
                      <time
                        dateTime={entry.at}
                        title={format(new Date(entry.at), 'MMM d, yyyy h:mm a')}
                      >
                        {formatDistanceToNow(new Date(entry.at), { addSuffix: true })}
                      </time>
                      {isAllView ? (
                        <button
                          type="button"
                          onClick={() => setActiveLaneKey(laneKeyOf(entry))}
                          title="Open this conversation"
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide hover:bg-muted-foreground/20"
                        >
                          {laneLabelFor(entry)}
                        </button>
                      ) : null}
                    </p>
                    {!readOnly ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-my-1 h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                        onClick={() => setForwarding(entry)}
                      >
                        <Forward className="size-3.5" />
                        Forward
                      </Button>
                    ) : null}
                  </div>

                  {entry.forwardedByName ? (
                    <p className="mt-1 text-xs italic text-muted-foreground">
                      Forwarded by {entry.forwardedByName}
                    </p>
                  ) : null}

                  <p className="mt-2 text-sm whitespace-pre-wrap">{entry.body}</p>

                  {alreadySent.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Forwarded to {alreadySent.join(', ')}
                    </p>
                  ) : null}

                  {entry.audience !== 'office' ? (
                    <CommsReadReceipt entryAt={entry.at} crewReadState={crewReadState} />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <ForwardMessageDialog
        open={forwarding !== null}
        onOpenChange={(open) => {
          if (!open) setForwarding(null)
        }}
        projectId={projectId}
        message={forwarding}
        recipients={forwardRecipients}
        alreadySentTo={
          forwarding
            ? (forwardedDestinations.get(forwarding.forwardedFromId ?? forwarding.id) ??
              new Set<string>())
            : new Set<string>()
        }
        onForwarded={() => void load({ silent: true })}
      />
    </Card>
  )
}
