import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { CalendarRange, LayoutList, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { startOfMonth } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { fetchTeam } from '@/services/hrTeamService'
import { isArchivedMember } from '@/lib/hrTeamUtils'
import { cn } from '@/lib/utils'
import {
  DrywallScheduleCascadeError,
  deleteScheduleItemForDrywallProject,
  fetchScheduleItemsForDrywallProject,
  type DrywallProjectScheduleItem,
} from '@/services/scheduleService'
import {
  DrywallScheduleCalendar,
  defaultScheduleCalendarMonth,
} from './DrywallScheduleCalendar'
import { GenerateStandardScheduleDialog } from './GenerateStandardScheduleDialog'
import { ScheduleItemDialog } from './ScheduleItemDialog'
import {
  SCHEDULE_ITEM_STATUS_CLASS,
  SCHEDULE_ITEM_STATUS_LABELS,
  SCHEDULE_PHASE_DOT_CLASS,
  phaseForScheduleItem,
} from './scheduleItemStatusStyles'

function formatDates(item: DrywallProjectScheduleItem): string {
  if (item.start_date === item.end_date) return item.start_date
  return `${item.start_date} → ${item.end_date}`
}

export function DrywallScheduleEditor() {
  const { projectId, projectName } = useOutletContext<DrywallProjectShellContext>()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<DrywallProjectScheduleItem[]>([])
  const [personNames, setPersonNames] = useState<Map<string, string>>(new Map())
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [editing, setEditing] = useState<DrywallProjectScheduleItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, team] = await Promise.all([
        fetchScheduleItemsForDrywallProject(projectId),
        fetchTeam().catch(() => null),
      ])
      setItems(rows)
      if (team) {
        const map = new Map<string, string>()
        for (const e of team.employees) {
          if (!isArchivedMember(e)) map.set(e.id, e.name)
        }
        for (const c of team.contractors1099) {
          if (!isArchivedMember(c)) map.set(c.id, c.name)
        }
        setPersonNames(map)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load schedule')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (item: DrywallProjectScheduleItem) => {
    setEditing(item)
    setDialogOpen(true)
  }

  const handleDelete = async (item: DrywallProjectScheduleItem) => {
    if (!window.confirm(`Delete "${item.name}" from the schedule?`)) return
    setDeletingId(item.id)
    try {
      await deleteScheduleItemForDrywallProject(item.id)
      toast.success('Schedule item deleted')
      await load()
    } catch (e) {
      if (e instanceof DrywallScheduleCascadeError) {
        toast.warning(e.message)
        await load()
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to delete item')
      }
    } finally {
      setDeletingId(null)
    }
  }

  const switchToCalendar = () => {
    setCalendarMonth(defaultScheduleCalendarMonth(items))
    setViewMode('calendar')
  }

  const empty = items.length === 0

  const title = useMemo(
    () => (projectName ? `Schedule for ${projectName}` : 'Project schedule'),
    [projectName],
  )

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-sm">
            Field tasks with predecessor chains — assigned crew see this project in /crew.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!empty && (
            <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  viewMode === 'list'
                    ? 'bg-card text-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutList className="size-4" />
                List
              </button>
              <button
                type="button"
                onClick={switchToCalendar}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  viewMode === 'calendar'
                    ? 'bg-card text-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <CalendarRange className="size-4" />
                Calendar
              </button>
            </div>
          )}
          {!readOnly && !empty && (
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add schedule item
            </Button>
          )}
        </div>
      </div>

      {empty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <CalendarRange className="text-muted-foreground h-10 w-10" />
            <div>
              <p className="font-medium">No schedule items yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Add one to get started, or generate Mark&apos;s standard drywall chain.
              </p>
            </div>
            {!readOnly && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add schedule item
                </Button>
                <Button type="button" variant="secondary" onClick={() => setGenerateOpen(true)}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate standard schedule
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'calendar' ? (
        <DrywallScheduleCalendar
          items={items}
          personNames={personNames}
          readOnly={readOnly}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          onEdit={openEdit}
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Schedule items ({items.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Dates</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Assigned</th>
                  <th className="px-4 py-2 font-medium">Notes</th>
                  {!readOnly && <th className="px-4 py-2 font-medium w-24" />}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-block size-2.5 rounded-full',
                            SCHEDULE_PHASE_DOT_CLASS[phaseForScheduleItem(item)],
                          )}
                          aria-hidden
                        />
                        {item.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                          item.type === 'field'
                            ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                            : 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
                        )}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatDates(item)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          SCHEDULE_ITEM_STATUS_CLASS[item.status],
                        )}
                      >
                        {SCHEDULE_ITEM_STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.assigned_persons.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {item.assigned_persons.map((id) => (
                            <span
                              key={id}
                              className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
                            >
                              {personNames.get(id) ?? id.slice(0, 8)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[12rem] truncate text-muted-foreground text-xs">
                      {item.notes?.trim() || '—'}
                    </td>
                    {!readOnly && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(item)}
                            aria-label={`Edit ${item.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            disabled={deletingId === item.id}
                            onClick={() => void handleDelete(item)}
                            aria-label={`Delete ${item.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <ScheduleItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        siblingItems={items}
        editing={editing}
        onSaved={() => void load()}
      />

      <GenerateStandardScheduleDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        projectId={projectId}
        onGenerated={() => void load()}
      />
    </div>
  )
}
