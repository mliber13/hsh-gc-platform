// What the close-out checklist needs from QuickBooks that the cost assessment does not carry:
// how many of the job's bills and invoices are still waiting for a person (closeoutChecklist.ts).
// Head counts only — no rows shipped.

import { supabase } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'

export interface CloseoutSignals {
  materialPending: number
  materialAccepted: number
  invoicePending: number
}

async function countRows(
  table: 'drywall_qb_materials' | 'drywall_qb_invoices',
  orgId: string,
  projectId: string,
  status: 'pending' | 'accepted',
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('matched_project_id', projectId)
    .eq('review_status', status)
  if (error) throw new Error(error.message || `Failed to count ${table}`)
  return count ?? 0
}

export async function fetchCloseoutSignals(projectId: string): Promise<CloseoutSignals> {
  const orgId = await requireUserOrgId()
  const [materialPending, materialAccepted, invoicePending] = await Promise.all([
    countRows('drywall_qb_materials', orgId, projectId, 'pending'),
    countRows('drywall_qb_materials', orgId, projectId, 'accepted'),
    countRows('drywall_qb_invoices', orgId, projectId, 'pending'),
  ])
  return { materialPending, materialAccepted, invoicePending }
}
