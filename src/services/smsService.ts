import { supabase } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'
import type {
  CascadeRowWithSmsContext,
  SmsEligibilityReason,
} from '@/lib/scheduleCascadeDiff'

export interface PublishCandidate {
  schedule_item_id: string
  project_id: string
  item_name: string
  project_name: string
  start_date: string
  assigned_company_id: string
  company_name: string
  recipient_phone: string
}

export interface PublishCandidateSkipped {
  schedule_item_id: string
  item_name: string
  reason: 'no_phone' | 'no_company'
  company_name: string | null
}

export interface PublishPreview {
  ready: PublishCandidate[]
  skipped: PublishCandidateSkipped[]
}

type JoinedOne<T> = T | T[] | null | undefined

function joinedOne<T>(value: JoinedOne<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function buildPublishPreview(projectId: string): Promise<PublishPreview> {
  const { data, error } = await supabase
    .from('schedule_items')
    .select(`
      id, project_id, name, start_date, assigned_company_id,
      subcontractors:assigned_company_id(name, phone),
      projects:project_id(name)
    `)
    .eq('project_id', projectId)
    .eq('confirmation_status', 'unsent')

  if (error) throw error

  const ready: PublishCandidate[] = []
  const skipped: PublishCandidateSkipped[] = []

  for (const row of data ?? []) {
    const sub = joinedOne((row as any).subcontractors)
    const project = joinedOne((row as any).projects)
    const projectName = project?.name ?? '(project)'

    if (!row.assigned_company_id || !sub) {
      skipped.push({
        schedule_item_id: row.id,
        item_name: row.name,
        reason: 'no_company',
        company_name: null,
      })
      continue
    }

    if (!sub.phone) {
      skipped.push({
        schedule_item_id: row.id,
        item_name: row.name,
        reason: 'no_phone',
        company_name: sub.name,
      })
      continue
    }

    ready.push({
      schedule_item_id: row.id,
      project_id: row.project_id,
      item_name: row.name,
      project_name: projectName,
      start_date: row.start_date,
      assigned_company_id: row.assigned_company_id,
      company_name: sub.name,
      recipient_phone: sub.phone,
    })
  }

  return { ready, skipped }
}

export interface SendSmsResult {
  schedule_item_id: string
  success: boolean
  error: unknown
  errorMessage: string | null
}

export function buildAssignmentMessage(candidate: PublishCandidate): string {
  const [year, month, day] = candidate.start_date.split('-').map(Number)
  const start = year && month && day
    ? new Date(year, month - 1, day)
    : new Date(candidate.start_date)
  const startShort = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `HSH GC - You're scheduled for ${candidate.item_name} at ${candidate.project_name} starting ${startShort}. Reply Y to confirm or N to decline.`
}

export async function sendOneAssignment(
  candidate: PublishCandidate,
): Promise<SendSmsResult> {
  const body = buildAssignmentMessage(candidate)
  const { data, error } = await supabase.functions.invoke('send-sms', {
    body: {
      schedule_item_id: candidate.schedule_item_id,
      project_id: candidate.project_id,
      recipient_phone: candidate.recipient_phone,
      recipient_company_id: candidate.assigned_company_id,
      body,
    },
  })

  if (error) {
    return {
      schedule_item_id: candidate.schedule_item_id,
      success: false,
      error,
      errorMessage: error.message,
    }
  }
  if (!(data as any)?.success) {
    const errorMessage =
      (data as any)?.error?.message ??
      (data as any)?.error ??
      (data as any)?.log_error ??
      (data as any)?.update_error ??
      'SMS send failed'
    return {
      schedule_item_id: candidate.schedule_item_id,
      success: false,
      error: data,
      errorMessage: typeof errorMessage === 'string'
        ? errorMessage
        : JSON.stringify(errorMessage),
    }
  }
  return {
    schedule_item_id: candidate.schedule_item_id,
    success: true,
    error: null,
    errorMessage: null,
  }
}

export function buildCascadeMessage(
  itemName: string,
  projectName: string,
  newStart: Date,
  newEnd: Date,
): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const startStr = newStart.toLocaleDateString('en-US', opts)
  const endStr = newEnd.toLocaleDateString('en-US', opts)
  return `HSH GC schedule update - ${itemName} at ${projectName} moved to ${startStr} - ${endStr}. Reply Y to confirm or N to decline.`
}

