// ============================================================================
// Project Activity Service
// ============================================================================
//
// Derives a "Recent Activity" feed for a project by fanning out reads to the
// existing per-row tables that already record created_at: change_orders,
// po_headers, project_documents, project_forms. There is no
// project_activity_events table — see src/types/projectActivity.ts for the
// rationale and the deals-side precedent we may graduate to later.
//
// All four queries run in parallel via Promise.all. Results are normalized
// to ProjectActivityEvent, concatenated, sorted by timestamp DESC, and
// sliced to the requested limit.
//

import { supabase } from '@/lib/supabase'
import type { ProjectActivityEvent } from '@/types/projectActivity'

const PER_TABLE_LIMIT = 10

/**
 * Fetch the most recent activity events across change orders, POs,
 * documents, and forms for the given project.
 *
 * Returns up to `limit` events sorted newest → oldest. Resilient to
 * partial failures: if one source query fails, the others still surface
 * (logs the error and skips that source).
 */
export async function getRecentProjectActivity(
  projectId: string,
  limit = 10,
): Promise<ProjectActivityEvent[]> {
  const [changeOrders, purchaseOrders, documents, forms] = await Promise.all([
    fetchChangeOrders(projectId),
    fetchPurchaseOrders(projectId),
    fetchDocuments(projectId),
    fetchForms(projectId),
  ])

  return [...changeOrders, ...purchaseOrders, ...documents, ...forms]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit)
}

// ============================================================================
// Per-source fetchers
// ============================================================================

async function fetchChangeOrders(projectId: string): Promise<ProjectActivityEvent[]> {
  const { data, error } = await supabase
    .from('change_orders')
    .select('id, title, cost_impact, status, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(PER_TABLE_LIMIT)

  if (error) {
    console.error('getRecentProjectActivity: change_orders fetch failed', error)
    return []
  }
  return (data || []).map((row: any) => {
    const amount =
      typeof row.cost_impact === 'number' && row.cost_impact !== 0
        ? formatCurrency(row.cost_impact)
        : null
    return {
      id: `change-order:${row.id}`,
      type: 'change-order' as const,
      timestamp: row.created_at,
      title: row.title || 'Change order',
      detail: amount ?? undefined,
      section: 'change-orders' as const,
    }
  })
}

async function fetchPurchaseOrders(projectId: string): Promise<ProjectActivityEvent[]> {
  const { data, error } = await supabase
    .from('po_headers')
    .select('id, po_number, status, created_at, subcontractors ( name )')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(PER_TABLE_LIMIT)

  if (error) {
    console.error('getRecentProjectActivity: po_headers fetch failed', error)
    return []
  }
  return (data || []).map((row: any) => {
    const num = row.po_number ? `PO-${row.po_number}` : 'Purchase order'
    const subName = row.subcontractors?.name
    return {
      id: `purchase-order:${row.id}`,
      type: 'purchase-order' as const,
      timestamp: row.created_at,
      title: subName ? `${num} — ${subName}` : num,
      detail: row.status && row.status !== 'draft' ? capitalize(row.status) : undefined,
      section: 'purchase-orders' as const,
    }
  })
}

async function fetchDocuments(projectId: string): Promise<ProjectActivityEvent[]> {
  const { data, error } = await supabase
    .from('project_documents')
    .select('id, name, file_size, mime_type, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(PER_TABLE_LIMIT)

  if (error) {
    console.error('getRecentProjectActivity: project_documents fetch failed', error)
    return []
  }
  return (data || []).map((row: any) => ({
    id: `document:${row.id}`,
    type: 'document' as const,
    timestamp: row.created_at,
    title: row.name || 'Untitled document',
    detail: typeof row.file_size === 'number' ? formatBytes(row.file_size) : undefined,
    section: 'documents' as const,
  }))
}

async function fetchForms(projectId: string): Promise<ProjectActivityEvent[]> {
  const { data, error } = await supabase
    .from('project_forms')
    .select('id, form_type, form_name, status, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(PER_TABLE_LIMIT)

  if (error) {
    console.error('getRecentProjectActivity: project_forms fetch failed', error)
    return []
  }
  return (data || []).map((row: any) => ({
    id: `form:${row.id}`,
    type: 'form' as const,
    timestamp: row.created_at,
    title: row.form_name || prettyFormType(row.form_type),
    detail: row.status ? capitalize(row.status) : undefined,
    section: 'forms' as const,
  }))
}

// ============================================================================
// Format helpers
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ')
}

function prettyFormType(type: string | null | undefined): string {
  if (!type) return 'Form'
  return type
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
