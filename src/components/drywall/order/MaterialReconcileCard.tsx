import { useMemo } from 'react'
import { PackageCheck, PackageOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { reconcileOrderedAgainstTakeoff } from '@/lib/drywall/orderSuggest'
import type { DrywallOrder, FieldTakeoff } from '@/types/drywall'

interface Props {
  fieldTakeoff: FieldTakeoff | null
  orders: DrywallOrder[]
}

function qty(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/**
 * Measured against ordered, for a job delivered in stages.
 *
 * Nothing else in the app compares the two: the takeoff says what the job needs, orders say
 * what was bought, and until now a shortfall was only ever found on site. Counts only
 * committed orders (sent / confirmed / partial / complete) — a draft is not material.
 */
export function MaterialReconcileCard({ fieldTakeoff, orders }: Props) {
  const reconciliation = useMemo(
    () => (fieldTakeoff ? reconcileOrderedAgainstTakeoff(fieldTakeoff, orders) : null),
    [fieldTakeoff, orders],
  )

  if (!reconciliation || reconciliation.rows.length === 0) return null

  const { rows, outstandingCount, unmatched } = reconciliation
  const outstanding = rows.filter((r) => r.outstanding > 0)
  const covered = rows.length - outstandingCount

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {outstandingCount > 0 ? (
            <PackageOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <PackageCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          )}
          Measured vs ordered
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {outstandingCount > 0
            ? `${outstandingCount} line${outstandingCount === 1 ? '' : 's'} still to order · ${covered} covered`
            : `All ${rows.length} measured line${rows.length === 1 ? '' : 's'} are on an order.`}
        </p>
      </CardHeader>

      {(outstanding.length > 0 || unmatched.length > 0) && (
        <CardContent className="space-y-4 text-sm">
          {outstanding.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Material</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Measured</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Ordered</th>
                    <th className="py-1.5 text-right font-medium">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {outstanding.map((row) => (
                    <tr key={`${row.description}|${row.unit}`} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">
                        <span className="block">{row.description}</span>
                        {row.area ? (
                          <span className="text-xs text-muted-foreground">{row.area}</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{qty(row.needed)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                        {qty(row.ordered)}
                      </td>
                      <td
                        className={cn(
                          'py-1.5 text-right font-medium tabular-nums',
                          'text-amber-700 dark:text-amber-400',
                        )}
                      >
                        {qty(row.outstanding)} {row.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {unmatched.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {unmatched.length} ordered line{unmatched.length === 1 ? '' : 's'} not in the field
              measurement — added by hand, or the description was edited after ordering.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
