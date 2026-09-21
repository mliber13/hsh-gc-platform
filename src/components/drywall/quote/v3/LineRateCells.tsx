import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { Input } from '@/components/ui/input'

import { cn } from '@/lib/utils'

import {

  getCatalogDefaultComponentLaborRate,

  getCatalogDefaultFinisherRate,

  getCatalogDefaultHangerRate,

  getCatalogDefaultMaterialRate,

  getEffectiveComponentLaborRate,

  getEffectiveFinisherRate,

  getEffectiveHangerRate,

  getLineMaterialRate,

  componentLaborRateUnitSuffix,

  isComponentLaborRateEnabled,

  isFinisherRateEnabled,

  isHangerRateEnabled,

  isMaterialRateEnabled,

  materialRateUnitSuffix,

  ratesEqual,

} from '@/lib/drywall/quoteV3CatalogResolve'

import type { QuoteLineItem } from '@/types/drywall'

import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'



function formatRateInput(n: number): string {

  if (!Number.isFinite(n)) return ''

  return String(Number(n.toFixed(4)))

}



function parseRateInput(raw: string): number | null {

  const trimmed = raw.trim()

  if (trimmed === '') return null

  const n = parseFloat(trimmed)

  return Number.isFinite(n) && n >= 0 ? n : null

}



type MaterialRateCellProps = {

  line: QuoteLineItem

  catalogs: OrgDrywallCatalogs

  readOnly: boolean

  compact?: boolean

  onPatch: (patch: Partial<QuoteLineItem>) => void

}



export function MaterialRateCell({

  line,

  catalogs,

  readOnly,

  compact,

  onPatch,

}: MaterialRateCellProps) {

  const enabled = isMaterialRateEnabled(line)

  const catalogDefault = getCatalogDefaultMaterialRate(line, catalogs)

  const effective = getLineMaterialRate(line, catalogs)

  const isOverridden =

    line.custom_material_rate != null && !ratesEqual(line.custom_material_rate, catalogDefault)

  const catalogUnset = enabled && !isOverridden && catalogDefault === 0



  if (readOnly) {

    if (!enabled) return <span className="text-muted-foreground">—</span>

    return (

      <span

        className={cn(

          'tabular-nums',

          isOverridden && 'font-medium text-amber-700 dark:text-amber-400',

          catalogUnset && 'text-amber-600 dark:text-amber-400',

        )}

        title={isOverridden ? 'Overridden from catalog' : undefined}

      >

        ${effective.toFixed(2)}

        {isOverridden ? '*' : ''}

      </span>

    )

  }



  if (!enabled) {

    return (

      <Input

        disabled

        placeholder="—"

        className={cn('h-7 w-[80px] text-right text-xs tabular-nums', compact && 'text-[11px]')}

      />

    )

  }



  const handleChange = (raw: string) => {

    const parsed = parseRateInput(raw)

    if (parsed === null) {

      onPatch({ custom_material_rate: undefined })

      return

    }

    if (ratesEqual(parsed, catalogDefault)) {

      onPatch({ custom_material_rate: undefined })

    } else {

      onPatch({ custom_material_rate: parsed })

    }

  }



  return (

    <RateInput

      value={formatRateInput(effective)}

      compact={compact}

      isOverridden={isOverridden}

      catalogUnset={catalogUnset}

      unitSuffix={materialRateUnitSuffix(line, catalogs)}

      onChange={handleChange}

      onReset={

        isOverridden

          ? () => onPatch({ custom_material_rate: undefined })

          : undefined

      }

    />

  )

}



type HangerRateCellProps = {

  line: QuoteLineItem

  catalogs: OrgDrywallCatalogs

  /** Quote-wide rate from the totals sidebar; the line inherits it when it has no override. */
  projectRate?: number

  readOnly: boolean

  compact?: boolean

  onPatch: (patch: Partial<QuoteLineItem>) => void

}



