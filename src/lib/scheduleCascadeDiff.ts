import type { ScheduleItem } from '@/types'

export interface CascadeChangeRow {
  item_id: string
  item_name: string
  old_start: Date
  new_start: Date
  old_end: Date
  new_end: Date
  assigned_company_id: string | null
  prior_confirmation_status: ScheduleItem['confirmation_status']
}

export type SmsEligibilityReason =
  | 'eligible'
  | 'unassigned'
  | 'no_phone'
  | 'never_published'
  | 'beyond_horizon'

export interface CascadeRowWithSmsContext extends CascadeChangeRow {
  recipient_phone: string | null
  recipient_company_name: string | null
  sms_eligibility: SmsEligibilityReason
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function computeCascadeDiff(
  cascaded: ScheduleItem[],
  originalDatesById: Map<string, { startDate: Date; endDate: Date }>,
): CascadeChangeRow[] {
  const out: CascadeChangeRow[] = []

  for (const item of cascaded) {
    const orig = originalDatesById.get(item.id)
    if (!orig) continue

    const startChanged = dateKey(orig.startDate) !== dateKey(item.startDate)
    const endChanged = dateKey(orig.endDate) !== dateKey(item.endDate)
    if (!startChanged && !endChanged) continue

    out.push({
      item_id: item.id,
      item_name: item.name,
      old_start: orig.startDate,
      new_start: item.startDate,
      old_end: orig.endDate,
      new_end: item.endDate,
      assigned_company_id: item.assignedCompanyId ?? null,
      prior_confirmation_status: item.confirmation_status,
    })
  }

  return out
}

export function classifySmsEligibility(
  row: CascadeChangeRow,
  subcontractorById: Map<string, { name: string; phone: string | null }>,
  today: Date = new Date(),
  horizonDays = 14,
): CascadeRowWithSmsContext {
  const sub = row.assigned_company_id
    ? subcontractorById.get(row.assigned_company_id)
    : null
  const recipient_phone = sub?.phone ?? null
  const recipient_company_name = sub?.name ?? null

  if (!row.assigned_company_id) {
    return { ...row, recipient_phone, recipient_company_name, sms_eligibility: 'unassigned' }
  }
  if (!recipient_phone) {
    return { ...row, recipient_phone, recipient_company_name, sms_eligibility: 'no_phone' }
  }
  if (row.prior_confirmation_status === 'unsent') {
    return { ...row, recipient_phone, recipient_company_name, sms_eligibility: 'never_published' }
  }

  const horizonEnd = new Date(today)
  horizonEnd.setHours(23, 59, 59, 999)
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays)

  if (row.new_start > horizonEnd) {
    return { ...row, recipient_phone, recipient_company_name, sms_eligibility: 'beyond_horizon' }
  }

  return { ...row, recipient_phone, recipient_company_name, sms_eligibility: 'eligible' }
}
