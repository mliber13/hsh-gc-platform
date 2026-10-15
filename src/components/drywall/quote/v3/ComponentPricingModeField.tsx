// How a grid / acoustic / metal-stud line prices its material — a choice on the line, not a side
// effect of typing a rate (P1-MONEY-5, Mark 2026-10-15). See componentPricingMode.

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { componentPricingMode } from '@/lib/drywall/quoteV3CatalogResolve'
import { computeLineItem, formatQuoteMoney } from '@/lib/drywall/quoteV3Math'
import type { QuoteLineItem } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

const ITEMIZED_PARTS: Record<string, string> = {
  suspended_grid: 'mains, tees, wire, lags and wall angle',
  acoustic: 'tile, mains, tees, wire and wall angle',
  metal_stud: 'studs and track by size and gauge',
}

const UNIT: Record<string, string> = {
  suspended_grid: 'sqft',
  acoustic: 'sqft',
  metal_stud: 'wall LF',
}

/**
 * What the line's material would cost per unit if itemised — so switching to one rate starts at
 * the same price instead of jumping.
 */
export function itemizedMaterialPerUnit(line: QuoteLineItem, catalogs: OrgDrywallCatalogs): number {
  const qty = Number(line.quantity) || 0
  if (qty <= 0) return 0
  const itemized = computeLineItem({ ...line, pricing_mode: 'itemized', custom_material_rate: undefined }, catalogs)
  return Math.round((itemized.materialTotal / qty) * 10000) / 10000
}

export function ComponentPricingModeField({
  line,
  catalogs,
  readOnly,
  onPatch,
}: {
  line: QuoteLineItem
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  onPatch: (patch: Partial<QuoteLineItem>) => void
}) {
  const mode = componentPricingMode(line)
  const unit = UNIT[line.type] ?? 'unit'

  const choose = (next: 'itemized' | 'flat_rate') => {
    if (readOnly || next === mode) return
    if (next === 'itemized') {
      onPatch({ pricing_mode: 'itemized', custom_material_rate: undefined })
    } else {
      onPatch({ pricing_mode: 'flat_rate', custom_material_rate: itemizedMaterialPerUnit(line, catalogs) })
    }
  }

  const option = (value: 'itemized' | 'flat_rate', label: string) => (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => choose(value)}
      className={cn(
        'rounded px-3 py-1 text-sm transition-colors',
        mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
      )}
      aria-pressed={mode === value}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-1.5">
      <Label>Material pricing</Label>
      <div className="inline-flex rounded-md border p-0.5">
        {option('itemized', 'Itemized from catalog')}
        {option('flat_rate', "One rate I'll enter")}
      </div>
      {mode === 'itemized' ? (
        <p className="text-xs text-muted-foreground">
          Priced from the catalog: {ITEMIZED_PARTS[line.type] ?? 'its components'}.
        </p>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Input
              id="custom-mat"
              type="number"
              min={0}
              step={0.01}
              disabled={readOnly}
              className="w-32 tabular-nums"
              value={line.custom_material_rate ?? ''}
              onChange={(e) => {
                const v = e.target.value
                onPatch({ custom_material_rate: v === '' ? 0 : parseFloat(v) || 0 })
              }}
            />
            <span className="text-sm text-muted-foreground">per {unit}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            One rate × quantity — no parts breakdown. Itemized would be{' '}
            {formatQuoteMoney(itemizedMaterialPerUnit(line, catalogs))} per {unit}.
          </p>
        </div>
      )}
    </div>
  )
}
