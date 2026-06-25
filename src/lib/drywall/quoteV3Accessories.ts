/**
 * Q.C.1 accessory engine — quantity formulas ported verbatim from accessoryCalc.ts.
 * Costs = units × catalog material_rate; finish scope accessories_applied gates categories.
 */
import type { DrywallQuoteV3, QuoteLineItem } from '@/types/drywall'
import type {
  AccessoryCatalogEntry,
  AccessoryCategory,
  FinishScopeCatalogEntry,
  OrgDrywallCatalogs,
} from '@/types/drywallCatalogs'
import { resolveFinishScope } from './quoteV3CatalogResolve'

/** v2 accessoryCalc.ts DEFAULT_SETTINGS — do not change without Q.C.4 parity review. */
export const ACCESSORY_CALC_CONSTANTS = {
  jointCompound: {
    allPurposeBaseRate: 4800,
    allPurposeLevel4Multiplier: 5,
    allPurposeLevel5Multiplier: 5,
    allPurposeStompMultiplier: 11,
    allPurposeSplatterMultiplier: 9,
    allPurposeDefaultMultiplier: 11,
    liteWeightMultiplier: 8,
    easySand90Rate: 5000,
    /** Firetape Only — reduced compound per plan §4.3 (not in field calc; quote-only). */
    firetapeReducedMultiplier: 2,
  },
  fasteners: { screwRate: 5760 },
  tape: {
    paperTapeRate: 1400,
    meshTapeLargeJobRate: 15000,
    meshTapeSmallJobRate: 1000,
    meshTapeSmallJobThreshold: 6000,
  },
  cornerBead: {
    easySand90PerStick: 10,
    liteWeightPerStick: 15,
  },
} as const

export interface AccessoryComputation {
  catalogEntryId: string
  display_name: string
  category: AccessoryCategory
  units: number
  unit: string
  unitRate: number
  cost: number
}

export type AccessoryCategoryMap = Record<AccessoryCategory, AccessoryComputation[]>

export interface LineAccessoryResult {
  byCategory: AccessoryCategoryMap
  totalCost: number
  items: AccessoryComputation[]
}

export interface QuoteAccessoryRollup {
  byCategory: AccessoryCategoryMap
  totalCost: number
  byLine: Record<string, number>
}

const EMPTY_CATEGORY_MAP = (): AccessoryCategoryMap => ({
  joint_compound: [],
  tape: [],
  screws: [],
  corner_bead: [],
  other: [],
})

function emptyLineResult(): LineAccessoryResult {
  return { byCategory: EMPTY_CATEGORY_MAP(), totalCost: 0, items: [] }
}

function catalogById(catalog: AccessoryCatalogEntry[]): Map<string, AccessoryCatalogEntry> {
  return new Map(catalog.map((e) => [e.id, e]))
}

export function effectiveAccessoryFlags(
  line: QuoteLineItem,
  finishScope: FinishScopeCatalogEntry | null | undefined,
): Record<keyof FinishScopeCatalogEntry['accessories_applied'], boolean> {
  const base = finishScope?.accessories_applied ?? {
    joint_compound: false,
    tape: false,
    screws: false,
    corner_bead: false,
  }
  const ov = line.accessoryOverrides
  if (ov?.no_joint_compound) {
    return {
      joint_compound: false,
      tape: ov.tape ?? base.tape,
      screws: ov.screws ?? base.screws,
      corner_bead: ov.corner_bead ?? base.corner_bead,
    }
  }
  return {
    joint_compound: ov?.joint_compound ?? base.joint_compound,
    tape: ov?.tape ?? base.tape,
    screws: ov?.screws ?? base.screws,
    corner_bead: ov?.corner_bead ?? base.corner_bead,
  }
}

