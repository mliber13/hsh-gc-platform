import { addDays, differenceInCalendarDays, isAfter, isBefore, parseISO } from 'date-fns'
import type { ScheduleItem } from '@/types'

export interface UnavailabilityWindow {
  companyId: string
  start: string
  end: string
}

export interface ScheduleDateMathOptions {
  workdays?: ReadonlyArray<0 | 1 | 2 | 3 | 4 | 5 | 6>
  holidays?: ReadonlyArray<string>
  unavailability?: ReadonlyArray<UnavailabilityWindow>
  /**
   * How predecessor lag is interpreted in cascadeSchedule:
   *   'sequential' (default) — `lag` = work days AFTER predecessor end, with +1 implicit gap.
   *                            Matches existing GC ScheduleBuilder behavior.
   *   'parallel-zero'         — `lag=0` means same start day as predecessor (parallel work).
   *                            `lag>=1` means N work days after predecessor end (no implicit gap).
   *                            Drywall uses this so lag=0 = same-day Stock+Scaffold/Prep pattern.
   */
  lagSemantic?: 'sequential' | 'parallel-zero'
}

export interface CascadeChange {
  itemId: string
  oldStartDate: Date
  newStartDate: Date
  oldEndDate: Date
  newEndDate: Date
  drivenBy: string[]
}

export interface CascadeResult {
  items: ScheduleItem[]
  changes: CascadeChange[]
  cycle?: string[]
}

const DEFAULT_WORKDAYS: ReadonlyArray<0 | 1 | 2 | 3 | 4 | 5 | 6> = [1, 2, 3, 4, 5]
const MAX_DATE_WALK_ITERATIONS = 365

function toDateOnlyKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function normalizeWorkdays(options?: ScheduleDateMathOptions): ReadonlyArray<0 | 1 | 2 | 3 | 4 | 5 | 6> {
  return options?.workdays && options.workdays.length > 0 ? options.workdays : DEFAULT_WORKDAYS
}

function normalizeHolidays(options?: ScheduleDateMathOptions): Set<string> {
  return new Set((options?.holidays ?? []).map((holiday) => holiday.slice(0, 10)))
}

function isDateInRangeInclusive(date: Date, start: Date, end: Date): boolean {
  return !isBefore(date, start) && !isAfter(date, end)
}

export function isWorkday(
  date: Date,
  options?: ScheduleDateMathOptions,
  companyId?: string,
): boolean {
  const weekday = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
  const workdays = normalizeWorkdays(options)
  if (!workdays.includes(weekday)) return false

  const dateKey = toDateOnlyKey(date)
  const holidays = normalizeHolidays(options)
  if (holidays.has(dateKey)) return false

  if (!companyId) return true
  const windows = options?.unavailability ?? []
  const blocked = windows.some((window) => {
    if (window.companyId !== companyId) return false
    const start = parseISO(window.start)
    const end = parseISO(window.end)
    return isDateInRangeInclusive(date, start, end)
  })
  return !blocked
}

export function nextWorkday(
  date: Date,
  options?: ScheduleDateMathOptions,
  companyId?: string,
): Date {
  let current = new Date(date)
  for (let i = 0; i < MAX_DATE_WALK_ITERATIONS; i += 1) {
    if (isWorkday(current, options, companyId)) return current
    current = addDays(current, 1)
  }
  return current
}

export function addWorkdays(
  date: Date,
  n: number,
  options?: ScheduleDateMathOptions,
  companyId?: string,
): Date {
  if (n === 0) return nextWorkday(date, options, companyId)

  let remaining = Math.abs(n)
  let current = new Date(date)
  const direction = n > 0 ? 1 : -1
  for (let i = 0; i < MAX_DATE_WALK_ITERATIONS * Math.max(1, remaining); i += 1) {
    current = addDays(current, direction)
    if (isWorkday(current, options, companyId)) {
      remaining -= 1
      if (remaining === 0) return current
    }
  }
  return current
}

export function workdaysBetween(
  start: Date,
  end: Date,
  options?: ScheduleDateMathOptions,
  companyId?: string,
): number {
  if (differenceInCalendarDays(end, start) === 0) {
    return isWorkday(start, options, companyId) ? 1 : 0
  }

  if (isAfter(start, end)) {
    return -workdaysBetween(end, start, options, companyId)
  }

  let total = 0
  let current = new Date(start)
  for (let i = 0; i <= differenceInCalendarDays(end, start); i += 1) {
    if (isWorkday(current, options, companyId)) total += 1
    current = addDays(current, 1)
  }
  return total
}

