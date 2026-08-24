import { DRYWALL_QUOTE_BASE_DEFAULTS } from './drywallQuoteDefaults'
import type { DrywallQuoteV3, QuoteAlternate, QuoteLineItem, QuoteLineItemType } from '@/types/drywall'
import type {
  AcousticComponentType,
  OrgDrywallCatalogs,
  SuspendedGridComponentType,
} from '@/types/drywallCatalogs'
import { calcAcousticCeilingGridCounts } from '@/lib/drywall/calculations/acousticCeilingGridCalc'
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
  computeRcChannelScrews,
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
    door_install_labor: 0,
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
    case 'door_install':
      return 'door_install_labor'
    default:
      return null
  }
}

export interface SuspendedGridBreakdown {
  perimeter: number
  mains: number
  tees_4ft: number
  /** Linear feet of wire. */
  wire: number
  lags: number
  wall_angle: number
  /** Acoustic only — ceiling tiles. */
  tiles?: number
  /** Acoustic 2x2 only — 2ft cross-tees. */
  tees_2ft?: number
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
  /** Present for suspended_grid lines priced via the itemized path (not blended). */
  gridBreakdown?: SuspendedGridBreakdown
}

export interface QuoteV3ComponentLaborByTrade {
  rc_channel_labor: number
  suspended_grid_labor: number
  insulation_labor: number
  acoustic_labor: number
  metal_stud_labor: number
  frp_labor: number
  door_install_labor: number
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
  alternates: Array<{
    id: string
    name: string
    pricingMode: 'add' | 'deduct'
    /** Fully marked-up amount; negative when pricingMode is `'deduct'`. */
    totalAdd: number
    /** Drywall sqft this alternate adds/removes; negative when `'deduct'`. */
    sqft: number
    /** Whether the customer has accepted this alternate. */
    selected: boolean
    /** This alternate's own cost breakdown (unsigned magnitudes) for netting. */
    breakdown: QuoteV3MarkupBreakdown
  }>
  grandTotalAllAlternates: number
  /** Base total + only the ACCEPTED (selected) alternates — the contract total. */
  acceptedTotal: number
  /** Base drywall sqft + only the ACCEPTED alternates' sqft — the estimate sqft. */
  acceptedSqft: number
}

export interface QuoteV3LaborBurdenOptions {
  hangerIncludeLaborBurden?: boolean
  finisherIncludeLaborBurden?: boolean
  prepCleanIncludeLaborBurden?: boolean
  componentIncludeLaborBurden?: boolean
  projectHangerRate?: number
  projectFinisherRate?: number
  /** Bead sticks allocated to this line from quote.bead_sticks (quote-level scope field). */
  allocatedBeadSticks?: number
}

const RC_DEFAULT_SPACING_IN = 24
const RC_DEFAULT_PIECE_LENGTH_FT = 12

