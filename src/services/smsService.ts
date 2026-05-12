import { supabase } from '@/lib/supabase'

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
