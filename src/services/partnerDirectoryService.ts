// ============================================================================
// Partner Directory Service
// ============================================================================
//
// Handles CRUD operations for subcontractors and suppliers stored in Supabase.
//

import { supabase, isOnlineMode } from '@/lib/supabase'
import {
  Subcontractor,
  Supplier,
  Developer,
  Municipality,
  Lender,
  SubcontractorInput,
  SupplierInput,
  DeveloperInput,
  MunicipalityInput,
  LenderInput,
} from '@/types'
import { getCurrentUserProfile } from './userService'

type NullableString = string | null | undefined

const sanitize = (value: NullableString): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : null
  return trimmed && trimmed.length > 0 ? trimmed : null
}

const sanitizeEmail = (value: NullableString): string | null => {
  const sanitized = sanitize(value)
  return sanitized ? sanitized.toLowerCase() : null
}

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

const toSubcontractor = (row: any): Subcontractor => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  trade: row.trade,
  contactName: row.contact_name,
  email: row.email,
  phone: row.phone,
  website: row.website,
  notes: row.notes,
  isActive: row.is_active,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
})

const toSupplier = (row: any): Supplier => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  category: row.category,
  contactName: row.contact_name,
  email: row.email,
  phone: row.phone,
  website: row.website,
  notes: row.notes,
  isActive: row.is_active,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
})

const toDeveloper = (row: any): Developer => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  type: row.type,
  contactName: row.contact_name,
  email: row.email,
  phone: row.phone,
  website: row.website,
  notes: row.notes,
  isActive: row.is_active,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
})

const toMunicipality = (row: any): Municipality => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  jurisdiction: row.jurisdiction,
  contactName: row.contact_name,
  email: row.email,
  phone: row.phone,
  website: row.website,
  notes: row.notes,
  isActive: row.is_active,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
})

const toLender = (row: any): Lender => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  type: row.type,
  contactName: row.contact_name,
  email: row.email,
  phone: row.phone,
  website: row.website,
  notes: row.notes,
  isActive: row.is_active,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
})

const buildSubcontractorPayload = (
  input: Partial<SubcontractorInput>,
  organizationId?: string
) => {
  const payload: Record<string, any> = {}

  if (organizationId) payload.organization_id = organizationId
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.trade !== undefined) payload.trade = sanitize(input.trade)
  if (input.contactName !== undefined) payload.contact_name = sanitize(input.contactName)
  if (input.email !== undefined) payload.email = sanitizeEmail(input.email)
  if (input.phone !== undefined) payload.phone = sanitize(input.phone)
  if (input.website !== undefined) payload.website = sanitize(input.website)
  if (input.notes !== undefined) payload.notes = sanitize(input.notes)
  if (input.isActive !== undefined) payload.is_active = input.isActive

  return payload
}

const buildSupplierPayload = (input: Partial<SupplierInput>, organizationId?: string) => {
  const payload: Record<string, any> = {}

  if (organizationId) payload.organization_id = organizationId
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.category !== undefined) payload.category = sanitize(input.category)
  if (input.contactName !== undefined) payload.contact_name = sanitize(input.contactName)
  if (input.email !== undefined) payload.email = sanitizeEmail(input.email)
  if (input.phone !== undefined) payload.phone = sanitize(input.phone)
  if (input.website !== undefined) payload.website = sanitize(input.website)
  if (input.notes !== undefined) payload.notes = sanitize(input.notes)
  if (input.isActive !== undefined) payload.is_active = input.isActive

  return payload
}

const buildDeveloperPayload = (input: Partial<DeveloperInput>, organizationId?: string) => {
  const payload: Record<string, any> = {}

  if (organizationId) payload.organization_id = organizationId
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.type !== undefined) payload.type = sanitize(input.type)
  if (input.contactName !== undefined) payload.contact_name = sanitize(input.contactName)
  if (input.email !== undefined) payload.email = sanitizeEmail(input.email)
  if (input.phone !== undefined) payload.phone = sanitize(input.phone)
  if (input.website !== undefined) payload.website = sanitize(input.website)
  if (input.notes !== undefined) payload.notes = sanitize(input.notes)
  if (input.isActive !== undefined) payload.is_active = input.isActive

  return payload
}

