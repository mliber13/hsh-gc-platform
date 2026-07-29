/**
 * Q.C.4 — v2 vs v3 quote math parity engine (read-only).
 * Imported by quote-v3-parity-test.mjs via tsx.
 */

import { buildDrywallQuoteCalculations } from '../../src/lib/drywall/buildDrywallQuoteCalculations.ts'
import { buildV3FromV2 } from '../../src/lib/drywall/convertQuoteV2ToV3.ts'
import {
  createEmptyDrywallQuoteV3,
  createQuoteLineItem,
  hydrateDrywallQuoteV3,
  prepareDrywallQuoteV3ForSave,
} from '../../src/lib/drywall/createEmptyDrywallQuoteV3.ts'
import { hydrateDrywallQuote } from '../../src/lib/drywall/createEmptyDrywallQuote.ts'
import { applyLaborBurden } from '../../src/lib/drywall/calculations/quantityUtils.ts'
import { calculateQuoteTotals } from '../../src/lib/drywall/quoteCalculations.ts'
import { computeLineItem, computeQuoteV3Totals } from '../../src/lib/drywall/quoteV3Math.ts'
import { parseOrgDrywallCatalogs } from '../../src/lib/drywall/catalogUtils.ts'
import type { DrywallQuote, QuoteLineItemType } from '../../src/types/drywall'
import type { OrgDrywallCatalogs } from '../../src/types/drywallCatalogs'

export interface ParityProjectInput {
  id: string
  name: string
  v2Quote: Record<string, unknown>
}

export interface ParityCategoryBreakdown {
  material: number
  labor: number
  accessories: number
  cleanup: number
  markup: number
  misc: number
}

/** Pre-tax component material by trade (v3 − v2 should be ~0 after Quote-Trust). */
export type ComponentMaterialTrade =
  | 'metal_stud'
  | 'suspended_grid'
  | 'acoustic'
  | 'insulation'
  | 'rc_channel'
  | 'frp'

export type ComponentMaterialByTrade = Record<ComponentMaterialTrade, number>

const COMPONENT_MATERIAL_TRADES: ComponentMaterialTrade[] = [
  'metal_stud',
  'suspended_grid',
  'acoustic',
  'insulation',
  'rc_channel',
  'frp',
]

const V2_COMPONENT_MATERIAL_FIELDS: Record<ComponentMaterialTrade, string> = {
  metal_stud: 'metalStudMaterialCost',
  suspended_grid: 'suspendedGridMaterialCost',
  acoustic: 'acousticCeilingMaterialCost',
  insulation: 'insulationMaterialCost',
  rc_channel: 'rcChannelMaterialCost',
  frp: 'frpMaterialCost',
}

/** With-burden component labor fields (for parity vs v3 laborTotal). */
const V2_COMPONENT_LABOR_FIELDS: Record<ComponentMaterialTrade, string> = {
  metal_stud: 'metalStudLaborCost',
  suspended_grid: 'suspendedGridLaborCost',
  acoustic: 'acousticCeilingLaborCost',
  insulation: 'insulationLaborCost',
  rc_channel: 'rcChannelLaborCost',
  frp: 'frpLaborCost',
}

