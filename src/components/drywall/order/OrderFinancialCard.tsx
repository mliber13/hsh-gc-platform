import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buildOrderFinancialComparison } from '@/lib/drywall/orderFinancialComparison'
import type { DrywallChangeOrder, DrywallQuote, FieldTakeoff } from '@/types/drywall'

interface OrderFinancialCardProps {
  quote: DrywallQuote | null
  fieldTakeoff: FieldTakeoff | null
  changeOrders: DrywallChangeOrder[]
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export function OrderFinancialCard({ quote, fieldTakeoff, changeOrders }: OrderFinancialCardProps) {
  if (!quote || !fieldTakeoff) return null

  const fin = buildOrderFinancialComparison(
    quote,
    fieldTakeoff,
    changeOrders,
    undefined,
    fieldTakeoff.reviewStatus,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Financial comparison</CardTitle>
        <CardDescription>
          Quote vs field sqft and labor rates (approved change orders included in adjusted total).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground">Quote sqft (w/ waste)</p>
          <p className="font-medium">{fin.originalSqft.toLocaleString()} sqft</p>
        </div>
        <div>
          <p className="text-muted-foreground">Field measured sqft</p>
          <p className="font-medium">{fin.revisedSqft.toLocaleString()} sqft</p>
        </div>
        <div>
          <p className="text-muted-foreground">Baseline total</p>
          <p className="font-medium">{money(fin.baselineTotal)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Adjusted total</p>
          <p className="font-medium">{money(fin.adjustedTotal)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Labor delta (w/ tax)</p>
          <p className="font-medium">{money(fin.deltaLaborWithTax)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Approved CO revenue</p>
          <p className="font-medium">{money(fin.deltaTotal)}</p>
        </div>
      </CardContent>
    </Card>
  )
}
