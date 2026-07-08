import { DRYWALL_QUOTE_BASE_DEFAULTS } from './drywallQuoteDefaults'
import type { DrywallQuoteV3, QuoteAlternate, QuoteLineItem, QuoteLineItemType } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import {
  getEffectiveComponentLaborRate,
  getEffectiveFinisherRate,
  getEffectiveHangerRate,
  getLineCatalogLabel,
  getLineMaterialRate,
  getLineUnit,
  resolveFinishScope,
} from './quoteV3CatalogResolve'
import {
  allocateQuoteBeadSticksAcrossLines,
  computeLineAccessories,
  computeQuoteAccessoryRollup,
  type AccessoryCategoryMap,
  type LineAccessoryResult,
} from './quoteV3Accessories'
import { applyLaborBurden } from './calculations/quantityUtils'

export const DEFAULT_PREP_CLEAN_RATE = DRYWALL_QUOTE_BASE_DEFAULTS.prepCleanRate

export function emptyComponentLaborByTrade(): QuoteV3ComponentLaborByTrade {
  return {
    rc_channel_labor: 0,
    suspended_grid_labor: 0,
    insulation_labor: 0,
    acoustic_labor: 0,
    metal_stud_labor: 0,
    frp_labor: 0,
  }
}

function componentLaborTradeKey(
  type: QuoteLineItemType,
): keyof QuoteV3ComponentLaborByTrade | null {
  switch (type) {
    case 'rc_channel':
      return 'rc_channel_labor'
    case 'suspended_grid':
      return 'suspended_grid_labor'
    case 'insulation':
      return 'insulation_labor'
    case 'acoustic':
      return 'acoustic_labor'
    case 'metal_stud':
      return 'metal_stud_labor'
    case 'frp':
      return 'frp_labor'
    default:
      return null
  }
}

export interface QuoteV3LineComputed {
  materialTotal: number
  hangerLaborTotal: number
  finisherLaborTotal: number
  laborTotal: number
  accessoriesTotal: number
  accessories: LineAccessoryResult
  lineTotal: number
  unit: string
  catalogLabel: string
  finishLabel: string
}

export interface QuoteV3ComponentLaborByTrade {
  rc_channel_labor: number
  suspended_grid_labor: number
  insulation_labor: number
  acoustic_labor: number
  metal_stud_labor: number
  frp_labor: number
}

export interface QuoteV3LineDirectCosts {
  materialSubtotal: number
  hangerLaborSubtotal: number
  finisherLaborSubtotal: number
  componentLaborSubtotal: number
  componentLaborByTrade: QuoteV3ComponentLaborByTrade
  accessoriesSubtotal: number
}

export interface QuoteV3MarkupBreakdown {
  linesSubtotal: number
  materialSubtotal: number
  hangerLaborSubtotal: number
  finisherLaborSubtotal: number
  componentLaborSubtotal: number
  componentLaborByTrade: QuoteV3ComponentLaborByTrade
  accessoriesSubtotal: number
  accessoryByCategory: AccessoryCategoryMap
  cleanupTotal: number
  cleanupDrywallSqft: number
  prepCleanRate: number
  markupBase: number
  directSubtotal: number
  overheadAmount: number
  profitAmount: number
  salesTaxAmount: number
  total: number
}

export interface QuoteV3TotalsSummary {
  totalSqft: number
  totalSqftWithWaste: number
  routine: QuoteV3MarkupBreakdown
  alternates: Array<{ id: string; name: string; totalAdd: number }>
  grandTotalAllAlternates: number
}

export interface QuoteV3LaborBurdenOptions {
  hangerIncludeLaborBurden?: boolean
  finisherIncludeLaborBurden?: boolean
  prepCleanIncludeLaborBurden?: boolean
  projectHangerRate?: number
  projectFinisherRate?: number
  /** Bead sticks allocated to this line from quote.bead_sticks (quote-level scope field). */
  allocatedBeadSticks?: number
}

