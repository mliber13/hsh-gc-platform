/**
 * Client-facing GC quotes — Supabase-only (no hybrid / localStorage).
 */

import { supabase } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'
import { getTradesForEstimate_Hybrid } from '@/services/hybridService'
import { TRADE_CATEGORIES, type TradeCategory } from '@/types/constants'
import {
  effectiveStatus,
  type ClientQuote,
  type ClientQuoteLineItem,
  type ClientQuoteListRow,
  type ClientQuoteOption,
  type ClientQuoteStatus,
  type ClientQuoteWithChildren,
  type DraftClientQuoteInput,
  type PreparedFor,
} from '@/types/clientQuote'

const TRADE_CATEGORY_ORDER = Object.keys(TRADE_CATEGORIES) as TradeCategory[]

function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

function mapPreparedFor(raw: unknown): PreparedFor | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const company = String(o.company ?? '').trim()
  const attn_name = String(o.attn_name ?? '').trim()
  const mailing_address = String(o.mailing_address ?? '').trim()
  if (!company && !attn_name && !mailing_address) return null
  return {
    company,
    attn_name,
    attn_title: o.attn_title != null ? String(o.attn_title) : undefined,
    mailing_address,
    phone: o.phone != null ? String(o.phone) : undefined,
    email: o.email != null ? String(o.email) : undefined,
  }
}

function mapQuote(row: Record<string, unknown>): ClientQuote {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: String(row.project_id),
    quote_number: String(row.quote_number ?? ''),
    revision: num(row.revision),
    status: row.status as ClientQuoteStatus,
    prepared_for: mapPreparedFor(row.prepared_for),
    project_address_override:
      row.project_address_override != null ? String(row.project_address_override) : null,
    scope_narrative: row.scope_narrative != null ? String(row.scope_narrative) : null,
    inclusions: Array.isArray(row.inclusions) ? (row.inclusions as string[]).map(String) : [],
    exclusions: Array.isArray(row.exclusions) ? (row.exclusions as string[]).map(String) : [],
    validity_days: num(row.validity_days) || 60,
    issued_at: row.issued_at != null ? String(row.issued_at) : null,
    expires_at: row.expires_at != null ? String(row.expires_at) : null,
    accepted_at: row.accepted_at != null ? String(row.accepted_at) : null,
    declined_at: row.declined_at != null ? String(row.declined_at) : null,
    sent_total: row.sent_total != null ? num(row.sent_total) : null,
    sent_pdf_url: row.sent_pdf_url != null ? String(row.sent_pdf_url) : null,
    superseded_by_id: row.superseded_by_id != null ? String(row.superseded_by_id) : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    created_by: row.created_by != null ? String(row.created_by) : null,
  }
}

function mapLineItem(row: Record<string, unknown>): ClientQuoteLineItem {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    client_quote_id: String(row.client_quote_id),
    trade_category: String(row.trade_category ?? ''),
    display_label: String(row.display_label ?? ''),
    amount: num(row.amount),
    sort_order: num(row.sort_order),
  }
}

function mapOption(row: Record<string, unknown>): ClientQuoteOption {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    client_quote_id: String(row.client_quote_id),
    label: String(row.label ?? ''),
    description: row.description != null ? String(row.description) : null,
    amount: num(row.amount),
    sort_order: num(row.sort_order),
  }
}

function categorySortIndex(category: string): number {
  const i = TRADE_CATEGORY_ORDER.indexOf(category as TradeCategory)
  return i >= 0 ? i : 999
}