/** Map finish scope id → all-purpose multiplier (v2 ceiling-finish branches). */
function allPurposeMultiplierForFinishScope(finishScopeId: string): number {
  const s = ACCESSORY_CALC_CONSTANTS.jointCompound
  if (finishScopeId === 'firetape_only') return s.firetapeReducedMultiplier
  if (finishScopeId === 'splatter_knockdown' || finishScopeId === 'splatter') {
    return s.allPurposeSplatterMultiplier
  }
  if (
    finishScopeId === 'stomp_knockdown' ||
    finishScopeId === 'knockdown'
  ) {
    return s.allPurposeStompMultiplier
  }
  if (
    finishScopeId === 'level_3' ||
    finishScopeId === 'level_4' ||
    finishScopeId === 'level_5'
  ) {
    return s.allPurposeLevel4Multiplier
  }
  return s.allPurposeDefaultMultiplier
}

function isFiretapeScope(finishScopeId: string): boolean {
  return finishScopeId === 'firetape_only'
}

function computeAllPurposeBoxes(sqft: number, finishScopeId: string): number {
  const s = ACCESSORY_CALC_CONSTANTS.jointCompound
  const mult = allPurposeMultiplierForFinishScope(finishScopeId)
  return Math.ceil((sqft / s.allPurposeBaseRate) * mult)
}

function computeLiteWeightBoxes(sqft: number, cornerBeadQty: number): number {
  const s = ACCESSORY_CALC_CONSTANTS.jointCompound
  const base = Math.ceil((sqft / s.allPurposeBaseRate) * s.liteWeightMultiplier)
  const additional = Math.ceil(
    cornerBeadQty / ACCESSORY_CALC_CONSTANTS.cornerBead.liteWeightPerStick,
  )
  return base + additional
}

function computeEasySand90Bags(sqft: number, cornerBeadQty: number): number {
  const s = ACCESSORY_CALC_CONSTANTS.jointCompound
  const base = Math.ceil(sqft / s.easySand90Rate)
  const additional = Math.ceil(
    cornerBeadQty / ACCESSORY_CALC_CONSTANTS.cornerBead.easySand90PerStick,
  )
  return base + additional
}

function computeScrewBoxes(sqft: number): number {
  return Math.ceil(sqft / ACCESSORY_CALC_CONSTANTS.fasteners.screwRate)
}

function computePaperTapeRolls(sqft: number): number {
  return Math.ceil(sqft / ACCESSORY_CALC_CONSTANTS.tape.paperTapeRate)
}

function computeMeshTapeRolls(sqft: number): number {
  const t = ACCESSORY_CALC_CONSTANTS.tape
  if (sqft < t.meshTapeSmallJobThreshold) {
    return Math.ceil(sqft / t.meshTapeSmallJobRate)
  }
  return Math.ceil(sqft / t.meshTapeLargeJobRate)
}

function pushItem(
  items: AccessoryComputation[],
  byCategory: AccessoryCategoryMap,
  entry: AccessoryCatalogEntry | undefined,
  units: number,
): void {
  if (!entry || units <= 0) return
  const cost = units * entry.material_rate
  const row: AccessoryComputation = {
    catalogEntryId: entry.id,
    display_name: entry.display_name,
    category: entry.category,
    units,
    unit: entry.unit,
    unitRate: entry.material_rate,
    cost,
  }
  items.push(row)
  byCategory[entry.category].push(row)
}

function cornerBeadPiecesFromLine(line: QuoteLineItem): number {
  const lf = line.accessoryOverrides?.corner_bead_lf ?? 0
  if (lf <= 0) return 0
  // v2 field uses manual pcs; 10 LF/stick is a common stick length for add-on compound math.
  return Math.ceil(lf / 10)
}

/**
 * Per-line accessory breakdown for drywall rows.
 * Uses finish scope accessories_applied + v2 quantity formulas.
 */
