import type { DrywallProject } from '@/types/drywall'
import type { QuoteV3TotalsSummary } from '@/lib/drywall/quoteV3Math'
import { formatQuoteMoney } from '@/lib/drywall/quoteV3Math'
import { drywallQuoteNumberLabel } from '@/lib/drywall/drywallQuoteNumber'

type Props = {
  project: DrywallProject
  quoteNumber?: string
  totals: QuoteV3TotalsSummary
}

const fmtSqft = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

export function QuoteHeaderV3({ project, quoteNumber, totals }: Props) {
  // Accepted alternates change the job. Reporting only the line-item figures here
  // overstated Madison - Pastor by 385 sqft and understated Brunswick - Brock by
  // 2,173 — the header read as the whole quote while the contract total below it
  // said otherwise. Show the base, then what was accepted, then the net.
  const accepted = totals.alternates.filter((alt) => alt.selected)
  const hasAccepted = accepted.length > 0
  const acceptedSqftDelta = totals.acceptedSqft - totals.totalSqft
  const acceptedMoneyDelta = totals.acceptedTotal - totals.routine.total


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
      {/* Sqft, sqft with waste and price per sqft moved to the floating money bar, which
          stays in view while editing (Mark, 2026-10-14). */}
      {hasAccepted ? (
        <div className="mt-2 border-t border-border/60 pt-2 text-sm tabular-nums">
          <p className="text-muted-foreground text-xs">
            {accepted.length === 1
              ? `1 accepted alternate — ${accepted[0].name || 'Unnamed'}`
              : `${accepted.length} accepted alternates — ${accepted
                  .map((alt) => alt.name || 'Unnamed')
                  .join(', ')}`}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
            <span>
              Alternates:{' '}
              <strong>
                {acceptedSqftDelta >= 0 ? '+' : '−'}
                {fmtSqft(Math.abs(acceptedSqftDelta))} sqft
              </strong>{' '}
              <span className="text-muted-foreground">
                ({acceptedMoneyDelta >= 0 ? '+' : '−'}
                {formatQuoteMoney(Math.abs(acceptedMoneyDelta))})
              </span>
            </span>
            <span>
              Net sqft: <strong>{fmtSqft(totals.acceptedSqft)}</strong>{' '}
              <span className="text-muted-foreground">
                ({fmtSqft(totals.acceptedSqftWithWaste)} with waste)
              </span>
            </span>
            <span>
              Quote total: <strong>{formatQuoteMoney(totals.acceptedTotal)}</strong>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
