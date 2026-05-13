/**
 * Client-facing GC quotes — Supabase-only (no hybrid / localStorage).
 */

import { supabase } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'
import { getTradesForEstimate_Hybrid } from '@/services/hybridService'
import { TRADE_CATEGORIES, type TradeCategory } from '@/types/constants'
import type {
  ClientQuote,
  ClientQuoteLineItem,
  ClientQuoteListRow,
  ClientQuoteOption,
  ClientQuoteStatus,
  ClientQuoteWithChildren,
  DraftClientQuoteInput,
  PreparedFor,
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
 */
export async function buildLineItemsFromEstimate(
  estimateId: string,
): Promise<Array<Pick<ClientQuoteLineItem, 'trade_category' | 'display_label' | 'amount' | 'sort_order'>>> {
  const trades = await getTradesForEstimate_Hybrid(estimateId)
  const sums = new Map<string, number>()
  for (const t of trades) {
    const cat = t.category
    sums.set(cat, (sums.get(cat) ?? 0) + (t.totalCost ?? 0))
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