const buildMunicipalityPayload = (input: Partial<MunicipalityInput>, organizationId?: string) => {
  const payload: Record<string, any> = {}
  if (organizationId) payload.organization_id = organizationId
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.contactName !== undefined) payload.contact_name = sanitize(input.contactName)
  if (input.email !== undefined) payload.email = sanitizeEmail(input.email)
  if (input.phone !== undefined) payload.phone = sanitize(input.phone)
  if (input.website !== undefined) payload.website = sanitize(input.website)
  if (input.notes !== undefined) payload.notes = sanitize(input.notes)
  if (input.isActive !== undefined) payload.is_active = input.isActive
  return payload
}

const buildLenderPayload = (input: Partial<LenderInput>, organizationId?: string) => {
  const payload: Record<string, any> = {}
  if (organizationId) payload.organization_id = organizationId
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.type !== undefined) payload.type = sanitize(input.type)
  if (input.contactName !== undefined) payload.contact_name = sanitize(input.contactName)
  if (input.email !== undefined) payload.email = sanitizeEmail(input.email)
  if (input.phone !== undefined) payload.phone = sanitize(input.phone)
  if (input.website !== undefined) payload.website = sanitize(input.website)
  if (input.notes !== undefined) payload.notes = sanitize(input.notes)
  if (input.isActive !== undefined) payload.is_active = input.isActive
  return payload
}

// -----------------------------------------------------------------------------
// Subcontractors
// -----------------------------------------------------------------------------

export async function fetchSubcontractors(options?: {
  includeInactive?: boolean
}): Promise<Subcontractor[]> {
  const organizationId = await requireOrganizationId()

  let query = supabase
    .from('subcontractors')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching subcontractors:', error)
    throw error
  }

  return (data || []).map(toSubcontractor)
}

export async function createSubcontractor(
  input: SubcontractorInput
): Promise<Subcontractor> {
  const organizationId = await requireOrganizationId()
  const payload = buildSubcontractorPayload(input, organizationId)

  const { data, error } = await supabase
    .from('subcontractors')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('Error creating subcontractor:', error)
    throw error
  }

  return toSubcontractor(data)
}

export async function updateSubcontractor(
  id: string,
  updates: Partial<SubcontractorInput>
): Promise<Subcontractor> {
  await requireOnlineMode()

  const payload = buildSubcontractorPayload(updates)

  const { data, error } = await supabase
    .from('subcontractors')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating subcontractor:', error)
    throw error
  }

  return toSubcontractor(data)
}

export async function setSubcontractorActive(
  id: string,
  isActive: boolean
): Promise<Subcontractor> {
  return updateSubcontractor(id, { isActive })
}

export async function deleteSubcontractor(id: string): Promise<void> {
  await requireOnlineMode()

  const { error } = await supabase
    .from('subcontractors')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting subcontractor:', error)
    throw error
  }
}

// -----------------------------------------------------------------------------
// Suppliers
// -----------------------------------------------------------------------------

export async function fetchSuppliers(options?: {
  includeInactive?: boolean
}): Promise<Supplier[]> {
  const organizationId = await requireOrganizationId()

  let query = supabase
    .from('suppliers')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching suppliers:', error)
    throw error
  }

  return (data || []).map(toSupplier)
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  const organizationId = await requireOrganizationId()
  const payload = buildSupplierPayload(input, organizationId)

  const { data, error } = await supabase
    .from('suppliers')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('Error creating supplier:', error)
    throw error
  }

  return toSupplier(data)
}

export async function updateSupplier(
  id: string,
  updates: Partial<SupplierInput>
): Promise<Supplier> {
  await requireOnlineMode()

  const payload = buildSupplierPayload(updates)

  const { data, error } = await supabase
    .from('suppliers')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating supplier:', error)
    throw error
  }

  return toSupplier(data)
}

export async function setSupplierActive(
  id: string,
  isActive: boolean
): Promise<Supplier> {
  return updateSupplier(id, { isActive })
}

export async function deleteSupplier(id: string): Promise<void> {
  await requireOnlineMode()

  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting supplier:', error)
    throw error
  }
}