function findCycleOrder(items: ReadonlyArray<ScheduleItem>): string[] | undefined {
  const byId = new Map(items.map((item) => [item.id, item]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []

  const dfs = (id: string): string[] | undefined => {
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id)
      return cycleStart >= 0 ? [...stack.slice(cycleStart), id] : [id]
    }
    if (visited.has(id)) return undefined
    visiting.add(id)
    stack.push(id)
    const item = byId.get(id)
    const predecessors = item?.predecessors ?? []
    for (const predecessor of predecessors) {
      if (!byId.has(predecessor.predecessorId)) continue
      const cycle = dfs(predecessor.predecessorId)
      if (cycle) return cycle
    }
    stack.pop()
    visiting.delete(id)
    visited.add(id)
    return undefined
  }

  for (const item of items) {
    const cycle = dfs(item.id)
    if (cycle) return cycle
  }
  return undefined
}

export function cascadeSchedule(
  items: ReadonlyArray<ScheduleItem>,
  options?: ScheduleDateMathOptions,
): CascadeResult {
  if (items.length === 0) return { items: [], changes: [] }

  const cycle = findCycleOrder(items)
  if (cycle) {
    return { items: items.map((item) => ({ ...item })), changes: [], cycle }
  }

  const byId = new Map(items.map((item) => [item.id, item]))
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  items.forEach((item) => {
    inDegree.set(item.id, 0)
    dependents.set(item.id, [])
  })
  items.forEach((item) => {
    item.predecessors.forEach((predecessor) => {
      if (!byId.has(predecessor.predecessorId)) return
      inDegree.set(item.id, (inDegree.get(item.id) ?? 0) + 1)
      dependents.set(predecessor.predecessorId, [...(dependents.get(predecessor.predecessorId) ?? []), item.id])
    })
  })

  const queue: string[] = items.filter((item) => (inDegree.get(item.id) ?? 0) === 0).map((item) => item.id)
  const topo: string[] = []
  while (queue.length > 0) {
    const current = queue.shift() as string
    topo.push(current)
    const downstream = dependents.get(current) ?? []
    downstream.forEach((nextId) => {
      const nextDegree = (inDegree.get(nextId) ?? 0) - 1
      inDegree.set(nextId, nextDegree)
      if (nextDegree === 0) queue.push(nextId)
    })
  }

  const computed = new Map<string, ScheduleItem>()
  const changes: CascadeChange[] = []

  topo.forEach((id) => {
    const original = byId.get(id)
    if (!original) return

    const normalizedDuration = Math.max(1, original.duration || 1)
    const relevantPredecessors = original.predecessors.filter((predecessor) => computed.has(predecessor.predecessorId))

    let newStartDate = new Date(original.startDate)
    let drivenBy: string[] = []

    if (relevantPredecessors.length > 0) {
      const predecessorCandidates = relevantPredecessors.map((predecessor) => {
        const predecessorItem = computed.get(predecessor.predecessorId) as ScheduleItem
        const lag = Number.isFinite(predecessor.lagDays) ? predecessor.lagDays : 0
        const parallelZero = options?.lagSemantic === 'parallel-zero'
        const candidateStart =
          parallelZero && lag === 0
            ? new Date(predecessorItem.endDate)
            : addWorkdays(
                predecessorItem.endDate,
                parallelZero ? lag : lag + 1,
                options,
                original.assignedCompanyId ?? undefined,
              )
        return {
          predecessorId: predecessor.predecessorId,
          candidateStart,
        }
      })

      const maxStart = predecessorCandidates.reduce((latest, candidate) =>
        isAfter(candidate.candidateStart, latest) ? candidate.candidateStart : latest,
      predecessorCandidates[0].candidateStart)

      newStartDate = maxStart
      drivenBy = predecessorCandidates
        .filter((candidate) => candidate.candidateStart.getTime() === maxStart.getTime())
        .map((candidate) => candidate.predecessorId)
    }

    const newEndDate = addWorkdays(
      newStartDate,
      Math.max(0, normalizedDuration - 1),
      options,
      original.assignedCompanyId ?? undefined,
    )

    const nextItem: ScheduleItem = {
      ...original,
      startDate: newStartDate,
      endDate: newEndDate,
      duration: normalizedDuration,
    }
    computed.set(id, nextItem)

    if (
      original.startDate.getTime() !== newStartDate.getTime()
      || original.endDate.getTime() !== newEndDate.getTime()
    ) {
      changes.push({
        itemId: original.id,
        oldStartDate: new Date(original.startDate),
        newStartDate: new Date(newStartDate),
        oldEndDate: new Date(original.endDate),
        newEndDate: new Date(newEndDate),
        drivenBy,
      })
    }
  })

  const updatedItems = items.map((item) => computed.get(item.id) ?? { ...item })
  return { items: updatedItems, changes }
}
