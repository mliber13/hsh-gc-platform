// Measuring a job in phases (docs/briefs/FIELD_PHASES.md, step 1 — Mark, 2026-10-16). Every
// area and every material line belongs to a phase; a job nobody phases is Phase 1, exactly as
// before (`phase` absent). The current phase is the open sheet; earlier phases fold away, with
// everything kept — crew pay, job size, heights and estimating all still read the whole job.

import type { FieldAccessoryEntry, FieldMeasurementArea, FieldTakeoff } from '@/types/drywall'
import { computeMeasuredSqft } from './fieldMeasurementUtils'

/** The phase of an area or material line — 1 when it carries none. */
export function phaseOf(item: { phase?: number }): number {
  return typeof item.phase === 'number' && item.phase >= 1 ? Math.floor(item.phase) : 1
}

/** The phase being measured now: the one started last, never below an area already in a later one. */
export function currentPhase(takeoff: Pick<FieldTakeoff, 'currentPhase' | 'measurements'>): number {
  const started = typeof takeoff.currentPhase === 'number' && takeoff.currentPhase >= 1 ? takeoff.currentPhase : 1
  return Math.max(started, ...(takeoff.measurements ?? []).map(phaseOf))
}

/** Whether this job has gone past one phase — the UI stays as it always was until then. */
export function isPhased(takeoff: Pick<FieldTakeoff, 'currentPhase' | 'measurements'>): boolean {
  return currentPhase(takeoff) > 1
}

/** Tag an area or material line with a phase. Phase 1 stays untagged, as on every older job. */
export function inPhase<T extends { phase?: number }>(item: T, phase: number): T {
  if (phase <= 1) {
    const { phase: _drop, ...rest } = item
    return rest as T
  }
  return { ...item, phase }
}

/** Open a new, empty phase after the current one. */
export function startNextPhase(takeoff: FieldTakeoff): FieldTakeoff {
  return { ...takeoff, currentPhase: currentPhase(takeoff) + 1 }
}

export interface PhaseSummary {
  phase: number
  areas: FieldMeasurementArea[]
  sqft: number
}

/** The earlier phases, oldest first, each with its areas and sqft — the folded lines. */
export function earlierPhases(takeoff: Pick<FieldTakeoff, 'currentPhase' | 'measurements'>): PhaseSummary[] {
  const now = currentPhase(takeoff)
  const out: PhaseSummary[] = []
  for (let p = 1; p < now; p++) {
    const areas = (takeoff.measurements ?? []).filter((a) => phaseOf(a) === p)
    if (areas.length) out.push({ phase: p, areas, sqft: computeMeasuredSqft(areas) })
  }
  return out
}

export function areasInPhase(measurements: FieldMeasurementArea[], phase: number): FieldMeasurementArea[] {
  return measurements.filter((a) => phaseOf(a) === phase)
}

export function materialsInPhase(accessories: FieldAccessoryEntry[], phase: number): FieldAccessoryEntry[] {
  return accessories.filter((a) => phaseOf(a) === phase)
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase()

/** The quote's areas not measured yet in any phase — what "Start from the quote's areas" offers. */
export function unmeasuredQuoteAreas<T extends { name: string }>(
  quoteAreas: T[],
  measurements: FieldMeasurementArea[],
): T[] {
  const measured = new Set(measurements.map((a) => norm(a.area)).filter(Boolean))
  return quoteAreas.filter((qa) => !measured.has(norm(qa.name)))
}
