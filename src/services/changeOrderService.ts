// ============================================================================
// GC change orders — the Supabase writer the page never had (P0-GC-1)
// ============================================================================
//
// `ChangeOrders.tsx` used to call `updateProject` from `@/services`, which is the
// synchronous localStorage writer. Online — which is every real session — the page loaded
// from Supabase, found no `actuals.changeOrders`, and showed nothing; saving wrote to
// `localStorage['hsh_gc_projects']` where nothing would ever read it again. The
// `change_orders` table has RLS and 0 rows.
//
// Errors here throw rather than falling back to local storage. A change order that appears
// to save and is gone tomorrow is worse than one that refuses to save — that lesson is
// already written down for the payroll editor and for `actualsHybridService`.

import { supabase } from '@/lib/supabase'
import type { ChangeOrder, Trade } from '@/types'

/** Row shape of `public.change_orders` as the app uses it. */
type ChangeOrderRow = {
  id: string
  project_id: string
  title: string | null
  description: string | null
  status: string | null
  cost_impact: number | string | null
  affected_trades: unknown
  requested_date: string | null
  approved_date: string | null
  implemented_date: string | null
  notes: string | null
  created_at?: string | null
  updated_at?: string | null
  change_order_number: string | null
  requested_by: string | null
  schedule_impact_days: number | string | null
  approved_by: string | null
  rejection_reason: string | null
  actual_cost: number | string | null
}

const COLUMNS =
  'id, project_id, title, description, status, cost_impact, affected_trades, ' +
  'requested_date, approved_date, implemented_date, notes, created_at, updated_at, ' +
  'change_order_number, ' +
  'requested_by, schedule_impact_days, approved_by, rejection_reason, actual_cost'

const STATUSES: ChangeOrder['status'][] = [
  'draft',
  'pending-approval',
  'approved',
  'rejected',
  'implemented',
]

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** `undefined` for a missing date — `new Date(null)` is 1970, which would read as real. */
function optionalDate(value: string | null): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function normalizeStatus(value: string | null): ChangeOrder['status'] {
  const found = STATUSES.find((s) => s === value)
  // Rows written before the status CHECK landed could hold the old 'pending' default.
  return found ?? 'draft'
}

/** DB row → the `ChangeOrder` the GC components already render. Pure, so it is testable. */
export function changeOrderFromRow(row: ChangeOrderRow): ChangeOrder {
  return {
    id: row.id,
    projectId: row.project_id,
    changeOrderNumber: row.change_order_number ?? '',
    title: row.title ?? '',
    description: row.description ?? '',
    status: normalizeStatus(row.status),
    requestedBy: row.requested_by ?? '',
    requestDate: optionalDate(row.requested_date) ?? new Date(),
    trades: Array.isArray(row.affected_trades) ? (row.affected_trades as Trade[]) : [],
    costImpact: num(row.cost_impact),
    scheduleImpact: num(row.schedule_impact_days),
    approvedBy: row.approved_by ?? undefined,
    approvalDate: optionalDate(row.approved_date),
    rejectionReason: row.rejection_reason ?? undefined,
    implementedDate: optionalDate(row.implemented_date),
    actualCost: row.actual_cost == null ? undefined : num(row.actual_cost),
    notes: row.notes ?? undefined,
    createdAt: optionalDate(row.created_at ?? null) ?? new Date(),
    updatedAt: optionalDate(row.updated_at ?? null) ?? new Date(),
  }
}

/**
 * `ChangeOrder` → the writable columns. Pure, so it is testable.
 *
 * `id`, `user_id` and `organization_id` are deliberately absent: the first is the key, and
 * the other two are stamped by the caller from the session.
 */