export function HangerRateCell({

  line,

  catalogs,

  projectRate,

  readOnly,

  compact,

  onPatch,

}: HangerRateCellProps) {

  const enabled = isHangerRateEnabled(line)

  // What this line prices at with no override of its own. The sidebar rate outranks
  // the catalog, so comparing against the catalog alone marked every line on a
  // quote with sidebar rates as overridden.
  const inherited = projectRate ?? getCatalogDefaultHangerRate(line, catalogs)

  const effective = getEffectiveHangerRate(line, catalogs, projectRate)

  const isOverridden =

    line.custom_hanger_rate != null && !ratesEqual(line.custom_hanger_rate, inherited)

  const catalogUnset = enabled && !isOverridden && inherited === 0



  if (readOnly) {

    if (!enabled) return <span className="text-muted-foreground">—</span>

    return (

      <span

        className={cn(

          'tabular-nums',

          isOverridden && 'font-medium text-amber-700 dark:text-amber-400',

          catalogUnset && 'text-amber-600 dark:text-amber-400',

        )}

      >

        ${effective.toFixed(2)}

        {isOverridden ? '*' : ''}

      </span>

    )

  }



  if (!enabled) {

    return (

      <Input

        disabled

        placeholder="—"

        className={cn('h-7 w-[80px] text-right text-xs tabular-nums', compact && 'text-[11px]')}

      />

    )

  }



  const handleChange = (raw: string) => {

    const parsed = parseRateInput(raw)

    if (parsed === null) {

      onPatch({ custom_hanger_rate: undefined })

      return

    }

    if (ratesEqual(parsed, inherited)) {

      onPatch({ custom_hanger_rate: undefined })

    } else {

      onPatch({ custom_hanger_rate: parsed })

    }

  }



  return (

    <RateInput

      value={formatRateInput(effective)}

      compact={compact}

      isOverridden={isOverridden}

      catalogUnset={catalogUnset}

      unitSuffix="/sqft"

      inheritedSource={projectRate != null ? 'project rate' : 'board catalog'}

      onChange={handleChange}

      onReset={isOverridden ? () => onPatch({ custom_hanger_rate: undefined }) : undefined}

    />

  )

}



type FinisherRateCellProps = {

  line: QuoteLineItem

  catalogs: OrgDrywallCatalogs

  /** Quote-wide rate from the totals sidebar; the line inherits it when it has no override. */
  projectRate?: number

  readOnly: boolean

  compact?: boolean

  onPatch: (patch: Partial<QuoteLineItem>) => void

}



export function FinisherRateCell({

  line,

  catalogs,

  projectRate,

  readOnly,

  compact,

  onPatch,

}: FinisherRateCellProps) {

  const enabled = isFinisherRateEnabled(line)

  // See HangerRateCell: the sidebar rate, not the finish scope, is what an
  // un-overridden line actually prices at.
  const inherited = projectRate ?? getCatalogDefaultFinisherRate(line, catalogs)

  const effective = getEffectiveFinisherRate(line, catalogs, projectRate)

  const isOverridden =

    line.custom_finisher_rate != null && !ratesEqual(line.custom_finisher_rate, inherited)

  const catalogUnset = enabled && !isOverridden && inherited === 0



  if (readOnly) {

    if (!enabled) return <span className="text-muted-foreground">—</span>

    return (

      <span

        className={cn(

          'tabular-nums',

          isOverridden && 'font-medium text-amber-700 dark:text-amber-400',

          catalogUnset && 'text-amber-600 dark:text-amber-400',

        )}

      >

        ${effective.toFixed(2)}

        {isOverridden ? '*' : ''}

      </span>

    )

  }



  if (!enabled) {

    return (

      <Input

        disabled

        placeholder="—"

        className={cn('h-7 w-[80px] text-right text-xs tabular-nums', compact && 'text-[11px]')}

      />

    )

  }



  const handleChange = (raw: string) => {

    const parsed = parseRateInput(raw)

    if (parsed === null) {

      onPatch({ custom_finisher_rate: undefined })

      return

    }

    if (ratesEqual(parsed, inherited)) {

      onPatch({ custom_finisher_rate: undefined })

    } else {

      onPatch({ custom_finisher_rate: parsed })

    }

  }



  return (

    <RateInput

      value={formatRateInput(effective)}

      compact={compact}

      isOverridden={isOverridden}

      catalogUnset={catalogUnset}

      unitSuffix="/sqft"

      inheritedSource={projectRate != null ? 'project rate' : 'finish scope'}

      onChange={handleChange}

      onReset={isOverridden ? () => onPatch({ custom_finisher_rate: undefined }) : undefined}

    />

  )

}



