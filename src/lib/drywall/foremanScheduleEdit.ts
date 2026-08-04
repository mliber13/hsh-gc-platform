/**
 * Field foreman schedule edit — reuses desktop cascade + Detach/Shift conflict logic
 * (ScheduleItemDialog D.6.7). No SMS / Twilio.
 */

import { parseISO } from 'date-fns'
import {
  addWorkdays,
  cascadeSchedule,
  type CascadeChange,
  workdaysBetween,
} from '@/lib/scheduleDateMath'
import type { ScheduleItem } from '@/types'
import type {
  DrywallProjectScheduleItem,
  DrywallScheduleItemStatus,
  NewScheduleItemInput,
} from '@/services/scheduleService'

export type ForemanScheduleEditInput = {
  startDate: string
  endDate: string
  status: DrywallScheduleItemStatus
  assignedPersons: string[]
  /** Crew-facing notes. Omit to leave unchanged; empty string clears. */
  notes?: string
  /** When Detach resolves a conflict — clear predecessor links on the edited item. */
  clearPredecessors?: boolean
}

export type ForemanPredecessorConflict = {
  predictedStart: string
  predecessor: DrywallProjectScheduleItem | null
  draft: ForemanScheduleEditInput
}

export type ForemanCascadePreview = {
  items: DrywallProjectScheduleItem[]
  changes: Array<{
    itemId: string
    name: string
    oldStartDate: string
    newStartDate: string
    oldEndDate: string
    newEndDate: string
  }>
  conflict: ForemanPredecessorConflict | null
}

function toDateOnly(value: string): string {
  return value.slice(0, 10)
}

function durationFromRange(startDate: string, endDate: string): number {
  return Math.max(1, workdaysBetween(parseISO(toDateOnly(startDate)), parseISO(toDateOnly(endDate))))
}

function toModel(item: DrywallProjectScheduleItem): ScheduleItem {
  return {
    id: item.id,
    scheduleId: item.schedule_id,
    type: item.type,
    name: item.name,
    startDate: parseISO(item.start_date),
    endDate: parseISO(item.end_date),
    duration: item.duration,
    predecessorIds: item.predecessor_ids,
    predecessors: item.predecessor_ids.map((predecessorId) => ({
      predecessorId,
      lagDays: item.lag_work_days,
    })),
    status: item.status,
    percentComplete: item.status === 'complete' ? 100 : 0,
    confirmation_status: 'unsent',
    assignedPersons: item.assigned_persons,
    assignedCompanyId: item.assigned_company_id,
    assignedTo: [],
    notes: item.notes ?? undefined,
  }
}

function applyEditToItem(
  item: DrywallProjectScheduleItem,
  edit: ForemanScheduleEditInput,
): DrywallProjectScheduleItem {
  const start = toDateOnly(edit.startDate)
  const end = toDateOnly(edit.endDate || edit.startDate)
  return {
    ...item,
    start_date: start,
    end_date: end,
    duration: durationFromRange(start, end),
    status: edit.status,
    assigned_persons: edit.assignedPersons,
    notes: edit.notes !== undefined ? edit.notes : item.notes,
    predecessor_ids: edit.clearPredecessors ? [] : item.predecessor_ids,
    lag_work_days: edit.clearPredecessors ? 0 : item.lag_work_days,
  }
}

/** Same prediction as ScheduleItemDialog.predictCascadeStart. */
export function predictCascadeStartForEdit(
  siblings: DrywallProjectScheduleItem[],
  editingId: string,
  edit: ForemanScheduleEditInput,
  predecessorIds: string[],
  lagWorkDays: number,
): string {
  const models: ScheduleItem[] = []
  for (const sibling of siblings) {
    if (sibling.id === editingId) continue
    models.push(toModel(sibling))
  }
  const draftDuration = durationFromRange(edit.startDate, edit.endDate || edit.startDate)
  models.push({
    id: editingId,
    scheduleId: siblings.find((s) => s.id === editingId)?.schedule_id ?? '',
    type: siblings.find((s) => s.id === editingId)?.type ?? 'field',
    name: siblings.find((s) => s.id === editingId)?.name ?? '',
    startDate: parseISO(edit.startDate),
    endDate: parseISO(edit.endDate || edit.startDate),
    duration: draftDuration,
    predecessorIds,
    predecessors: predecessorIds.map((id) => ({
      predecessorId: id,
      lagDays: lagWorkDays,
    })),
    status: edit.status,
    percentComplete: edit.status === 'complete' ? 100 : 0,
    confirmation_status: 'unsent',
    assignedPersons: edit.assignedPersons,
    assignedCompanyId: null,
    assignedTo: [],
  })
  const result = cascadeSchedule(models, { lagSemantic: 'parallel-zero' })
  const cascaded = result.items.find((i) => i.id === editingId)
  if (!cascaded) return edit.startDate
  return cascaded.startDate.toISOString().slice(0, 10)
}

/**
 * Detect Detach/Shift conflict (desktop parity). Returns conflict without cascading
 * dependents when the user's start would be overridden by predecessors.
 */
