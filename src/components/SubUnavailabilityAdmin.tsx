// ============================================================================
// Subcontractor unavailability admin (Path B — no per-sub detail page)
// ============================================================================

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createSubUnavailability,
  deleteSubUnavailability,
  fetchSubUnavailability,
  type SubUnavailability,
} from '@/services/calendarConfigService'
import { fetchSubcontractors } from '@/services/partnerDirectoryService'

interface SubUnavailabilityAdminProps {
  onBack: () => void
}

export function SubUnavailabilityAdmin({ onBack }: SubUnavailabilityAdminProps) {
  usePageTitle('Sub Unavailability')
  const [subs, setSubs] = useState<{ id: string; name: string }[]>([])
  const [selectedSubId, setSelectedSubId] = useState('')
  const [rows, setRows] = useState<SubUnavailability[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchSubcontractors({ includeInactive: true })
        setSubs(data.map((s) => ({ id: s.id, name: s.name })))
        if (data.length > 0) setSelectedSubId(data[0].id)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Failed to load subcontractors')
      }
    })()
  }, [])

  const loadRows = useCallback(async () => {
    if (!selectedSubId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setRows(await fetchSubUnavailability([selectedSubId]))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load unavailability')
    } finally {
      setLoading(false)
    }
  }, [selectedSubId])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const handleAdd = async () => {
    if (!selectedSubId) {
      toast.error('Select a subcontractor')
      return
    }
    if (!startDate || !endDate) {
      toast.error('Start and end dates are required')
      return
    }
    if (endDate < startDate) {
      toast.error('End date must be on or after start date')
      return
    }
    setSaving(true)
    try {
      await createSubUnavailability({
        subcontractor_id: selectedSubId,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || null,
      })
      setStartDate('')
      setEndDate('')
      setReason('')
      await loadRows()
      toast.success('Unavailability added')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add unavailability')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row: SubUnavailability) => {
    if (!window.confirm(`Remove unavailability ${row.start_date} to ${row.end_date}?`)) {
      return
    }
    try {
      await deleteSubUnavailability(row.id)
      await loadRows()
      toast.success('Removed')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const selectedSubName = subs.find((s) => s.id === selectedSubId)?.name ?? ''

  return (
    <AdminLayout
      onBack={onBack}
      title="Sub unavailability"
      description="Date ranges when an assigned subcontractor cannot work. Cascade math skips these days for their items."
    >
      <Card>
        <CardHeader>
          <CardTitle>Subcontractor</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedSubId} onValueChange={setSelectedSubId}>
            <SelectTrigger>
              <SelectValue placeholder="Select subcontractor" />
            </SelectTrigger>
            <SelectContent>
              {subs.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add range</CardTitle>
          <CardDescription>
            {selectedSubName
              ? `Blocked workdays for ${selectedSubName}`
              : 'Select a subcontractor first'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unavail-start">Start date</Label>
              <Input
                id="unavail-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unavail-end">End date</Label>
              <Input
                id="unavail-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="unavail-reason">Reason (optional)</Label>
              <Input
                id="unavail-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Vacation"
              />
            </div>
          </div>
          <Button onClick={() => void handleAdd()} disabled={saving || !selectedSubId}>
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranges</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unavailability ranges for this subcontractor.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-md border">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium tabular-nums">
                      {format(parseISO(row.start_date), 'MMM d, yyyy')}
                      {' — '}
                      {format(parseISO(row.end_date), 'MMM d, yyyy')}
                    </span>
                    {row.reason ? (
                      <span className="text-muted-foreground"> · {row.reason}</span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void handleDelete(row)}
                    aria-label="Delete range"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  )
}

function AdminLayout({
  onBack,
  title,
  description,
  children,
}: {
  onBack: () => void
  title: string
  description: string
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
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      {children}
    </div>
  )
}
