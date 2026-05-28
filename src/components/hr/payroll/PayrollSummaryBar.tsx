import { formatCurrency } from './payrollFormat'

interface PayrollSummaryBarProps {
  totalGross: number
  w2Total: number
  c1099Total: number
  entryCount: number
}

export function PayrollSummaryBar({
  totalGross,
  w2Total,
  c1099Total,
  entryCount,
}: PayrollSummaryBarProps) {
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-md bg-muted/40 p-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">People with pay</span>
        <p className="font-semibold tabular-nums">{entryCount}</p>
      </div>
      <div className="rounded-md bg-muted/40 p-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">W2 gross</span>
        <p className="font-semibold tabular-nums">{formatCurrency(w2Total)}</p>
      </div>
      <div className="rounded-md bg-muted/40 p-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">1099 gross</span>
        <p className="font-semibold tabular-nums">{formatCurrency(c1099Total)}</p>
      </div>
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Total gross</span>
        <p className="text-lg font-bold tabular-nums">{formatCurrency(totalGross)}</p>
      </div>
    </div>
  )
}
