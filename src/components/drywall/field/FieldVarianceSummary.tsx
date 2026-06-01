import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FIELD_VARIANCE_WARNING_PCT } from '@/lib/drywall/fieldMeasurementUtils'

interface FieldVarianceSummaryProps {
  quoteSqft: number
  measuredSqft: number
}

export function FieldVarianceSummary({ quoteSqft, measuredSqft }: FieldVarianceSummaryProps) {
  const variance = measuredSqft - quoteSqft
  const variancePercent = quoteSqft > 0 ? (variance / quoteSqft) * 100 : 0
  const showWarning =
    quoteSqft > 0 && Math.abs(variancePercent) >= FIELD_VARIANCE_WARNING_PCT

  const varianceClass =
    variance === 0 ? 'text-foreground' : variance > 0 ? 'text-green-600' : 'text-red-600'

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Quoted vs measured</CardTitle>
        <CardDescription>Field-verified square footage compared to the quote (after waste).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showWarning && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm">
              Variance is {Math.abs(variancePercent).toFixed(1)}% — review before continuing to order.
            </p>
          </div>
        )}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Quoted</span>
            <span className="font-semibold">{quoteSqft ? `${quoteSqft.toLocaleString()} sqft` : '—'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Field measured</span>
            <span className="font-semibold">
              {measuredSqft ? `${measuredSqft.toLocaleString()} sqft` : '—'}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">Variance</span>
            <span className={`font-semibold ${varianceClass}`}>
              {variance > 0 ? '+' : ''}
              {variance.toLocaleString(undefined, { maximumFractionDigits: 0 })} sqft (
              {variancePercent > 0 ? '+' : ''}
              {variancePercent.toFixed(1)}%)
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
