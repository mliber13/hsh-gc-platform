import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Clock, Link2, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  clockIn,
  clockOut,
  deleteEntry,
  fetchEntriesForRange,
  fetchMyOpenPunch,
  updateEntry,
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
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

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
      })
      toast.success('Clocked in')
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

  const totalHours = useMemo(
    () => entries.reduce((sum, entry) => sum + hoursFor(entry), 0),
    [entries],
  )

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
                    Since {formatDateTime(openPunch.clock_in)}
                  </p>
                </div>
                <Button onClick={() => void handleClockOut()} disabled={punchLoading}>
                  {punchLoading ? 'Clocking out…' : 'Clock out'}
                </Button>
              </div>
            ) : (
              <Button onClick={() => void handleClockIn()} disabled={punchLoading}>
                {punchLoading ? 'Clocking in…' : 'Clock in'}
              </Button>
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
            Entries in range: {entries.length} · Total closed hours: {formatHours(totalHours)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-44">
              <label className="mb-1 block text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="min-w-44">
              <label className="mb-1 block text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => void load()}>
              Apply range
            </Button>
          </div>

          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No entries found for this range.
            </p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
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
