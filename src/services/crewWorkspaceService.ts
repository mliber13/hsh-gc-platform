// ============================================================================
// Crew workspace data — assigned drywall projects (D.6.2)
// ============================================================================

import { format } from 'date-fns'
import { supabase, isOnlineMode } from '@/lib/supabase'
import { DRYWALL_QUOTE_BASE_DEFAULTS } from '@/lib/drywall/drywallQuoteDefaults'
import {
  getEffectiveFinisherRate,
  getEffectiveHangerRate,
} from '@/lib/drywall/quoteV3CatalogResolve'
import { belongsInDrywallWorkspace } from '@/services/projectVisibility'
import {
  fetchDrywallProjectById,
  getIntakeSourceFromLegacy,
  getPoDataFromLegacy,
} from '@/services/drywallProjectsService'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import { hydrateDrywallQuoteV3 } from '@/lib/drywall/createEmptyDrywallQuoteV3'
import { getCurrentUserProfile, requireUserOrgId } from '@/services/userService'
import { fetchTeam } from '@/services/hrTeamService'
import {
  specialtyFromPositionName,
  isMeasurerSpecialty,
  type CrewSpecialty,
} from '@/lib/drywall/crewSpecialty'
import { crewMeasureWorkflowStatus } from '@/lib/drywall/crewMeasureStatus'
import {
  fieldTakeoffWithTotals,
  mergeFieldTakeoff,
  quotedSqftWithWaste,
} from '@/lib/drywall/fieldMeasurementUtils'
import { phaseForScheduleItem } from '@/components/drywall/schedule/scheduleItemStatusStyles'
import type {
  CrewLaborRateSource,
  CrewMeasurePageContext,
  CrewProjectDetail,
  CrewProjectListItem,
  CrewProjectScheduleEntry,
} from '@/types/crew'
import type {
  DrywallPoData,
  DrywallProject,
  DrywallQuote,
  DrywallQuoteV3,
  FieldTakeoff,
  QuoteBreakdown,
  QuoteLineItem,
} from '@/types/drywall'
import { isDrywallProjectClosed, normalizeDrywallProjectStatus } from '@/types/drywall'

export class CrewWorkspacePermissionError extends Error {
  constructor(message = 'You do not have access to this project.') {
    super(message)
    this.name = 'CrewWorkspacePermissionError'
  }
}

export class CrewProfileNotLinkedError extends Error {
  constructor(
    message = 'Your account is not linked to a team member profile. Contact your office administrator.',
  ) {
    super(message)
    this.name = 'CrewProfileNotLinkedError'
  }
}

type ScheduleRow = {
  id: string
  project_id: string
  name: string
  type: 'field' | 'office'
  start_date: string
  end_date: string
  status: string
  notes: string | null
  show_job_info_person_ids: string[] | null
}

type ProjectRow = {
  id: string
  name: string
  client: unknown
  address: unknown
  city?: string | null
  state?: string | null
  zip_code?: string | null
  status: string
  type: string
  metadata: Record<string, unknown> | null
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : null
}

function formatClient(client: unknown, fallback = ''): string {
  if (typeof client === 'string') return client.trim() || fallback
  if (client && typeof client === 'object') {
    const c = client as Record<string, unknown>
    return (
      (typeof c.name === 'string' && c.name.trim()) ||
      (typeof c.company === 'string' && c.company.trim()) ||
      fallback
    )
  }
  return fallback
}

function formatAddress(row: ProjectRow): string {
  if (typeof row.address === 'string' && row.address.trim()) return row.address.trim()
  if (row.address && typeof row.address === 'object') {
    const a = row.address as Record<string, unknown>
    const parts = [
      typeof a.street === 'string' ? a.street : typeof a.line1 === 'string' ? a.line1 : '',
      typeof a.city === 'string' ? a.city : row.city ?? '',
      typeof a.state === 'string' ? a.state : row.state ?? '',
      typeof a.zip === 'string' ? a.zip : typeof a.zipCode === 'string' ? a.zipCode : row.zip_code ?? '',
    ].filter(Boolean)
    if (parts.length) return parts.join(', ')
  }
  const parts = [row.city, row.state, row.zip_code].filter(Boolean)
  return parts.join(', ')
}

