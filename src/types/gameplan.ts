// ============================================================================
// Gameplan - Chapters (phases) + Plays (gates). Readiness is primary; schedule is constraint.
// ============================================================================

export type ChapterStatus = 'READY' | 'BLOCKED' | 'IN_PROGRESS' | 'COMPLETE'

export type PlayOwner = 'GC' | 'SUB' | 'IN_HOUSE' | 'SUPPLIER'

export type PlayStatus = 'NOT_STARTED' | 'BLOCKED' | 'IN_PROGRESS' | 'COMPLETE'

export interface GameplanChapterConfig {
  key: string
  name: string
}

/** Static chapter list (phases). Order defines display order. */
export const GAMEPLAN_CHAPTERS: GameplanChapterConfig[] = [
  { key: 'pre_con', name: 'Pre-Con' },
  { key: 'foundation', name: 'Foundation' },
  { key: 'framing_dry_in', name: 'Framing & Dry-In' },
  { key: 'mep_rough', name: 'MEP Rough' },
  { key: 'insulation', name: 'Insulation' },
  { key: 'drywall', name: 'Drywall' },
  { key: 'finishes', name: 'Finishes' },
  { key: 'turnover', name: 'Turnover' },
]

export interface GameplanPlay {
  id: string
  projectId: string
  organizationId: string
  chapterKey: string
  title: string
  description: string | null
  owner: PlayOwner
  status: PlayStatus
  targetStart: string | null
  targetFinish: string | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface CreateGameplanPlayInput {
  chapterKey: string
  title: string
  description?: string | null
  owner: PlayOwner
  status?: PlayStatus
  targetStart?: string | null
  targetFinish?: string | null
  sortOrder?: number
}

export interface UpdateGameplanPlayInput {
  title?: string
  description?: string | null
  owner?: PlayOwner
  status?: PlayStatus
  targetStart?: string | null
  targetFinish?: string | null
  sortOrder?: number
}

/** Compute chapter status from play statuses (readiness-first). */
export function getChapterStatus(plays: GameplanPlay[]): ChapterStatus {
  if (plays.length === 0) return 'READY'
  const hasBlocked = plays.some((p) => p.status === 'BLOCKED')
  const hasInProgress = plays.some((p) => p.status === 'IN_PROGRESS')
  const allComplete = plays.every((p) => p.status === 'COMPLETE')
  if (hasBlocked) return 'BLOCKED'
  if (allComplete) return 'COMPLETE'
  if (hasInProgress) return 'IN_PROGRESS'
  return 'READY'
}

/** Blocking (not complete) count for display. */
export function getBlockingCount(plays: GameplanPlay[]): number {
  return plays.filter((p) => p.status !== 'COMPLETE').length
}

/** Confidence: low / med / high from % of plays complete. */
export function getConfidence(plays: GameplanPlay[]): 'low' | 'med' | 'high' | null {
  if (plays.length === 0) return null
  const complete = plays.filter((p) => p.status === 'COMPLETE').length
  const pct = complete / plays.length
  if (pct >= 1) return 'high'
  if (pct >= 0.5) return 'med'
  return 'low'
}

// ----------------------------------------------------------------------------
// HSH Workflow Playbook - default plays (from HSH_GC_Workflow_Playbook.docx)
// ----------------------------------------------------------------------------

export interface PlaybookPlayTemplate {
  chapterKey: string
  title: string
  description: string | null
  owner: PlayOwner
  sortOrder: number
}

// ----------------------------------------------------------------------------
// Playbook (DB) - org-level template
// ----------------------------------------------------------------------------

export interface PlaybookPlay {
  id: string
  organizationId: string
  chapterKey: string
  title: string
  description: string | null
  owner: PlayOwner
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface CreatePlaybookPlayInput {
  chapterKey: string
  title: string
  description?: string | null
  owner: PlayOwner
  sortOrder?: number
}

export interface UpdatePlaybookPlayInput {
  title?: string
  description?: string | null
  owner?: PlayOwner
  sortOrder?: number
}

// ----------------------------------------------------------------------------
// HSH default playbook (global, DB-backed, editable by admins)
// ----------------------------------------------------------------------------

export interface DefaultPlaybookPlay {
  id: string
  chapterKey: string
  title: string
  description: string | null
  owner: PlayOwner
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface CreateDefaultPlaybookPlayInput {
  chapterKey: string
  title: string
  description?: string | null
  owner: PlayOwner
  sortOrder?: number
}

export interface UpdateDefaultPlaybookPlayInput {
  title?: string
  description?: string | null
  owner?: PlayOwner
  sortOrder?: number
}

/** Fallback default plays (used only if gameplan_default_playbook is empty). */
export const HSH_PLAYBOOK_PLAYS: PlaybookPlayTemplate[] = [
  // Phase 1: Project Initiation, Procurement & Permit Setup → pre_con
  { chapterKey: 'pre_con', title: 'Finalize Construction Plans', description: 'Confirm plans permit-ready; resolve design/structural/code issues; issue plans for construction (IFC).', owner: 'GC', sortOrder: 1 },
  { chapterKey: 'pre_con', title: 'Permits', description: 'Submit for all required permits; track permit approvals and numbers.', owner: 'GC', sortOrder: 2 },
  { chapterKey: 'pre_con', title: 'Material Procurement', description: 'Identify major materials; place orders and confirm lead times; secure materials onsite or offsite per schedule.', owner: 'GC', sortOrder: 3 },
  { chapterKey: 'pre_con', title: 'Subcontractor Buy-Out & Scheduling', description: 'Secure all required subcontractors; confirm scope, pricing, and sequencing; establish tentative start windows.', owner: 'GC', sortOrder: 4 },
  { chapterKey: 'pre_con', title: 'Power Coordination', description: 'Obtain work order numbers for temporary and permanent power; coordinate meter and service locations.', owner: 'GC', sortOrder: 5 },
  { chapterKey: 'pre_con', title: 'Gas Utility Coordination', description: 'Contact gas company; schedule site visit after framing for gas line installation.', owner: 'GC', sortOrder: 6 },
  // Phase 2: Site Work & Foundation → foundation
  { chapterKey: 'foundation', title: 'Utility Verification & Tie-Ins', description: 'Call 811 for locates; confirm utilities marked; identify water and sewer tie-in locations.', owner: 'GC', sortOrder: 1 },
  { chapterKey: 'foundation', title: 'Foundation Excavation', description: 'Excavate per plans; verify depth, layout, and bearing conditions.', owner: 'SUB', sortOrder: 2 },
  { chapterKey: 'foundation', title: 'Footer Layout & Drainage', description: 'Frame footers; install footer drains; confirm sump pump location and drain routing.', owner: 'SUB', sortOrder: 3 },
  { chapterKey: 'foundation', title: 'Footer Pours', description: 'Pour perimeter and interior footers; schedule and pass inspections.', owner: 'SUB', sortOrder: 4 },
  { chapterKey: 'foundation', title: 'Basement Gravel Base', description: 'Cover drainage system; bring floor elevation level with footers.', owner: 'SUB', sortOrder: 5 },
  { chapterKey: 'foundation', title: 'Foundation Walls', description: 'Install foundation walls; confirm all wall openings prior to install.', owner: 'SUB', sortOrder: 6 },
  { chapterKey: 'foundation', title: 'Waterproofing & Below-Grade Insulation', description: 'Waterproof all below-grade walls; install insulation.', owner: 'SUB', sortOrder: 7 },
  { chapterKey: 'foundation', title: 'Backfill', description: 'Backfill with #57 gravel.', owner: 'SUB', sortOrder: 8 },
  { chapterKey: 'foundation', title: 'Basement Floor Slab', description: 'Confirm drains and bathroom rough-ins; pour slab.', owner: 'SUB', sortOrder: 9 },
  // Phase 3: Framing & Dry-In
  { chapterKey: 'framing_dry_in', title: 'Framing Readiness', description: 'Framing materials onsite; IFC plans onsite; window and door rough opening info finalized; foundation inspections passed.', owner: 'GC', sortOrder: 1 },
  { chapterKey: 'framing_dry_in', title: 'Wood Framing', description: 'Complete all structural framing per plans.', owner: 'SUB', sortOrder: 2 },
  { chapterKey: 'framing_dry_in', title: 'Windows & Exterior Doors', description: 'Install immediately after framing to seal structure.', owner: 'SUB', sortOrder: 3 },
  { chapterKey: 'framing_dry_in', title: 'Blocking for Cabinets & Accessories', description: 'Install blocking for cabinets, handrails, grab bars, towel bars, and accessories.', owner: 'SUB', sortOrder: 4 },
  { chapterKey: 'framing_dry_in', title: 'Garage Opening Temporary Access', description: 'Frame garage opening with plywood; install hinged temporary access door.', owner: 'GC', sortOrder: 5 },
  { chapterKey: 'framing_dry_in', title: 'Roofing & Exterior Envelope', description: 'Roofing, siding, fascia, soffits, gutters installed.', owner: 'SUB', sortOrder: 6 },
  // Phase 4: MEP Rough-In & Exterior Envelope (MEP portion)
  { chapterKey: 'mep_rough', title: 'Plumbing Rough-In', description: 'Tubs and shower valves onsite prior to start.', owner: 'SUB', sortOrder: 1 },
  { chapterKey: 'mep_rough', title: 'HVAC Rough-In', description: null, owner: 'SUB', sortOrder: 2 },
  { chapterKey: 'mep_rough', title: 'Electrical Rough-In', description: null, owner: 'SUB', sortOrder: 3 },
  { chapterKey: 'mep_rough', title: 'Exterior Coordination for MEP', description: 'Siding and exterior components required for penetrations onsite.', owner: 'GC', sortOrder: 4 },
  // Insulation
  { chapterKey: 'insulation', title: 'Insulation', description: 'Install insulation and pass inspection.', owner: 'SUB', sortOrder: 1 },
  // Drywall
  { chapterKey: 'drywall', title: 'Drywall', description: 'Floors papered before finishing; in cold months, heat must be operational before drywall begins.', owner: 'SUB', sortOrder: 1 },
  { chapterKey: 'drywall', title: 'Garage Door Installation', description: 'Install garage door after drywall finishing.', owner: 'SUB', sortOrder: 2 },
  // Phase 5: Interior Finish, Finals & Site Close-Out → finishes
  { chapterKey: 'finishes', title: 'Prime & Ceiling Finish', description: 'Prime all walls and ceilings; final coat on ceilings.', owner: 'SUB', sortOrder: 1 },
  { chapterKey: 'finishes', title: 'Carpentry & Cabinet Installation', description: 'Cabinets, trim, interior doors, finish panels; exterior doors covered and protected; thresholds protected.', owner: 'SUB', sortOrder: 2 },
  { chapterKey: 'finishes', title: 'Countertop Measurement', description: 'Measure after cabinets installed; typical lead time approximately 2 weeks.', owner: 'GC', sortOrder: 3 },
  { chapterKey: 'finishes', title: 'Final Paint', description: 'Two coats on trim; two coats on walls.', owner: 'SUB', sortOrder: 4 },
  { chapterKey: 'finishes', title: 'Final Trade Sequencing', description: '1) Final electrical 2) Flooring 3) Final HVAC 4) Countertops 5) Final plumbing.', owner: 'GC', sortOrder: 5 },
  { chapterKey: 'finishes', title: 'Countertop Protection', description: 'Countertops covered immediately after install.', owner: 'GC', sortOrder: 6 },
  { chapterKey: 'finishes', title: 'Appliances', description: 'Deliver and install appliances.', owner: 'SUB', sortOrder: 7 },
  { chapterKey: 'finishes', title: 'Exterior Close-Out', description: 'Final grading and landscaping; pour driveways, porches, sidewalks.', owner: 'SUB', sortOrder: 8 },
  // Turnover
  { chapterKey: 'turnover', title: 'Turnover & Close-Out', description: 'All finishes complete; utilities active; exterior work complete; project ready for turnover.', owner: 'GC', sortOrder: 1 },
]
