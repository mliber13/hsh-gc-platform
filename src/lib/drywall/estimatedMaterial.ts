import { computeLineItem, computeQuoteV3Totals } from '@/lib/drywall/quoteV3Math'
import type { DrywallQuote, DrywallQuoteV2V3, QuoteLineItemType } from '@/types/drywall'
import { isDrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

export interface EstimatedMaterialComponent {
  key: string
  label: string
  amount: number
}

export interface EstimatedMaterialBreakdown {
  components: EstimatedMaterialComponent[]
  salesTax: number
  totalPreTax: number
  totalWithTax: number
}

const COMPONENT_LABELS: Record<string, string> = {
  drywall: 'Drywall (board + accessories)',
  suspended_grid: 'Suspended Grid',
  rc_channel: 'RC Channel',
  insulation: 'Insulation',
  acoustic: 'Acoustic Ceiling',
  metal_stud: 'Metal Stud Framing',
  frp: 'FRP',
}

const V2_OTHER_COMPONENT_FIELDS: Array<{ key: string; field: string }> = [
  { key: 'suspended_grid', field: 'suspendedGridMaterialCost' },
  { key: 'rc_channel', field: 'rcChannelMaterialCost' },
  { key: 'insulation', field: 'insulationMaterialCost' },
  { key: 'acoustic', field: 'acousticCeilingMaterialCost' },
  { key: 'metal_stud', field: 'metalStudMaterialCost' },
  { key: 'frp', field: 'frpMaterialCost' },
]

const V3_LINE_TYPES: QuoteLineItemType[] = [
  'drywall',
  'suspended_grid',
  'rc_channel',
  'insulation',
  'acoustic',
  'metal_stud',
  'frp',
]

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function emptyEstimatedMaterialBreakdown(): EstimatedMaterialBreakdown {
  return {
    components: [],
    salesTax: 0,
    totalPreTax: 0,
    totalWithTax: 0,
  }
}

function buildBreakdown(
  amountsByKey: Map<string, number>,
  salesTax: number,
  totals?: { totalPreTax: number; totalWithTax: number },
): EstimatedMaterialBreakdown {
  const components: EstimatedMaterialComponent[] = []
  for (const [key, amount] of amountsByKey) {
    if (amount <= 0) continue
    components.push({
      key,
      label: COMPONENT_LABELS[key] ?? key,
      amount,
    })
  }
  components.sort((a, b) => b.amount - a.amount)

  const tax = num(salesTax)
  const componentSum = components.reduce((sum, row) => sum + row.amount, 0)
  const totalWithTax = totals?.totalWithTax ?? componentSum + tax
  const totalPreTax = totals?.totalPreTax ?? componentSum

  return {
    components,
    salesTax: tax,
    totalPreTax,
    totalWithTax,
  }
}

function computeEstimatedMaterialV2(quote: DrywallQuote): EstimatedMaterialBreakdown {
  const calc = quote.calculations ?? {}
  const c = calc as Record<string, unknown>

  const frpMaterial = num(c.frpMaterialCost)
  const frpTax = num(c.frpSalesTax)
  const salesTax = num(c.salesTax) + frpTax
  const totalWithTax = num(c.totalMaterialCost) + frpMaterial + frpTax
  const totalPreTax = totalWithTax - salesTax

  const drywallPreTax =
    num(c.standardDrywallMaterialCost) - num(c.standardDrywallSalesTax)

  const amountsByKey = new Map<string, number>()
  amountsByKey.set('drywall', drywallPreTax)
  for (const { key, field } of V2_OTHER_COMPONENT_FIELDS) {
    amountsByKey.set(key, num(c[field]))
  }

  return buildBreakdown(amountsByKey, salesTax, { totalPreTax, totalWithTax })
}

function computeEstimatedMaterialV3(
  quote: Extract<DrywallQuoteV2V3, { version: 3 }>,
  catalogs: OrgDrywallCatalogs,
): EstimatedMaterialBreakdown {
  const amountsByKey = new Map<string, number>()
  for (const type of V3_LINE_TYPES) {
    amountsByKey.set(type, 0)
  }

  for (const line of quote.lineItems) {
    const computed = computeLineItem(line, catalogs)
    const lineMaterial =
      computed.materialTotal + (line.type === 'drywall' ? computed.accessoriesTotal : 0)
    amountsByKey.set(line.type, (amountsByKey.get(line.type) ?? 0) + lineMaterial)
  }

  const salesTax = computeQuoteV3Totals(quote, catalogs).routine.salesTaxAmount
  return buildBreakdown(amountsByKey, salesTax)
}

export function computeEstimatedMaterial(
  quote: DrywallQuoteV2V3,
  catalogs: OrgDrywallCatalogs | null,
): EstimatedMaterialBreakdown {
  if (isDrywallQuoteV3(quote)) {
    if (!catalogs) return emptyEstimatedMaterialBreakdown()
    return computeEstimatedMaterialV3(quote, catalogs)
  }
  return computeEstimatedMaterialV2(quote)
}
