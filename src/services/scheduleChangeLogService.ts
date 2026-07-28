import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { isOnlineMode, supabase } from '@/lib/supabase'
import { SCHEDULE_ITEM_STATUS_LABELS } from '@/components/drywall/schedule/scheduleItemStatusStyles'

export type ScheduleChangeAction = 'created' | 'updated' | 'deleted'

export type ScheduleFieldChange = {
  old: unknown
  new: unknown
}

export type ScheduleChangeEntry = {
  id: string
  scheduleItemId: string | null
  projectId: string | null
  organizationId: string
  changedBy: string | null
  changedByName: string | null
  changedAt: string
  action: ScheduleChangeAction
  itemName: string | null
  txid: number
  changes: Record<string, ScheduleFieldChange>
}

export type ScheduleChangeGroup = {
  txid: number
  changedAt: string
  changedBy: string | null
  changedByName: string | null
  projectId: string | null
  entries: ScheduleChangeEntry[]
  /** Primary entry used for the group headline (date-move preferred). */
  primary: ScheduleChangeEntry
  /** Other entries in the same transaction (cascaded dependents, batch creates, etc.). */
  dependentsCount: number
}

export type FetchScheduleChangesOpts = {
  projectId?: string
  changedBy?: string
  limit?: number
  /** ISO timestamp cursor — return rows strictly older than this. */
  before?: string
}

type DbRow = {
  id: string
  schedule_item_id: string | null
  project_id: string | null
  organization_id: string
  changed_by: string | null
  changed_by_name: string | null
  changed_at: string
  action: ScheduleChangeAction
  item_name: string | null
  txid: number | string
  changes: Record<string, ScheduleFieldChange> | null
}

function mapRow(row: DbRow): ScheduleChangeEntry {
  return {
    id: row.id,
    scheduleItemId: row.schedule_item_id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    changedBy: row.changed_by,
    changedByName: row.changed_by_name,
    changedAt: row.changed_at,
    action: row.action,
    itemName: row.item_name,
    txid: typeof row.txid === 'string' ? Number(row.txid) : row.txid,
    changes: row.changes ?? {},
  }
}

export async function fetchScheduleChanges(
  opts: FetchScheduleChangesOpts = {},
): Promise<ScheduleChangeEntry[]> {
  if (!isOnlineMode()) return []

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  let query = supabase
    .from('schedule_item_changes')
    .select(
      'id, schedule_item_id, project_id, organization_id, changed_by, changed_by_name, changed_at, action, item_name, txid, changes',
    )
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (opts.projectId) query = query.eq('project_id', opts.projectId)
  if (opts.changedBy) query = query.eq('changed_by', opts.changedBy)
  if (opts.before) query = query.lt('changed_at', opts.before)

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as DbRow[]).map(mapRow)
}

function asString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v)).filter(Boolean)
}

function formatShortDate(value: unknown): string {
  const s = asString(value)
  if (!s) return '—'
  try {
    return format(parseISO(s.length === 10 ? `${s}T12:00:00` : s), 'MMM d')
  } catch {
    return s
  }
}

function statusLabel(value: unknown): string {
  const s = asString(value)
  if (!s) return '—'
  return (
    SCHEDULE_ITEM_STATUS_LABELS[s as keyof typeof SCHEDULE_ITEM_STATUS_LABELS] ?? s
  )
}

function personLabel(id: string, names?: Map<string, string>): string {
  return names?.get(id)?.trim() || id.slice(0, 8)
}

function formatPersonDiff(
  oldVal: unknown,
  newVal: unknown,
  names?: Map<string, string>,
): string {
  const oldIds = new Set(asStringArray(oldVal))
  const newIds = new Set(asStringArray(newVal))
  const added = [...newIds].filter((id) => !oldIds.has(id))
  const removed = [...oldIds].filter((id) => !newIds.has(id))
  const parts: string[] = []
  for (const id of added) parts.push(`+${personLabel(id, names)}`)
  for (const id of removed) parts.push(`−${personLabel(id, names)}`)
  return parts.length > 0 ? `reassigned: ${parts.join(', ')}` : 'reassigned'
}

function formatDateMove(oldStart: unknown, newStart: unknown): string | null {
  const a = asString(oldStart)
  const b = asString(newStart)
  if (!a || !b || a === b) return null
  try {
    const oldD = parseISO(a.length === 10 ? `${a}T12:00:00` : a)
    const newD = parseISO(b.length === 10 ? `${b}T12:00:00` : b)
    const delta = differenceInCalendarDays(newD, oldD)
    const later = delta > 0
    const abs = Math.abs(delta)
    const deltaLabel =
      abs === 0
        ? ''
        : ` (${abs} day${abs === 1 ? '' : 's'} ${later ? 'later' : 'earlier'})`
    return `moved ${formatShortDate(a)} → ${formatShortDate(b)}${deltaLabel}`
  } catch {
    return `moved ${formatShortDate(a)} → ${formatShortDate(b)}`
  }
}

export type FormatScheduleChangeOpts = {
  personNames?: Map<string, string>
}