function resolvePersonId(profile: Awaited<ReturnType<typeof getCurrentUserProfile>>): string {
  const id =
    profile?.linkedEmployeeId ??
    profile?.linkedContractorId ??
    profile?.linked_employee_id ??
    profile?.linked_contractor_id ??
    null
  if (!id || typeof id !== 'string') {
    throw new CrewProfileNotLinkedError()
  }
  return id
}

function isDrywallProjectRow(row: ProjectRow): boolean {
  if (row.type === 'drywall') return true
  const meta = row.metadata ?? {}
  if (meta.app_scope === 'DRYWALL_ONLY') return true
  return belongsInDrywallWorkspace(meta)
}

function isExcludedProject(row: ProjectRow): boolean {
  if (isDrywallProjectClosed(row.status)) return true
  const legacy =
    row.metadata?.legacy && typeof row.metadata.legacy === 'object'
      ? (row.metadata.legacy as Record<string, unknown>)
      : {}
  const quote = legacy.quote
  if (quote && typeof quote === 'object' && !Array.isArray(quote)) {
    const outcome = (quote as Record<string, unknown>).outcome
    if (outcome === 'lost') return true
  }
  return false
}

function mapScheduleEntry(row: ScheduleRow): CrewProjectScheduleEntry {
  return {
    id: row.id,
    name: row.name,
    type: row.type === 'office' ? 'office' : 'field',
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    notes: row.notes,
  }
}

function nextScheduledDate(rows: ScheduleRow[]): string | null {
  if (rows.length === 0) return null
  const today = format(new Date(), 'yyyy-MM-dd')
  const sorted = [...rows].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const upcoming = sorted.find((r) => r.start_date >= today)
  return upcoming?.start_date ?? sorted[0]?.start_date ?? null
}

async function fetchAssignedScheduleRows(personId: string): Promise<ScheduleRow[]> {
  const orgId = await requireUserOrgId()
  const { data, error } = await supabase
    .from('schedule_items')
    .select(
      'id, project_id, name, type, start_date, end_date, status, notes, show_job_info_person_ids',
    )
    .eq('organization_id', orgId)
    .contains('assigned_persons', [personId])
    .order('start_date', { ascending: true })

  if (error) throw new Error(error.message || 'Failed to load schedule assignments')
  return (data ?? []) as ScheduleRow[]
}

function personSeesJobInfo(personId: string, rows: ScheduleRow[]): boolean {
  return rows.some((row) => (row.show_job_info_person_ids ?? []).includes(personId))
}

export type CrewViewAsOpts = {
  viewAsPersonId?: string
}

/** Operator preview: resolve specialty from org_team (operators can read the roster). */
export async function resolveSpecialtyForPerson(personId: string): Promise<CrewSpecialty> {
  try {
    const team = await fetchTeam()
    const member =
      team.employees.find((e) => e.id === personId) ??
      team.contractors1099.find((c) => c.id === personId)
    if (!member?.positionId) return 'unknown'
    const position = team.positions.find((p) => p.id === member.positionId)
    return specialtyFromPositionName(position?.name ?? null)
  } catch (e) {
    console.warn('resolveSpecialtyForPerson failed:', e)
    return 'unknown'
  }
}

async function resolvePersonContext(
  opts?: CrewViewAsOpts,
): Promise<{ personId: string; specialty: CrewSpecialty }> {
  if (opts?.viewAsPersonId) {
    const personId = opts.viewAsPersonId
    const specialty = await resolveSpecialtyForPerson(personId)
    return { personId, specialty }
  }
  const profile = await getCurrentUserProfile()
  const personId = resolvePersonId(profile)
  const specialty = await resolveCrewSpecialty(personId)
  return { personId, specialty }
}

