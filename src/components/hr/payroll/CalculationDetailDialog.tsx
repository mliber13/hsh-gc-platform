import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { PayrollCalculationDetail } from '@/lib/payrollMath'
import { formatCurrency } from './payrollFormat'

interface CalculationDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  details: PayrollCalculationDetail[]
  title: string
}

export function CalculationDetailDialog({
  open,
  onOpenChange,
  details,
  title,
}: CalculationDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pr-1 text-sm">
          {details.map((d) => (
            <div key={`${d.name}-${d.personType}`} className="border-b pb-4 last:border-0">
              <p className="font-semibold">
                {d.name} · {d.personType === 'w2' ? 'W2' : '1099'}
              </p>
              {d.payType === 'salary' && d.salaryAmount > 0 && (
                <p className="text-muted-foreground">Salary: {formatCurrency(d.salaryAmount)}</p>
              )}
              {d.hoursBreakdown.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium">Hours by job</p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {d.hoursBreakdown.map((h, i) => (
                      <li key={i}>
                        {h.jobName}: {h.hours}h (reg {h.asRegular.toFixed(2)}, OT{' '}
                        {h.asOT.toFixed(2)}) @ {formatCurrency(h.rate)} = {formatCurrency(h.pay)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.pieceBreakdown.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium">Piece</p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {d.pieceBreakdown.map((p, i) => (
                      <li key={i}>
                        {p.jobName}: {p.phasesCompleted}/{p.totalPhases} × {p.jobTotalSqft} sqft @{' '}
                        {formatCurrency(p.rate)} = {formatCurrency(p.amount)}
                      </li>
                    ))}
                  </ul>
                  {d.pieceDeductionTotal > 0 && (
                    <p>Helper deduction: −{formatCurrency(d.pieceDeductionTotal)}</p>
                  )}
                  <p>Net piece: {formatCurrency(d.pieceNetTotal)}</p>
                </div>
              )}
              <p className="mt-2 font-semibold">Gross: {formatCurrency(d.gross)}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