export async function listClientQuotesForProject(projectId: string): Promise<ClientQuoteListRow[]> {
  const { data, error } = await supabase
    .from('client_quotes')
    .select(
      `
      *,
      client_quote_line_items ( amount ),
      client_quote_options ( amount )
    `,
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  const rows = (data ?? []) as Array<
    Record<string, unknown> & {
      client_quote_line_items?: { amount: unknown }[]
      client_quote_options?: { amount: unknown }[]
    }
  >

  return rows.map((row) => {
    const quote = mapQuote(row)
    const li = row.client_quote_line_items ?? []
    const op = row.client_quote_options ?? []
    const lineSum = li.reduce((s, r) => s + num(r.amount), 0)
    const optSum = op.reduce((s, r) => s + num(r.amount), 0)
    const draft_live_total = quote.status === 'draft' ? lineSum + optSum : null
    return { ...quote, draft_live_total }
  })
}

export async function getClientQuoteWithChildren(id: string): Promise<ClientQuoteWithChildren | null> {
  const { data: qrow, error: qerr } = await supabase.from('client_quotes').select('*').eq('id', id).maybeSingle()
  if (qerr) throw qerr
  if (!qrow) return null

  const { data: lines, error: lerr } = await supabase
    .from('client_quote_line_items')
    .select('*')
    .eq('client_quote_id', id)
    .order('sort_order', { ascending: true })
  if (lerr) throw lerr

  const { data: opts, error: oerr } = await supabase
    .from('client_quote_options')
    .select('*')
    .eq('client_quote_id', id)
    .order('sort_order', { ascending: true })
  if (oerr) throw oerr

  const quote = mapQuote(qrow as Record<string, unknown>)
  return {
    ...quote,
    line_items: (lines ?? []).map((r) => mapLineItem(r as Record<string, unknown>)),
    options: (opts ?? []).map((r) => mapOption(r as Record<string, unknown>)),
  }
}

export async function getDefaultInclusionsForProjectType(
  orgId: string,
  projectType: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('client_quote_inclusion_templates')
    .select('items')
    .eq('organization_id', orgId)
    .eq('project_type', projectType)
    .maybeSingle()
  if (error) throw error
  const items = data?.items
  return Array.isArray(items) ? items.map(String) : []
}

export async function getDefaultExclusionsForProjectType(
  orgId: string,
  projectType: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('client_quote_exclusion_templates')
    .select('items')
    .eq('organization_id', orgId)
    .eq('project_type', projectType)
    .maybeSingle()
  if (error) throw error
  const items = data?.items
  return Array.isArray(items) ? items.map(String) : []
}

/**
 * Roll up estimate trades by category for quote line items.
 * Uses the project's bound estimate via `estimateId` (UI model: one estimate per project;
 * DB may have multiple estimates per project — caller should pass the estimate the book is editing).
 *
 * Per-category amount = sum over trades in that category of:
 *   trade.totalCost * (1 + markupPct + contingencyPct)
 * where markupPct is trade.markupPercent (falling back to the project-level
 * markupPercent from estimates.totals, falling back to 20%), and
 * contingencyPct is project-level (estimates.totals.contingencyPercent, default 10%).
 * The grand total of all category amounts equals the estimate's totalEstimated
 * value shown in the Estimate Book (EstimateBuilder.calculateTotals).
 */
export async function buildLineItemsFromEstimate(
  estimateId: string,
): Promise<Array<Pick<ClientQuoteLineItem, 'trade_category' | 'display_label' | 'amount' | 'sort_order'>>> {
  const [{ data: estimateRow }, trades] = await Promise.all([
    supabase.from('estimates').select('totals').eq('id', estimateId).maybeSingle(),
    getTradesForEstimate_Hybrid(estimateId),
  ])

  const totals = (estimateRow?.totals ?? {}) as {
    markupPercent?: number
    contingencyPercent?: number
  }
  const contingencyPct = (totals.contingencyPercent ?? 10) / 100

  const sums = new Map<string, number>()
  for (const t of trades) {
    const base = t.totalCost ?? 0
    // Match EstimateBuilder.calculateTotals: trade markup falls back to project markup,
    // which falls back to 20%. `||` (not `??`) matches the existing convention.
    const tradeMarkupPct = ((t.markupPercent || totals.markupPercent || 20) as number) / 100
    const quoted = base * (1 + tradeMarkupPct + contingencyPct)
    sums.set(t.category, (sums.get(t.category) ?? 0) + quoted)
  }
  const categories = [...sums.keys()].sort((a, b) => categorySortIndex(a) - categorySortIndex(b))
  return categories.map((category, idx) => {
    const label =
      TRADE_CATEGORIES[category as TradeCategory]?.label ?? category.replace(/-/g, ' ')
    return {
      trade_category: category,
      display_label: label,
      amount: sums.get(category) ?? 0,
      sort_order: idx,
    }
  })
}

async function replaceLineItemsAndOptions(
  orgId: string,
  quoteId: string,
  line_items: NonNullable<DraftClientQuoteInput['line_items']>,
  options: NonNullable<DraftClientQuoteInput['options']>,
): Promise<void> {
  const { error: d1 } = await supabase.from('client_quote_line_items').delete().eq('client_quote_id', quoteId)
  if (d1) throw d1
  const { error: d2 } = await supabase.from('client_quote_options').delete().eq('client_quote_id', quoteId)
  if (d2) throw d2

  if (line_items.length) {
    const { error: liErr } = await supabase.from('client_quote_line_items').insert(
      line_items.map((li, i) => ({
        organization_id: orgId,
        client_quote_id: quoteId,
        trade_category: li.trade_category,
        display_label: li.display_label,
        amount: li.amount,
        sort_order: li.sort_order ?? i,
      })),
    )
    if (liErr) throw liErr
  }
  if (options.length) {
    const { error: oErr } = await supabase.from('client_quote_options').insert(
      options.map((o, i) => ({
        organization_id: orgId,
        client_quote_id: quoteId,
        label: o.label,
        description: o.description ?? null,
        amount: o.amount,
        sort_order: o.sort_order ?? i,
      })),
    )
    if (oErr) throw oErr
  }
}

/**
 * Reactivate a project whose status is 'lost' when a new live quote
 * arrives on it (new draft or revision spawned from a declined/expired
 * quote). Keeps the invariant: a project with any live quote should not
 * be marked lost.
 */
async function reactivateProjectIfLost(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ status: 'estimating' })
    .eq('id', projectId)
    .eq('status', 'lost')
  if (error) throw error
}

