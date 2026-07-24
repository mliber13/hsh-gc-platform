// ============================================================================
// Customer comms — customer/GC-super schedule share link (no-login).
// Office generates/copies the link; the public page reads the schedule + sends
// change requests via the customer-schedule-share edge function.
// ============================================================================

import { supabase } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'
import { normalizeCustomerPhone } from '@/services/customerCommsService'

/** 64 hex chars — unguessable capability token. */
function generateShareToken(): string {
  const rand = () => crypto.randomUUID().replace(/-/g, '')
  return rand() + rand()
}

/** Office: get the customer's existing active schedule link, or create one. Returns the full URL. */
export async function getOrCreateCustomerShareLink(phone: string): Promise<string> {
  const orgId = await requireUserOrgId()
  const contactPhone = normalizeCustomerPhone(phone)

  const { data: existing, error: readError } = await supabase
    .from('customer_share_links')
    .select('token')
    .eq('organization_id', orgId)
    .eq('contact_phone', contactPhone)
    .is('revoked_at', null)
    .maybeSingle()
  if (readError) throw new Error(readError.message || 'Failed to read customer link')

  let token = existing?.token as string | undefined
  if (!token) {
    token = generateShareToken()
    const { error: insertError } = await supabase.from('customer_share_links').insert({
      organization_id: orgId,
      contact_phone: contactPhone,
      token,
    })
    if (insertError) throw new Error(insertError.message || 'Failed to create customer link')
  }

  return `${window.location.origin}/customer/${token}`
}

// ---- Public (no-login) side — invoked from the /customer/:token page ----

export interface CustomerScheduleItem {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  status: string | null
  assignees: string[]
}

export interface CustomerShareMessage {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  createdAt: string
}

export interface CustomerScheduleProject {
  projectId: string
  projectName: string
  items: CustomerScheduleItem[]
  messages: CustomerShareMessage[]
}

export interface CustomerScheduleData {
  contactName: string | null
  clientName: string | null
  projects: CustomerScheduleProject[]
}

export async function fetchCustomerSchedule(token: string): Promise<CustomerScheduleData> {
  const { data, error } = await supabase.functions.invoke('customer-schedule-share', {
    body: { token, action: 'list' },
  })
  if (error) throw new Error(error.message || 'Failed to load schedule')
  if (data?.error) throw new Error(String(data.error))
  return {
    contactName: data?.contactName ?? null,
    clientName: data?.clientName ?? null,
    projects: (data?.projects ?? []) as CustomerScheduleProject[],
  }
}

export async function submitCustomerRequest(
  token: string,
  projectId: string,
  message: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('customer-schedule-share', {
    body: { token, action: 'request', project_id: projectId, message },
  })
  if (error) throw new Error(error.message || 'Failed to send request')
  if (data?.error) throw new Error(String(data.error))
}
