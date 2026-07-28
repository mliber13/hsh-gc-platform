import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarDays, ChevronRight, MapPin, RefreshCw, Users } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { isCrewRole } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  CrewProfileNotLinkedError,
  fetchCrewProjectList,
  personIsForeman,
  type CrewListScope,
} from '@/services/crewWorkspaceService'
import { fetchTeam } from '@/services/hrTeamService'
import type { CrewProjectListItem } from '@/types/crew'
import { drywallStatusLabel, drywallStatusPillClass } from '@/lib/drywall/crewStatusStyles'
import {
  crewMeasureStatusLabel,
  crewMeasureStatusPillClass,
} from '@/lib/drywall/crewMeasureStatus'

function parseScope(raw: string | null): CrewListScope {
  return raw === 'all' ? 'all' : 'mine'
}

export function CrewProjectListPage() {
  const { isFieldForeman, effectiveRole } = usePermissions()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isOperator = !isCrewRole(effectiveRole)
  const viewAsPersonId = isOperator ? searchParams.get('as') : null
  const scope = parseScope(searchParams.get('scope'))

  const [items, setItems] = useState<CrewProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewIsForeman, setPreviewIsForeman] = useState(false)
  const [previewFirstName, setPreviewFirstName] = useState<string | null>(null)

  const isForemanView = isFieldForeman || previewIsForeman

  const jobsLabel = (() => {
    const base = scope === 'all' ? 'All jobs' : 'My jobs'
    if (viewAsPersonId && previewIsForeman && previewFirstName) {
      return `${base} (${previewFirstName} — foreman preview)`
    }
    return base
  })()
  usePageTitle(jobsLabel)

  useEffect(() => {
    if (!viewAsPersonId) {
      setPreviewIsForeman(false)
      setPreviewFirstName(null)
      return
    }
    let cancelled = false
    void Promise.all([personIsForeman(viewAsPersonId), fetchTeam().catch(() => null)]).then(
      ([isForeman, team]) => {
        if (cancelled) return
        setPreviewIsForeman(isForeman)
        if (isForeman && team) {
          const member =
            team.employees.find((e) => e.id === viewAsPersonId) ??
            team.contractors1099.find((c) => c.id === viewAsPersonId)
          setPreviewFirstName(member?.name?.trim().split(/\s+/)[0] ?? 'crew')
        } else {
          setPreviewFirstName(null)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [viewAsPersonId])

  const setScope = (next: CrewListScope) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'mine') params.delete('scope')
    else params.set('scope', 'all')
    setSearchParams(params, { replace: true })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCrewProjectList({
        viewAsPersonId: viewAsPersonId ?? undefined,
        scope,
      })
      setItems(data)
    } catch (e) {
      if (e instanceof CrewProfileNotLinkedError) {
        setError(e.message)
      } else {
        console.error('fetchCrewProjectList failed:', e)
        setError('Could not load your jobs. Try again or contact the office.')
      }
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [viewAsPersonId, scope])

  useEffect(() => {
    void load()
  }, [load])

  const { pullDistance, refreshing } = usePullToRefresh(load)

  const scopeToggle =
    isForemanView ? (
      <div
        className="flex rounded-lg border bg-muted/40 p-0.5"
        role="group"
        aria-label="Job list scope"
      >
        <button
          type="button"
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            scope === 'mine'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={scope === 'mine'}
          onClick={() => setScope('mine')}
        >
          My jobs
        </button>
        <button
          type="button"
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            scope === 'all'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={scope === 'all'}
          onClick={() => setScope('all')}
        >
          All jobs
        </button>
      </div>
    ) : null

  if (loading) {
    return (
      <div className="space-y-3">
        {scopeToggle}
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      </div>
    )
  }

  if (error) {
    const isOperatorExplainer =
      !viewAsPersonId && error.includes('not linked') && isOperator
    return (
      <div className="space-y-3">
        {scopeToggle}
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            {isOperatorExplainer
              ? 'Operator preview: use View as to see a crew member’s assigned jobs, or assign team members on schedule items in the Schedule workspace.'
              : error}
          </p>
          {!isOperatorExplainer ? (
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {scopeToggle}
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center">
          <CalendarDays className="size-10 text-muted-foreground/50" />
          <h2 className="text-lg font-semibold">
            {scope === 'all' && isForemanView ? 'No jobs right now' : 'No assigned jobs'}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {viewAsPersonId
              ? scope === 'all'
                ? 'No current or upcoming drywall schedule items.'
                : 'This crew member has no schedule assignments in the current workspace.'
              : scope === 'all' && isForemanView
                ? 'No current or upcoming drywall schedule items.'
                : 'Check with your office about scheduling.'}
          </p>
        </div>
      </div>
    )
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const openTask = (item: CrewProjectListItem) => {
    const params = new URLSearchParams()
    if (viewAsPersonId) params.set('as', viewAsPersonId)
    if (scope === 'all') params.set('scope', 'all')
    params.set('item', item.scheduleItemId)
    navigate(`/crew/projects/${item.projectId}?${params.toString()}`)
  }

  return (
    <div
      className="space-y-3 pb-8"
      style={{
        transform: `translateY(${pullDistance}px)`,
        transition: pullDistance === 0 ? 'transform 200ms' : 'none',
      }}
    >
      {pullDistance > 0 || refreshing ? (
        <div
          className="pointer-events-none fixed left-0 right-0 top-14 flex justify-center"
          style={{ opacity: Math.min(1, pullDistance / 70) }}
        >
          <div className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">
            {refreshing ? 'Refreshing…' : pullDistance >= 70 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        </div>
      ) : null}

      {scopeToggle}

      <p className="text-sm text-muted-foreground">
        {items.length} upcoming task{items.length === 1 ? '' : 's'}
        {scope === 'mine' && !viewAsPersonId ? ' for you' : ''}
        {scope === 'all' ? ' across all jobs' : ''}
      </p>
      {items.map((item) => {
        const dateLabel = format(parseISO(item.scheduleItemDate), 'EEE MMM d')
        const isToday = item.scheduleItemDate === todayStr

        return (
          <Card
            key={item.scheduleItemId}
            className="cursor-pointer transition-colors hover:bg-muted/30 active:bg-muted/50"
            onClick={() => openTask(item)}
          >
            <CardContent className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-base font-semibold leading-snug">{item.projectName}</h3>
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    {item.measureWorkflowStatus ? (
                      <span className={crewMeasureStatusPillClass(item.measureWorkflowStatus)}>
                        Measure: {crewMeasureStatusLabel(item.measureWorkflowStatus)}
                      </span>
                    ) : null}
                    <span className={drywallStatusPillClass(item.status)}>
                      {drywallStatusLabel(item.status)}
                    </span>
                  </div>
                </div>
                {item.client ? (
                  <p className="text-sm text-muted-foreground">{item.client}</p>
                ) : null}
                {item.address ? (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="truncate">{item.address}</span>
                  </p>
                ) : null}
                <p className="text-sm font-medium text-foreground">{item.scheduleItemName}</p>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarDays className="size-3.5 shrink-0" />
                  {isToday ? (
                    <span className="font-semibold text-primary">Today · {dateLabel}</span>
                  ) : (
                    dateLabel
                  )}
                </p>
                {isForemanView ? (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {item.assignedPersonNames.length > 0
                        ? item.assignedPersonNames.join(', ')
                        : 'Unassigned'}
                    </span>
                  </p>
                ) : null}
                {item.scheduleItemNotes ? (
                  <p className="whitespace-pre-line rounded-md bg-muted/40 p-2 text-xs leading-snug text-muted-foreground md:hidden">
                    {item.scheduleItemNotes}
                  </p>
                ) : null}
              </div>
              {item.scheduleItemNotes ? (
                <div className="hidden w-2/5 shrink-0 self-stretch border-l border-border/60 pl-3 md:block">
                  <p className="line-clamp-5 whitespace-pre-line text-sm leading-snug text-muted-foreground">
                    {item.scheduleItemNotes}
                  </p>
                </div>
              ) : null}
              <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
