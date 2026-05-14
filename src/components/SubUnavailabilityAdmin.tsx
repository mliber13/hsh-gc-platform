// ============================================================================
// Subcontractor unavailability admin (Path B — no per-sub detail page)
// ============================================================================
//
// Two scopes here:
//   - Add form (top): sub picker + dates + reason. Adds for the picked sub.
//   - Ranges table (bottom): GLOBAL across all subs, sorted by start_date.
//     Each row shows sub name explicitly. Edit + delete affordances per row.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createSubUnavailability,
  deleteSubUnavailability,
  fetchSubUnavailability,
  updateSubUnavailability,
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
  const [editingRow, setEditingRow] = useState<SubUnavailability | null>(null)

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
    setLoading(true)
    try {
      // Global: fetch all rows for the org (no subcontractor_id filter).
      const all = await fetchSubUnavailability()
      // Sort by start_date ascending so upcoming/recent comes first when
      // paired with a date-from-now filter; for now show all in chronological order.
      all.sort((a, b) => a.start_date.localeCompare(b.start_date))
      setRows(all)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load unavailability')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const subNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of subs) map.set(s.id, s.name)
    return map
  }, [subs])

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
    const subName = subNameById.get(row.subcontractor_id) ?? 'this sub'
    if (
      !window.confirm(
        `Remove ${subName}'s unavailability ${row.start_date} to ${row.end_date}?`,
      )
    ) {
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
          <CardTitle>Add range</CardTitle>
          <CardDescription>
            Pick a subcontractor and block off the dates they're unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="unavail-sub">Subcontractor</Label>
              <Select value={selectedSubId} onValueChange={setSelectedSubId}>
                <SelectTrigger id="unavail-sub">
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
            </div>
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
            {saving ? 'Adding…' : `Add for ${selectedSubName || 'sub'}`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranges</CardTitle>
          <CardDescription>
            All unavailability ranges across every subcontractor, earliest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unavailability ranges yet. Add one above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Subcontractor</th>
                    <th className="py-2 pr-4 font-medium">Dates</th>
                    <th className="py-2 pr-4 font-medium">Reason</th>
                    <th className="py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-4 font-medium text-foreground">
                        {subNameById.get(row.subcontractor_id) ?? '(unknown sub)'}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {format(parseISO(row.start_date), 'MMM d, yyyy')}
                        {' — '}
                        {format(parseISO(row.end_date), 'MMM d, yyyy')}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {row.reason || '—'}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => setEditingRow(row)}
                            aria-label="Edit range"
                          >
                            <Pencil className="size-4" />
                          </Button>
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditRangeDialog
        row={editingRow}
        subName={
          editingRow
            ? subNameById.get(editingRow.subcontractor_id) ?? '(unknown sub)'
            : ''
        }
        onClose={() => setEditingRow(null)}
        onSaved={() => {
          setEditingRow(null)
          void loadRows()
        }}
      />
    </AdminLayout>
  )
}

function EditRangeDialog({
  row,
  subName,
  onClose,
  onSaved,
}: {
  row: SubUnavailability | null
  subName: string
  onClose: () => void
  onSaved: () => void
}) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Re-seed local state every time we open a new row
  useEffect(() => {
    if (!row) return
    setStartDate(row.start_date)
    setEndDate(row.end_date)
    setReason(row.reason ?? '')
  }, [row?.id])

  const handleSave = async () => {
    if (!row) return
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
      await updateSubUnavailability(row.id, {
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || null,
      })
      toast.success('Updated')
      onSaved()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update range')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit unavailability — {subName}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-start">Start date</Label>
            <Input
              id="edit-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-end">End date</Label>
            <Input
              id="edit-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="edit-reason">Reason (optional)</Label>
            <Input
              id="edit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Vacation"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
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