export async function createDraftQuote(input: DraftClientQuoteInput): Promise<ClientQuoteWithChildren> {
  const orgId = await requireUserOrgId()

  const { data: qnum, error: rpcErr } = await supabase.rpc('next_client_quote_number', {
    p_org: orgId,
  })
  if (rpcErr) throw rpcErr
  const quote_number = typeof qnum === 'string' ? qnum : String(qnum ?? '')

  const line_items = input.line_items ?? []
  const options = input.options ?? []

  const insertRow = {
    organization_id: orgId,
    project_id: input.project_id,
    quote_number,
    revision: 0,
    status: 'draft' as const,
    prepared_for: input.prepared_for ?? null,
    project_address_override: input.project_address_override ?? null,
    scope_narrative: input.scope_narrative ?? null,
    inclusions: input.inclusions ?? [],
    exclusions: input.exclusions ?? [],
    validity_days: input.validity_days ?? 60,
  }

  const { data: created, error: insErr } = await supabase
    .from('client_quotes')
    .insert(insertRow)
    .select('id')
    .single()
  if (insErr) throw insErr
  const quoteId = String(created!.id)

  await replaceLineItemsAndOptions(orgId, quoteId, line_items, options)

  await reactivateProjectIfLost(input.project_id)

  const full = await getClientQuoteWithChildren(quoteId)
  if (!full) throw new Error('createDraftQuote: failed to load new quote')
  return full
}

