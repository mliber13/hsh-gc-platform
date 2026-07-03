import { supabase } from '@/lib/supabase'
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import { requireUserOrgId } from '@/services/userService'

export type DrywallQbInvoiceReviewStatus = 'pending' | 'accepted' | 'rejected'

export interface QbInvoiceFromApi {
  qbInvoiceId: string
  docNumber: string
  txnDate: string
  totalAmt: number
  balance: number
  customerName: string
}

export interface DrywallQbInvoice {
  id: string
  organizationId: string
  qbInvoiceId: string
  qbCustomerName: string | null
  qbJobName: string | null
  docNumber: string | null
  txnDate: string | null
  totalAmt: number
  balance: number
  matchedProjectId: string | null
  matchedProjectName: string | null
  reviewStatus: DrywallQbInvoiceReviewStatus
  syncedAt: string
}

export interface SyncDrywallQbInvoicesResult {
  fetched: number
  matched: number
  unmatched: number
  pendingReview: number
  unmatchedNames: string[]
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** QB "Customer:Job" — use job segment after the last colon. */
export function qbJobNameFromCustomerName(customerName: string): string {
  const trimmed = customerName.trim()
  const i = trimmed.lastIndexOf(':')
  return i >= 0 ? trimmed.slice(i + 1).trim() : trimmed
}

function defaultSinceDate(): string {
  return `${new Date().getFullYear()}-01-01`
}

function defaultReviewStatus(
  existing: DrywallQbInvoiceReviewStatus | undefined,
  matched: boolean,
): DrywallQbInvoiceReviewStatus {
  if (existing) return existing
  return matched ? 'accepted' : 'pending'
}

type DbRow = {
  id: string
  organization_id: string
  qb_invoice_id: string
  qb_customer_name: string | null
  qb_job_name: string | null
  doc_number: string | null
  txn_date: string | null
  total_amt: number | string
  balance: number | string
  matched_project_id: string | null
  review_status: DrywallQbInvoiceReviewStatus
  synced_at: string
  projects?: { name: string | null } | { name: string | null }[] | null
}

function mapRow(row: DbRow): DrywallQbInvoice {
  const projectJoin = row.projects
  const projectName = Array.isArray(projectJoin)
    ? projectJoin[0]?.name ?? null
    : projectJoin?.name ?? null

  return {
    id: row.id,
    organizationId: row.organization_id,
    qbInvoiceId: row.qb_invoice_id,
    qbCustomerName: row.qb_customer_name,
    qbJobName: row.qb_job_name,
    docNumber: row.doc_number,
    txnDate: row.txn_date,
    totalAmt: Number(row.total_amt) || 0,
    balance: Number(row.balance) || 0,
    matchedProjectId: row.matched_project_id,
    matchedProjectName: projectName,
    reviewStatus: row.review_status,
    syncedAt: row.synced_at,
  }
}

export function sumIncludedQbInvoiceTotals(invoices: DrywallQbInvoice[]): {
  count: number
  totalAmt: number
  balance: number
} {
  const included = invoices.filter((row) => row.reviewStatus === 'accepted')
  return {
    count: included.length,
    totalAmt: included.reduce((sum, row) => sum + row.totalAmt, 0),
    balance: included.reduce((sum, row) => sum + row.balance, 0),
  }
}

export async function fetchDrywallQbInvoices(): Promise<DrywallQbInvoice[]> {
  const orgId = await requireUserOrgId()
  const { data, error } = await supabase
    .from('drywall_qb_invoices')
    .select(
      'id, organization_id, qb_invoice_id, qb_customer_name, qb_job_name, doc_number, txn_date, total_amt, balance, matched_project_id, review_status, synced_at, projects:matched_project_id ( name )',
    )
    .eq('organization_id', orgId)
    .order('txn_date', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load QuickBooks invoices')
  return (data ?? []).map((row) => mapRow(row as DbRow))
}

export async function setDrywallQbInvoiceStatus(
  id: string,
  status: DrywallQbInvoiceReviewStatus,
): Promise<void> {
  const orgId = await requireUserOrgId()
  const { data, error } = await supabase
    .from('drywall_qb_invoices')
    .update({ review_status: status })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message || 'Failed to update invoice status')
  if (!data) {
    throw new Error('Invoice not found or update was not permitted')
  }
}

export async function syncDrywallQbInvoices(
  sinceDate?: string,
): Promise<SyncDrywallQbInvoicesResult> {
  const orgId = await requireUserOrgId()
  const effectiveSince = sinceDate?.trim() || defaultSinceDate()

  const { data, error } = await supabase.functions.invoke('qb-get-invoices', {
    body: { sinceDate: effectiveSince },
  })

  if (error) {
    throw new Error(error.message || 'Failed to fetch invoices from QuickBooks')
  }

  if (data?.error === 'QuickBooks not connected') {
    throw new Error('QuickBooks not connected')
  }
  if (data?.error) {
    throw new Error(String(data.error))
  }

  const invoices = (data?.invoices ?? []) as QbInvoiceFromApi[]
  const projects = await fetchDrywallProjects()
  const projectByName = new Map<string, { id: string; name: string }>()
  for (const p of projects) {
    const key = normalizeName(p.name)
    if (key && !projectByName.has(key)) {
      projectByName.set(key, { id: p.id, name: p.name })
    }
  }

  const { data: existingRows } = await supabase
    .from('drywall_qb_invoices')
    .select('qb_invoice_id, review_status')
    .eq('organization_id', orgId)

  const reviewByQbId = new Map<string, DrywallQbInvoiceReviewStatus>()
  for (const row of existingRows ?? []) {
    reviewByQbId.set(row.qb_invoice_id, row.review_status as DrywallQbInvoiceReviewStatus)
  }

  const unmatchedNamesSet = new Set<string>()
  const upsertRows: Record<string, unknown>[] = []
  const syncedAt = new Date().toISOString()
  let matched = 0
  let unmatched = 0

  for (const inv of invoices) {
    const jobName = qbJobNameFromCustomerName(inv.customerName ?? '')
    const project = projectByName.get(normalizeName(jobName))
    if (project) {
      matched += 1
    } else {
      unmatched += 1
      if (jobName.trim()) unmatchedNamesSet.add(jobName.trim())
    }

    upsertRows.push({
      organization_id: orgId,
      qb_invoice_id: inv.qbInvoiceId,
      qb_customer_name: inv.customerName || null,
      qb_job_name: jobName || null,
      doc_number: inv.docNumber || null,
      txn_date: inv.txnDate || null,
      total_amt: inv.totalAmt,
      balance: inv.balance,
      matched_project_id: project?.id ?? null,
      review_status: defaultReviewStatus(reviewByQbId.get(inv.qbInvoiceId), !!project),
      synced_at: syncedAt,
    })
  }

  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase
      .from('drywall_qb_invoices')
      .upsert(upsertRows, { onConflict: 'organization_id,qb_invoice_id' })

    if (upsertError) {
      throw new Error(upsertError.message || 'Failed to save invoices')
    }
  }

  const { count: pendingReview, error: pendingError } = await supabase
    .from('drywall_qb_invoices')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('review_status', 'pending')

  if (pendingError) {
    throw new Error(pendingError.message || 'Failed to count pending invoices')
  }

  return {
    fetched: invoices.length,
    matched,
    unmatched,
    pendingReview: pendingReview ?? 0,
    unmatchedNames: Array.from(unmatchedNamesSet).sort((a, b) => a.localeCompare(b)),
  }
}
