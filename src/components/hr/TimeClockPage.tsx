import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subDays,
  subMonths,
} from 'date-fns'
import { Clock, Link2, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  clockIn,
  clockOut,
  deleteEntry,
  fetchEntriesForRange,
  fetchMyOpenPunch,
  fetchTimeClockProjects,
  updateEntry,
  type TimeClockProject,
} from '@/services/hrTimeService'
import type { PunchState, TimeEntry } from '@/types/hr'
import { TimeEntryEditDialog } from './time/TimeEntryEditDialog'

function formatDateTime(value?: string | null) {
  if (!value) return 'Open'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return format(d, 'MM/dd/yyyy h:mm a')
}

function hoursFor(entry: TimeEntry): number {
  if (!entry.clock_out) return 0
  const ms = new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return ms / (1000 * 60 * 60)
}

function formatHours(value: number) {
  return value.toFixed(2)
}

function isoDateFromNow(daysOffset: number) {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  return d.toISOString().slice(0, 10)
}

const ISO = 'yyyy-MM-dd'

/** Quick date-range presets for the entry log (label + from/to as yyyy-MM-dd). */
type QuickRange = { key: string; label: string; range: () => { from: string; to: string } }

const QUICK_RANGES: QuickRange[] = [
  {
    key: 'today',
    label: 'Today',
    range: () => {
      const d = format(new Date(), ISO)
      return { from: d, to: d }
    },
  },
  {
    key: 'this-week',
    label: 'This week',
    range: () => {
      const now = new Date()
      return { from: format(startOfWeek(now), ISO), to: format(endOfWeek(now), ISO) }
    },
  },
  {
    key: 'last-week',
    label: 'Last week',
    range: () => {
      const last = subWeeks(new Date(), 1)
      return { from: format(startOfWeek(last), ISO), to: format(endOfWeek(last), ISO) }
    },
  },
  {
    key: 'this-month',
    label: 'This month',
    range: () => {
      const now = new Date()
      return { from: format(startOfMonth(now), ISO), to: format(endOfMonth(now), ISO) }
    },
  },
  {
    key: 'last-month',
    label: 'Last month',
    range: () => {
      const last = subMonths(new Date(), 1)
      return { from: format(startOfMonth(last), ISO), to: format(endOfMonth(last), ISO) }
    },
  },
  {
    key: 'last-14',
    label: 'Last 14 days',
    range: () => ({ from: format(subDays(new Date(), 13), ISO), to: format(new Date(), ISO) }),
  },
]