export async function updateDraftQuote(
  id: string,
  patch: Partial<DraftClientQuoteInput>,
): Promise<ClientQuoteWithChildren> {
  const existing = await getClientQuoteWithChildren(id)
  if (!existing) throw new Error('Quote not found')
  if (existing.status !== 'draft') {
    throw new Error('Only draft quotes can be edited')
  }

  const orgId = await requireUserOrgId()

  const updates: Record<string, unknown> = {}
  if (patch.prepared_for !== undefined) updates.prepared_for = patch.prepared_for
  if (patch.project_address_override !== undefined)
    updates.project_address_override = patch.project_address_override
  if (patch.scope_narrative !== undefined) updates.scope_narrative = patch.scope_narrative
  if (patch.inclusions !== undefined) updates.inclusions = patch.inclusions
  if (patch.exclusions !== undefined) updates.exclusions = patch.exclusions
  if (patch.validity_days !== undefined) updates.validity_days = patch.validity_days

  if (Object.keys(updates).length > 0) {
    const { error: upErr } = await supabase.from('client_quotes').update(updates).eq('id', id)
    if (upErr) throw upErr
  }

  if (patch.line_items !== undefined || patch.options !== undefined) {
    await replaceLineItemsAndOptions(
      orgId,
      id,
      patch.line_items ?? existing.line_items.map(stripLineIds),
      patch.options ?? existing.options.map(stripOptIds),
    )
  }

  const full = await getClientQuoteWithChildren(id)
  if (!full) throw new Error('updateDraftQuote: failed to reload')
  return full
}

function stripLineIds(li: ClientQuoteLineItem): Omit<ClientQuoteLineItem, 'id' | 'organization_id' | 'client_quote_id'> {
  return {
    trade_category: li.trade_category,
    display_label: li.display_label,
    amount: li.amount,
    sort_order: li.sort_order,
  }
}

function stripOptIds(o: ClientQuoteOption): Omit<ClientQuoteOption, 'id' | 'organization_id' | 'client_quote_id'> {
  return {
    label: o.label,
    description: o.description,
    amount: o.amount,
    sort_order: o.sort_order,
  }
}

export async function deleteDraftQuote(id: string): Promise<void> {
  const existing = await getClientQuoteWithChildren(id)
  if (!existing) return
  if (existing.status !== 'draft') {
    throw new Error('Only draft quotes can be deleted')
  }
  const { error } = await supabase.from('client_quotes').delete().eq('id', id)
  if (error) throw error
}

/** Upload PDF to quote-documents; first path segment must match profiles.organization_id (RLS). */
async function uploadQuotePdfBlob(orgId: string, quoteId: string, blob: Blob): Promise<string> {
  const path = `${orgId}/client-quotes/${quoteId}.pdf`
  const { error } = await supabase.storage.from('quote-documents').upload(path, blob, {
    cacheControl: '3600',
    upsert: true,
    contentType: 'application/pdf',
  })
  if (error) throw error
  return path
}

/**
 * Mark draft as sent: caller supplies the PDF blob (rendered in the browser).
 * Freezes totals, sets issued/expires, stores storage path on sent_pdf_url.
 */
export async function markQuoteSent(quoteId: string, pdfBlob: Blob): Promise<ClientQuoteWithChildren> {
  const existing = await getClientQuoteWithChildren(quoteId)
  if (!existing) throw new Error('Quote not found')
  if (existing.status !== 'draft') {
    throw new Error('Only draft quotes can be sent')
  }
  const orgId = await requireUserOrgId()

  const path = await uploadQuotePdfBlob(orgId, quoteId, pdfBlob)

  const linesSum = existing.line_items.reduce((s, li) => s + li.amount, 0)
  const optsSum = existing.options.reduce((s, o) => s + o.amount, 0)
  const sentTotal = linesSum + optsSum

  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + existing.validity_days * 86_400_000)

  const { error: upErr } = await supabase
    .from('client_quotes')
    .update({
      status: 'sent',
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      sent_total: sentTotal,
      sent_pdf_url: path,
    })
    .eq('id', quoteId)
  if (upErr) throw upErr

  const reloaded = await getClientQuoteWithChildren(quoteId)
  if (!reloaded) throw new Error('markQuoteSent: failed to reload')
  return reloaded
}

