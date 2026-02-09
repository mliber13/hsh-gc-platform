// ============================================================================
// Contact Directory Service - labeled contacts (standalone + entity-linked)
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import type { Contact, ContactInput } from '@/types'
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

function toContact(row: any): Contact {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: row.role ?? null,
    notes: row.notes ?? null,
    subcontractorId: row.subcontractor_id ?? null,
    supplierId: row.supplier_id ?? null,
    developerId: row.developer_id ?? null,
    municipalityId: row.municipality_id ?? null,
    lenderId: row.lender_id ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export interface FetchContactsOptions {
  label?: string
  subcontractorId?: string
  supplierId?: string
  developerId?: string
  municipalityId?: string
  lenderId?: string
}

/** Fetch all contacts for the org, optionally filtered by label or entity */
export async function fetchContacts(options?: FetchContactsOptions): Promise<Contact[]> {
  const organizationId = await requireOrganizationId()

  let query = supabase
    .from('contacts')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })

  if (options?.label) query = query.eq('label', options.label)
  if (options?.subcontractorId) query = query.eq('subcontractor_id', options.subcontractorId)
  if (options?.supplierId) query = query.eq('supplier_id', options.supplierId)
  if (options?.developerId) query = query.eq('developer_id', options.developerId)
  if (options?.municipalityId) query = query.eq('municipality_id', options.municipalityId)
  if (options?.lenderId) query = query.eq('lender_id', options.lenderId)

  const { data, error } = await query
  if (error) {
    console.error('Error fetching contacts:', error)
    throw error
  }
  return (data || []).map(toContact)
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const organizationId = await requireOrganizationId()

  const payload: Record<string, any> = {
    organization_id: organizationId,
    label: input.label,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    role: input.role?.trim() || null,
    notes: input.notes?.trim() || null,
  }
  if (input.subcontractorId) payload.subcontractor_id = input.subcontractorId
  else if (input.supplierId) payload.supplier_id = input.supplierId
  else if (input.developerId) payload.developer_id = input.developerId
  else if (input.municipalityId) payload.municipality_id = input.municipalityId
  else if (input.lenderId) payload.lender_id = input.lenderId

  const { data, error } = await supabase
    .from('contacts')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('Error creating contact:', error)
    throw error
  }
  return toContact(data)
}

export async function updateContact(
  id: string,
  updates: Partial<ContactInput>
): Promise<Contact> {
  await requireOnlineMode()

  const payload: Record<string, any> = {}
  if (updates.label !== undefined) payload.label = updates.label
  if (updates.name !== undefined) payload.name = updates.name.trim()
  if (updates.email !== undefined) payload.email = updates.email?.trim() || null
  if (updates.phone !== undefined) payload.phone = updates.phone?.trim() || null
  if (updates.role !== undefined) payload.role = updates.role?.trim() || null
  if (updates.notes !== undefined) payload.notes = updates.notes?.trim() || null

  const { data, error } = await supabase
    .from('contacts')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating contact:', error)
    throw error
  }
  return toContact(data)
}

export async function deleteContact(id: string): Promise<void> {
  await requireOnlineMode()
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) {
    console.error('Error deleting contact:', error)
    throw error
  }
}