export async function sendOneCascadeUpdate(params: {
  schedule_item_id: string
  project_id: string
  recipient_phone: string
  recipient_company_id: string
  item_name: string
  project_name: string
  new_start: Date
  new_end: Date
}): Promise<SendSmsResult> {
  const body = buildCascadeMessage(
    params.item_name,
    params.project_name,
    params.new_start,
    params.new_end,
  )
  const { data, error } = await supabase.functions.invoke('send-sms', {
    body: {
      schedule_item_id: params.schedule_item_id,
      project_id: params.project_id,
      recipient_phone: params.recipient_phone,
      recipient_company_id: params.recipient_company_id,
      body,
      message_type: 'cascade_update',
    },
  })

  if (error) {
    return {
      schedule_item_id: params.schedule_item_id,
      success: false,
      error,
      errorMessage: error.message,
    }
  }
  if (!(data as any)?.success) {
    const errorMessage =
      (data as any)?.error?.message ??
      (data as any)?.error ??
      (data as any)?.log_error ??
      (data as any)?.update_error ??
      'SMS send failed'
    return {
      schedule_item_id: params.schedule_item_id,
      success: false,
      error: data,
      errorMessage: typeof errorMessage === 'string'
        ? errorMessage
        : JSON.stringify(errorMessage),
    }
  }

  return {
    schedule_item_id: params.schedule_item_id,
    success: true,
    error: null,
    errorMessage: null,
  }
}

export async function writeSystemCascadeEntry(params: {
  project_id: string
  schedule_item_id: string
  item_name: string
  old_start: Date
  new_start: Date
  old_end: Date
  new_end: Date
  reason: SmsEligibilityReason | 'pm_opt_out'
}): Promise<void> {
  const organizationId = await requireUserOrgId()
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const oldStart = params.old_start.toLocaleDateString('en-US', opts)
  const newStart = params.new_start.toLocaleDateString('en-US', opts)
  const reasonLabel = params.reason === 'pm_opt_out'
    ? 'PM opted out'
    : params.reason.replaceAll('_', ' ')

  const { error } = await supabase
    .from('communication_log_entries')
    .insert({
      organization_id: organizationId,
      project_id: params.project_id,
      schedule_item_id: params.schedule_item_id,
      direction: 'system',
      channel: 'system',
      author_user_id: null,
      author_company_id: null,
      author_label: 'system',
      body: `Date moved from ${oldStart} to ${newStart} (no SMS - ${reasonLabel})`,
      metadata: {
        type: 'cascade_silent',
        old_start: params.old_start.toISOString(),
        new_start: params.new_start.toISOString(),
        old_end: params.old_end.toISOString(),
        new_end: params.new_end.toISOString(),
        reason: params.reason,
      },
    })

  if (error) throw error
}

export interface PersistCascadeResult {
  smsSuccess: number
  smsFailed: number
  silentLogged: number
  total: number
}

export async function persistCascadeChanges(params: {
  projectId: string
  projectName: string
  rows: CascadeRowWithSmsContext[]
  selectedSmsItemIds: Set<string>
}): Promise<PersistCascadeResult> {
  const { projectId, projectName, rows, selectedSmsItemIds } = params

  // Per-row UPDATEs (not bulk upsert) to avoid RLS WITH CHECK on the
  // INSERT path: our payload is partial (id + dates only), so the
  // INSERT-side org-scope check would reject the row even though the
  // UPDATE policy would pass. UPDATE-only sidesteps the issue cleanly.
  for (const row of rows) {
    const { error } = await supabase
      .from('schedule_items')
      .update({
        start_date: row.new_start.toISOString().slice(0, 10),
        end_date: row.new_end.toISOString().slice(0, 10),
      })
      .eq('id', row.item_id)
    if (error) throw error
  }

  let smsSuccess = 0
  let smsFailed = 0
  let silentLogged = 0

  for (const row of rows) {
    if (!selectedSmsItemIds.has(row.item_id)) {
      await writeSystemCascadeEntry({
        project_id: projectId,
        schedule_item_id: row.item_id,
        item_name: row.item_name,
        old_start: row.old_start,
        new_start: row.new_start,
        old_end: row.old_end,
        new_end: row.new_end,
        reason: 'pm_opt_out',
      })
      silentLogged += 1
      continue
    }

    if (row.sms_eligibility !== 'eligible') {
      await writeSystemCascadeEntry({
        project_id: projectId,
        schedule_item_id: row.item_id,
        item_name: row.item_name,
        old_start: row.old_start,
        new_start: row.new_start,
        old_end: row.old_end,
        new_end: row.new_end,
        reason: row.sms_eligibility,
      })
      silentLogged += 1
      continue
    }

    const result = await sendOneCascadeUpdate({
      schedule_item_id: row.item_id,
      project_id: projectId,
      recipient_phone: row.recipient_phone as string,
      recipient_company_id: row.assigned_company_id as string,
      item_name: row.item_name,
      project_name: projectName,
      new_start: row.new_start,
      new_end: row.new_end,
    })

    if (result.success) {
      smsSuccess += 1
    } else {
      smsFailed += 1
      console.error('Cascade SMS failed', result.error)
    }
  }

  return { smsSuccess, smsFailed, silentLogged, total: rows.length }
}