export async function markQuoteAccepted(quoteId: string): Promise<ClientQuoteWithChildren> {
  const existing = await getClientQuoteWithChildren(quoteId)
  if (!existing) throw new Error('Quote not found')
  if (existing.status !== 'sent') {
    throw new Error('Only sent quotes can be marked accepted')
  }

  const { error: qErr } = await supabase
    .from('client_quotes')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', quoteId)
  if (qErr) throw qErr

  const { error: pErr } = await supabase.from('projects').update({ status: 'in-progress' }).eq('id', existing.project_id)
  if (pErr) throw pErr

  const reloaded = await getClientQuoteWithChildren(quoteId)
  if (!reloaded) throw new Error('markQuoteAccepted: failed to reload')
  return reloaded
}

function isLiveQuoteRow(
  q: ClientQuoteListRow,
  excludeId: string,
  now: number,
): boolean {
  if (q.id === excludeId) return false
  if (q.status === 'draft') return true
  if (q.status === 'sent') {
    if (!q.expires_at) return true
    return new Date(q.expires_at).getTime() > now
  }
  return false
}

export async function markQuoteDeclined(quoteId: string): Promise<{
  quote: ClientQuoteWithChildren
  projectMarkedLost: boolean
}> {
  const existing = await getClientQuoteWithChildren(quoteId)
  if (!existing) throw new Error('Quote not found')
  if (existing.status !== 'sent') {
    throw new Error('Only sent quotes can be marked declined')
  }

  const { error: qErr } = await supabase
    .from('client_quotes')
    .update({ status: 'declined', declined_at: new Date().toISOString() })
    .eq('id', quoteId)
  if (qErr) throw qErr

  const siblings = await listClientQuotesForProject(existing.project_id)
  const now = Date.now()
  const liveOthers = siblings.filter((q) => isLiveQuoteRow(q, quoteId, now))

  let projectMarkedLost = false
  if (liveOthers.length === 0) {
    const { error: pErr } = await supabase.from('projects').update({ status: 'lost' }).eq('id', existing.project_id)
    if (pErr) throw pErr
    projectMarkedLost = true
  }

  const reloaded = await getClientQuoteWithChildren(quoteId)
  if (!reloaded) throw new Error('markQuoteDeclined: failed to reload')
  return { quote: reloaded, projectMarkedLost }
}

/**
 * Spawn a new revision from an existing quote (sent / declined / expired-derived).
 * Copies content, marks parent superseded with superseded_by_id → new row.
 */
export async function createQuoteRevision(parentQuoteId: string): Promise<ClientQuoteWithChildren> {
  const parent = await getClientQuoteWithChildren(parentQuoteId)
  if (!parent) throw new Error('Parent quote not found')

  const eff = effectiveStatus(parent)
  const allowed = new Set<ClientQuoteStatus>(['sent', 'declined', 'expired'])
  if (!allowed.has(eff)) {
    throw new Error(`Cannot create a revision from a quote in status '${eff}'.`)
  }

  const orgId = await requireUserOrgId()
  const nextRevision = parent.revision + 1

  const insertRow = {
    organization_id: orgId,
    project_id: parent.project_id,
    quote_number: parent.quote_number,
    revision: nextRevision,
    status: 'draft' as const,
    prepared_for: parent.prepared_for,
    project_address_override: parent.project_address_override,
    scope_narrative: parent.scope_narrative,
    inclusions: [...(parent.inclusions ?? [])],
    exclusions: [...(parent.exclusions ?? [])],
    validity_days: parent.validity_days,
  }

  const { data: created, error: insErr } = await supabase
    .from('client_quotes')
    .insert(insertRow)
    .select('id')
    .single()
  if (insErr) throw insErr
  const newId = String(created!.id)

  await replaceLineItemsAndOptions(
    orgId,
    newId,
    parent.line_items.map(stripLineIds),
    parent.options.map(stripOptIds),
  )

  const { error: supErr } = await supabase
    .from('client_quotes')
    .update({ status: 'superseded', superseded_by_id: newId })
    .eq('id', parentQuoteId)
  if (supErr) throw supErr

  await reactivateProjectIfLost(parent.project_id)

  const full = await getClientQuoteWithChildren(newId)
  if (!full) throw new Error('createQuoteRevision: failed to load new revision')
  return full
}