function emptyAccessories(): LineAccessoryResult {
  return {
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
}

export function computeLineItem(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
  laborBurden?: QuoteV3LaborBurdenOptions,
): QuoteV3LineComputed {
  const qty = line.quantity || 0
  // Waste applies to every trade; drywall defaults to 10%, components to 0% (opt-in via their input).
  const wastePct = line.waste_pct ?? (line.type === 'drywall' ? 10 : 0)
  const wasteMult = 1 + wastePct / 100
  const materialRate = getLineMaterialRate(line, catalogs)
  let materialTotal = qty * materialRate * wasteMult

  let hangerLaborTotal = 0
  let finisherLaborTotal = 0
  let laborTotal = 0
  let accessoriesTotal = 0
  let accessories: LineAccessoryResult = emptyAccessories()
  let gridBreakdown: SuspendedGridBreakdown | undefined

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
  } else if (line.type === 'rc_channel') {
    const spacingIn = line.rc_spacing_in && line.rc_spacing_in > 0 ? line.rc_spacing_in : RC_DEFAULT_SPACING_IN
    const spacingFt = spacingIn / 12
    const surface = line.rc_surface === 'ceiling' ? 'ceiling' : 'wall'
    const wallHeight = line.rc_wall_height && line.rc_wall_height > 0 ? line.rc_wall_height : 0
    const rows = surface === 'wall' ? (wallHeight > 0 ? Math.ceil(wallHeight / spacingFt) : 1) : 0
    const channelLf = surface === 'ceiling' ? qty / spacingFt : qty * rows
    const rcWastePct = line.waste_pct ?? 10
    const channelLfWasted = (channelLf * (100 + rcWastePct)) / 100
    const pieceLenFt =
      catalogs.rc_channel.find((e) => e.id === line.catalog_id)?.default_piece_length_ft ||
      RC_DEFAULT_PIECE_LENGTH_FT
    const pieces = Math.ceil(channelLfWasted / pieceLenFt)
    materialTotal = pieces * materialRate
    const laborRate = getEffectiveComponentLaborRate(line, catalogs)
    laborTotal = applyLaborBurden(
      channelLfWasted * laborRate,
      laborBurden?.componentIncludeLaborBurden ?? true,
    )
    const rcScrews = computeRcChannelScrews(channelLfWasted, catalogs.accessories ?? [], {
      screwsEnabled: line.accessoryOverrides?.screws ?? true,
      accessoriesInMaterialRate: line.accessories_in_material_rate,
    })
    accessories = rcScrews.accessories
    accessoriesTotal = rcScrews.screwsTotal
  } else if (line.type === 'suspended_grid') {
    // Itemized grid material: counts (v2 formulas) × catalog per-component rates.
    // Labor stays sqft × carpenter rate via the standard component-labor path below.
    const sqft = qty
    const gridWastePct = line.waste_pct ?? 0
    const wasteMultGrid = 1 + gridWastePct / 100
    const sqftWasted = sqft * wasteMultGrid
    const basePerimeter =
      line.grid_perimeter && line.grid_perimeter > 0 ? line.grid_perimeter : 4 * Math.sqrt(sqft)
    const perimeterWasted = basePerimeter * wasteMultGrid
    const ov = line.grid_count_overrides ?? {}
    const mains = ov.mains ?? Math.ceil(sqftWasted / 4 / 12)
    const tees_4ft = ov.tees_4ft ?? Math.ceil((sqftWasted / 16) * 2)
    const wire = ov.wire ?? Math.ceil(sqftWasted / 5)
    const lags = ov.lags ?? Math.ceil(wire / 8)
    const wall_angle = ov.wall_angle ?? Math.ceil(perimeterWasted / 8)

    if (line.custom_material_rate != null) {
      // Converted/blended line — preserve v2→v3 parity; don't retro-itemize.
      materialTotal = qty * line.custom_material_rate
    } else {
      const rate = (ct: SuspendedGridComponentType) =>
        catalogs.suspended_grid.find((e) => e.component_type === ct)?.material_rate ?? 0
      // The perimeter wall-angle may be catalogued as either "wall_angle" or "shiny_90".
      const angleRate = rate('wall_angle') || rate('shiny_90')
      materialTotal =
        mains * rate('mains') +
        tees_4ft * rate('tees_4ft') +
        wire * rate('wire') +
        lags * rate('lags') +
        wall_angle * angleRate
      gridBreakdown = { perimeter: perimeterWasted, mains, tees_4ft, wire, lags, wall_angle }
    }

    // Labor = wasted ceiling sqft × carpenter rate (waste applied, like the material takeoff).
    const laborRate = getEffectiveComponentLaborRate(line, catalogs)
    laborTotal = applyLaborBurden(
      sqftWasted * laborRate,
      laborBurden?.componentIncludeLaborBurden ?? true,
    )
  } else if (line.type === 'acoustic') {
    // Itemized ACT: tiles + grid (mains/tees/wall-angle/wire/lags) from sqft + perimeter +
    // tile size, priced by the acoustic catalog. Labor is sqft × carpenter rate below.
    const sqft = qty
    const acstWastePct = line.waste_pct ?? 0
    const wasteMultAc = 1 + acstWastePct / 100
    const sqftWasted = sqft * wasteMultAc
    const tileSize = line.acst_tile_size === '2x2' ? '2x2' : '2x4'
    const counts = calcAcousticCeilingGridCounts({
      baseSqft: sqft,
      perimeter: line.grid_perimeter,
      wastePct: acstWastePct,
      tileSize,
    })
    const tileArea = tileSize === '2x2' ? 4 : 8
    const ov = line.grid_count_overrides ?? {}
    const tiles = ov.tiles ?? Math.ceil(sqftWasted / tileArea)
    const mains = ov.mains ?? counts?.mainsCount ?? 0
    const tees_4ft = ov.tees_4ft ?? counts?.tees4ftCount ?? 0
    const tees_2ft = ov.tees_2ft ?? counts?.tees2ftCount ?? 0
    const wire = ov.wire ?? Number(counts?.wireLinearFt ?? 0)
    const lags = ov.lags ?? counts?.lagsCount ?? 0
    const wall_angle = ov.wall_angle ?? counts?.wallAngleCount ?? 0

    if (line.custom_material_rate != null) {
      // Converted/blended line — preserve parity; don't retro-itemize.
      materialTotal = qty * line.custom_material_rate
    } else {
      const rate = (ct: AcousticComponentType) =>
        catalogs.acoustic.find((e) => e.component_type === ct)?.material_rate ?? 0
      materialTotal =
        tiles * rate('tile') +
        mains * rate('mains') +
        tees_4ft * rate('tees_4ft') +
        tees_2ft * rate('tees_2ft') +
        wire * rate('wire') +
        lags * rate('lags') +
        wall_angle * rate('wall_angle')
      const basePerimeter =
        line.grid_perimeter && line.grid_perimeter > 0 ? line.grid_perimeter : 4 * Math.sqrt(sqft)
      gridBreakdown = {
        perimeter: basePerimeter * wasteMultAc,
        tiles,
        mains,
        tees_4ft,
        tees_2ft,
        wire,
        lags,
        wall_angle,
      }
    }

    const laborRate = getEffectiveComponentLaborRate(line, catalogs)
    laborTotal = applyLaborBurden(
      sqftWasted * laborRate,
      laborBurden?.componentIncludeLaborBurden ?? true,
    )
  } else {
    // insulation / metal_stud / frp / door_install — material already carries waste
    // via wasteMult above; apply the same waste to labor.
    const laborRate = getEffectiveComponentLaborRate(line, catalogs)
    laborTotal = applyLaborBurden(
      qty * wasteMult * laborRate,
      laborBurden?.componentIncludeLaborBurden ?? true,
    )
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
    gridBreakdown,
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
    } else {
      componentLaborSubtotal += computed.laborTotal
      const tradeKey = componentLaborTradeKey(line.type)
      if (tradeKey) {
        componentLaborByTrade[tradeKey] += computed.laborTotal
      }
    }
    accessoriesSubtotal += computed.accessoriesTotal
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
    componentIncludeLaborBurden: quote.component_include_labor_burden ?? true,
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
    const pricingMode = alternatePricingMode(alt)
    const magnitude = marked.total
    const altSqft = alt.lineItems.reduce(
      (s, l) => s + (l.type === 'drywall' ? l.quantity || 0 : 0),
      0,
    )
    return {
      id: alt.id,
      name: alt.name,
      pricingMode,
      totalAdd: pricingMode === 'deduct' ? -magnitude : magnitude,
      sqft: pricingMode === 'deduct' ? -altSqft : altSqft,
      selected: Boolean(alt.selected),
      breakdown: marked,
    }
  })

  const selectedAlts = alternates.filter((a) => a.selected)
  const acceptedTotal = routine.total + selectedAlts.reduce((s, a) => s + a.totalAdd, 0)
  const acceptedSqft = totalSqft + selectedAlts.reduce((s, a) => s + a.sqft, 0)
  const grandTotalAllAlternates =
    routine.total + alternates.reduce((s, a) => s + a.totalAdd, 0)

  return {
    totalSqft,
    totalSqftWithWaste,
    routine,
    alternates,
    grandTotalAllAlternates,
    acceptedTotal,
    acceptedSqft,
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
    const pricingMode = alternatePricingMode(alt)
    const magnitude = marked.total
    return {
      ...alt,
      pricingMode,
      totalAdd: pricingMode === 'deduct' ? -magnitude : magnitude,
    }
  })
}

/** Resolve alternate add vs deduct; legacy quotes without the field are adds. */
export function alternatePricingMode(alt: Pick<QuoteAlternate, 'pricingMode'>): 'add' | 'deduct' {
  return alt.pricingMode === 'deduct' ? 'deduct' : 'add'
}

/** Customer-facing label for an alternate's signed total. */
export function formatAlternateDeltaLabel(
  totalAdd: number,
  pricingMode: 'add' | 'deduct' = totalAdd < 0 ? 'deduct' : 'add',
): string {
  const magnitude = Math.abs(totalAdd)
  return pricingMode === 'deduct'
    ? `Deduct ${formatQuoteMoney(magnitude)}`
    : `Add ${formatQuoteMoney(magnitude)}`
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