export interface ParityProjectResult {
  id: string
  name: string
  v2GrandTotal: number
  /** Path A — buildV3FromV2 → compute (direct convert math). */
  v3GrandTotal: number
  /** Path B — convert → serialize → hydrate → compute (browser load path). */
  v3HydratedGrandTotal: number
  hydrateDelta: number
  delta: number
  deltaPct: number
  v2Breakdown: {
    materialDirect: number
    laborDirect: number
    accessoriesDirect: number
    cleanupDirect: number
    markup: number
    grandTotal: number
  }
  v3Breakdown: {
    materialDirect: number
    laborDirect: number
    accessoriesDirect: number
    cleanupDirect: number
    markup: number
    grandTotal: number
  }
  varianceByCategory: ParityCategoryBreakdown
  /** Per-trade pre-tax component material (v3 − v2). */
  componentMaterialVariance: ComponentMaterialByTrade
  v2ComponentMaterial: ComponentMaterialByTrade
  v3ComponentMaterial: ComponentMaterialByTrade
  /** Per-trade with-burden component labor (v3 − v2). */
  componentLaborVariance: ComponentMaterialByTrade
  v2ComponentLabor: ComponentMaterialByTrade
  v3ComponentLabor: ComponentMaterialByTrade
  notes: string[]
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

export function extractV2DirectCosts(calc: Record<string, unknown>, v2: DrywallQuote) {
  const materialDirect = num(calc.materialCost)
  const hangerLabor = applyLaborBurden(num(calc.hangerCost), v2.hangerIncludeLaborBurden)
  const finisherLabor = applyLaborBurden(num(calc.finisherCost), v2.finisherIncludeLaborBurden)
  const cleanupDirect = applyLaborBurden(num(calc.prepCleanCost), v2.prepCleanIncludeLaborBurden)

  const componentLabor =
    num(calc.rcChannelLaborCost) +
    num(calc.suspendedGridLaborCost) +
    num(calc.insulationLaborCost) +
    num(calc.acousticCeilingLaborCost) +
    num(calc.metalStudLaborCost)

  const componentMaterial =
    num(calc.rcChannelMaterialCost) +
    num(calc.suspendedGridMaterialCost) +
    num(calc.insulationMaterialCost) +
    num(calc.acousticCeilingMaterialCost) +
    num(calc.metalStudMaterialCost) +
    num(calc.frpMaterialCost)

  const laborDirect = hangerLabor + finisherLabor + componentLabor
  const materialWithComponents = materialDirect + componentMaterial
  const accessoriesDirect = 0
  const materialSalesTax = num(calc.salesTax)
  const directSubtotal =
    materialWithComponents + accessoriesDirect + materialSalesTax + laborDirect
  const markup =
    num(calc.overheadAmount) + num(calc.profitAmount) + num(calc.actualProfit)
  const grandTotal = num(calc.finalTotal) || num(calc.calculatedTotal)

  return {
    materialDirect: materialWithComponents,
    laborDirect,
    accessoriesDirect,
    cleanupDirect,
    materialSalesTax,
    directSubtotal,
    markup,
    grandTotal,
  }
}

export function extractV3DirectCosts(
  routine: ReturnType<typeof computeQuoteV3Totals>['routine'],
) {
  const materialDirect = routine.materialSubtotal
  const laborDirect =
    routine.hangerLaborSubtotal +
    routine.finisherLaborSubtotal +
    routine.componentLaborSubtotal
  const accessoriesDirect = routine.accessoriesSubtotal
  const cleanupDirect = routine.cleanupTotal
  const markup =
    routine.overheadAmount + routine.profitAmount + routine.salesTaxAmount
  const grandTotal = routine.total

  return {
    materialDirect,
    laborDirect,
    accessoriesDirect,
    cleanupDirect,
    markup,
    grandTotal,
  }
}

function emptyComponentMaterialByTrade(): ComponentMaterialByTrade {
  return {
    metal_stud: 0,
    suspended_grid: 0,
    acoustic: 0,
    insulation: 0,
    rc_channel: 0,
    frp: 0,
  }
}

export function extractV2ComponentMaterialByTrade(
  calc: Record<string, unknown>,
): ComponentMaterialByTrade {
  const out = emptyComponentMaterialByTrade()
  for (const trade of COMPONENT_MATERIAL_TRADES) {
    out[trade] = num(calc[V2_COMPONENT_MATERIAL_FIELDS[trade]])
  }
  return out
}

export function extractV3ComponentMaterialByTrade(
  lineItems: { type: QuoteLineItemType; [key: string]: unknown }[],
  catalogs: OrgDrywallCatalogs,
): ComponentMaterialByTrade {
  const out = emptyComponentMaterialByTrade()
  for (const line of lineItems) {
    if (line.type === 'drywall' || line.type === 'door_install') continue
    if (!(line.type in out)) continue
    const materialTotal = computeLineItem(line as never, catalogs).materialTotal
    out[line.type as ComponentMaterialTrade] += materialTotal
  }
  return out
}

export function extractV2ComponentLaborByTrade(
  calc: Record<string, unknown>,
): ComponentMaterialByTrade {
  const out = emptyComponentMaterialByTrade()
  for (const trade of COMPONENT_MATERIAL_TRADES) {
    out[trade] = num(calc[V2_COMPONENT_LABOR_FIELDS[trade]])
  }
  return out
}

export function extractV3ComponentLaborByTrade(
  lineItems: { type: QuoteLineItemType; [key: string]: unknown }[],
  catalogs: OrgDrywallCatalogs,
  componentIncludeLaborBurden = true,
): ComponentMaterialByTrade {
  const out = emptyComponentMaterialByTrade()
  for (const line of lineItems) {
    if (line.type === 'drywall' || line.type === 'door_install') continue
    if (!(line.type in out)) continue
    const laborTotal = computeLineItem(line as never, catalogs, {
      componentIncludeLaborBurden,
    }).laborTotal
    out[line.type as ComponentMaterialTrade] += laborTotal
  }
  return out
}

function computeComponentByTradeVariance(
  v2: ComponentMaterialByTrade,
  v3: ComponentMaterialByTrade,
): ComponentMaterialByTrade {
  const out = emptyComponentMaterialByTrade()
  for (const trade of COMPONENT_MATERIAL_TRADES) {
    out[trade] = v3[trade] - v2[trade]
  }
  return out
}

function computeVarianceByCategory(
  v2: ReturnType<typeof extractV2DirectCosts>,
  v3: ReturnType<typeof extractV3DirectCosts>,
): ParityCategoryBreakdown {
  const material = v3.materialDirect - v2.materialDirect
  const labor = v3.laborDirect - v2.laborDirect
  const accessories = v3.accessoriesDirect - v2.accessoriesDirect
  const cleanup = v3.cleanupDirect - v2.cleanupDirect
  const markup = v3.markup - v2.markup
  const categorized = material + labor + accessories + cleanup + markup
  const misc = v3.grandTotal - v2.grandTotal - categorized
  return { material, labor, accessories, cleanup, markup, misc }
}

export function runParityForProject(
  project: ParityProjectInput,
  catalogs: OrgDrywallCatalogs,
): ParityProjectResult {
  const v2 = hydrateDrywallQuote(project.v2Quote)
  const calc = buildDrywallQuoteCalculations(v2) as Record<string, unknown>
  const v2Totals = calculateQuoteTotals({ ...v2, version: undefined }, calc)
  const v2GrandTotal = num(v2Totals.totalQuote) || num(calc.finalTotal)

  const v3Quote = buildV3FromV2(v2)
  const v3Totals = computeQuoteV3Totals(v3Quote, catalogs)
  const v3GrandTotal = v3Totals.routine.total

  const jsonbEquivalent = prepareDrywallQuoteV3ForSave(v3Quote)
  const v3Hydrated = hydrateDrywallQuoteV3(jsonbEquivalent)
  const v3HydratedTotals = computeQuoteV3Totals(v3Hydrated, catalogs)
  const v3HydratedGrandTotal = v3HydratedTotals.routine.total
  const hydrateDelta = v3HydratedGrandTotal - v3GrandTotal

  const v2Breakdown = extractV2DirectCosts(calc, v2)
  const v3Breakdown = extractV3DirectCosts(v3Totals.routine)
  const varianceByCategory = computeVarianceByCategory(v2Breakdown, v3Breakdown)
  const v2ComponentMaterial = extractV2ComponentMaterialByTrade(calc)
  const v3ComponentMaterial = extractV3ComponentMaterialByTrade(v3Quote.lineItems, catalogs)
  const componentMaterialVariance = computeComponentByTradeVariance(
    v2ComponentMaterial,
    v3ComponentMaterial,
  )
  const v2ComponentLabor = extractV2ComponentLaborByTrade(calc)
  const v3ComponentLabor = extractV3ComponentLaborByTrade(
    v3Quote.lineItems,
    catalogs,
    v3Quote.component_include_labor_burden !== false,
  )
  const componentLaborVariance = computeComponentByTradeVariance(
    v2ComponentLabor,
    v3ComponentLabor,
  )

  const notes: string[] = []
  if ((v2.breakdowns?.length ?? 0) > 0) {
    notes.push(
      `${v2.breakdowns?.length} v2 breakdown(s) → ${v3Quote.lineItems.filter((l) => l.type === 'drywall').length} drywall line(s)`,
    )
  }
  if (v3Quote.lineItems.some((l) => l.accessories_in_material_rate)) {
    notes.push('Converted lines suppress explicit accessories (v2 materialRate already blends them)')
  }
  if (v3Quote.lineItems.some((l) => l.custom_material_rate != null)) {
    notes.push('v3 lines carry custom_material_rate from v2 blended materialRate')
  }
  if (v3Quote.lineItems.some((l) => l.type !== 'drywall' && l.custom_labor_rate != null)) {
    notes.push('v3 component lines carry custom_labor_rate from v2 pre-burden labor base')
  }
  if (Math.abs(varianceByCategory.accessories) > 50) {
    notes.push('Accessory delta: new v3 quotes use explicit accessories; converted lines should suppress')
  }
  if (Math.abs(varianceByCategory.labor) > 100 && !v3Quote.hanger_include_labor_burden) {
    notes.push('Labor delta may reflect labor burden toggles')
  }
  for (const trade of COMPONENT_MATERIAL_TRADES) {
    if (Math.abs(componentMaterialVariance[trade]) > 0.01) {
      notes.push(
        `Component material ${trade}: v2 ${fmt(v2ComponentMaterial[trade])} vs v3 ${fmt(v3ComponentMaterial[trade])} (Δ ${fmt(componentMaterialVariance[trade])})`,
      )
    }
    if (Math.abs(componentLaborVariance[trade]) > 0.01) {
      notes.push(
        `Component labor ${trade}: v2 ${fmt(v2ComponentLabor[trade])} vs v3 ${fmt(v3ComponentLabor[trade])} (Δ ${fmt(componentLaborVariance[trade])})`,
      )
    }
  }

  return {
    id: project.id,
    name: project.name,
    v2GrandTotal,
    v3GrandTotal,
    v3HydratedGrandTotal,
    hydrateDelta,
    delta: v3GrandTotal - v2GrandTotal,
    deltaPct: v2GrandTotal !== 0 ? ((v3GrandTotal - v2GrandTotal) / v2GrandTotal) * 100 : 0,
    v2Breakdown: {
      materialDirect: v2Breakdown.materialDirect,
      laborDirect: v2Breakdown.laborDirect,
      accessoriesDirect: v2Breakdown.accessoriesDirect,
      cleanupDirect: v2Breakdown.cleanupDirect,
      markup: v2Breakdown.markup,
      grandTotal: v2GrandTotal,
    },
    v3Breakdown: {
      materialDirect: v3Breakdown.materialDirect,
      laborDirect: v3Breakdown.laborDirect,
      accessoriesDirect: v3Breakdown.accessoriesDirect,
      cleanupDirect: v3Breakdown.cleanupDirect,
      markup: v3Breakdown.markup,
      grandTotal: v3GrandTotal,
    },
    varianceByCategory,
    componentMaterialVariance,
    v2ComponentMaterial,
    v3ComponentMaterial,
    componentLaborVariance,
    v2ComponentLabor,
    v3ComponentLabor,
    notes,
  }
}

export function runParitySuite(
  projects: ParityProjectInput[],
  catalogsPayload: unknown,
): ParityProjectResult[] {
  const catalogs = parseOrgDrywallCatalogs(catalogsPayload)
  return projects.map((p) => runParityForProject(p, catalogs))
}

export function assertParityResults(results: ParityProjectResult[]): void {
  for (const r of results) {
    if (Math.abs(r.delta) > 0.01) {
      throw new Error(
        `${r.name}: Path A v3 ${fmt(r.v3GrandTotal)} != v2 baseline ${fmt(r.v2GrandTotal)} (delta ${fmt(r.delta)})`,
      )
    }
    if (Math.abs(r.hydrateDelta) > 0.01) {
      throw new Error(
        `${r.name}: Path B (hydrate) ${fmt(r.v3HydratedGrandTotal)} != Path A ${fmt(r.v3GrandTotal)} (hydrate delta ${fmt(r.hydrateDelta)})`,
      )
    }
    for (const trade of COMPONENT_MATERIAL_TRADES) {
      const d = r.componentMaterialVariance[trade]
      if (Math.abs(d) > 0.01) {
        throw new Error(
          `${r.name}: component material ${trade} v3 ${fmt(r.v3ComponentMaterial[trade])} != v2 ${fmt(r.v2ComponentMaterial[trade])} (delta ${fmt(d)})`,
        )
      }
      const laborDelta = r.componentLaborVariance[trade]
      if (Math.abs(laborDelta) > 0.01) {
        throw new Error(
          `${r.name}: component labor ${trade} v3 ${fmt(r.v3ComponentLabor[trade])} != v2 ${fmt(r.v2ComponentLabor[trade])} (delta ${fmt(laborDelta)})`,
        )
      }
    }
  }
}

/** Native v3 quotes (no legacy snapshot) should compute explicit accessories when flag is unset. */
export function runNativeV3AccessorySmoke(catalogs: OrgDrywallCatalogs): void {
  const quote = createEmptyDrywallQuoteV3()
  quote.lineItems = [
    {
      ...createQuoteLineItem('drywall'),
      quantity: 1000,
      finish_scope_id: 'level_4',
      catalog_id: '1_2_regular',
      waste_pct: 10,
    },
  ]

  const nativeTotals = computeQuoteV3Totals(quote, catalogs)
  if (nativeTotals.routine.accessoriesSubtotal <= 0) {
    throw new Error(
      `Native v3 smoke: expected explicit accessories > $0, got ${fmt(nativeTotals.routine.accessoriesSubtotal)}`,
    )
  }

  const suppressed = {
    ...quote,
    lineItems: [
      {
        ...quote.lineItems[0],
        accessories_in_material_rate: true as const,
      },
    ],
  }
  const suppressedTotals = computeQuoteV3Totals(suppressed, catalogs)
  if (Math.abs(suppressedTotals.routine.accessoriesSubtotal) > 0.01) {
    throw new Error(
      `Native v3 smoke: suppressed line should have $0 accessories, got ${fmt(suppressedTotals.routine.accessoriesSubtotal)}`,
    )
  }
}

export function printParityReport(results: ParityProjectResult[]): void {
  console.log('\n=== Quote v2 vs v3 parity (Path A convert + Path B hydrate) ===\n')

  const header = [
    'Project'.padEnd(24),
    'v2 Total'.padStart(12),
    'Path A'.padStart(12),
    'Path B'.padStart(12),
    'v2 Δ'.padStart(12),
    'Hydr Δ'.padStart(12),
  ].join(' ')
  console.log(header)
  console.log('-'.repeat(header.length))

  for (const r of results) {
    console.log(
      [
        r.name.slice(0, 24).padEnd(24),
        fmt(r.v2GrandTotal).padStart(12),
        fmt(r.v3GrandTotal).padStart(12),
        fmt(r.v3HydratedGrandTotal).padStart(12),
        fmt(r.delta).padStart(12),
        fmt(r.hydrateDelta).padStart(12),
      ].join(' '),
    )
  }

  console.log('\n--- Category variance (v3 − v2) ---\n')
  for (const r of results) {
    const v = r.varianceByCategory
    console.log(r.name)
    console.log(`  Material:     ${fmt(v.material)}`)
    console.log(`  Labor:        ${fmt(v.labor)}`)
    console.log(`  Accessories:  ${fmt(v.accessories)}`)
    console.log(`  Cleanup:      ${fmt(v.cleanup)}`)
    console.log(`  Markup/tax:   ${fmt(v.markup)}`)
    console.log(`  Misc/round:   ${fmt(v.misc)}`)
    console.log('  Component material (v3 − v2):')
    for (const trade of COMPONENT_MATERIAL_TRADES) {
      const v2m = r.v2ComponentMaterial[trade]
      const v3m = r.v3ComponentMaterial[trade]
      if (v2m === 0 && v3m === 0) continue
      console.log(
        `    ${trade.padEnd(16)} v2 ${fmt(v2m).padStart(10)}  v3 ${fmt(v3m).padStart(10)}  Δ ${fmt(r.componentMaterialVariance[trade])}`,
      )
    }
    console.log('  Component labor (v3 − v2, with burden):')
    for (const trade of COMPONENT_MATERIAL_TRADES) {
      const v2l = r.v2ComponentLabor[trade]
      const v3l = r.v3ComponentLabor[trade]
      if (v2l === 0 && v3l === 0) continue
      console.log(
        `    ${trade.padEnd(16)} v2 ${fmt(v2l).padStart(10)}  v3 ${fmt(v3l).padStart(10)}  Δ ${fmt(r.componentLaborVariance[trade])}`,
      )
    }
    if (r.notes.length) {
      console.log(`  Notes: ${r.notes.join('; ')}`)
    }
    console.log('')
  }
}
