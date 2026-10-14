/**
 * Which order a schedule item's "Attach order sheet" should open.
 *
 * Two features create a job's first order. Advancing field → order seeds a draft from the
 * takeoff (buildAutoDraftOrderFromTakeoff, 2026-08-17) so the job lands on the supplier board;
 * since late September orders start from a stock schedule item. The second never retired the
 * first, so attaching from the schedule item built a SECOND order with the same items and left
 * the seeded draft orphaned: five jobs between 2026-10-01 and 10-12 (Burton - Hutchinson,
 * Mentor - Evanko, 3149 Coy Dr, Moreland Hills - Mario, MC Townhouse 106), 12–23s apart.
 *
 * Rule: the schedule item's own order if it has one; otherwise adopt the job's ONE unattached
 * draft — it is the order this item is about to create. Two or more is ambiguous, so none is
 * adopted and a new order is made, as before.
 */
import type { DrywallOrder } from '@/types/drywall'

export function isUnattachedDraftOrder(order: DrywallOrder): boolean {
  return order.status === 'draft' && !order.scheduleItemId
}

export function orderForScheduleItem(
  orders: DrywallOrder[],
  scheduleItemId: string,
): { order: DrywallOrder | null; adopted: boolean } {
  const linked = orders.find((o) => o.scheduleItemId === scheduleItemId)
  if (linked) return { order: linked, adopted: false }
  const unattached = orders.filter(isUnattachedDraftOrder)
  if (unattached.length === 1) return { order: unattached[0], adopted: true }
  return { order: null, adopted: false }
}