export function computeLineItem(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
  laborBurden?: QuoteV3LaborBurdenOptions,
): QuoteV3LineComputed {
  const qty = line.quantity || 0
  const wastePct = line.waste_pct ?? 10
  const wasteMult = line.type === 'drywall' ? 1 + wastePct / 100 : 1

  const materialRate = getLineMaterialRate(line, catalogs)
  const materialTotal = qty * materialRate * wasteMult

  let hangerLaborTotal = 0
  let finisherLaborTotal = 0
  let laborTotal = 0
  let accessoriesTotal = 0
  let accessories: LineAccessoryResult = {
    byCategory: {
      joint_compound: [],
      tape: [],
      screws: [],
      corner_bead: [],
      other: [],
    },
    totalCost: 0,
    items: [],
  }

  if (line.type === 'drywall') {
    const finishScope = resolveFinishScope(line, catalogs)
    const effectiveSqft = qty * wasteMult
    const hangerRate = getEffectiveHangerRate(
      line,
      catalogs,
      laborBurden?.projectHangerRate,
    )
    const finisherRate = getEffectiveFinisherRate(
      line,
      catalogs,
      laborBurden?.projectFinisherRate,
    )
    hangerLaborTotal = applyLaborBurden(
      effectiveSqft * hangerRate,
      laborBurden?.hangerIncludeLaborBurden,
    )
    finisherLaborTotal = applyLaborBurden(
      effectiveSqft * finisherRate,
      laborBurden?.finisherIncludeLaborBurden,
    )
    laborTotal = hangerLaborTotal + finisherLaborTotal
    accessories = computeLineAccessories(
      line,
      finishScope,
      catalogs.accessories ?? [],
      laborBurden?.allocatedBeadSticks ?? 0,
    )
    accessoriesTotal = accessories.totalCost
  } else {
    const laborRate = getEffectiveComponentLaborRate(line, catalogs)
    laborTotal = qty * laborRate
  }

  return {
    materialTotal,
    hangerLaborTotal,
    finisherLaborTotal,
    laborTotal,
    accessoriesTotal,
    accessories,
    lineTotal: materialTotal + laborTotal + accessoriesTotal,
    unit: getLineUnit(line, catalogs),
    catalogLabel: getLineCatalogLabel(line, catalogs),
    finishLabel: resolveFinishScope(line, catalogs)?.display_name ?? '—',
  }
}

export function enrichLineWithComputed(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
): QuoteLineItem {
  const c = computeLineItem(line, catalogs)
  return {
    ...line,
    computed_material_total: c.materialTotal,
    computed_labor_total: c.laborTotal,
    computed_accessories_total: c.accessoriesTotal,
    computed_line_total: c.lineTotal,
  }
}

export function computeMarkupBreakdown(
  linesSubtotal: number,
  cleanupTotal: number,
  overheadPct: number,
  profitPct: number,
  salesTaxPct: number,
  cleanupDrywallSqft = 0,
  prepCleanRate = DEFAULT_PREP_CLEAN_RATE,
  directCosts?: QuoteV3LineDirectCosts & { accessoryByCategory?: AccessoryCategoryMap },
): QuoteV3MarkupBreakdown {
  const materialSubtotal = directCosts?.materialSubtotal ?? 0
  const accessoriesSubtotal = directCosts?.accessoriesSubtotal ?? 0
  const hangerLabor = directCosts?.hangerLaborSubtotal ?? 0
  const finisherLabor = directCosts?.finisherLaborSubtotal ?? 0
  const componentLabor = directCosts?.componentLaborSubtotal ?? 0

  const taxableMaterial = directCosts
    ? materialSubtotal + accessoriesSubtotal
    : Math.max(0, linesSubtotal - cleanupTotal)
  const salesTaxAmount = taxableMaterial * (salesTaxPct / 100)
  const laborSubtotal = directCosts
    ? hangerLabor + finisherLabor + componentLabor + cleanupTotal
    : cleanupTotal
  const directCost = directCosts
    ? taxableMaterial + salesTaxAmount + laborSubtotal
    : linesSubtotal + cleanupTotal
  const markupBase = directCost

  const overheadAmount = markupBase * (overheadPct / 100)
  const afterOverhead = markupBase + overheadAmount
  const profitAmount = afterOverhead * (profitPct / 100)
  const total = afterOverhead + profitAmount

  return {
    linesSubtotal,
    materialSubtotal: directCosts?.materialSubtotal ?? linesSubtotal,
    hangerLaborSubtotal: directCosts?.hangerLaborSubtotal ?? 0,
    finisherLaborSubtotal: directCosts?.finisherLaborSubtotal ?? 0,
    componentLaborSubtotal: directCosts?.componentLaborSubtotal ?? 0,
    componentLaborByTrade: directCosts?.componentLaborByTrade ?? emptyComponentLaborByTrade(),
    accessoriesSubtotal: directCosts?.accessoriesSubtotal ?? 0,
    accessoryByCategory: directCosts?.accessoryByCategory ?? {
      joint_compound: [],
      tape: [],
      screws: [],
      corner_bead: [],
      other: [],
    },
    cleanupTotal,
    cleanupDrywallSqft,
    prepCleanRate,
    markupBase,
    directSubtotal: markupBase,
    overheadAmount,
    profitAmount,
    salesTaxAmount,
    total,
  }
}

