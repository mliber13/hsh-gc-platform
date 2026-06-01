import type { DrywallQuote } from '@/types/drywall'
import { NumField, SectionDivider } from './quoteFormPrimitives'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

export function QuoteSuspendedGridPanel({ quote, readOnly, onChange }: Props) {
  const shiny90Cost =
    (parseFloat(String(quote.shiny90Count)) || 0) * (parseFloat(String(quote.shiny90Rate)) || 0)
  const mainsCost =
    (parseFloat(String(quote.mainsCount)) || 0) * (parseFloat(String(quote.mainsRate)) || 0)
  const teesCost =
    (parseFloat(String(quote.tees4ftCount)) || 0) * (parseFloat(String(quote.tees4ftRate)) || 0)
  const wireCost =
    (parseFloat(String(quote.wireLinearFt)) || 0) * (parseFloat(String(quote.wireRate)) || 0)
  const lagsCost =
    (parseFloat(String(quote.lagsCount)) || 0) * (parseFloat(String(quote.lagsRate)) || 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <NumField
          label="Project grid sqft"
          value={quote.suspendedGridSqft}
          readOnly={readOnly}
          step="0.1"
          hint="When using breakdowns, set sqft per floor in each breakdown."
          onChange={(v) => onChange({ suspendedGridSqft: v })}
        />
        <NumField
          label="Perimeter (LF)"
          value={quote.suspendedGridPerimeter}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ suspendedGridPerimeter: v })}
        />
        <NumField
          label="Waste %"
          value={quote.suspendedGridWastePercentage}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ suspendedGridWastePercentage: v })}
        />
        <NumField
          label="Carpenter ($/sqft)"
          value={quote.carpenterRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ carpenterRate: v })}
        />
      </div>

      <SectionDivider title="Grid components (project-level)" />
      <p className="text-xs text-muted-foreground">
        Counts auto-calculate from sqft/perimeter in math; override manually if needed.
      </p>
      <div className="space-y-2 text-sm">
        {[
          { label: 'Shiny 90', countKey: 'shiny90Count' as const, rateKey: 'shiny90Rate' as const, cost: shiny90Cost },
          { label: 'Mains', countKey: 'mainsCount' as const, rateKey: 'mainsRate' as const, cost: mainsCost },
          { label: '4ft Tees', countKey: 'tees4ftCount' as const, rateKey: 'tees4ftRate' as const, cost: teesCost },
        ].map((row) => (
          <div key={row.label} className="grid grid-cols-[6rem_1fr_1fr_5rem] gap-2 items-end">
            <span className="text-xs font-medium pb-2">{row.label}</span>
            <NumField
              label="Count"
              value={quote[row.countKey]}
              readOnly={readOnly}
              step="1"
              onChange={(v) => onChange({ [row.countKey]: v })}
            />
            <NumField
              label="Rate"
              value={quote[row.rateKey]}
              readOnly={readOnly}
              onChange={(v) => onChange({ [row.rateKey]: v })}
            />
            <span className="text-xs text-right pb-2">${row.cost.toFixed(2)}</span>
          </div>
        ))}
        <div className="grid grid-cols-[6rem_1fr_1fr_5rem] gap-2 items-end">
          <span className="text-xs font-medium pb-2">Wire</span>
          <NumField
            label="LF"
            value={quote.wireLinearFt}
            readOnly={readOnly}
            onChange={(v) => onChange({ wireLinearFt: v })}
          />
          <NumField
            label="$/LF"
            value={quote.wireRate}
            readOnly={readOnly}
            onChange={(v) => onChange({ wireRate: v })}
          />
          <span className="text-xs text-right pb-2">${wireCost.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-[6rem_1fr_1fr_5rem] gap-2 items-end">
          <span className="text-xs font-medium pb-2">Lags</span>
          <NumField
            label="Count"
            value={quote.lagsCount}
            readOnly={readOnly}
            step="1"
            onChange={(v) => onChange({ lagsCount: v })}
          />
          <NumField
            label="Rate"
            value={quote.lagsRate}
            readOnly={readOnly}
            onChange={(v) => onChange({ lagsRate: v })}
          />
          <span className="text-xs text-right pb-2">${lagsCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
