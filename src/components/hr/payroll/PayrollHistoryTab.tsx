import { useMemo, useState } from 'react'
import { Calculator, Copy, FileDown, Lock, Pencil, Trash2, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PayPeriod } from '@/types/payroll'
import { formatCurrency, formatPayPeriodRange } from './payrollFormat'

type HistorySort = 'newest' | 'oldest' | 'gross-desc' | 'gross-asc'
type HistoryStatusFilter = 'all' | 'editable' | 'locked'

const DEFAULT_SORT: HistorySort = 'newest'
const DEFAULT_YEAR = 'all'
const DEFAULT_STATUS: HistoryStatusFilter = 'all'

interface PayrollHistoryTabProps {
  runs: PayPeriod[]
  onEdit: (run: PayPeriod) => void
  onDelete: (runId: string) => Promise<void>
  onToggleLock: (run: PayPeriod, lock: boolean) => Promise<void>
  onExportPdf: (run: PayPeriod) => void
  onViewCalculations: (run: PayPeriod) => void
  onDuplicate: (run: PayPeriod) => void
}

function runGross(run: PayPeriod): number {
  return (
    run.totalGross ??
    (run.entries || []).reduce((s, e) => s + (parseFloat(String(e.gross)) || 0), 0)
  )
}

function yearFromEndDate(endDate: string): number | null {
  const y = parseInt(endDate.slice(0, 4), 10)
  return Number.isFinite(y) ? y : null
}

function compareRuns(a: PayPeriod, b: PayPeriod, sort: HistorySort): number {
  switch (sort) {
    case 'oldest': {
      const end = a.endDate.localeCompare(b.endDate)
      if (end !== 0) return end
      return a.startDate.localeCompare(b.startDate)
    }
    case 'gross-desc':
      return runGross(b) - runGross(a)
    case 'gross-asc':
      return runGross(a) - runGross(b)
    case 'newest':
    default: {
      const end = b.endDate.localeCompare(a.endDate)
      if (end !== 0) return end
      return b.startDate.localeCompare(a.startDate)
    }
  }
}

export function PayrollHistoryTab({
  runs,
  onEdit,
  onDelete,
  onToggleLock,
  onExportPdf,
  onViewCalculations,
  onDuplicate,
}: PayrollHistoryTabProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [lockTarget, setLockTarget] = useState<{ run: PayPeriod; lock: boolean } | null>(null)
  const [sort, setSort] = useState<HistorySort>(DEFAULT_SORT)
  const [yearFilter, setYearFilter] = useState(DEFAULT_YEAR)
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>(DEFAULT_STATUS)

  const years = useMemo(() => {
    const set = new Set<number>()
    for (const run of runs) {
      const y = yearFromEndDate(run.endDate)
      if (y != null) set.add(y)
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [runs])

  const filteredSortedRuns = useMemo(() => {
    let list = [...runs]
    if (yearFilter !== DEFAULT_YEAR) {
      const year = parseInt(yearFilter, 10)
      list = list.filter((run) => yearFromEndDate(run.endDate) === year)
    }
    if (statusFilter === 'locked') {
      list = list.filter((run) => run.locked)
    } else if (statusFilter === 'editable') {
      list = list.filter((run) => !run.locked)
    }
    list.sort((a, b) => compareRuns(a, b, sort))
    return list
  }, [runs, sort, yearFilter, statusFilter])

  const filtersActive =
    sort !== DEFAULT_SORT || yearFilter !== DEFAULT_YEAR || statusFilter !== DEFAULT_STATUS

  const resetFilters = () => {
    setSort(DEFAULT_SORT)
    setYearFilter(DEFAULT_YEAR)
    setStatusFilter(DEFAULT_STATUS)
  }

  if (runs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No saved payroll runs yet. Use Run payroll to create the first run.
      </p>
    )
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="min-w-[10rem]">
          <Label className="text-xs text-muted-foreground">Sort</Label>
          <Select value={sort} onValueChange={(v) => setSort(v as HistorySort)}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="gross-desc">Highest gross</SelectItem>
              <SelectItem value="gross-asc">Lowest gross</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[8rem]">
          <Label className="text-xs text-muted-foreground">Year</Label>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[8rem]">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as HistoryStatusFilter)}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="editable">Editable</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {filtersActive && (
          <button
            type="button"
            className="mb-0.5 text-sm text-primary underline-offset-4 hover:underline"
            onClick={resetFilters}
          >
            Reset
          </button>
        )}
        <p className="mb-0.5 ml-auto text-xs text-muted-foreground">
          {filteredSortedRuns.length} of {runs.length} run
          {runs.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <colgroup>
            <col className="w-[45%]" />
            <col className="w-[20%]" />
            <col className="w-[15%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Period</th>
              <th className="p-3 font-medium text-right">Gross</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSortedRuns.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  No payroll runs match the current filters.
                </td>
              </tr>
            ) : (
              filteredSortedRuns.map((run) => {
                const gross = runGross(run)
                return (
                  <tr key={run.id} className="border-b last:border-0">
                    <td className="p-3">
                      {formatPayPeriodRange(run.startDate, run.endDate)}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(gross)}</td>
                    <td className="p-3">
                      {run.locked ? (
                        <span className="text-amber-700">Locked</span>
                      ) : (
                        <span className="text-muted-foreground">Editable</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="View calculations"
                          onClick={() => onViewCalculations(run)}
                        >
                          <Calculator className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Duplicate as new draft"
                          onClick={() => onDuplicate(run)}
                        >
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="PDF"
                          onClick={() => onExportPdf(run)}
                        >
                          <FileDown className="size-4" />
                        </Button>
                        {!run.locked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Edit"
                            onClick={() => onEdit(run)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={run.locked ? 'Unlock' : 'Lock'}
                          onClick={() => setLockTarget({ run, lock: !run.locked })}
                        >
                          {run.locked ? (
                            <Unlock className="size-4" />
                          ) : (
                            <Lock className="size-4" />
                          )}
                        </Button>
                        {!run.locked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Delete"
                            onClick={() => setDeleteId(run.id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this payroll run?</DialogTitle>
            <DialogDescription>
              This removes only this run. Other pay periods are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteId) void onDelete(deleteId)
                setDeleteId(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lockTarget} onOpenChange={(o) => !o && setLockTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {lockTarget?.lock ? 'Lock payroll?' : 'Unlock payroll?'}
            </DialogTitle>
            <DialogDescription>
              {lockTarget?.lock
                ? 'Locked runs cannot be edited until unlocked.'
                : 'You can edit this run again after unlocking.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (lockTarget) void onToggleLock(lockTarget.run, lockTarget.lock)
                setLockTarget(null)
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