export function applyProjectMarkup(
  markupBase: number,
  overheadPct: number,
  profitPct: number,
  salesTaxPct: number,
  linesSubtotal = markupBase,
  cleanupTotal = 0,
  cleanupDrywallSqft = 0,
  prepCleanRate = DEFAULT_PREP_CLEAN_RATE,
): QuoteV3MarkupBreakdown {
  return computeMarkupBreakdown(
    linesSubtotal,
    cleanupTotal,
    overheadPct,
    profitPct,
    salesTaxPct,
    cleanupDrywallSqft,
    prepCleanRate,
  )
}

export function lineDirectCostsFromLines(
  lines: QuoteLineItem[],
  catalogs: OrgDrywallCatalogs,
  laborBurden?: QuoteV3LaborBurdenOptions,
  quoteBeadSticks?: number | string | null,
): QuoteV3LineDirectCosts & { accessoryByCategory: AccessoryCategoryMap } {
  let materialSubtotal = 0
  let hangerLaborSubtotal = 0
  let finisherLaborSubtotal = 0
  let componentLaborSubtotal = 0
  const componentLaborByTrade = emptyComponentLaborByTrade()
  let accessoriesSubtotal = 0
  const accessoryByCategory: AccessoryCategoryMap = {
    joint_compound: [],
    tape: [],
    screws: [],
    corner_bead: [],
    other: [],
  }
  const beadAllocation = allocateQuoteBeadSticksAcrossLines(lines, quoteBeadSticks)
  for (const line of lines) {
    const computed = computeLineItem(line, catalogs, {
      ...laborBurden,
      allocatedBeadSticks: beadAllocation.get(line.id) ?? 0,
    })
    materialSubtotal += computed.materialTotal
    if (line.type === 'drywall') {
      hangerLaborSubtotal += computed.hangerLaborTotal
      finisherLaborSubtotal += computed.finisherLaborTotal
      accessoriesSubtotal += computed.accessoriesTotal
    } else {
      componentLaborSubtotal += computed.laborTotal
      const tradeKey = componentLaborTradeKey(line.type)
      if (tradeKey) {
        componentLaborByTrade[tradeKey] += computed.laborTotal
      }
    }
    for (const cat of Object.keys(accessoryByCategory) as Array<keyof AccessoryCategoryMap>) {
      accessoryByCategory[cat].push(...computed.accessories.byCategory[cat])
    }
  }
  return {
    materialSubtotal,
    hangerLaborSubtotal,
    finisherLaborSubtotal,
    componentLaborSubtotal,
    componentLaborByTrade,
    accessoriesSubtotal,
    accessoryByCategory,
  }
}

export function linesSubtotalFromLines(
  lines: QuoteLineItem[],
  catalogs: OrgDrywallCatalogs,
  laborBurden?: QuoteV3LaborBurdenOptions,
  quoteBeadSticks?: number | string | null,
): number {
  const direct = lineDirectCostsFromLines(lines, catalogs, laborBurden, quoteBeadSticks)
  return (
    direct.materialSubtotal +
    direct.hangerLaborSubtotal +
    direct.finisherLaborSubtotal +
    direct.componentLaborSubtotal +
    direct.accessoriesSubtotal
  )
}

function sumDrywallSqft(lines: QuoteLineItem[]): number {
  return lines.reduce((sum, line) => {
    if (line.type !== 'drywall') return sum
    return sum + (line.quantity || 0)
  }, 0)
}

function sumDrywallSqftWithWaste(lines: QuoteLineItem[]): number {
  return lines.reduce((sum, line) => {
    if (line.type !== 'drywall') return sum
    const qty = line.quantity || 0
    const wastePct = line.waste_pct ?? 10
    return sum + qty * (1 + wastePct / 100)
  }, 0)
}

