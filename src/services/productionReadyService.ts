// ============================================================================
// Production-ready nudge — jobs still in "order" whose production has started
// ============================================================================
// A drywall job sits in `order` status until someone manually advances it to
// `production`. If a production-phase schedule item (stock/hang/finish/…) has
// already started, the job is really in production but the status lags — which
// skews the COO dashboard (backlog vs. capacity). This surfaces those jobs so
// the office can one-click advance them; it never changes status on its own.

import { supabase, isOnlineMode } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'
import {
  phaseForScheduleItem,
  type SchedulePhase,
} from '@/components/drywall/schedule/scheduleItemStatusStyles'

/** Phases that mean field production has actually begun (excludes measure/office/other). */
const PRODUCTION_PHASES: ReadonlySet<SchedulePhase> = new Set<SchedulePhase>([
  'stock',
  'scaffold',
  'hang',
  'paper_floor',
  'finish',
  'cleanout',
])

export interface ProductionReadyNudge {
  projectId: string
  projectName: string
  /** Earliest production-phase schedule item that has already started ("stock date"). */
  startedItemName: string
  /** yyyy-MM-dd of that item's start. */
  startedDate: string
}

export async function fetchProductionReadyNudges(): Promise<ProductionReadyNudge[]> {
  if (!isOnlineMode()) return []

  const orgId = await requireUserOrgId()
  const today = new Date().toISOString().slice(0, 10)

  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('status', 'order')
  if (projErr) throw new Error(projErr.message || 'Failed to load projects')
  if (!projects?.length) return []

  const nameById = new Map<string, string>(
    projects.map((p) => [p.id as string, ((p.name as string) ?? '').trim() || 'Untitled']),
  )
  const projectIds = [...nameById.keys()]

  const { data: items, error: itemErr } = await supabase
    .from('schedule_items')
    .select('project_id, name, type, start_date')
    .eq('organization_id', orgId)
    .in('project_id', projectIds)
    .lte('start_date', today)
    .order('start_date', { ascending: true })
  if (itemErr) throw new Error(itemErr.message || 'Failed to load schedule items')

  // Items are ordered by start_date asc, so the first production-phase item seen
  // per project is that project's earliest started production item.
  const earliest = new Map<string, { name: string; date: string }>()
  for (const it of items ?? []) {
    const pid = it.project_id as string
    if (earliest.has(pid)) continue
    const phase = phaseForScheduleItem({
      name: (it.name as string) ?? '',
      type: it.type === 'office' ? 'office' : 'field',
    })
    if (!PRODUCTION_PHASES.has(phase)) continue
    earliest.set(pid, {
      name: ((it.name as string) ?? '').trim() || 'Production item',
      date: it.start_date as string,
    })
  }

  const nudges: ProductionReadyNudge[] = []
  for (const [pid, info] of earliest) {
    nudges.push({
      projectId: pid,
      projectName: nameById.get(pid) ?? 'Untitled',
      startedItemName: info.name,
      startedDate: info.date,
    })
  }
  return nudges.sort((a, b) => a.startedDate.localeCompare(b.startedDate))
}