export function detectPredecessorConflict(
  siblings: DrywallProjectScheduleItem[],
  editingId: string,
  edit: ForemanScheduleEditInput,
): ForemanPredecessorConflict | null {
  const current = siblings.find((s) => s.id === editingId)
  if (!current) return null
  const predecessorIds = edit.clearPredecessors ? [] : current.predecessor_ids
  if (predecessorIds.length === 0) return null

  const predicted = predictCascadeStartForEdit(
    siblings,
    editingId,
    edit,
    predecessorIds,
    current.lag_work_days,
  )
  if (predicted === toDateOnly(edit.startDate)) return null

  const predOnly =
    predecessorIds.length === 1
      ? siblings.find((s) => s.id === predecessorIds[0]) ?? null
      : null

  return {
    predictedStart: predicted,
    predecessor: predOnly,
    draft: edit,
  }
}

/** Shift predecessor earlier so the edited item can keep the user's chosen start (desktop parity). */
export function shiftPredecessorForConflict(
  siblings: DrywallProjectScheduleItem[],
  editingId: string,
  conflict: ForemanPredecessorConflict,
): DrywallProjectScheduleItem[] {
  if (!conflict.predecessor) return siblings
  const pred = conflict.predecessor
  const userStart = parseISO(conflict.draft.startDate)
  const editing = siblings.find((s) => s.id === editingId)
  const lag = editing?.lag_work_days ?? 0
  const newPredEnd = lag === 0 ? userStart : addWorkdays(userStart, -lag)
  const newPredStart = addWorkdays(newPredEnd, -(pred.duration - 1))
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  return siblings.map((s) => {
    if (s.id !== pred.id) return s
    return {
      ...s,
      start_date: iso(newPredStart),
      end_date: iso(newPredEnd),
      duration: Math.max(1, workdaysBetween(newPredStart, newPredEnd)),
    }
  })
}

export function buildCascadePreview(
  siblings: DrywallProjectScheduleItem[],
  editingId: string,
  edit: ForemanScheduleEditInput,
  options?: { resolveConflict?: 'detach' | 'shift' },
): ForemanCascadePreview {
  let working = siblings.map((s) => ({ ...s }))
  let editToApply = { ...edit }

  if (options?.resolveConflict === 'detach') {
    editToApply = { ...editToApply, clearPredecessors: true }
  } else if (options?.resolveConflict === 'shift') {
    const conflict = detectPredecessorConflict(working, editingId, editToApply)
    if (conflict?.predecessor) {
      working = shiftPredecessorForConflict(working, editingId, conflict)
    }
  } else {
    const conflict = detectPredecessorConflict(working, editingId, editToApply)
    if (conflict) {
      return { items: working, changes: [], conflict }
    }
  }

  working = working.map((s) => (s.id === editingId ? applyEditToItem(s, editToApply) : s))

  const models = working.map(toModel)
  const result = cascadeSchedule(models, { lagSemantic: 'parallel-zero' })
  if (result.cycle) {
    throw new Error('Schedule has a circular dependency — review predecessors')
  }

  const byId = new Map(working.map((s) => [s.id, s]))
  const cascadedItems: DrywallProjectScheduleItem[] = result.items.map((model) => {
    const base = byId.get(model.id)
    if (!base) return base as unknown as DrywallProjectScheduleItem
    const start = model.startDate.toISOString().slice(0, 10)
    const end = model.endDate.toISOString().slice(0, 10)
    return {
      ...base,
      start_date: start,
      end_date: end,
      duration: model.duration,
      // Detach clears predecessors on the edited item only.
      predecessor_ids:
        base.id === editingId && editToApply.clearPredecessors ? [] : base.predecessor_ids,
    }
  })

  const nameById = new Map(siblings.map((s) => [s.id, s.name]))
  const changes = result.changes.map((c: CascadeChange) => ({
    itemId: c.itemId,
    name: nameById.get(c.itemId) ?? c.itemId,
    oldStartDate: c.oldStartDate.toISOString().slice(0, 10),
    newStartDate: c.newStartDate.toISOString().slice(0, 10),
    oldEndDate: c.oldEndDate.toISOString().slice(0, 10),
    newEndDate: c.newEndDate.toISOString().slice(0, 10),
  }))

  return { items: cascadedItems, changes, conflict: null }
}

export function toRpcBatch(items: DrywallProjectScheduleItem[]) {
  return items.map((item) => ({
    id: item.id,
    start_date: item.start_date,
    end_date: item.end_date,
    status: item.status,
    duration: item.duration,
    assigned_persons: item.assigned_persons,
    notes: item.notes ?? null,
    predecessors: item.predecessor_ids.map((predecessor_id) => ({
      predecessor_id,
      lag_days: item.lag_work_days,
    })),
  }))
}

/** Helper for tests / typing — mirrors NewScheduleItemInput date fields. */
export function editFromPayload(payload: NewScheduleItemInput): ForemanScheduleEditInput {
  return {
    startDate: payload.startDate,
    endDate: payload.endDate,
    status: (payload.status ?? 'not-started') as DrywallScheduleItemStatus,
    assignedPersons: payload.assignedPersons ?? [],
  }
}