export async function fetchCrewProjectList(
  opts?: CrewViewAsOpts,
): Promise<CrewProjectListItem[]> {
  if (!isOnlineMode()) return []

  const { personId, specialty } = await resolvePersonContext(opts)
  const scheduleRows = await fetchAssignedScheduleRows(personId)
  if (scheduleRows.length === 0) return []

  const projectIds = [...new Set(scheduleRows.map((r) => r.project_id))]
  const orgId = await requireUserOrgId()

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, client, address, city, state, zip_code, status, type, metadata')
    .eq('organization_id', orgId)
    .in('id', projectIds)

  if (error) throw new Error(error.message || 'Failed to load projects')

  const byProject = new Map<string, ScheduleRow[]>()
  for (const row of scheduleRows) {
    const list = byProject.get(row.project_id) ?? []
    list.push(row)
    byProject.set(row.project_id, list)
  }

  const items: CrewProjectListItem[] = []
  for (const row of (data ?? []) as ProjectRow[]) {
    if (!isDrywallProjectRow(row) || isExcludedProject(row)) continue
    const personItems = byProject.get(row.id) ?? []
    if (personItems.length === 0) continue

    const hasMeasureAssignment = personItems.some(scheduleRowHasMeasurePhase)
    let measureWorkflowStatus: CrewProjectListItem['measureWorkflowStatus'] = null
    if (isMeasurerSpecialty(specialty) && hasMeasureAssignment) {
      const legacy =
        row.metadata?.legacy && typeof row.metadata.legacy === 'object'
          ? (row.metadata.legacy as Record<string, unknown>)
          : {}
      measureWorkflowStatus = crewMeasureWorkflowStatus(parseFieldTakeoff(legacy))
    }

    items.push({
      projectId: row.id,
      projectName: row.name?.trim() || 'Untitled',
      client: formatClient(row.client),
      address: formatAddress(row),
      status: normalizeDrywallProjectStatus(row.status),
      nextScheduledDate: nextScheduledDate(personItems),
      scheduleEntryCount: personItems.length,
      scheduleItemNames: personItems.map((r) => r.name.trim()).filter(Boolean),
      measureWorkflowStatus,
    })
  }

  items.sort((a, b) => {
    if (!a.nextScheduledDate && !b.nextScheduledDate) {
      return a.projectName.localeCompare(b.projectName)
    }
    if (!a.nextScheduledDate) return 1
    if (!b.nextScheduledDate) return -1
    const cmp = a.nextScheduledDate.localeCompare(b.nextScheduledDate)
    return cmp !== 0 ? cmp : a.projectName.localeCompare(b.projectName)
  })

  return items
}

function parseFieldTakeoff(legacy: Record<string, unknown>): FieldTakeoff | null {
  const raw = legacy.fieldTakeoff
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as FieldTakeoff
}

function v2QuoteFromLegacy(legacy: Record<string, unknown>): DrywallQuote | null {
  const raw = legacy.quote
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const q = raw as Record<string, unknown>
  if (q.version === 3) return null
  return q as DrywallQuote
}

function v3QuoteFromLegacy(legacy: Record<string, unknown>): DrywallQuoteV3 | null {
  const raw = legacy.quote
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const q = raw as Record<string, unknown>
  if (q.version !== 3) return null
  // Hydrate so structured-scope fields backfill from legacyV2Snapshot when the operator
  // hasn't re-saved since D.6.6b shipped.
  return hydrateDrywallQuoteV3(q)
}

function resolveScopeOfWork(
  legacy: Record<string, unknown>,
  intakeSource: 'quote' | 'po',
  po: DrywallPoData | null,
): string {
  if (intakeSource === 'po' && po?.scopeText) return po.scopeText.trim()
  const v3 = v3QuoteFromLegacy(legacy)
  if (v3?.scope_of_work?.trim()) return v3.scope_of_work.trim()
  const v2 = v2QuoteFromLegacy(legacy)
  if (v2?.useCustomScopeOfWork && v2.customScopeOfWork?.trim()) {
    return v2.customScopeOfWork.trim()
  }
  if (v2?.scopeOfWork?.trim()) return v2.scopeOfWork.trim()
  if (po?.scopeText?.trim()) return po.scopeText.trim()
  return ''
}

