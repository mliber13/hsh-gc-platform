import { Calculator } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildOrderFinancialComparison,
  type OrderReviewLaborRatesInput,
} from '@/lib/drywall/orderFinancialComparison'
import { projectV3QuoteToV2Shape } from '@/lib/drywall/projectV3QuoteToV2Shape'
import { computeMeasuredSqft } from '@/lib/drywall/fieldMeasurementUtils'
import type { DrywallChangeOrder, DrywallQuote, DrywallQuoteV2V3, FieldTakeoff } from '@/types/drywall'
import { isDrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import { useMemo } from 'react'

const EMPTY_RATES: OrderReviewLaborRatesInput = {
  hangerRate: '',
  finisherRate: '',
  prepCleanRate: '',
}

interface Props {
  quote: DrywallQuoteV2V3 | DrywallQuote | null
  fieldTakeoff: FieldTakeoff | null
  changeOrders?: DrywallChangeOrder[]
  catalogs?: OrgDrywallCatalogs | null
}

export function OrderFinancialCard({
  quote,
  fieldTakeoff,
  changeOrders = [],
  catalogs = null,
}: Props) {
  const v3Quote = quote && isDrywallQuoteV3(quote) ? quote : null
  const v2Quote = useMemo<DrywallQuote | null>(() => {
    if (!quote) return null
    if (isDrywallQuoteV3(quote)) {
      return catalogs ? projectV3QuoteToV2Shape(quote, catalogs) : null
    }
    return quote
  }, [quote, catalogs])

  if (!quote || !fieldTakeoff) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Load quote and field measurement data to compare quoted vs field sqft.
        </CardContent>
      </Card>
    )
  }

  if (!v2Quote) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading quote comparison…
        </CardContent>
      </Card>
    )
  }

  // Areas first, stored scalar as fallback — same staleness the rate card had.
  const measuredFromAreas = computeMeasuredSqft(fieldTakeoff.measurements ?? [])
  const fieldSqft = measuredFromAreas > 0 ? measuredFromAreas : fieldTakeoff.totalMeasuredSqft || 0
  if (fieldSqft <= 0) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-6 text-sm text-amber-800 dark:text-amber-200">
          Add field measurements before comparing to the quote. Quote totals are available on
          the Quote stage.
        </CardContent>
      </Card>
    )
  }

  const fin = buildOrderFinancialComparison(v2Quote, fieldTakeoff, changeOrders, EMPTY_RATES, {
    v3Quote,
    catalogs,
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calculator className="h-5 w-5 text-primary" />
          Quote vs field measurement
        </CardTitle>
        <CardDescription>Quoted sqft includes waste from the quote stage.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs uppercase text-muted-foreground mb-1">Quoted sqft</p>
            <p className="text-2xl font-bold">
              {fin.originalSqft.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs uppercase text-muted-foreground mb-1">Field measured</p>
            <p className="text-2xl font-bold">{fin.revisedSqft.toLocaleString()}</p>
          </div>
          <div
            className={`rounded-lg border p-4 ${
              fin.varianceSqft === 0
                ? 'bg-muted/30'
                : fin.varianceSqft > 0
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-red-500/30 bg-red-500/10'
            }`}
          >
            <p className="text-xs uppercase text-muted-foreground mb-1">Variance</p>
            <p className="text-2xl font-bold">
              {fin.varianceSqft > 0 ? '+' : ''}
              {fin.varianceSqft.toLocaleString(undefined, { maximumFractionDigits: 1 })} sqft
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {fin.variancePercent > 0 ? '+' : ''}
              {fin.variancePercent.toFixed(1)}%
            </p>
          </div>
        </div>
        {fieldTakeoff.varianceNotes ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-100">Variance notes</p>
            <p className="text-amber-800 dark:text-amber-200 mt-1">{fieldTakeoff.varianceNotes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
