import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { History, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { fetchTeam } from '@/services/hrTeamService'
import { isArchivedMember } from '@/lib/hrTeamUtils'
import {
  fetchScheduleChanges,
  formatScheduleChange,
  formatScheduleChangeGroup,
  groupByTxid,
  type ScheduleChangeEntry,
  type ScheduleChangeGroup,
} from '@/services/scheduleChangeLogService'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, scopes the feed to one project (per-project history). */
  projectId?: string
  projectName?: string | null
  /** Optional project id → name map for the global feed. */
  projectNames?: Map<string, string>
  title?: string
}

const FILTER_ALL = 'all'

function formatWhen(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d · h:mm a')
  } catch {
    return iso
  }
}

export function ScheduleChangeLogSheet({
  open,
  onOpenChange,
  projectId,
  projectName,
  projectNames,
  title,
}: Props) {
  const { effectiveRole } = usePermissions()
  const canView = canWriteDrywallProject(effectiveRole)

  const [entries, setEntries] = useState<ScheduleChangeEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [personNames, setPersonNames] = useState<Map<string, string>>(() => new Map())
  const [personFilter, setPersonFilter] = useState(FILTER_ALL)
  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)

  const isGlobal = !projectId
  const sheetTitle =
    title ?? (isGlobal ? 'Schedule activity' : 'Schedule history')

  const load = useCallback(async () => {
    if (!canView) {
      setEntries([])
      return
    }
    setLoading(true)
    try {
      const rows = await fetchScheduleChanges({
        projectId,
        limit: 200,
      })
      setEntries(rows)
    } catch (e) {
      console.error('fetchScheduleChanges failed:', e)
      toast.error(e instanceof Error ? e.message : 'Failed to load schedule activity')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [canView, projectId])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetchTeam()
      .then((team) => {
        if (cancelled) return
        const map = new Map<string, string>()
        for (const e of team.employees) {
          if (!isArchivedMember(e)) map.set(e.id, e.name)
        }
        for (const c of team.contractors1099) {
          if (!isArchivedMember(c)) map.set(c.id, c.name)
        }
        setPersonNames(map)
      })
      .catch(() => {
        /* roster optional for assignee diffs */
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    setPersonFilter(FILTER_ALL)
    setProjectFilter(FILTER_ALL)
  }, [projectId, open])

  const actorOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const e of entries) {
      if (!e.changedBy) continue
      if (!byId.has(e.changedBy)) {
        byId.set(e.changedBy, e.changedByName?.trim() || 'Unknown')
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])

  const projectOptions = useMemo(() => {
    if (!isGlobal) return []
    const byId = new Map<string, string>()
    for (const e of entries) {
      if (!e.projectId) continue
      if (!byId.has(e.projectId)) {
        byId.set(
          e.projectId,
          projectNames?.get(e.projectId) ?? projectName ?? e.projectId.slice(0, 8),
        )
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entries, isGlobal, projectNames, projectName])

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (personFilter !== FILTER_ALL && e.changedBy !== personFilter) return false
      if (projectFilter !== FILTER_ALL && e.projectId !== projectFilter) return false
      return true
    })
  }, [entries, personFilter, projectFilter])

  const groups = useMemo(() => groupByTxid(filteredEntries), [filteredEntries])

  if (!canView) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-border/60 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 p-4 pr-10">
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4" />
            {sheetTitle}
          </SheetTitle>
          <SheetDescription>
            {isGlobal
              ? 'Recent schedule edits across jobs (operators only).'
              : `Edits to this job’s schedule${projectName ? ` — ${projectName}` : ''}.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2">
          <select
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            aria-label="Filter by person"
          >
            <option value={FILTER_ALL}>All people</option>
            {actorOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {isGlobal ? (
            <select
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="Filter by project"
            >
              <option value={FILTER_ALL}>All projects</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => void load()}
            aria-label="Refresh"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-3 p-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            ) : groups.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No schedule changes yet.
              </p>
            ) : (
              groups.map((group) => (
                <ChangeGroupCard
                  key={group.txid}
                  group={group}
                  personNames={personNames}
                  projectName={
                    group.projectId
                      ? (projectNames?.get(group.projectId) ??
                        (group.projectId === projectId ? projectName : null) ??
                        null)
                      : null
                  }
                  showProject={isGlobal}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function ChangeGroupCard({
  group,
  personNames,
  projectName,
  showProject,
}: {
  group: ScheduleChangeGroup
  personNames: Map<string, string>
  projectName: string | null
  showProject: boolean
}) {
  const headline = formatScheduleChangeGroup(group, {
    personNames,
    projectName: showProject ? projectName : null,
  })

  return (
    <div className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
      <p className="text-sm font-medium leading-snug text-foreground">{headline}</p>
      <p className="mt-1 text-xs text-muted-foreground">{formatWhen(group.changedAt)}</p>
      {group.dependentsCount > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-border/50 pt-2">
          {group.entries
            .filter((e) => e.id !== group.primary.id)
            .map((e) => (
              <li key={e.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {e.itemName ?? 'Item'}
                </span>
                {' — '}
                {formatScheduleChange(e, { personNames })}
              </li>
            ))}
        </ul>
      ) : group.primary.action === 'updated' &&
        Object.keys(group.primary.changes).length > 1 ? (
        <p className={cn('mt-1.5 text-xs text-muted-foreground')}>
          {formatScheduleChange(group.primary, { personNames })}
        </p>
      ) : null}
    </div>
  )
}
