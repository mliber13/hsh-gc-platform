// ============================================================================
// Customer comms (CC.1) — customer/superintendent SMS coordination per project.
// Person-keyed threads; office resolves multi-job routing. Outbound via the
// send-customer-sms edge function (Twilio); inbound routing lands in CC.2.
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'

export interface CustomerContact {
  name: string
  phone: string
}

export interface CustomerMessage {
  id: string
  contactPhone: string
  contactName: string | null
  direction: 'inbound' | 'outbound'
  body: string
  projectId: string | null
  status: string | null
  createdAt: string
}

/** Strip to digits, keep last 10 — the thread/contact key (mirror normalize_phone_10). */
export function normalizeCustomerPhone(raw: string): string {
  return (raw || '').replace(/\D/g, '').slice(-10)
}

type MessageRow = {
  id: string
  contact_phone: string
  contact_name: string | null
  direction: string
  body: string
  project_id: string | null
  status: string | null
  created_at: string
}

function mapMessage(row: MessageRow): CustomerMessage {
  return {
    id: row.id,
    contactPhone: row.contact_phone,
    contactName: row.contact_name,
    direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
    body: row.body,
    projectId: row.project_id,
    status: row.status,
    createdAt: row.created_at,
  }
}

export async function fetchCustomerContact(projectId: string): Promise<CustomerContact | null> {
  if (!isOnlineMode()) return null
  const { data, error } = await supabase
    .from('customer_project_contacts')
    .select('contact_name, contact_phone')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) {
    console.error('fetchCustomerContact:', error)
    return null
  }
  if (!data) return null
  return { name: data.contact_name ?? '', phone: data.contact_phone ?? '' }
}

export async function saveCustomerContact(
  projectId: string,
  contact: CustomerContact,
): Promise<void> {
  const orgId = await requireUserOrgId()
  const phone = normalizeCustomerPhone(contact.phone)
  const { error } = await supabase.from('customer_project_contacts').upsert(
    {
      organization_id: orgId,
      project_id: projectId,
      contact_name: contact.name.trim() || null,
      contact_phone: phone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' },
  )
  if (error) throw new Error(error.message || 'Failed to save customer contact')
}

/** Messages tagged to this project (CC.1 project-side view; the person-thread inbox is CC.2). */
export async function fetchProjectCustomerMessages(
  projectId: string,
): Promise<CustomerMessage[]> {
  if (!isOnlineMode()) return []
  const { data, error } = await supabase
    .from('customer_messages')
    .select('id, contact_phone, contact_name, direction, body, project_id, status, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('fetchProjectCustomerMessages:', error)
    return []
  }
  return ((data ?? []) as MessageRow[]).map(mapMessage)
}

export async function sendCustomerMessage(input: {
  projectId: string
  phone: string
  name?: string
  body: string
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-customer-sms', {
    body: {
      project_id: input.projectId,
      recipient_phone: input.phone,
      recipient_name: input.name,
      body: input.body,
    },
  })
  if (error) throw new Error(error.message || 'Failed to send message')
  if (data && data.success === false) {
    const detail =
      data.error && typeof data.error === 'object' && 'message' in data.error
        ? String((data.error as { message: unknown }).message)
        : typeof data.error === 'string'
          ? data.error
          : 'SMS failed to send'
    throw new Error(detail)
  }
}