/** Human-readable summary of a single audit row. */
export function formatScheduleChange(
  entry: ScheduleChangeEntry,
  opts: FormatScheduleChangeOpts = {},
): string {
  if (entry.action === 'created') {
    return `created “${entry.itemName ?? 'item'}”`
  }
  if (entry.action === 'deleted') {
    return `deleted “${entry.itemName ?? 'item'}”`
  }

  const parts: string[] = []
  const c = entry.changes

  const dateMove = formatDateMove(c.start_date?.old, c.start_date?.new)
  if (dateMove) parts.push(dateMove)
  else if (c.end_date && asString(c.end_date.old) !== asString(c.end_date.new)) {
    parts.push(
      `end date ${formatShortDate(c.end_date.old)} → ${formatShortDate(c.end_date.new)}`,
    )
  }

  if (c.name) {
    parts.push(`renamed “${asString(c.name.old) ?? '—'}” → “${asString(c.name.new) ?? '—'}”`)
  }
  if (c.status) {
    parts.push(`status: ${statusLabel(c.status.old)} → ${statusLabel(c.status.new)}`)
  }
  if (c.assigned_persons) {
    parts.push(formatPersonDiff(c.assigned_persons.old, c.assigned_persons.new, opts.personNames))
  }
  if (c.lead_person_ids) {
    parts.push(
      `leads: ${formatPersonDiff(c.lead_person_ids.old, c.lead_person_ids.new, opts.personNames).replace(/^reassigned:\s*/, '')}`,
    )
  }
  if (c.type) {
    parts.push(`type: ${asString(c.type.old) ?? '—'} → ${asString(c.type.new) ?? '—'}`)
  }
  if (c.duration) {
    parts.push(`duration: ${asString(c.duration.old) ?? '—'} → ${asString(c.duration.new) ?? '—'}`)
  }
  if (c.predecessors || c.predecessor_ids) {
    parts.push('predecessors updated')
  }
  if (c.supplier_id) {
    parts.push('supplier updated')
  }

  if (parts.length === 0) return `updated “${entry.itemName ?? 'item'}”`
  return parts.join('; ')
}

function scorePrimary(entry: ScheduleChangeEntry): number {
  let score = 0
  if (entry.changes.start_date) score += 10
  if (entry.changes.end_date) score += 4
  if (entry.changes.assigned_persons) score += 3
  if (entry.changes.status) score += 2
  if (entry.changes.name) score += 2
  score += Object.keys(entry.changes).length
  return score
}

/** Group raw rows by txid so a cascade reads as one event. */
export function groupByTxid(entries: ScheduleChangeEntry[]): ScheduleChangeGroup[] {
  const byTx = new Map<number, ScheduleChangeEntry[]>()
  for (const entry of entries) {
    const list = byTx.get(entry.txid) ?? []
    list.push(entry)
    byTx.set(entry.txid, list)
  }

  const groups: ScheduleChangeGroup[] = []
  for (const [txid, list] of byTx) {
    const sorted = [...list].sort((a, b) => scorePrimary(b) - scorePrimary(a))
    const primary = sorted[0]!
    const changedAt = list.reduce(
      (max, e) => (e.changedAt > max ? e.changedAt : max),
      list[0]!.changedAt,
    )
    groups.push({
      txid,
      changedAt,
      changedBy: primary.changedBy,
      changedByName: primary.changedByName,
      projectId: primary.projectId,
      entries: list,
      primary,
      dependentsCount: Math.max(0, list.length - 1),
    })
  }

  groups.sort((a, b) => b.changedAt.localeCompare(a.changedAt))
  return groups
}

/** Headline for a grouped cascade / batch event. */
export function formatScheduleChangeGroup(
  group: ScheduleChangeGroup,
  opts: FormatScheduleChangeOpts & { projectName?: string | null } = {},
): string {
  const actor = group.changedByName?.trim() || 'Someone'
  const item = group.primary.itemName ?? 'item'
  const projectBit = opts.projectName ? ` on ${opts.projectName}` : ''
  const dep =
    group.dependentsCount > 0
      ? ` (+${group.dependentsCount} dependent${group.dependentsCount === 1 ? '' : 's'} shifted)`
      : ''

  if (group.entries.every((e) => e.action === 'created')) {
    if (group.entries.length === 1) return `${actor} created “${item}”${projectBit}`
    return `${actor} created ${group.entries.length} items${projectBit}`
  }
  if (group.entries.every((e) => e.action === 'deleted')) {
    if (group.entries.length === 1) return `${actor} deleted “${item}”${projectBit}`
    return `${actor} deleted ${group.entries.length} items${projectBit}`
  }

  const dateMove = formatDateMove(
    group.primary.changes.start_date?.old,
    group.primary.changes.start_date?.new,
  )
  if (dateMove) {
    return `${actor} ${dateMove.replace(/^moved /, `moved “${item}” `)}${dep}${projectBit}`
  }

  const detail = formatScheduleChange(group.primary, opts)
  return `${actor} ${detail}${dep}${projectBit}`
}
