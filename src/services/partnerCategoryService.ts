// ============================================================================
// Partner contact categories — DB-backed partner label tabs
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import type { PartnerCategory } from '@/types/contactDirectory'
import { getCurrentUserProfile } from './userService'

async function requireOnlineMode() {
  if (!isOnlineMode()) {
    throw new Error('This action requires an online connection to Supabase.')
  }
}

async function requireOrganizationId(): Promise<string> {
  await requireOnlineMode()
  const profile = await getCurrentUserProfile()
  if (!profile?.organization_id) {
    throw new Error('Unable to determine the current organization.')
  }
  return profile.organization_id
}

function toPartnerCategory(row: Record<string, unknown>): PartnerCategory {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    key: String(row.key),
    label: String(row.label),
    sortOrder: Number(row.sort_order ?? 0),
    isArchived: Boolean(row.is_archived),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  }
}

/** Uppercase snake_case key from a display label (ASCII letters/digits). */
export function slugifyPartnerCategoryKey(label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  if (!slug) {
    throw new Error('Category label must contain at least one letter or number.')
  }
  return slug
}

export async function fetchPartnerCategories(opts?: {
  includeArchived?: boolean
}): Promise<PartnerCategory[]> {
  const organizationId = await requireOrganizationId()

  let query = supabase
    .from('contact_categories')
    .select('*')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (!opts?.includeArchived) {
    query = query.eq('is_archived', false)
  }

  const { data, error } = await query
  if (error) {
    console.error('Error fetching partner categories:', error)
    throw error
  }
  return (data ?? []).map((row) => toPartnerCategory(row as Record<string, unknown>))
}

export async function createPartnerCategory(input: {
  key?: string
  label: string
}): Promise<PartnerCategory> {
  const organizationId = await requireOrganizationId()
  const label = input.label.trim()
  if (!label) throw new Error('Category label is required.')
  const key = input.key?.trim() ? input.key.trim().toUpperCase() : slugifyPartnerCategoryKey(label)

  const { data: existing } = await supabase
    .from('contact_categories')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('key', key)
    .maybeSingle()

  if (existing) {
    throw new Error(`A category with key "${key}" already exists.`)
  }

  const { data: maxRow } = await supabase
    .from('contact_categories')
    .select('sort_order')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sortOrder = maxRow?.sort_order != null ? Number(maxRow.sort_order) + 1 : 0

  const { data, error } = await supabase
    .from('contact_categories')
    .insert({
      organization_id: organizationId,
      key,
      label,
      sort_order: sortOrder,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating partner category:', error)
    throw error
  }
  return toPartnerCategory(data as Record<string, unknown>)
}

export async function updatePartnerCategory(
  id: string,
  updates: Partial<{ label: string; sortOrder: number; isArchived: boolean }>,
): Promise<PartnerCategory> {
  await requireOnlineMode()

  const payload: Record<string, unknown> = {}
  if (updates.label !== undefined) {
    const label = updates.label.trim()
    if (!label) throw new Error('Category label cannot be empty.')
    payload.label = label
  }
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder
  if (updates.isArchived !== undefined) payload.is_archived = updates.isArchived

  const { data, error } = await supabase
    .from('contact_categories')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating partner category:', error)
    throw error
  }
  return toPartnerCategory(data as Record<string, unknown>)
}

export async function deletePartnerCategory(id: string): Promise<void> {
  const organizationId = await requireOrganizationId()

  const { data: category, error: catErr } = await supabase
    .from('contact_categories')
    .select('key')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  if (catErr || !category) {
    throw new Error('Category not found.')
  }

  const { count, error: countErr } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('label', category.key)
    .is('subcontractor_id', null)
    .is('supplier_id', null)
    .is('developer_id', null)
    .is('municipality_id', null)
    .is('lender_id', null)

  if (countErr) throw countErr
  if ((count ?? 0) > 0) {
    throw new Error(
      `Cannot delete this category — ${count} contact(s) still use it. Archive instead, or reassign contacts first.`,
    )
  }

  const { error } = await supabase.from('contact_categories').delete().eq('id', id)
  if (error) {
    console.error('Error deleting partner category:', error)
    throw error
  }
}

export async function countStandaloneContactsForCategoryKey(key: string): Promise<number> {
  const organizationId = await requireOrganizationId()
  const { count, error } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('label', key)
    .is('subcontractor_id', null)
    .is('supplier_id', null)
    .is('developer_id', null)
    .is('municipality_id', null)
    .is('lender_id', null)

  if (error) throw error
  return count ?? 0
}
