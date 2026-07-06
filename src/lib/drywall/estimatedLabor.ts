import { applyLaborBurden } from '@/lib/drywall/calculations/quantityUtils'
import {
  computeCleanupTotal,
  emptyComponentLaborByTrade,
  lineDirectCostsFromLines,
  type QuoteV3ComponentLaborByTrade,
  type QuoteV3LaborBurdenOptions,
} from '@/lib/drywall/quoteV3Math'
import type { DrywallQuote, DrywallQuoteV2V3 } from '@/types/drywall'
import { isDrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

export interface EstimatedLaborComponent {
  key: string
  label: string
  amount: number
}

export interface EstimatedLaborBreakdown {
  hanger: number
  finisher: number
  prepClean: number
  components: EstimatedLaborComponent[]
  componentsTotal: number
  total: number
}

const COMPONENT_LABELS: Record<string, string> = {
  rc_channel_labor: 'RC Channel',
  suspended_grid_labor: 'Suspended Grid',
  insulation_labor: 'Insulation',
  acoustic_labor: 'Acoustic Ceiling',
  metal_stud_labor: 'Metal Stud',
  frp_labor: 'FRP',
}

const COMPONENT_KEYS = Object.keys(COMPONENT_LABELS) as Array<keyof QuoteV3ComponentLaborByTrade>

const V2_COMPONENT_FIELDS: Array<{ key: keyof QuoteV3ComponentLaborByTrade; field: string }> = [
  { key: 'rc_channel_labor', field: 'rcChannelLaborCost' },
  { key: 'insulation_labor', field: 'insulationLaborCost' },
  { key: 'acoustic_labor', field: 'acousticCeilingLaborCost' },
  { key: 'metal_stud_labor', field: 'metalStudLaborCost' },
  { key: 'frp_labor', field: 'frpLaborCost' },
  { key: 'suspended_grid_labor', field: 'suspendedGridLaborCost' },
]

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function emptyEstimatedLaborBreakdown(): EstimatedLaborBreakdown {
  return {
    hanger: 0,
    finisher: 0,
    prepClean: 0,
    components: [],
    componentsTotal: 0,
    total: 0,
  }
}

export function componentLaborLabel(key: string): string {
  return COMPONENT_LABELS[key] ?? key
}

function buildComponents(
  amountsByKey: Partial<Record<string, number>>,
): EstimatedLaborComponent[] {
  const components: EstimatedLaborComponent[] = []
  for (const key of COMPONENT_KEYS) {
    const amount = num(amountsByKey[key])
    if (amount <= 0) continue
    components.push({
      key,
      label: COMPONENT_LABELS[key] ?? key,
      amount,
    })
  }
  return components
}

function finalizeBreakdown(
  hanger: number,
  finisher: number,
  prepClean: number,
  components: EstimatedLaborComponent[],
): EstimatedLaborBreakdown {
  const componentsTotal = components.reduce((sum, row) => sum + row.amount, 0)
  return {
    hanger,
    finisher,
    prepClean,
    components,
    componentsTotal,
    total: hanger + finisher + prepClean + componentsTotal,
  }
}

function v2LaborLine(
  base: unknown,
  withTax: unknown,
  includeBurden?: boolean,
): number {
  if (includeBurden === false) return num(base)
  const taxed = num(withTax)
  if (taxed > 0) return taxed
  return applyLaborBurden(num(base), includeBurden)
}

function laborBurdenFromV3Quote(
  quote: Extract<DrywallQuoteV2V3, { version: 3 }>,
): QuoteV3LaborBurdenOptions {
  return {
    hangerIncludeLaborBurden: quote.hanger_include_labor_burden,
    finisherIncludeLaborBurden: quote.finisher_include_labor_burden,
    prepCleanIncludeLaborBurden: quote.prep_clean_include_labor_burden,
    projectHangerRate: quote.project_hanger_rate,
    projectFinisherRate: quote.project_finisher_rate,
  }
}

function computeEstimatedLaborV2(quote: DrywallQuote): EstimatedLaborBreakdown {
  const calc = (quote.calculations ?? {}) as Record<string, unknown>

  const hanger = v2LaborLine(
    calc.hangerCost,
    calc.hangerCostWithTax,
    quote.hangerIncludeLaborBurden,
  )
  const finisher = v2LaborLine(
    calc.finisherCost,
    calc.finisherCostWithTax,
    quote.finisherIncludeLaborBurden,
  )
  const prepClean = v2LaborLine(
    calc.prepCleanCost,
    calc.prepCleanCostWithTax,
    quote.prepCleanIncludeLaborBurden,
  )

  const amounts: Partial<Record<string, number>> = {}
  for (const { key, field } of V2_COMPONENT_FIELDS) {
    amounts[key] = num(calc[field])
  }

  return finalizeBreakdown(hanger, finisher, prepClean, buildComponents(amounts))
}

function computeEstimatedLaborV3(
  quote: Extract<DrywallQuoteV2V3, { version: 3 }>,
  catalogs: OrgDrywallCatalogs,
): EstimatedLaborBreakdown {
  const burden = laborBurdenFromV3Quote(quote)
  const dc = lineDirectCostsFromLines(quote.lineItems, catalogs, burden)
  const prepClean = computeCleanupTotal(
    quote.lineItems,
    num(quote.prep_clean_rate),
    burden,
  )

  const trade = dc.componentLaborByTrade ?? emptyComponentLaborByTrade()
  const amounts: Partial<Record<string, number>> = {}
  for (const key of COMPONENT_KEYS) {
    amounts[key] = num(trade[key])
  }

  return finalizeBreakdown(
    num(dc.hangerLaborSubtotal),
    num(dc.finisherLaborSubtotal),
    prepClean,
    buildComponents(amounts),
  )
}

export function computeEstimatedLabor(
  quote: DrywallQuoteV2V3,
  catalogs: OrgDrywallCatalogs | null,
): EstimatedLaborBreakdown {
  if (isDrywallQuoteV3(quote)) {
    if (!catalogs) return emptyEstimatedLaborBreakdown()
    return computeEstimatedLaborV3(quote, catalogs)
  }
  return computeEstimatedLaborV2(quote)
}