export function computeLineAccessories(
  line: QuoteLineItem,
  finishScope: FinishScopeCatalogEntry | null | undefined,
  accessoryCatalog: AccessoryCatalogEntry[],
): LineAccessoryResult {
  if (line.type !== 'drywall' || !finishScope) return emptyLineResult()
  if (line.accessories_in_material_rate) return emptyLineResult()

  const wastePct = line.waste_pct ?? 10
  const sqft = (line.quantity || 0) * (1 + wastePct / 100)
  if (sqft <= 0) return emptyLineResult()

  const flags = effectiveAccessoryFlags(line, finishScope)
  const byCategory = EMPTY_CATEGORY_MAP()
  const items: AccessoryComputation[] = []
  const catalog = catalogById(accessoryCatalog)
  const finishId = finishScope.id
  const cornerBeadQty = cornerBeadPiecesFromLine(line)

  if (flags.joint_compound) {
    pushItem(
      items,
      byCategory,
      catalog.get('joint_compound_all_purpose'),
      computeAllPurposeBoxes(sqft, finishId),
    )
    if (!isFiretapeScope(finishId)) {
      pushItem(
        items,
        byCategory,
        catalog.get('joint_compound_lite_weight'),
        computeLiteWeightBoxes(sqft, cornerBeadQty),
      )
      pushItem(
        items,
        byCategory,
        catalog.get('joint_compound_easy_sand_90'),
        computeEasySand90Bags(sqft, cornerBeadQty),
      )
    }
  }

  if (flags.screws) {
    pushItem(items, byCategory, catalog.get('screws_1_25_coarse'), computeScrewBoxes(sqft))
  }

  if (flags.tape) {
    pushItem(items, byCategory, catalog.get('tape_paper_500ft'), computePaperTapeRolls(sqft))
    pushItem(items, byCategory, catalog.get('tape_mesh_300ft'), computeMeshTapeRolls(sqft))
  }

  if (flags.corner_bead) {
    const lf = line.accessoryOverrides?.corner_bead_lf ?? 0
    if (lf > 0) {
      pushItem(items, byCategory, catalog.get('corner_bead_metal'), lf)
    }
  }

  const totalCost = items.reduce((sum, i) => sum + i.cost, 0)
  return { byCategory, totalCost, items }
}

function mergeCategoryMaps(target: AccessoryCategoryMap, source: AccessoryCategoryMap): void {
  for (const cat of Object.keys(target) as AccessoryCategory[]) {
    target[cat].push(...source[cat])
  }
}

function aggregateByCategory(items: AccessoryComputation[]): AccessoryCategoryMap {
  const map = EMPTY_CATEGORY_MAP()
  for (const item of items) {
    map[item.category].push(item)
  }
  return map
}

/** Project-wide accessory rollup across routine lines and alternates. */
export function computeQuoteAccessoryRollup(
  quote: DrywallQuoteV3,
  catalogs: OrgDrywallCatalogs,
): QuoteAccessoryRollup {
  const byLine: Record<string, number> = {}
  const allItems: AccessoryComputation[] = []
  const accessoryCatalog = catalogs.accessories ?? []

  const processLines = (lines: QuoteLineItem[]) => {
    for (const line of lines) {
      if (line.type !== 'drywall') continue
      const finishScope = resolveFinishScope(line, catalogs)
      const result = computeLineAccessories(line, finishScope, accessoryCatalog)
      byLine[line.id] = result.totalCost
      allItems.push(...result.items)
    }
  }

  processLines(quote.lineItems)
  for (const alt of quote.alternates) {
    processLines(alt.lineItems)
  }

  return {
    byCategory: aggregateByCategory(allItems),
    totalCost: allItems.reduce((s, i) => s + i.cost, 0),
    byLine,
  }
}

/** Collapse duplicate catalog rows for project-level sidebar display. */
export function summarizeAccessoryItems(
  items: AccessoryComputation[],
): Array<{ display_name: string; units: number; unit: string; unitRate: number; cost: number }> {
  const merged = new Map<string, { display_name: string; units: number; unit: string; unitRate: number; cost: number }>()
  for (const item of items) {
    const key = item.catalogEntryId
    const prev = merged.get(key)
    if (prev) {
      prev.units += item.units
      prev.cost += item.cost
    } else {
      merged.set(key, {
        display_name: item.display_name,
        units: item.units,
        unit: item.unit,
        unitRate: item.unitRate,
        cost: item.cost,
      })
    }
  }
  return [...merged.values()]
}
