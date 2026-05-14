// ============================================================================
// Org holidays admin — non-work days for schedule cascade
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createOrgHoliday,
  deleteOrgHoliday,
  fetchOrgHolidays,
  type OrgHoliday,
} from '@/services/calendarConfigService'

interface HolidaysAdminProps {
  onBack: () => void
}

export function HolidaysAdmin({ onBack }: HolidaysAdminProps) {
  usePageTitle('Holidays')
  const [holidays, setHolidays] = useState<OrgHoliday[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState('')
  const [label, setLabel] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setHolidays(await fetchOrgHolidays())
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load holidays')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byYear = useMemo(() => {
    const map = new Map<number, OrgHoliday[]>()
    for (const h of holidays) {
      const year = Number.parseInt(h.date.slice(0, 4), 10)
      if (!map.has(year)) map.set(year, [])
      map.get(year)!.push(h)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [holidays])

  const handleAdd = async () => {
    if (!date.trim()) {
      toast.error('Date is required')
      return
    }
    if (!label.trim()) {
      toast.error('Label is required')
      return
    }
    setSaving(true)
    try {
      await createOrgHoliday({ date, label: label.trim() })
      setDate('')
      setLabel('')
      await load()
      toast.success('Holiday added')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add holiday')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (holiday: OrgHoliday) => {
    if (!window.confirm(`Remove "${holiday.label}" on ${holiday.date}?`)) return
    try {
      await deleteOrgHoliday(holiday.id)
      await load()
      toast.success('Holiday removed')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete holiday')
    }
  }

  return (
    <HolidaysAdminLayout onBack={onBack}>
      <Card>
        <CardHeader>
          <CardTitle>Add holiday</CardTitle>
          <CardDescription>
            Org-wide non-work days. Schedule cascade math skips these dates for every trade.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2 flex-1">
            <Label htmlFor="holiday-date">Date</Label>
            <Input
              id="holiday-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2 flex-[2]">
            <Label htmlFor="holiday-label">Label</Label>
            <Input
              id="holiday-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Thanksgiving"
            />
          </div>
          <Button onClick={() => void handleAdd()} disabled={saving}>
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Holidays</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holidays added yet. Add Thanksgiving, Christmas, July 4th, and any HSH-specific
              non-work days here.
            </p>
          ) : (
            <div className="space-y-6">
              {byYear.map(([year, rows]) => (
                <div key={year}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">{year}</h3>
                  <ul className="divide-y divide-border/60 rounded-md border">
                    {rows.map((h) => (
                      <li
                        key={h.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium tabular-nums">
                            {format(parseISO(h.date), 'MMM d, yyyy')}
                          </span>
                          <span className="text-muted-foreground"> · {h.label}</span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => void handleDelete(h)}
                          aria-label={`Delete ${h.label}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </HolidaysAdminLayout>
  )
}

function HolidaysAdminLayout({
  onBack,
  children,
}: {
  onBack: () => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground w-fit"
      >
        <ArrowLeft className="size-4" />
        Back
      </button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Holidays</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Non-work days skipped when schedule dates cascade.
        </p>
      </div>
      {children}
    </div>
  )
}
