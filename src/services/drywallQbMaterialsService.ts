import { supabase } from '@/lib/supabase'
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import { requireUserOrgId } from '@/services/userService'
import { normalizeName, qbJobNameFromCustomerName, fetchAcceptedOffSystemInvoiceJobNames } from '@/services/drywallQbRevenueService'

export type DrywallQbMaterialReviewStatus = 'pending' | 'accepted' | 'rejected'

export interface QbMaterialTransactionFromApi {
  qbTransactionId: string
  qbTransactionType: string
  qbLineId?: string | null
  vendorName: string
  txnDate: string
  docNumber: string
  amount: number
  accountType: string
  qbProjectId: string | null
  qbProjectName: string | null
  description: string
}

export interface DrywallQbMaterial {
  id: string
  organizationId: string
  qbTransactionId: string
  qbTransactionType: string | null
  qbLineId: string
  vendorName: string | null
  qbJobName: string | null
  docNumber: string | null
  txnDate: string | null
  amount: number
  matchedProjectId: string | null
  matchedProjectName: string | null
  reviewStatus: DrywallQbMaterialReviewStatus
  syncedAt: string
}

export interface SyncDrywallQbMaterialsResult {
  fetched: number
  matched: number
  offSystemMatched: number
  unmatched: number
  pendingReview: number
  unmatchedNames: string[]
}

function defaultSinceDate(): string {
  return `${new Date().getFullYear()}-01-01`
}

function defaultReviewStatus(
  existing: DrywallQbMaterialReviewStatus | undefined,
  preBlessed: boolean,
): DrywallQbMaterialReviewStatus {
  if (existing) return existing
  return preBlessed ? 'accepted' : 'pending'
}

function materialDedupKey(
  qbTransactionId: string,
  qbTransactionType: string | null | undefined,
  qbLineId: string | null | undefined,
): string {
  return `${qbTransactionType ?? ''}:${qbTransactionId}:${qbLineId ?? ''}`
}

type DbRow = {
  id: string
  organization_id: string
  qb_transaction_id: string
  qb_transaction_type: string | null
  qb_line_id: string
  vendor_name: string | null
  qb_job_name: string | null
  doc_number: string | null
  txn_date: string | null
  amount: number | string
  matched_project_id: string | null
  review_status: DrywallQbMaterialReviewStatus
  synced_at: string
  projects?: { name: string | null } | { name: string | null }[] | null
}

function mapRow(row: DbRow): DrywallQbMaterial {
  const projectJoin = row.projects
  const projectName = Array.isArray(projectJoin)
    ? projectJoin[0]?.name ?? null
    : projectJoin?.name ?? null

  return {
    id: row.id,
    organizationId: row.organization_id,
    qbTransactionId: row.qb_transaction_id,
    qbTransactionType: row.qb_transaction_type,
    qbLineId: row.qb_line_id,
    vendorName: row.vendor_name,
    qbJobName: row.qb_job_name,
    docNumber: row.doc_number,
    txnDate: row.txn_date,
    amount: Number(row.amount) || 0,
    matchedProjectId: row.matched_project_id,
    matchedProjectName: projectName,
    reviewStatus: row.review_status,
    syncedAt: row.synced_at,
  }
}

export function includedMaterialTotal(materials: DrywallQbMaterial[]): {
  count: number
  amount: number
} {
  const included = materials.filter((row) => row.reviewStatus === 'accepted')
  return {
    count: included.length,
    amount: included.reduce((sum, row) => sum + row.amount, 0),
  }
}

export async function fetchDrywallQbMaterials(): Promise<DrywallQbMaterial[]> {
  const orgId = await requireUserOrgId()
  const { data, error } = await supabase
    .from('drywall_qb_materials')
    .select(
      'id, organization_id, qb_transaction_id, qb_transaction_type, qb_line_id, vendor_name, qb_job_name, doc_number, txn_date, amount, matched_project_id, review_status, synced_at, projects:matched_project_id ( name )',
    )
    .eq('organization_id', orgId)
    .order('txn_date', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load QuickBooks materials')
  return (data ?? []).map((row) => mapRow(row as DbRow))
}

export async function setDrywallQbMaterialStatus(
  id: string,
  status: DrywallQbMaterialReviewStatus,
): Promise<void> {
  const orgId = await requireUserOrgId()
  const { data, error } = await supabase
    .from('drywall_qb_materials')
    .update({ review_status: status })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message || 'Failed to update material status')
  if (!data) {
    throw new Error('Material row not found or update was not permitted')
  }
}