function nonEmptyStr(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function resolveStructuredScope(
  legacy: Record<string, unknown>,
): CrewProjectDetail['structuredScope'] {
  const v3 = v3QuoteFromLegacy(legacy)
  if (v3) {
    const ceilingFinish =
      v3.ceiling_finish === 'Other'
        ? nonEmptyStr(v3.ceiling_finish_other) ?? 'Other'
        : nonEmptyStr(v3.ceiling_finish)
    const wallFinish =
      v3.wall_finish === 'Other'
        ? nonEmptyStr(v3.wall_finish_other) ?? 'Other'
        : nonEmptyStr(v3.wall_finish)
    const useCustom = Boolean(v3.use_custom_scope_of_work)
    const customText = nonEmptyStr(v3.custom_scope_of_work)
    return {
      useCustom,
      customText,
      hangCeilingThickness: nonEmptyStr(v3.ceiling_thickness),
      hangWallThickness: nonEmptyStr(v3.wall_thickness),
      hangExceptions: nonEmptyStr(v3.hang_exceptions),
      ceilingFinish,
      ceilingExceptions: nonEmptyStr(v3.ceiling_exceptions),
      wallFinish,
      wallExceptions: nonEmptyStr(v3.wall_exceptions),
      additionalNotes: nonEmptyStr(v3.scope_of_work),
    }
  }

  const v2 = v2QuoteFromLegacy(legacy)
  if (v2) {
    const ceilingFinish =
      v2.ceilingFinish === 'Other'
        ? nonEmptyStr(v2.ceilingFinishOther) ?? 'Other'
        : nonEmptyStr(v2.ceilingFinish)
    const wallFinish =
      v2.wallFinish === 'Other'
        ? nonEmptyStr(v2.wallFinishOther) ?? 'Other'
        : nonEmptyStr(v2.wallFinish)
    const useCustom = Boolean(v2.useCustomScopeOfWork)
    const customText = nonEmptyStr(v2.customScopeOfWork)
    return {
      useCustom,
      customText,
      hangCeilingThickness: nonEmptyStr(v2.ceilingThickness),
      hangWallThickness: nonEmptyStr(v2.wallThickness),
      hangExceptions: nonEmptyStr(v2.hangExceptions),
      ceilingFinish,
      ceilingExceptions: nonEmptyStr(v2.ceilingExceptions),
      wallFinish,
      wallExceptions: nonEmptyStr(v2.wallExceptions),
      additionalNotes: nonEmptyStr(v2.scopeOfWork),
    }
  }

  return null
}

/** Categories the hanger handles (installation hardware). */
const HANGER_MATERIAL_CATEGORIES = new Set<string>([
  'Corner Bead',
  'Adhesives',
  'Fasteners',
  'Metal Studs',
  'Metal Track',
  'Acoustic Ceiling',
  'Suspended Drywall Grid',
])

/** Categories the finisher does NOT need to see (hanger-only hardware). */
const FINISHER_HIDE_CATEGORIES = new Set<string>(['Adhesives', 'Fasteners'])

function resolveMaterials(
  field: FieldTakeoff | null,
  specialty: CrewSpecialty,
  preview: boolean,
): CrewProjectDetail['materials'] {
  // Measurers don't handle materials on site.
  if (!preview && specialty === 'measurer') return []
  if (!field?.accessories?.length) return []
  // Unknown specialty + not preview → no materials (we don't know who they are).
  if (!preview && specialty === 'unknown') return []

  return field.accessories
    .filter((acc) => {
      const type = acc.type?.trim()
      if (!type) return false
      const qtyNum = Number(acc.quantity)
      // Skip empty/zero rows — operator may have added a blank row.
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) return false
      if (preview || specialty === 'both') return true
      if (specialty === 'hanger') return HANGER_MATERIAL_CATEGORIES.has(type)
      if (specialty === 'finisher') return !FINISHER_HIDE_CATEGORIES.has(type)
      return false
    })
    .map((acc) => ({
      id: acc.id,
      type: acc.type ?? '',
      subtype: acc.subtype?.trim() || null,
      quantity: String(acc.quantity ?? ''),
      unit: acc.unit?.trim() || 'pcs',
      length: acc.length?.trim() || null,
      threadType: acc.threadType?.trim() || null,
    }))
}

function resolveBeadSticks(legacy: Record<string, unknown>): number | null {
  // v3 stores under bead_sticks; v2 stores under beadSticks. Operator's count excludes tearaway.
  const v3 = v3QuoteFromLegacy(legacy)
  if (v3?.bead_sticks != null) {
    const n = num(v3.bead_sticks)
    if (n != null && n > 0) return n
  }
  const v2 = v2QuoteFromLegacy(legacy)
  if (v2 && v2.beadSticks != null) {
    const n = num(v2.beadSticks)
    if (n != null && n > 0) return n
  }
  return null
}

