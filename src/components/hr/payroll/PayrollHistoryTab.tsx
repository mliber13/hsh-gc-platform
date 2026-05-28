import { FileDown, Lock, Pencil, Trash2, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useState } from 'react'
import type { PayPeriod } from '@/types/payroll'
import { formatCurrency } from './payrollFormat'

interface PayrollHistoryTabProps {
  runs: PayPeriod[]
  onEdit: (run: PayPeriod) => void
  onDelete: (runId: string) => Promise<void>
  onToggleLock: (run: PayPeriod, lock: boolean) => Promise<void>
  onExportPdf: (run: PayPeriod) => void
}

export function PayrollHistoryTab({
  runs,
  onEdit,
  onDelete,
  onToggleLock,
  onExportPdf,
}: PayrollHistoryTabProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [lockTarget, setLockTarget] = useState<{ run: PayPeriod; lock: boolean } | null>(null)

  if (runs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No saved payroll runs yet. Use Run payroll to create the first run.
      </p>
    )
  }

  return (
    <>
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
            {runs.map((run) => {
              const gross =
                run.totalGross ??
                (run.entries || []).reduce(
                  (s, e) => s + (parseFloat(String(e.gross)) || 0),
                  0,
                )
              return (
                <tr key={run.id} className="border-b last:border-0">
                  <td className="p-3">
                    {run.startDate} – {run.endDate}
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
                        onClick={() =>
                          setLockTarget({ run, lock: !run.locked })
                        }
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
            })}
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
