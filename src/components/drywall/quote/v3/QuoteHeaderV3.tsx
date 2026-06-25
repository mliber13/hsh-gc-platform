import type { DrywallProject } from '@/types/drywall'
import type { QuoteV3TotalsSummary } from '@/lib/drywall/quoteV3Math'
import { formatQuoteMoney } from '@/lib/drywall/quoteV3Math'
import { drywallQuoteNumberLabel } from '@/lib/drywall/drywallQuoteNumber'

type Props = {
  project: DrywallProject
  quoteNumber?: string
  totals: QuoteV3TotalsSummary
}

export function QuoteHeaderV3({ project, quoteNumber, totals }: Props) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{project.name}</p>
          <p className="text-muted-foreground text-xs">
            {project.client && `${project.client} · `}
            {project.address || 'No address'}
          </p>
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          Quote # {drywallQuoteNumberLabel(quoteNumber) || 'Assigned on save'}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
        <span>
          Total sqft:{' '}
          <strong>{totals.totalSqft.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
        </span>
        <span>
          With waste:{' '}
          <strong>
            {totals.totalSqftWithWaste.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </strong>
        </span>
        <span>
          Base price: <strong>{formatQuoteMoney(totals.routine.total)}</strong>
        </span>
      </div>
    </div>
  )
}