// -----------------------------------------------------------------------------
// Developers
// -----------------------------------------------------------------------------

export async function fetchDevelopers(options?: {
  includeInactive?: boolean
}): Promise<Developer[]> {
  const organizationId = await requireOrganizationId()

  let query = supabase
    .from('developers')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching developers:', error)
    throw error
  }

  return (data || []).map(toDeveloper)
}

export async function createDeveloper(input: DeveloperInput): Promise<Developer> {
  const organizationId = await requireOrganizationId()
  const payload = buildDeveloperPayload(input, organizationId)

  const { data, error } = await supabase
    .from('developers')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('Error creating developer:', error)
    throw error
  }

  return toDeveloper(data)
}

export async function updateDeveloper(
  id: string,
  updates: Partial<DeveloperInput>
): Promise<Developer> {
  await requireOnlineMode()

  const payload = buildDeveloperPayload(updates)

  const { data, error } = await supabase
    .from('developers')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating developer:', error)
    throw error
  }

  return toDeveloper(data)
}

export async function setDeveloperActive(
  id: string,
  isActive: boolean
): Promise<Developer> {
  return updateDeveloper(id, { isActive })
}

export async function deleteDeveloper(id: string): Promise<void> {
  await requireOnlineMode()

  const { error } = await supabase
    .from('developers')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting developer:', error)
    throw error
  }
}

// -----------------------------------------------------------------------------
// Municipalities
// -----------------------------------------------------------------------------

export async function fetchMunicipalities(options?: {
  includeInactive?: boolean
}): Promise<Municipality[]> {
  const organizationId = await requireOrganizationId()

  let query = supabase
    .from('municipalities')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    console.error('Error fetching municipalities:', error)
    throw error
  }
  return (data || []).map(toMunicipality)
}

export async function createMunicipality(input: MunicipalityInput): Promise<Municipality> {
  const organizationId = await requireOrganizationId()
  const payload = buildMunicipalityPayload(input, organizationId)

  const { data, error } = await supabase
    .from('municipalities')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('Error creating municipality:', error)
    throw error
  }
  return toMunicipality(data)
}

export async function updateMunicipality(
  id: string,
  updates: Partial<MunicipalityInput>
): Promise<Municipality> {
  await requireOnlineMode()
  const payload = buildMunicipalityPayload(updates)
  const { data, error } = await supabase
    .from('municipalities')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('Error updating municipality:', error)
    throw error
  }
  return toMunicipality(data)
}

export async function setMunicipalityActive(
  id: string,
  isActive: boolean
): Promise<Municipality> {
  return updateMunicipality(id, { isActive })
}

export async function deleteMunicipality(id: string): Promise<void> {
  await requireOnlineMode()
  const { error } = await supabase.from('municipalities').delete().eq('id', id)
  if (error) {
    console.error('Error deleting municipality:', error)
    throw error
  }
}

// -----------------------------------------------------------------------------
// Lenders
// -----------------------------------------------------------------------------

export async function fetchLenders(options?: {
  includeInactive?: boolean
}): Promise<Lender[]> {
  const organizationId = await requireOrganizationId()

  let query = supabase
    .from('lenders')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    console.error('Error fetching lenders:', error)
    throw error
  }
  return (data || []).map(toLender)
}

export async function createLender(input: LenderInput): Promise<Lender> {
  const organizationId = await requireOrganizationId()
  const payload = buildLenderPayload(input, organizationId)

  const { data, error } = await supabase
    .from('lenders')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('Error creating lender:', error)
    throw error
  }
  return toLender(data)
}

export async function updateLender(
  id: string,
  updates: Partial<LenderInput>
): Promise<Lender> {
  await requireOnlineMode()
  const payload = buildLenderPayload(updates)
  const { data, error } = await supabase
    .from('lenders')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('Error updating lender:', error)
    throw error
  }
  return toLender(data)
}

export async function setLenderActive(
  id: string,
  isActive: boolean
): Promise<Lender> {
  return updateLender(id, { isActive })
}

export async function deleteLender(id: string): Promise<void> {
  await requireOnlineMode()
  const { error } = await supabase.from('lenders').delete().eq('id', id)
  if (error) {
    console.error('Error deleting lender:', error)
    throw error
  }
}