function resolveTotalSqft(
  legacy: Record<string, unknown>,
  intakeSource: 'quote' | 'po',
  po: DrywallPoData | null,
): number | null {
  const field = parseFieldTakeoff(legacy)
  const measured = num(field?.totalMeasuredSqft)
  if (measured != null && measured > 0) return measured

  // Prefer quote sqft with waste — matches quote labor pay basis (qty × (1 + waste%)).
  const v3 = v3QuoteFromLegacy(legacy)
  if (v3?.lineItems?.length) {
    const withWaste = quotedSqftWithWaste(v3)
    if (withWaste > 0) return withWaste
  }

  const v2 = v2QuoteFromLegacy(legacy)
  if (v2) {
    const withWaste = quotedSqftWithWaste(v2)
    if (withWaste > 0) return withWaste
    const direct = num(v2.sqft)
    if (direct != null && direct > 0) return direct
    const breakdownSum = (v2.breakdowns ?? []).reduce(
      (acc, b) => acc + (num(b.sqft) ?? 0),
      0,
    )
    if (breakdownSum > 0) return breakdownSum
  }

  if (intakeSource === 'po' && po) {
    const poSqft = num(po.customerSqft)
    if (poSqft != null && poSqft > 0) return poSqft
  }

  return null
}

function readOrderApprovedLaborRates(field: FieldTakeoff | null): {
  hangerRate: number | null
  finisherRate: number | null
  prepCleanRate: number | null
} | null {
  const approved = field?.reviewApprovedRates as Record<string, unknown> | undefined
  // Order stage always persists all three rates together (see OrderFinancialCard.handleSaveRates).
  if (!approved || approved.hangerRate == null) return null
  return {
    hangerRate: num(approved.hangerRate),
    finisherRate: num(approved.finisherRate),
    prepCleanRate: num(approved.prepCleanRate),
  }
}

async function resolveQuoteCatalogLaborRates(legacy: Record<string, unknown>): Promise<{
  hangerRate: number | null
  finisherRate: number | null
  prepCleanRate: number | null
  rateSource: CrewLaborRateSource
}> {
  const v3 = v3QuoteFromLegacy(legacy)
  if (v3) {
    const catalogs = await fetchOrgDrywallCatalogs()
    const drywallLines = v3.lineItems.filter((l) => l.type === 'drywall')
    const projectHanger = num(v3.project_hanger_rate)
    const projectFinisher = num(v3.project_finisher_rate)
    const hasOverride = drywallLines.some(
      (l) => l.custom_hanger_rate != null || l.custom_finisher_rate != null,
    )
    const hasProjectRate =
      (projectHanger != null && projectHanger > 0) ||
      (projectFinisher != null && projectFinisher > 0)

    const avg = (vals: number[]) => {
      const positive = vals.filter((v) => v > 0)
      if (positive.length === 0) return null
      return positive.reduce((a, b) => a + b, 0) / positive.length
    }

    // Prefer project-level rates (same as quote UI / projectV3QuoteToV2Shape), then
    // per-line effective rates with project rate as the catalog fallback input.
    const hangerRate =
      projectHanger != null && projectHanger > 0
        ? projectHanger
        : avg(
            drywallLines.map((l) =>
              getEffectiveHangerRate(l, catalogs, projectHanger ?? undefined),
            ),
          )
    const finisherRate =
      projectFinisher != null && projectFinisher > 0
        ? projectFinisher
        : avg(
            drywallLines.map((l) =>
              getEffectiveFinisherRate(l, catalogs, projectFinisher ?? undefined),
            ),
          )

    return {
      hangerRate,
      finisherRate,
      prepCleanRate: num(v3.prep_clean_rate) ?? null,
      rateSource: hasOverride || hasProjectRate ? 'v3_override' : 'catalog_default',
    }
  }

  const v2 = v2QuoteFromLegacy(legacy)
  if (v2) {
    const hanger = num(v2.hangerRate)
    const finisher = num(v2.finisherRate)
    const prep = num(v2.prepCleanRate)
    const hasLegacy =
      (hanger != null && hanger > 0) ||
      (finisher != null && finisher > 0) ||
      (prep != null && prep > 0)
    if (hasLegacy) {
      return {
        hangerRate: hanger,
        finisherRate: finisher,
        prepCleanRate: prep ?? num(DRYWALL_QUOTE_BASE_DEFAULTS.prepCleanRate),
        rateSource: 'v2_legacy',
      }
    }
  }

  const catalogs = await fetchOrgDrywallCatalogs()
  const defaultBoard = catalogs.boards.find((b) => (b.hanger_rate ?? 0) > 0)
  const defaultFinish = catalogs.finish_scopes.find((f) => (f.finisher_rate ?? 0) > 0)
  return {
    hangerRate: defaultBoard?.hanger_rate ?? num(DRYWALL_QUOTE_BASE_DEFAULTS.hangerRate),
    finisherRate: defaultFinish?.finisher_rate ?? num(DRYWALL_QUOTE_BASE_DEFAULTS.finisherRate),
    prepCleanRate: num(DRYWALL_QUOTE_BASE_DEFAULTS.prepCleanRate),
    rateSource: 'catalog_default',
  }
}