export function computeCleanupTotal(
  lines: QuoteLineItem[],
  prepCleanRate: number,
  laborBurden?: QuoteV3LaborBurdenOptions,
): number {
  const base = sumDrywallSqftWithWaste(lines) * prepCleanRate
  return applyLaborBurden(base, laborBurden?.prepCleanIncludeLaborBurden)
}

function laborBurdenFromQuote(quote: DrywallQuoteV3): QuoteV3LaborBurdenOptions {
  return {
    hangerIncludeLaborBurden: quote.hanger_include_labor_burden,
    finisherIncludeLaborBurden: quote.finisher_include_labor_burden,
    prepCleanIncludeLaborBurden: quote.prep_clean_include_labor_burden,
    projectHangerRate: quote.project_hanger_rate,
    projectFinisherRate: quote.project_finisher_rate,
  }
}

export function computeQuoteV3Totals(
  quote: DrywallQuoteV3,
  catalogs: OrgDrywallCatalogs,
): QuoteV3TotalsSummary {
  const prepCleanRate = quote.prep_clean_rate ?? DEFAULT_PREP_CLEAN_RATE
  const laborBurden = laborBurdenFromQuote(quote)
  const directCosts = lineDirectCostsFromLines(
    quote.lineItems,
    catalogs,
    laborBurden,
    quote.bead_sticks,
  )
  const linesSubtotal =
    directCosts.materialSubtotal +
    directCosts.hangerLaborSubtotal +
    directCosts.finisherLaborSubtotal +
    directCosts.componentLaborSubtotal +
    directCosts.accessoriesSubtotal
  const accessoryRollup = computeQuoteAccessoryRollup(quote, catalogs)
  const cleanupDrywallSqft = sumDrywallSqftWithWaste(quote.lineItems)
  const cleanupTotal = computeCleanupTotal(quote.lineItems, prepCleanRate, laborBurden)
  const routine = computeMarkupBreakdown(
    linesSubtotal,
    cleanupTotal,
    quote.overhead_pct,
    quote.profit_pct,
    quote.sales_tax_pct,
    cleanupDrywallSqft,
    prepCleanRate,
    {
      ...directCosts,
      accessoryByCategory: accessoryRollup.byCategory,
    },
  )

  let totalSqft = 0
  let totalSqftWithWaste = 0
  for (const line of quote.lineItems) {
    if (line.type !== 'drywall') continue
    const qty = line.quantity || 0
    const wastePct = line.waste_pct ?? 10
    totalSqft += qty
    totalSqftWithWaste += qty * (1 + wastePct / 100)
  }

  const alternates = quote.alternates.map((alt) => {
    const altDirect = lineDirectCostsFromLines(alt.lineItems, catalogs, laborBurden)
    const linesSub = linesSubtotalFromLines(alt.lineItems, catalogs, laborBurden)
    const marked = computeMarkupBreakdown(
      linesSub,
      0,
      quote.overhead_pct,
      quote.profit_pct,
      quote.sales_tax_pct,
      0,
      prepCleanRate,
      altDirect,
    )
    return { id: alt.id, name: alt.name, totalAdd: marked.total }
  })

  const grandTotalAllAlternates =
    routine.total + alternates.reduce((s, a) => s + a.totalAdd, 0)

  return {
    totalSqft,
    totalSqftWithWaste,
    routine,
    alternates,
    grandTotalAllAlternates,
  }
}

export function enrichQuoteAlternates(
  quote: DrywallQuoteV3,
  catalogs: OrgDrywallCatalogs,
): QuoteAlternate[] {
  const laborBurden = laborBurdenFromQuote(quote)
  return quote.alternates.map((alt) => {
    const altDirect = lineDirectCostsFromLines(alt.lineItems, catalogs, laborBurden)
    const linesSub = linesSubtotalFromLines(alt.lineItems, catalogs, laborBurden)
    const marked = computeMarkupBreakdown(
      linesSub,
      0,
      quote.overhead_pct,
      quote.profit_pct,
      quote.sales_tax_pct,
      0,
      quote.prep_clean_rate ?? DEFAULT_PREP_CLEAN_RATE,
      altDirect,
    )
    return { ...alt, totalAdd: marked.total }
  })
}

export function formatQuoteMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPctLabel(pct: number): string {
  const rounded = Math.round(pct * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}