type ComponentLaborRateCellProps = {
  line: QuoteLineItem
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  compact?: boolean
  onPatch: (patch: Partial<QuoteLineItem>) => void
}

export function ComponentLaborRateCell({
  line,
  catalogs,
  readOnly,
  compact,
  onPatch,
}: ComponentLaborRateCellProps) {
  const enabled = isComponentLaborRateEnabled(line)
  const catalogDefault = getCatalogDefaultComponentLaborRate(line, catalogs)
  const effective = getEffectiveComponentLaborRate(line, catalogs)
  const isOverridden =
    line.custom_labor_rate != null && !ratesEqual(line.custom_labor_rate, catalogDefault)
  const catalogUnset = enabled && !isOverridden && catalogDefault === 0

  if (readOnly) {
    if (!enabled) return <span className="text-muted-foreground">—</span>
    return (
      <span
        className={cn(
          'tabular-nums',
          isOverridden && 'font-medium text-amber-700 dark:text-amber-400',
          catalogUnset && 'text-amber-600 dark:text-amber-400',
        )}
      >
        ${effective.toFixed(2)}
        {isOverridden ? '*' : ''}
      </span>
    )
  }

  if (!enabled) {
    return (
      <Input
        disabled
        placeholder="—"
        className={cn('h-7 w-[80px] text-right text-xs tabular-nums', compact && 'text-[11px]')}
      />
    )
  }

  const handleChange = (raw: string) => {
    const parsed = parseRateInput(raw)
    if (parsed === null) {
      onPatch({ custom_labor_rate: undefined })
      return
    }
    if (ratesEqual(parsed, catalogDefault)) {
      onPatch({ custom_labor_rate: undefined })
    } else {
      onPatch({ custom_labor_rate: parsed })
    }
  }

  return (
    <RateInput
      value={formatRateInput(effective)}
      compact={compact}
      isOverridden={isOverridden}
      catalogUnset={catalogUnset}
      unitSuffix={componentLaborRateUnitSuffix(line, catalogs)}
      onChange={handleChange}
      onReset={isOverridden ? () => onPatch({ custom_labor_rate: undefined }) : undefined}
    />
  )
}

function RateInput({

  value,

  compact,

  isOverridden,

  catalogUnset,

  unitSuffix,

  /** Where a non-overridden rate comes from, for the tooltips (e.g. "project rate"). */
  inheritedSource,

  onChange,

  onReset,

}: {

  value: string

  compact?: boolean

  isOverridden: boolean

  catalogUnset: boolean

  unitSuffix: string

  inheritedSource?: string

  onChange: (raw: string) => void

  onReset?: () => void

}) {

  const source = inheritedSource ?? 'catalog default'

  const showReset = isOverridden && Boolean(onReset)

  // The reset button sits inside the input's trailing padding rather than beside it.
  // As a flex sibling it added 30px to an 82px column and overlapped the next cell,
  // and it also made the field jump narrower the moment a rate was overridden.
  return (

    <div className="relative w-[80px]">

      <span className="text-muted-foreground pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px]">

        $

      </span>

      <Input

        type="number"

        min={0}

        step={0.01}

        value={value}

        title={

          catalogUnset

            ? `No rate set — add one in Settings → Catalogs, or set a project rate${unitSuffix}`

            : isOverridden

              ? `Overridden on this line${unitSuffix}`

              : `From ${source}${unitSuffix}`

        }

        className={cn(

          'h-7 w-full pl-4 text-right text-xs tabular-nums',

          showReset ? 'pr-5' : 'pr-1',

          compact && 'text-[11px]',

          isOverridden &&

            'border-amber-400/80 bg-amber-50/80 dark:border-amber-600/60 dark:bg-amber-950/40',

          catalogUnset &&

            !isOverridden &&

            'border-amber-300/70 text-amber-700 dark:border-amber-700/50 dark:text-amber-400',

        )}

        onChange={(e) => onChange(e.target.value)}

      />

      {showReset && (

        <Button

          type="button"

          variant="ghost"

          size="icon"

          className="absolute right-0.5 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-700 hover:bg-transparent hover:text-amber-900 dark:text-amber-400"

          title={`Reset to ${source}`}

          onClick={onReset}

        >

          <RotateCcw className="h-3 w-3" />

        </Button>

      )}

    </div>

  )

}


