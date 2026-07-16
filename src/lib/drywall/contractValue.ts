import type { DrywallChangeOrder } from '@/types/drywall'

export interface ContractValueResult {
  baseContractValue: number | null
  acceptedChangeOrderRevenue: number
  effectiveContractValue: number | null
  billedToDate: number
  remainingToBill: number | null
  overbilledAmount: number
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function finite(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function acceptedChangeOrderTotal(changeOrders: DrywallChangeOrder[] = []): number {
  return changeOrders.reduce((sum, changeOrder) => {
    const status = String(changeOrder.status ?? '').trim().toLowerCase()
    if (status !== 'accepted' && status !== 'approved') return sum
    const amount = finite(
      changeOrder.acceptedAmount ??
        (status === 'approved' ? changeOrder.requestedAmount : undefined),
    )
    return sum + (amount ?? 0)
  }, 0)
}

export function resolveBaseContractValue(input: {
  quote?: unknown
  po?: unknown
}): number | null {
  const quote = record(input.quote)
  const snapshot = record(quote?.bidSnapshot)
  const calculations = record(quote?.calculations)
  const snapshotTotal = finite(snapshot?.total)
  if (snapshotTotal != null && snapshotTotal > 0) return snapshotTotal
  const finalTotal = finite(calculations?.finalTotal)
  if (finalTotal != null && finalTotal > 0) return finalTotal
  const quoteTotal = finite(quote?.totalQuoteAmount)
  if (quoteTotal != null && quoteTotal > 0) return quoteTotal

  const po = record(input.po)
  const sqft = finite(po?.customerSqft)
  const rate = finite(po?.agreedUnitRate)
  const poTotal = sqft != null && rate != null ? sqft * rate : null
  return poTotal != null && poTotal > 0 ? poTotal : null
}

export function computeContractValue(input: {
  quote?: unknown
  po?: unknown
  changeOrders?: DrywallChangeOrder[]
  billedToDate?: unknown
}): ContractValueResult {
  const baseContractValue = resolveBaseContractValue(input)
  const acceptedChangeOrderRevenue = acceptedChangeOrderTotal(input.changeOrders)
  const effectiveContractValue =
    baseContractValue == null ? null : baseContractValue + acceptedChangeOrderRevenue
  const billedToDate = finite(input.billedToDate) ?? 0
  // Snap the remaining/overbilled gap to cents so sub-cent float drift (quote math vs QB)
  // cannot flip a fully-billed job into a phantom overbill. Leave the raw totals unrounded.
  const roundCents = (n: number) => Math.round(n * 100) / 100
  const difference =
    effectiveContractValue == null ? null : roundCents(effectiveContractValue - billedToDate)

  return {
    baseContractValue,
    acceptedChangeOrderRevenue,
    effectiveContractValue,
    billedToDate,
    remainingToBill: difference == null ? null : Math.max(0, difference),
    overbilledAmount: difference == null ? 0 : Math.max(0, -difference),
  }
}

export function computeContractValueFromLegacy(
  legacy: Record<string, unknown>,
  billedToDate: unknown = 0,
): ContractValueResult {
  const rawChangeOrders = Array.isArray(legacy.changeOrders) ? legacy.changeOrders : []
  const changeOrders = rawChangeOrders.filter(
    (item): item is DrywallChangeOrder => Boolean(record(item)),
  )
  return computeContractValue({
    quote: legacy.quote,
    po: legacy.poData ?? legacy.po,
    changeOrders,
    billedToDate,
  })
}
