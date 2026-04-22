import { supabase, isOnlineMode } from '@/lib/supabase'
import { getCurrentUserProfile } from './userService'

export type ProspectCategory =
  | 'Grocer'
  | 'QSR'
  | 'Casual Dining'
  | 'Entertainment'
  | 'Retail'
  | 'Fitness'
  | 'Medical'
  | 'Other'

export type ProspectStage =
  | 'Contacted'
  | 'Meeting Set'
  | 'Meeting Complete'
  | 'Proposal Sent'
  | 'Negotiating'
  | 'LOI Signed'
  | 'Dead'

export interface TenantProspect {
  id: string
  name: string
  development: string
  category: ProspectCategory
  contactName: string
  contactEmail: string
  contactPhone: string
  outreachMethod: string
  stage: ProspectStage
  owner: string
  nextAction: string
  nextActionDate: string
  notes: string
}

type TenantProspectInput = Omit<TenantProspect, 'id'>

const sanitize = (value?: string | null): string => (value ?? '').trim()

const mapRow = (row: any): TenantProspect => ({
  id: row.id,
  name: row.name,
  development: row.development,
  category: row.category,
  contactName: row.contact_name ?? '',
  contactEmail: row.contact_email ?? '',
  contactPhone: row.contact_phone ?? '',
  outreachMethod: row.outreach_method ?? '',
  stage: row.stage,
  owner: row.owner ?? '',
  nextAction: row.next_action ?? '',
  nextActionDate: row.next_action_date ?? '',
  notes: row.notes ?? '',
})

async function requireOrganizationId(): Promise<string> {
  if (!isOnlineMode()) throw new Error('Offline mode')
  const profile = await getCurrentUserProfile()
  if (!profile?.organization_id) throw new Error('Unable to determine organization')
  return profile.organization_id
}

function toInsertPayload(input: TenantProspectInput, organizationId: string) {
  return {
    organization_id: organizationId,
    name: sanitize(input.name),
    development: sanitize(input.development),
    category: input.category,
    contact_name: sanitize(input.contactName) || null,
    contact_email: sanitize(input.contactEmail) || null,
    contact_phone: sanitize(input.contactPhone) || null,
    outreach_method: sanitize(input.outreachMethod) || null,
    stage: input.stage,
    owner: sanitize(input.owner) || null,
    next_action: sanitize(input.nextAction) || null,
    next_action_date: sanitize(input.nextActionDate) || null,
    notes: sanitize(input.notes) || null,
  }
}

export async function fetchTenantProspects(): Promise<TenantProspect[]> {
  const organizationId = await requireOrganizationId()
  const { data, error } = await supabase
    .from('tenant_pipeline_prospects')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(mapRow)
}

export async function createTenantProspect(input: TenantProspectInput): Promise<TenantProspect> {
  const organizationId = await requireOrganizationId()
  const { data, error } = await supabase
    .from('tenant_pipeline_prospects')
    .insert(toInsertPayload(input, organizationId))
    .select('*')
    .single()

  if (error) throw error
  return mapRow(data)
}

export async function updateTenantProspect(id: string, input: TenantProspectInput): Promise<TenantProspect> {
  const organizationId = await requireOrganizationId()
  const { data, error } = await supabase
    .from('tenant_pipeline_prospects')
    .update(toInsertPayload(input, organizationId))
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error) throw error
  return mapRow(data)
}

export async function deleteTenantProspect(id: string): Promise<void> {
  const organizationId = await requireOrganizationId()
  const { error } = await supabase
    .from('tenant_pipeline_prospects')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)

  if (error) throw error
}
