import type { DrywallProjectScheduleItem } from '@/services/scheduleService'

export const SCHEDULE_ITEM_STATUS_LABELS: Record<
  DrywallProjectScheduleItem['status'],
  string
> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  complete: 'Complete',
  delayed: 'Delayed',
}

/** Status pill styling for list view. */
export const SCHEDULE_ITEM_STATUS_CLASS: Record<
  DrywallProjectScheduleItem['status'],
  string
> = {
  'not-started': 'bg-muted text-muted-foreground',
  'in-progress': 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  complete: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  delayed: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
}

// ============================================================================
// Phase coloring — substring match on item name → consistent color per phase.
// Used for calendar bars + list-view phase dot.
// ============================================================================

export type SchedulePhase =
  | 'measure'
  | 'stock'
  | 'scaffold'
  | 'hang'
  | 'paper_floor'
  | 'finish'
  | 'cleanout'
  | 'office'
  | 'other'

interface PhaseMatcher {
  phase: SchedulePhase
  /** Lowercase substrings; matches if name (lowercased) contains any. */
  keywords: string[]
}

/** Order matters — first match wins. More-specific phrases listed before generic ones. */
const PHASE_MATCHERS: PhaseMatcher[] = [
  { phase: 'paper_floor', keywords: ['paper floor', 'paper-floor', 'paperfloor'] },
  { phase: 'measure', keywords: ['measure'] },
  { phase: 'scaffold', keywords: ['scaffold', 'prep'] },
  { phase: 'stock', keywords: ['stock', 'delivery', 'deliver'] },
  { phase: 'hang', keywords: ['hang'] },
  { phase: 'finish', keywords: ['finish', 'mud', 'tape'] },
  { phase: 'cleanout', keywords: ['cleanout', 'clean out', 'pointup', 'point up', 'point-up'] },
]

export function phaseForItemName(name: string): SchedulePhase {
  const n = name.toLowerCase()
  for (const matcher of PHASE_MATCHERS) {
    if (matcher.keywords.some((kw) => n.includes(kw))) return matcher.phase
  }
  return 'other'
}

/** Type takes precedence — all office items share one color regardless of name. */
export function phaseForScheduleItem(item: {
  name: string
  type: 'field' | 'office'
}): SchedulePhase {
  if (item.type === 'office') return 'office'
  return phaseForItemName(item.name)
}

export const SCHEDULE_PHASE_LABELS: Record<SchedulePhase, string> = {
  measure: 'Measure',
  stock: 'Stock',
  scaffold: 'Scaffold / Prep',
  hang: 'Hang',
  paper_floor: 'Paper Floor',
  finish: 'Finish',
  cleanout: 'Cleanout',
  office: 'Office',
  other: 'Other',
}

/** Calendar bar classes — fill + text + border for phase color. */
export const SCHEDULE_PHASE_BAR_CLASS: Record<SchedulePhase, string> = {
  measure: 'bg-emerald-500 text-white border-emerald-600',
  stock: 'bg-amber-500 text-amber-950 border-amber-600',
  scaffold: 'bg-orange-500 text-white border-orange-600',
  hang: 'bg-blue-500 text-white border-blue-600',
  paper_floor: 'bg-pink-500 text-white border-pink-600',
  finish: 'bg-purple-500 text-white border-purple-600',
  cleanout: 'bg-slate-500 text-white border-slate-600',
  office: 'bg-teal-500 text-white border-teal-600',
  other: 'bg-neutral-500 text-white border-neutral-600',
}

/** Left border accent for portfolio calendar bars (phase color only). */
export const SCHEDULE_PHASE_LEFT_BORDER_CLASS: Record<SchedulePhase, string> = {
  measure: 'border-l-4 border-l-emerald-600',
  stock: 'border-l-4 border-l-amber-600',
  scaffold: 'border-l-4 border-l-orange-600',
  hang: 'border-l-4 border-l-blue-600',
  paper_floor: 'border-l-4 border-l-pink-600',
  finish: 'border-l-4 border-l-purple-600',
  cleanout: 'border-l-4 border-l-slate-600',
  office: 'border-l-4 border-l-teal-600',
  other: 'border-l-4 border-l-neutral-600',
}

/** Small color dot for list-view phase indicator. */
export const SCHEDULE_PHASE_DOT_CLASS: Record<SchedulePhase, string> = {
  measure: 'bg-emerald-500',
  stock: 'bg-amber-500',
  scaffold: 'bg-orange-500',
  hang: 'bg-blue-500',
  paper_floor: 'bg-pink-500',
  finish: 'bg-purple-500',
  cleanout: 'bg-slate-500',
  office: 'bg-teal-500',
  other: 'bg-neutral-400',
}
