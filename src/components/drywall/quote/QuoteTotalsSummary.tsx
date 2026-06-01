import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DrywallQuoteCalculations } from '@/types/drywall'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

interface Props {
  calculations: DrywallQuoteCalculations
  totals: Record<string, number | boolean | undefined>
}

export function QuoteTotalsSummary({ calculations, totals }: Props) {
  const direct = Number(totals.totalDirectCost ?? calculations.totalDirectCost) || 0
  const overhead = Number(totals.overheadAmount ?? calculations.overheadAmount) || 0
  const profit = Number(totals.profitAmount ?? calculations.profitAmount) || 0
  const tax = Number(totals.totalSalesTax ?? calculations.salesTax) || 0
  const total =
    Number(totals.totalQuote ?? calculations.finalTotal ?? calculations.subtotalAfterProfit) || 0

  return (
    <Card className="border-primary/30 sticky top-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Quote totals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Gross (direct)</span>
          <span className="font-medium">{fmt(direct)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Overhead</span>
          <span>{fmt(overhead)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Profit</span>
          <span>{fmt(profit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sales tax</span>
          <span>{fmt(tax)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-semibold text-primary">
          <span>Total</span>
          <span>{fmt(total)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