export function TimeClockPage() {
  usePageTitle('HR — Time Clock')
  const { effectiveRole } = usePermissions()
  const canManageEntries = ['owner', 'office_gc', 'office_drywall'].includes(effectiveRole)

  const [loading, setLoading] = useState(true)
  const [punchLoading, setPunchLoading] = useState(false)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [punchState, setPunchState] = useState<PunchState>({
    linked: false,
    openEntry: null,
  })
  const [from, setFrom] = useState(isoDateFromNow(-7))
  const [to, setTo] = useState(isoDateFromNow(0))
  const [personFilter, setPersonFilter] = useState('all')
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [projects, setProjects] = useState<TimeClockProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetchTimeClockProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows)
      })
      .catch(() => {
        if (!cancelled) setProjects([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [state, rows] = await Promise.all([
        fetchMyOpenPunch(),
        fetchEntriesForRange({ from, to }),
      ])
      setPunchState(state)
      setEntries(rows)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load time clock')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  const openPunch = punchState.openEntry

  const handleClockIn = async () => {
    if (!punchState.linked || !punchState.hrPersonId || !punchState.hrPersonType) return
    setPunchLoading(true)
    try {
      await clockIn({
        personId: punchState.hrPersonId,
        personType: punchState.hrPersonType,
        projectId: selectedProjectId || undefined,
      })
      toast.success('Clocked in')
      setSelectedProjectId('')
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to clock in'
      toast.error(msg)
    } finally {
      setPunchLoading(false)
    }
  }

  const handleClockOut = async () => {
    if (!openPunch) return
    setPunchLoading(true)
    try {
      await clockOut(openPunch.id)
      toast.success('Clocked out')
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to clock out'
      toast.error(msg)
    } finally {
      setPunchLoading(false)
    }
  }

  // People present in the loaded range (for the person dropdown), sorted by name.
  const personOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const entry of entries) {
      if (entry.person_id && !byId.has(entry.person_id)) {
        byId.set(entry.person_id, entry.person_name || 'Unknown person')
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])

  // Keep the selected person valid when the range changes and they drop out.
  useEffect(() => {
    if (personFilter !== 'all' && !personOptions.some((p) => p.id === personFilter)) {
      setPersonFilter('all')
    }
  }, [personOptions, personFilter])

  const visibleEntries = useMemo(
    () =>
      personFilter === 'all'
        ? entries
        : entries.filter((e) => e.person_id === personFilter),
    [entries, personFilter],
  )

  const totalHours = useMemo(
    () => visibleEntries.reduce((sum, entry) => sum + hoursFor(entry), 0),
    [visibleEntries],
  )

  const activeRangeKey = useMemo(() => {
    for (const preset of QUICK_RANGES) {
      const r = preset.range()
      if (r.from === from && r.to === to) return preset.key
    }
    return null
  }, [from, to])

  const applyQuickRange = (preset: QuickRange) => {
    const r = preset.range()
    setFrom(r.from)
    setTo(r.to)
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Clock className="size-6 text-primary" />
          Time Clock
        </h1>
        <p className="text-sm text-muted-foreground">
          Clock in/out and review time entries for a selected date range.
        </p>
      </div>

      {punchState.linked ? (
        <Card>
          <CardHeader>
            <CardTitle>Punch panel</CardTitle>
            <CardDescription>Your linked HR person can clock in/out here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openPunch ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <div>
                  <p className="font-medium text-amber-900">You are clocked in</p>
                  <p className="text-sm text-amber-700">
                    {openPunch.project_name ? `${openPunch.project_name} · ` : ''}
                    Since {formatDateTime(openPunch.clock_in)}
                  </p>
                </div>
                <Button onClick={() => void handleClockOut()} disabled={punchLoading}>
                  {punchLoading ? 'Clocking out…' : 'Clock out'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1 space-y-1.5">
                  <label className="block text-xs text-muted-foreground">Job (optional)</label>
                  <Select
                    value={selectedProjectId || 'none'}
                    onValueChange={(v) => setSelectedProjectId(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No job — general hours" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No job — general hours</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => void handleClockIn()} disabled={punchLoading}>
                  {punchLoading ? 'Clocking in…' : 'Clock in'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <Link2 className="mt-0.5 size-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Link your profile to an HR person to clock in. Visit{' '}
              <Link to="/hr/team" className="text-primary underline">
                Team
              </Link>{' '}
              for now.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Entry log</CardTitle>
          <CardDescription>
            {personFilter === 'all'
              ? `Entries in range: ${visibleEntries.length}`
              : `Entries for ${personOptions.find((p) => p.id === personFilter)?.name ?? 'person'}: ${visibleEntries.length}`}{' '}
            · Total closed hours: {formatHours(totalHours)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick date-range presets */}
          <div className="flex flex-wrap gap-2">
            {QUICK_RANGES.map((preset) => (
              <Button
                key={preset.key}
                type="button"
                size="sm"
                variant={activeRangeKey === preset.key ? 'default' : 'outline'}
                onClick={() => applyQuickRange(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-44">
              <label className="mb-1 block text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="min-w-44">
              <label className="mb-1 block text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="min-w-56 flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">Person</label>
              <Select value={personFilter} onValueChange={setPersonFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All people" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All people</SelectItem>
                  {personOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
          </div>

          {visibleEntries.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {personFilter === 'all'
                ? 'No entries found for this range.'
                : 'No entries for this person in this range.'}
            </p>
          ) : (
            <div className="space-y-2">
              {visibleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{entry.person_name || 'Unknown person'}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.project_name || 'Unassigned project'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      In: {formatDateTime(entry.clock_in)} · Out: {formatDateTime(entry.clock_out)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded border px-2 py-1 text-xs">
                      {entry.source_app || 'Unknown source'}
                    </span>
                    <span
                      className={
                        entry.clock_out
                          ? 'rounded bg-muted px-2 py-1 text-xs'
                          : 'rounded bg-primary px-2 py-1 text-xs text-primary-foreground'
                      }
                    >
                      {entry.clock_out ? `${formatHours(hoursFor(entry))} hrs` : 'Open'}
                    </span>
                    {canManageEntries && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditEntry(entry)}
                          title="Edit entry"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            try {
                              await deleteEntry(entry.id)
                              toast.success('Entry deleted')
                              await load()
                            } catch (e: unknown) {
                              toast.error(
                                e instanceof Error ? e.message : 'Failed to delete entry',
                              )
                            }
                          }}
                          title="Delete entry"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TimeEntryEditDialog
        open={!!editEntry}
        entry={editEntry}
        onOpenChange={(open) => {
          if (!open) setEditEntry(null)
        }}
        saving={savingEdit}
        onSave={async (patch) => {
          if (!editEntry) return
          setSavingEdit(true)
          try {
            await updateEntry(editEntry.id, patch)
            toast.success('Entry updated')
            setEditEntry(null)
            await load()
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to save entry'
            toast.error(msg)
          } finally {
            setSavingEdit(false)
          }
        }}
      />
    </div>
  )
}