export async function syncDrywallQbMaterials(
  sinceDate?: string,
): Promise<SyncDrywallQbMaterialsResult> {
  const orgId = await requireUserOrgId()
  const effectiveSince = sinceDate?.trim() || defaultSinceDate()
  const offSystemInvoiceJobNames = await fetchAcceptedOffSystemInvoiceJobNames()
  const offSystemInvoiceByName = new Set(offSystemInvoiceJobNames.map(normalizeName))

  const { data, error } = await supabase.functions.invoke('qb-get-job-transactions', {
    body: {
      sinceDate: effectiveSince,
      projectScope: 'drywall',
      extraJobNames: offSystemInvoiceJobNames,
    },
  })

  if (error) {
    throw new Error(error.message || 'Failed to fetch material costs from QuickBooks')
  }

  if (data?.error === 'QuickBooks not connected') {
    throw new Error('QuickBooks not connected')
  }
  if (data?.error) {
    throw new Error(String(data.error))
  }

  const allTransactions = (data?.transactions ?? []) as QbMaterialTransactionFromApi[]
  const transactions = allTransactions.filter((txn) => txn.accountType === 'Job Materials')

  const projects = await fetchDrywallProjects()
  const projectByName = new Map<string, { id: string; name: string }>()
  for (const p of projects) {
    const key = normalizeName(p.name)
    if (key && !projectByName.has(key)) {
      projectByName.set(key, { id: p.id, name: p.name })
    }
  }

  const { data: existingRows } = await supabase
    .from('drywall_qb_materials')
    .select('qb_transaction_id, qb_transaction_type, qb_line_id, review_status')
    .eq('organization_id', orgId)

  const reviewByKey = new Map<string, DrywallQbMaterialReviewStatus>()
  for (const row of existingRows ?? []) {
    reviewByKey.set(
      materialDedupKey(row.qb_transaction_id, row.qb_transaction_type, row.qb_line_id),
      row.review_status as DrywallQbMaterialReviewStatus,
    )
  }

  const unmatchedNamesSet = new Set<string>()
  const upsertRows: Record<string, unknown>[] = []
  const syncedAt = new Date().toISOString()
  let matched = 0
  let offSystemMatched = 0
  let unmatched = 0

  for (const txn of transactions) {
    const rawJobName = txn.qbProjectName?.trim() || ''
    const jobName = rawJobName ? qbJobNameFromCustomerName(rawJobName) : ''
    const project = jobName ? projectByName.get(normalizeName(jobName)) : undefined
    const isOffSystemInvoiceJob =
      !project && !!jobName && offSystemInvoiceByName.has(normalizeName(jobName))
    const preBlessed = !!project || isOffSystemInvoiceJob

    if (project) {
      matched += 1
    } else if (isOffSystemInvoiceJob) {
      offSystemMatched += 1
    } else {
      unmatched += 1
      if (jobName.trim()) unmatchedNamesSet.add(jobName.trim())
    }

    const lineId = txn.qbLineId != null ? String(txn.qbLineId) : ''
    const dedupKey = materialDedupKey(txn.qbTransactionId, txn.qbTransactionType, lineId)

    upsertRows.push({
      organization_id: orgId,
      qb_transaction_id: txn.qbTransactionId,
      qb_transaction_type: txn.qbTransactionType ?? '',
      qb_line_id: lineId,
      vendor_name: txn.vendorName || null,
      qb_job_name: jobName || null,
      doc_number: txn.docNumber || null,
      txn_date: txn.txnDate || null,
      amount: txn.amount,
      matched_project_id: project?.id ?? null,
      review_status: defaultReviewStatus(reviewByKey.get(dedupKey), preBlessed),
      synced_at: syncedAt,
    })
  }

  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase
      .from('drywall_qb_materials')
      .upsert(upsertRows, {
        onConflict: 'organization_id,qb_transaction_type,qb_transaction_id,qb_line_id',
      })

    if (upsertError) {
      throw new Error(upsertError.message || 'Failed to save material costs')
    }
  }

  const { count: pendingReview, error: pendingError } = await supabase
    .from('drywall_qb_materials')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('review_status', 'pending')

  if (pendingError) {
    throw new Error(pendingError.message || 'Failed to count pending materials')
  }

  return {
    fetched: transactions.length,
    matched,
    offSystemMatched,
    unmatched,
    pendingReview: pendingReview ?? 0,
    unmatchedNames: Array.from(unmatchedNamesSet).sort((a, b) => a.localeCompare(b)),
  }
}
