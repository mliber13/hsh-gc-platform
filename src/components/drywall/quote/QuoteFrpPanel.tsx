import type { DrywallQuote } from '@/types/drywall'
import { NumField, SectionDivider } from './quoteFormPrimitives'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

export function QuoteFrpPanel({ quote, readOnly, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumField
          label="Waste %"
          value={quote.frpWastePercentage}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ frpWastePercentage: v })}
        />
        <NumField
          label="Square footage"
          value={quote.frpSqft}
          readOnly={readOnly}
          step="0.1"
          hint="Sheets = SF ÷ 32"
          onChange={(v) => onChange({ frpSqft: v })}
        />
        <NumField
          label="# Walls"
          value={quote.frpWallCount}
          readOnly={readOnly}
          step="1"
          onChange={(v) => onChange({ frpWallCount: v })}
        />
        <NumField
          label="Wall height (ft)"
          value={quote.frpWallHeight}
          readOnly={readOnly}
          onChange={(v) => onChange({ frpWallHeight: v })}
        />
        <NumField
          label="Inside corners"
          value={quote.frpInsideCorners}
          readOnly={readOnly}
          step="1"
          onChange={(v) => onChange({ frpInsideCorners: v })}
        />
        <NumField
          label="Outside corners"
          value={quote.frpOutsideCorners}
          readOnly={readOnly}
          step="1"
          onChange={(v) => onChange({ frpOutsideCorners: v })}
        />
        <NumField
          label="Exposed edges (J-mold LF)"
          value={quote.frpExposedEdgesLf}
          readOnly={readOnly}
          onChange={(v) => onChange({ frpExposedEdgesLf: v })}
        />
      </div>
      <SectionDivider title="Labor" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumField
          label="Install labor ($/sqft)"
          value={quote.frpLaborRate}
          readOnly={readOnly}
          hint="Applied to square footage above"
          onChange={(v) => onChange({ frpLaborRate: v })}
        />
      </div>
      <SectionDivider title="Cost per unit" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumField label="Sheets" value={quote.frpSheetRate} readOnly={readOnly} onChange={(v) => onChange({ frpSheetRate: v })} />
        <NumField label="Adhesive buckets" value={quote.frpAdhesiveBucketRate} readOnly={readOnly} onChange={(v) => onChange({ frpAdhesiveBucketRate: v })} />
        <NumField label="Division sticks" value={quote.frpDivisionStickRate} readOnly={readOnly} onChange={(v) => onChange({ frpDivisionStickRate: v })} />
        <NumField label="IC sticks" value={quote.frpIcStickRate} readOnly={readOnly} onChange={(v) => onChange({ frpIcStickRate: v })} />
        <NumField label="OC sticks" value={quote.frpOcStickRate} readOnly={readOnly} onChange={(v) => onChange({ frpOcStickRate: v })} />
        <NumField label="J-Mold sticks" value={quote.frpJMoldStickRate} readOnly={readOnly} onChange={(v) => onChange({ frpJMoldStickRate: v })} />
      </div>
    </div>
  )
}
