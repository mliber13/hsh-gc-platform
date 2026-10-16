// Ceiling heights on a quote (Mark, 2026-10-15). Each drywall line carries its own height — a
// Togal import fills them from the wall labels — and this strip holds the height for most of
// the job (any line without one) and sums up how much board is tall. Tall lines are priced by
// tallWallPricing.ts (CEILING_HEIGHTS.md).

import { Ruler } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  HEIGHT_BAND_LABEL,
  type HeightBand,
  parseHeightFt,
  quoteTallSqftByBand,
} from '@/lib/drywall/ceilingHeights'
import type { DrywallQuoteV3 } from '@/types/drywall'

const BANDS: HeightBand[] = ['10-11', '12-14', '15+']
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

export function QuoteHeightsSection({
  quote,
  readOnly,
  onChange,
}: {
  quote: DrywallQuoteV3
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuoteV3>) => void
}) {
  const byBand = quoteTallSqftByBand(quote)
  const tall = BANDS.filter((b) => (byBand[b] ?? 0) > 0)

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-l-4 border-l-sky-500 bg-card px-4 py-3 shadow-sm">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Ruler className="h-4 w-4 text-sky-600" />
        Ceiling heights
      </span>
      <div className="flex items-center gap-2">
        <Label htmlFor="quote-default-height" className="text-xs text-muted-foreground">
          Most of the job
        </Label>
        <div className="relative w-24">
          <Input
            id="quote-default-height"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            className="h-8 pr-7"
            placeholder="9"
            disabled={readOnly}
            value={quote.default_height_ft ?? ''}
            onChange={(e) => onChange({ default_height_ft: parseHeightFt(e.target.value) })}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            ft
          </span>
        </div>
      </div>
      <span className="text-sm">
        {tall.length > 0 ? (
          <>
            Tall board:{' '}
            {tall.map((b, i) => (
              <span key={b}>
                {i > 0 ? ' · ' : ''}
                <span className="font-semibold tabular-nums">{fmt(byBand[b]!)} sqft</span>{' '}
                <span className="text-amber-700 dark:text-amber-300">at {HEIGHT_BAND_LABEL[b]}</span>
              </span>
            ))}
          </>
        ) : (
          <span className="text-muted-foreground">No board 10&apos; and up</span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        Each line has its own height (a takeoff import fills it in). Lines 10&apos; and up add mud, tape and tall-wall labor — see Pricing.
      </span>
    </div>
  )
}
