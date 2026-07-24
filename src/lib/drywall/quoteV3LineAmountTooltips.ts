import {
  componentLaborRateUnitSuffix,
  getEffectiveComponentLaborRate,
  getEffectiveFinisherRate,
  getEffectiveHangerRate,
  getLineMaterialRate,
  getLineUnit,
  materialRateUnitSuffix,
} from './quoteV3CatalogResolve'
import { includeLaborBurden, LABOR_TAX_RATE } from './calculations/quantityUtils'
import { formatQuoteMoney, type QuoteV3LaborBurdenOptions, type QuoteV3LineComputed } from './quoteV3Math'
import type { QuoteLineItem } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

function formatQty(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatRate(rate: number, suffix: string): string {
  const dollars = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(rate)
  return `${dollars}${suffix}`
}

export function materialAmountTooltip(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
  computed: QuoteV3LineComputed,
): string | undefined {
  const qty = line.quantity || 0
  if (qty === 0 && computed.materialTotal === 0) return undefined

  const unit = getLineUnit(line, catalogs)
  const rate = getLineMaterialRate(line, catalogs)
  const rateLabel = formatRate(rate, materialRateUnitSuffix(line, catalogs))
  const total = formatQuoteMoney(computed.materialTotal)

  if (line.type === 'drywall') {
    const wastePct = line.waste_pct ?? 10
    const wasteMult = 1 + wastePct / 100
    if (wasteMult !== 1) {
      return `${formatQty(qty)} ${unit} × ${rateLabel} × ${wasteMult.toFixed(2)} waste = ${total}`
    }
  }

  return `${formatQty(qty)} ${unit} × ${rateLabel} = ${total}`
}

export function laborAmountTooltip(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
  computed: QuoteV3LineComputed,
  laborBurden?: QuoteV3LaborBurdenOptions,
): string | undefined {
  const qty = line.quantity || 0
  if (qty === 0 && computed.laborTotal === 0) return undefined

  if (line.type === 'drywall') {
    const wastePct = line.waste_pct ?? 10
    const wasteMult = 1 + wastePct / 100
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
    const hangerLabel = formatRate(hangerRate, '/sqft')
    const finisherLabel = formatRate(finisherRate, '/sqft')
    const sqftLabel = formatQty(effectiveSqft)
    const hangerBurdened = includeLaborBurden(laborBurden?.hangerIncludeLaborBurden)
    const finisherBurdened = includeLaborBurden(laborBurden?.finisherIncludeLaborBurden)
    const burdenNote =
      hangerBurdened || finisherBurdened
        ? ` incl. ${(LABOR_TAX_RATE * 100).toFixed(0)}% labor burden`
        : ''
    const wasteNote = wasteMult !== 1 ? ` (${formatQty(qty)} sqft × ${wasteMult.toFixed(2)} waste)` : ''
    return `${sqftLabel} sqft${wasteNote} × ${hangerLabel} hanger + ${sqftLabel} sqft × ${finisherLabel} finisher${burdenNote} = ${formatQuoteMoney(computed.laborTotal)}`
  }

  const unit = getLineUnit(line, catalogs)
  const laborRate = getEffectiveComponentLaborRate(line, catalogs)
  const rateLabel = formatRate(laborRate, componentLaborRateUnitSuffix(line, catalogs))
  return `${formatQty(qty)} ${unit} × ${rateLabel} labor = ${formatQuoteMoney(computed.laborTotal)}`
}

export function accessoriesAmountTooltip(computed: QuoteV3LineComputed): string | undefined {
  if (computed.accessoriesTotal === 0 || computed.accessories.items.length === 0) return undefined
  const lines = computed.accessories.items.map(
    (i) => `${i.units} ${i.unit} ${i.display_name} × ${formatQuoteMoney(i.unitRate)} = ${formatQuoteMoney(i.cost)}`,
  )
  return [...lines, `Total accessories ${formatQuoteMoney(computed.accessoriesTotal)}`].join('\n')
}

export function lineTotalAmountTooltip(computed: QuoteV3LineComputed): string | undefined {
  if (computed.lineTotal === 0) return undefined
  const parts = [
    `Material ${formatQuoteMoney(computed.materialTotal)}`,
    `Labor ${formatQuoteMoney(computed.laborTotal)}`,
  ]
  if (computed.accessoriesTotal > 0) {
    parts.push(`Accessories ${formatQuoteMoney(computed.accessoriesTotal)}`)
  }
  return `${parts.join(' + ')} = ${formatQuoteMoney(computed.lineTotal)}`
}

export function showsMaterialWasteHint(line: QuoteLineItem): boolean {
  if (line.type !== 'drywall' && line.type !== 'rc_channel') return false
  const wastePct = line.waste_pct ?? 10
  return wastePct > 0
}
