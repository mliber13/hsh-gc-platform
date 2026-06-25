import type { DrywallProjectListItem, DrywallProjectStatus } from '@/types/drywall'
import { isDrywallProjectClosed, normalizeDrywallProjectStatus } from '@/types/drywall'

/** Quote stage: substantive sqft or total from list scalar projection. */
export function listItemHasQuoteData(
  p: Pick<DrywallProjectListItem, 'sqft' | 'quoteTotal'>,
): boolean {
  return (p.sqft != null && p.sqft > 0) || (p.quoteTotal != null && p.quoteTotal > 0)
}

function statusAtOrPastField(status: string): boolean {
  const s = normalizeDrywallProjectStatus(status)
  return (
    s === 'field-measurement' ||
    s === 'order' ||
    s === 'production' ||
    s === 'production-complete' ||
    s === 'closed'
  )
}

/** Field stage: takeoff scalars (RPC) or workflow status past quote when quote exists. */
export function listItemHasFieldData(
  p: Pick<
    DrywallProjectListItem,
    'sqft' | 'quoteTotal' | 'status' | 'fieldMeasuredSqft' | 'fieldTakeoffUpdated' | 'fieldFirstMeasurementId'
  >,
): boolean {
  if (p.fieldMeasuredSqft != null && p.fieldMeasuredSqft > 0) return true
  if (p.fieldTakeoffUpdated) return true
  if (p.fieldFirstMeasurementId) return true
  if (!listItemHasQuoteData(p)) return false
  return statusAtOrPastField(String(p.status))
}

/** Order stage: legacy.orders[] entry (RPC) or active order workflow status. */
export function listItemHasOrderData(
  p: Pick<DrywallProjectListItem, 'sqft' | 'quoteTotal' | 'status' | 'orderFirstId'>,
): boolean {
  if (p.orderFirstId) return true
  if (!listItemHasQuoteData(p)) return false
  return (p.status as DrywallProjectStatus | string) === 'order'
}