async function resolveLaborRates(
  legacy: Record<string, unknown>,
  field: FieldTakeoff | null,
): Promise<{
  hangerRate: number | null
  finisherRate: number | null
  prepCleanRate: number | null
  rateSource: CrewLaborRateSource
}> {
  const approved = readOrderApprovedLaborRates(field)
  if (approved) {
    const fallback = await resolveQuoteCatalogLaborRates(legacy)
    return {
      hangerRate:
        approved.hangerRate != null && approved.hangerRate > 0
          ? approved.hangerRate
          : fallback.hangerRate,
      finisherRate:
        approved.finisherRate != null && approved.finisherRate > 0
          ? approved.finisherRate
          : fallback.finisherRate,
      prepCleanRate:
        approved.prepCleanRate != null && approved.prepCleanRate > 0
          ? approved.prepCleanRate
          : fallback.prepCleanRate,
      rateSource: 'order_approved',
    }
  }
  // Quote/catalog rates stay internal until order finalizes pay — avoids crew seeing
  // rates (and estimated pay) change after measure / order adjustments.
  return {
    hangerRate: null,
    finisherRate: null,
    prepCleanRate: null,
    rateSource: 'pending_order',
  }
}

function resolveBreakdowns(
  legacy: Record<string, unknown>,
  catalogs: Awaited<ReturnType<typeof fetchOrgDrywallCatalogs>> | null,
): CrewProjectDetail['breakdowns'] {
  const v3 = v3QuoteFromLegacy(legacy)
  if (v3?.lineItems?.length) {
    return v3.lineItems
      .filter((l) => l.type === 'drywall')
      .map((line: QuoteLineItem) => {
        const finishScope =
          line.finish_scope_id && catalogs
            ? catalogs.finish_scopes.find((f) => f.id === line.finish_scope_id)?.display_name ??
              line.finish_scope_id
            : line.finish_scope_id ?? null
        return {
          id: line.id,
          description: line.description || 'Drywall',
          location: line.location?.trim() || null,
          sqft: num(line.quantity),
          finishScope,
        }
      })
  }

  const v2 = v2QuoteFromLegacy(legacy)
  if (v2?.breakdowns?.length) {
    return v2.breakdowns.map((b: QuoteBreakdown) => ({
      id: b.id,
      description: (b.description as string | undefined)?.trim() || 'Scope',
      location: null,
      sqft: num(b.sqft),
      finishScope: null,
    }))
  }

  return []
}

function resolveFieldNotes(field: FieldTakeoff | null): CrewProjectDetail['fieldNotes'] {
  if (!field) return null
  const notes = {
    siteContact: field.siteContact?.trim() || null,
    contactPhone: field.contactPhone?.trim() || null,
    meetingLocation: field.meetingLocation?.trim() || null,
    accessNotes: field.accessNotes?.trim() || null,
    hazards: field.hazards?.trim() || null,
    notes: field.notes?.trim() || null,
  }
  const hasAny = Object.values(notes).some(Boolean)
  return hasAny ? notes : null
}

