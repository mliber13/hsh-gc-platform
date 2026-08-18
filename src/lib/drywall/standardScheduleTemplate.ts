// ============================================================================
// Standard drywall schedule template — the steps "Generate standard schedule"
// creates. Stored per-org (org_drywall_catalogs.standard_schedule_template) so
// the office configures default assignee / duration / lag per step in Settings.
// The steps form a linear chain: each depends on the one before it.
// ============================================================================

export interface StandardScheduleStep {
  /** Stable id (for React keys + reordering); not persisted to schedule_items. */
  id: string
  name: string
  /** Field work vs an office task (e.g. Bill Complete). */
  type: 'field' | 'office'
  /** Work-days the step spans (inclusive). Min 1. */
  durationDays: number
  /** Work-days after the previous step's end before this one starts. Min 0. */
  lagDays: number
  /** Default org_team member ids assigned when generated (may be empty). */
  assignedPersonIds: string[]
}

export type StandardScheduleTemplate = StandardScheduleStep[]

/** Built-in fallback when an org hasn't customized the template. Mirrors the
 *  original hardcoded lineup + a Bill Complete office step at the end. */
export const DEFAULT_STANDARD_SCHEDULE_TEMPLATE: StandardScheduleTemplate = [
  { id: 'measure', name: 'Measure', type: 'field', durationDays: 1, lagDays: 0, assignedPersonIds: [] },
  { id: 'stock', name: 'Stock', type: 'field', durationDays: 1, lagDays: 5, assignedPersonIds: [] },
  { id: 'scaffold-prep', name: 'Scaffold / Prep', type: 'field', durationDays: 1, lagDays: 0, assignedPersonIds: [] },
  { id: 'hang', name: 'Hang', type: 'field', durationDays: 1, lagDays: 1, assignedPersonIds: [] },
  { id: 'finish', name: 'Finish', type: 'field', durationDays: 1, lagDays: 1, assignedPersonIds: [] },
  { id: 'cleanout', name: 'Cleanout', type: 'field', durationDays: 1, lagDays: 1, assignedPersonIds: [] },
  { id: 'bill-complete', name: 'Bill Complete', type: 'office', durationDays: 1, lagDays: 1, assignedPersonIds: [] },
]

export function newStandardScheduleStep(): StandardScheduleStep {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? `step-${Date.now()}-${Math.floor(Math.random() * 1e6)}`),
    name: '',
    type: 'field',
    durationDays: 1,
    lagDays: 1,
    assignedPersonIds: [],
  }
}

function normalizeStep(raw: unknown, index: number): StandardScheduleStep | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (!name) return null
  const durationRaw = Number(r.durationDays)
  const lagRaw = Number(r.lagDays)
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `step-${index}`,
    name,
    type: r.type === 'office' ? 'office' : 'field',
    durationDays: Number.isFinite(durationRaw) ? Math.max(1, Math.round(durationRaw)) : 1,
    lagDays: Number.isFinite(lagRaw) ? Math.max(0, Math.round(lagRaw)) : 1,
    assignedPersonIds: Array.isArray(r.assignedPersonIds)
      ? r.assignedPersonIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [],
  }
}

/** Parse the stored JSON into a valid template, or null when unset/empty (→ use default). */
export function normalizeStandardScheduleTemplate(raw: unknown): StandardScheduleTemplate | null {
  if (!Array.isArray(raw)) return null
  const steps = raw
    .map((s, i) => normalizeStep(s, i))
    .filter((s): s is StandardScheduleStep => s != null)
  return steps.length > 0 ? steps : null
}