export function changeOrderToRow(
  projectId: string,
  co: ChangeOrder,
): Omit<ChangeOrderRow, 'id' | 'project_id'> & { project_id: string } {
  return {
    project_id: projectId,
    title: co.title?.trim() || 'Untitled change order',
    description: co.description ?? '',
    status: co.status,
    cost_impact: num(co.costImpact),
    affected_trades: co.trades ?? [],
    requested_date: (co.requestDate ? new Date(co.requestDate) : new Date()).toISOString(),
    approved_date: co.approvalDate ? new Date(co.approvalDate).toISOString() : null,
    implemented_date: co.implementedDate ? new Date(co.implementedDate).toISOString() : null,
    notes: co.notes ?? null,
    change_order_number: co.changeOrderNumber?.trim() || null,
    requested_by: co.requestedBy?.trim() || null,
    schedule_impact_days: Math.trunc(num(co.scheduleImpact)),
    approved_by: co.approvedBy?.trim() || null,
    rejection_reason: co.rejectionReason?.trim() || null,
    actual_cost: co.actualCost == null ? null : num(co.actualCost),
  }
}

/** Every change order on a project, oldest first so CO numbers read in order. */
export async function fetchChangeOrders(projectId: string): Promise<ChangeOrder[]> {
  const { data, error } = await supabase
    .from('change_orders')
    .select(COLUMNS)
    .eq('project_id', projectId)
    .order('requested_date', { ascending: true })

  if (error) throw new Error(error.message || 'Could not load change orders')
  return ((data ?? []) as unknown as ChangeOrderRow[]).map(changeOrderFromRow)
}

/**
 * Insert or update one change order, and return what the database actually stored.
 *
 * The returned row is the source of truth for the caller's state: a client-side object
 * echoed back would hide a column the database rejected or defaulted.
 */
export async function saveChangeOrder(
  projectId: string,
  co: ChangeOrder,
  opts?: { isNew?: boolean },
): Promise<ChangeOrder> {
  const row = changeOrderToRow(projectId, co)

  if (opts?.isNew) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('You are signed out — sign in again to save this change order')

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.organization_id) {
      throw new Error('Your account has no organization, so this change order cannot be saved')
    }

    const { data, error } = await supabase
      .from('change_orders')
      .insert({ ...row, user_id: user.id, organization_id: profile.organization_id })
      .select(COLUMNS)
      .single()

    if (error) {
      // The unique index is on (project_id, change_order_number).
      if (error.code === '23505') {
        throw new Error(
          `Change order ${row.change_order_number ?? ''} already exists on this project`.trim(),
        )
      }
      throw new Error(error.message || 'Could not save the change order')
    }
    return changeOrderFromRow(data as unknown as ChangeOrderRow)
  }

  // PostgREST reports success on an UPDATE that matched zero rows, so the returned row is
  // the only proof it landed — RLS refusing the write looks identical otherwise.
  const { data, error } = await supabase
    .from('change_orders')
    .update(row)
    .eq('id', co.id)
    .select(COLUMNS)

  if (error) throw new Error(error.message || 'Could not save the change order')
  if (!data || data.length === 0) {
    throw new Error('That change order could not be updated — reload the page and try again')
  }
  return changeOrderFromRow(data[0] as unknown as ChangeOrderRow)
}

export async function deleteChangeOrder(changeOrderId: string): Promise<void> {
  const { data, error } = await supabase
    .from('change_orders')
    .delete()
    .eq('id', changeOrderId)
    .select('id')

  if (error) throw new Error(error.message || 'Could not delete the change order')
  if (!data || data.length === 0) {
    throw new Error('That change order could not be deleted — reload the page and try again')
  }
}

/**
 * The next free CO number on a project.
 *
 * The form derived this from `existingCOs.length + 1`, which repeats as soon as one is
 * deleted — and the unique index now refuses the duplicate. Take the highest number in use
 * rather than the count.
 */
export function nextChangeOrderNumber(existing: ChangeOrder[]): string {
  let highest = 0
  for (const co of existing) {
    const match = /(\d+)\s*$/.exec(co.changeOrderNumber ?? '')
    if (!match) continue
    const n = parseInt(match[1], 10)
    if (Number.isFinite(n) && n > highest) highest = n
  }
  return `CO-${String(highest + 1).padStart(3, '0')}`
}