async function resolveCrewSpecialty(_personId: string): Promise<CrewSpecialty> {
  // Crew can't read org_team directly (RLS — payload contains everyone's pay rates).
  // SECURITY DEFINER RPC returns just the caller's linked position name.
  const { data, error } = await supabase.rpc('get_my_linked_position_name')
  if (error) {
    console.warn('get_my_linked_position_name failed:', error)
    return 'unknown'
  }
  const positionName = typeof data === 'string' ? data : null
  return specialtyFromPositionName(positionName)
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function computeEstimatedTotalPay(
  totalSqft: number | null,
  laborRates: CrewProjectDetail['laborRates'],
  specialty: CrewSpecialty,
  options?: { preview?: boolean },
): CrewProjectDetail['estimatedTotalPay'] {
  if (!options?.preview && specialty === 'measurer') {
    return { hanger: null, finisher: null }
  }

  const sqft = totalSqft != null && totalSqft > 0 ? totalSqft : null
  const preview = options?.preview === true

  const hangerEligible =
    preview || specialty === 'hanger' || specialty === 'both'
  const finisherEligible =
    preview || specialty === 'finisher' || specialty === 'both'

  const hanger =
    hangerEligible &&
    sqft != null &&
    laborRates.hangerRate != null &&
    laborRates.hangerRate > 0
      ? roundMoney(sqft * laborRates.hangerRate)
      : null

  const finisher =
    finisherEligible &&
    sqft != null &&
    laborRates.finisherRate != null &&
    laborRates.finisherRate > 0
      ? roundMoney(sqft * laborRates.finisherRate)
      : null

  return { hanger, finisher }
}

export async function fetchCrewProjectDetail(
  projectId: string,
  opts?: CrewViewAsOpts,
): Promise<CrewProjectDetail> {
  if (!isOnlineMode()) {
    throw new Error('Crew workspace requires an online connection.')
  }

  const { personId, specialty } = await resolvePersonContext(opts)
  const scheduleRows = (await fetchAssignedScheduleRows(personId)).filter(
    (r) => r.project_id === projectId,
  )

  if (scheduleRows.length === 0) {
    throw new CrewWorkspacePermissionError()
  }

  const project = await fetchDrywallProjectById(projectId)
  if (!project) {
    throw new CrewWorkspacePermissionError()
  }

  return mapProjectDetail(project, scheduleRows, {
    specialty,
    preview: false,
    personId,
  })
}

function scheduleRowHasMeasurePhase(row: ScheduleRow): boolean {
  return (
    phaseForScheduleItem({
      name: row.name,
      type: row.type === 'office' ? 'office' : 'field',
    }) === 'measure'
  )
}

function resolveFieldTakeoffFromProject(project: DrywallProject): FieldTakeoff {
  const legacy = project.legacy
  const prepared =
    legacy.fieldMeasurementPrep &&
    typeof legacy.fieldMeasurementPrep === 'object' &&
    !Array.isArray(legacy.fieldMeasurementPrep)
      ? (legacy.fieldMeasurementPrep as Record<string, unknown>)
      : {}
  const raw = parseFieldTakeoff(legacy)
  return fieldTakeoffWithTotals(mergeFieldTakeoff(raw, prepared))
}

function buildCrewMeasurePageContext(
  project: DrywallProject,
  scheduleRows: ScheduleRow[],
  specialty: CrewSpecialty,
): CrewMeasurePageContext {
  const fieldTakeoff = resolveFieldTakeoffFromProject(project)
  return {
    projectId: project.id,
    projectName: project.name?.trim() || 'Untitled',
    specialty,
    workflowStatus: crewMeasureWorkflowStatus(fieldTakeoff),
    hasMeasureAssignment: scheduleRows.some(scheduleRowHasMeasurePhase),
    fieldTakeoff,
    projectAddress: project.address?.trim() ?? '',
  }
}

export async function fetchCrewMeasurePage(
  projectId: string,
  opts?: CrewViewAsOpts,
): Promise<CrewMeasurePageContext> {
  if (!isOnlineMode()) {
    throw new Error('Crew workspace requires an online connection.')
  }

  const { personId, specialty } = await resolvePersonContext(opts)
  const scheduleRows = (await fetchAssignedScheduleRows(personId)).filter(
    (r) => r.project_id === projectId,
  )

  if (scheduleRows.length === 0) {
    throw new CrewWorkspacePermissionError()
  }

  const project = await fetchDrywallProjectById(projectId)
  if (!project) {
    throw new CrewWorkspacePermissionError()
  }

  return buildCrewMeasurePageContext(project, scheduleRows, specialty)
}

/** Operators previewing /crew measure flow without a linked person id. */
export async function fetchCrewMeasurePageForPreview(
  projectId: string,
): Promise<CrewMeasurePageContext> {
  const project = await fetchDrywallProjectById(projectId)
  if (!project) throw new Error('Project not found')

  const orgId = await requireUserOrgId()
  const { data } = await supabase
    .from('schedule_items')
    .select('id, project_id, name, type, start_date, end_date, status, notes')
    .eq('organization_id', orgId)
    .eq('project_id', projectId)
    .order('start_date', { ascending: true })

  return buildCrewMeasurePageContext(project, (data ?? []) as ScheduleRow[], 'measurer')
}

/** Operators previewing /crew without a linked person id still see project detail. */
export async function fetchCrewProjectDetailForPreview(
  projectId: string,
): Promise<CrewProjectDetail> {
  const project = await fetchDrywallProjectById(projectId)
  if (!project) throw new Error('Project not found')

  const orgId = await requireUserOrgId()
  const { data } = await supabase
    .from('schedule_items')
    .select(
      'id, project_id, name, type, start_date, end_date, status, notes, show_job_info_person_ids',
    )
    .eq('organization_id', orgId)
    .eq('project_id', projectId)
    .order('start_date', { ascending: true })

  return mapProjectDetail(project, (data ?? []) as ScheduleRow[], {
    specialty: 'both',
    preview: true,
  })
}

async function mapProjectDetail(
  project: DrywallProject,
  scheduleRows: ScheduleRow[],
  context: { specialty: CrewSpecialty; preview?: boolean; personId?: string },
): Promise<CrewProjectDetail> {
  const legacy = project.legacy
  const po = getPoDataFromLegacy(legacy)
  const intakeSource = getIntakeSourceFromLegacy(legacy) ?? (po ? 'po' : 'quote')
  const field = parseFieldTakeoff(legacy)
  const catalogs = v3QuoteFromLegacy(legacy) ? await fetchOrgDrywallCatalogs() : null
  const showJobInfo =
    context.preview === true ||
    (context.personId != null && personSeesJobInfo(context.personId, scheduleRows))

  const totalSqft = showJobInfo ? resolveTotalSqft(legacy, intakeSource, po) : null
  const laborRates = showJobInfo
    ? await resolveLaborRates(legacy, field)
    : {
        hangerRate: null,
        finisherRate: null,
        prepCleanRate: null,
        rateSource: 'pending_order' as const,
      }

  return {
    projectId: project.id,
    projectName: project.name,
    client: project.client,
    address: project.address,
    status: normalizeDrywallProjectStatus(project.status),
    scopeOfWork: showJobInfo ? resolveScopeOfWork(legacy, intakeSource, po) : '',
    structuredScope: showJobInfo ? resolveStructuredScope(legacy) : null,
    totalSqft,
    beadSticks: showJobInfo ? resolveBeadSticks(legacy) : null,
    materials: showJobInfo
      ? resolveMaterials(field, context.specialty, context.preview === true)
      : [],
    photos: showJobInfo
      ? (field?.photos ?? []).map((p) => ({
          id: p.id,
          storagePath: p.storagePath?.trim() || null,
          url: p.url?.trim() || null,
          label: p.label?.trim() || null,
        }))
      : [],
    specialty: context.specialty,
    laborRates,
    estimatedTotalPay: showJobInfo
      ? computeEstimatedTotalPay(totalSqft, laborRates, context.specialty, {
          preview: context.preview,
        })
      : { hanger: null, finisher: null },
    fieldNotes: showJobInfo ? resolveFieldNotes(field) : null,
    scheduleEntries: scheduleRows.map(mapScheduleEntry),
    breakdowns: showJobInfo ? resolveBreakdowns(legacy, catalogs) : [],
    intakeSource,
    showJobInfo,
  }
}

export class CrewFieldTakeoffSaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CrewFieldTakeoffSaveError'
  }
}

/** Crew measurer save — SECURITY DEFINER RPC (no direct projects UPDATE). */
export async function saveFieldTakeoffAsMeasurer(
  projectId: string,
  takeoff: FieldTakeoff,
): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Crew measure requires an online connection.')
  }

  const withTotals = fieldTakeoffWithTotals(takeoff)
  const { error } = await supabase.rpc('save_field_takeoff_as_measurer', {
    p_project_id: projectId,
    p_takeoff: withTotals,
  })

  if (error) {
    const msg = error.message ?? 'Failed to save measurements'
    if (
      msg.includes('not authorized') ||
      msg.includes('not authenticated') ||
      msg.includes('locked for review')
    ) {
      throw new CrewWorkspacePermissionError(msg)
    }
    throw new CrewFieldTakeoffSaveError(msg)
  }
}

export function crewRateSourceLabel(source: CrewLaborRateSource): string {
  switch (source) {
    case 'order_approved':
      return 'order labor rates'
    case 'pending_order':
      return 'pending order rates'
    case 'v3_override':
      return 'project override'
    case 'v2_legacy':
      return 'quote rates'
    default:
      return 'catalog default'
  }
}
