/**
 * Phase C.1.1 UI parity vs drywall QuoteStage.jsx (project-level optional components):
 *
 * | Section            | Before C.1.1              | After C.1.1                          |
 * |--------------------|---------------------------|--------------------------------------|
 * | RC Channel         | Toggle + 4 rate fields    | Full ceiling/wall/spacing/entries    |
 * | Suspended Grid     | Partial                   | Sqft, perimeter, waste, carpenter, grid component counts/rates |
 * | Insulation         | Labor/waste only + stub   | Full per-entry editor                |
 * | Acoustic Ceiling   | 3 fields                  | Tile size, sqft, perimeter, grid parts |
 * | Metal Stud         | Labor/waste only          | Rate matrix + project entries        |
 * | FRP                | 3 fields                  | Full quantity + unit cost grid       |
 *
 * Per-breakdown inputs live in BreakdownOptionalSections.tsx (RC, grid, metal stud, hang overrides).
 */
import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DrywallQuote } from '@/types/drywall'
import { QuoteAcousticCeilingPanel } from './QuoteAcousticCeilingPanel'
import { QuoteFrpPanel } from './QuoteFrpPanel'
import { QuoteInsulationPanel } from './QuoteInsulationPanel'
import { QuoteMetalStudPanel } from './QuoteMetalStudPanel'
import { QuoteRcChannelPanel } from './QuoteRcChannelPanel'
import { QuoteSuspendedGridPanel } from './QuoteSuspendedGridPanel'

interface ToggleSectionProps {
  title: string
  enabled: boolean
  readOnly: boolean
  onToggle: (v: boolean) => void
  children?: ReactNode
}

function ToggleSection({ title, enabled, readOnly, onToggle, children }: ToggleSectionProps) {
  return (
    <Card className={enabled ? '' : 'opacity-60'}>
      <CardHeader className="py-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <CardTitle className="text-base">{title}</CardTitle>
        </label>
      </CardHeader>
      {enabled && children ? (
        <CardContent className="pt-0 pb-4">{children}</CardContent>
      ) : null}
    </Card>
  )
}

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

export function QuoteOptionalAddons({ quote, readOnly, onChange }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Optional components (project defaults)</h3>
      <p className="text-sm text-muted-foreground -mt-1">
        Toggle each section on, then set rates and project-wide quantities. Per-floor values are
        inside each breakdown card when breakdowns exist.
      </p>

      <ToggleSection
        title="RC Channel"
        enabled={Boolean(quote.includeRcChannel)}
        readOnly={readOnly}
        onToggle={(v) => onChange({ includeRcChannel: v })}
      >
        <QuoteRcChannelPanel quote={quote} readOnly={readOnly} onChange={onChange} />
      </ToggleSection>

      <ToggleSection
        title="Suspended drywall grid ceiling"
        enabled={Boolean(quote.includeSuspendedGrid)}
        readOnly={readOnly}
        onToggle={(v) => onChange({ includeSuspendedGrid: v })}
      >
        <QuoteSuspendedGridPanel quote={quote} readOnly={readOnly} onChange={onChange} />
      </ToggleSection>

      <ToggleSection
        title="Insulation"
        enabled={Boolean(quote.includeInsulation)}
        readOnly={readOnly}
        onToggle={(v) => onChange({ includeInsulation: v })}
      >
        <QuoteInsulationPanel quote={quote} readOnly={readOnly} onChange={onChange} />
      </ToggleSection>

      <ToggleSection
        title="Acoustic ceiling tile and grid"
        enabled={Boolean(quote.includeAcousticCeiling)}
        readOnly={readOnly}
        onToggle={(v) => onChange({ includeAcousticCeiling: v })}
      >
        <QuoteAcousticCeilingPanel quote={quote} readOnly={readOnly} onChange={onChange} />
      </ToggleSection>

      <ToggleSection
        title="Metal stud framing"
        enabled={Boolean(quote.includeMetalStudFraming)}
        readOnly={readOnly}
        onToggle={(v) => onChange({ includeMetalStudFraming: v })}
      >
        <QuoteMetalStudPanel quote={quote} readOnly={readOnly} onChange={onChange} />
      </ToggleSection>

      <ToggleSection
        title="FRP"
        enabled={Boolean(quote.includeFRP)}
        readOnly={readOnly}
        onToggle={(v) => onChange({ includeFRP: v })}
      >
        <QuoteFrpPanel quote={quote} readOnly={readOnly} onChange={onChange} />
      </ToggleSection>
    </div>
  )
}
