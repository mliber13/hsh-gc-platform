/**
 * Drywall piece key namespace — v3 catalog-driven piece work types.
 *
 * Source of truth flow:
 * - Finish scope id (e.g. `level_4`, `firetape_only`) = finisher piece key
 * - Hanger work: `drywall_hanging` (generic) OR board-specific (`drywall_hanging_5_8_type_x` etc. — defer board-specific to post-MVP if catalog data thin)
 * - Component piece keys: trade-prefixed (`rc_channel_labor`, `insulation_labor`, `metal_stud_labor`, etc.)
 *
 * v2 generic keys ('hanger', 'finisher', 'carpenter', 'rcChannel') continue as fallbacks for v2 quote-derived piece entries.
 */

import { PAYROLL_WORK_TYPES } from '@/lib/payrollMath'
import type { FinishScopeCatalogEntry, OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type { PayrollPieceCatalogSource } from '@/types/payroll'

export const DRYWALL_HANGER_PIECE_KEY = 'drywall_hanging' as const

export const COMPONENT_LABOR_PIECE_KEYS = {
  rc_channel: 'rc_channel_labor',
  suspended_grid: 'suspended_grid_labor',
  insulation: 'insulation_labor',
  acoustic: 'acoustic_labor',
  metal_stud: 'metal_stud_labor',
  frp: 'frp_labor',
} as const

export type ComponentLaborPieceKey =
  (typeof COMPONENT_LABOR_PIECE_KEYS)[keyof typeof COMPONENT_LABOR_PIECE_KEYS]

export type DrywallPieceKey =
  | typeof DRYWALL_HANGER_PIECE_KEY
  | ComponentLaborPieceKey
  | string // finish scope ids (catalog-driven, dynamic)

const COMPONENT_LABOR_LABELS: Record<ComponentLaborPieceKey, string> = {
  rc_channel_labor: 'RC Channel Labor',
  suspended_grid_labor: 'Suspended Grid Labor',
  insulation_labor: 'Insulation Labor',
  acoustic_labor: 'Acoustic Ceiling Labor',
  metal_stud_labor: 'Metal Stud Labor',
  frp_labor: 'FRP Labor',
}

const COMPONENT_CATALOG_KEY_BY_PIECE_KEY: Record<
  ComponentLaborPieceKey,
  keyof OrgDrywallCatalogs
> = {
  rc_channel_labor: 'rc_channel',
  suspended_grid_labor: 'suspended_grid',
  insulation_labor: 'insulation',
  acoustic_labor: 'acoustic',
  metal_stud_labor: 'metal_stud',
  frp_labor: 'frp',
}

const COMPONENT_LABOR_PIECE_KEY_SET = new Set<string>(Object.values(COMPONENT_LABOR_PIECE_KEYS))

export type PayrollPieceTypeOptionGroup = 'drywall' | 'component' | 'legacy'

export interface PayrollPieceTypeOption {
  value: string
  label: string
  group: PayrollPieceTypeOptionGroup
  catalogSource: PayrollPieceCatalogSource
  defaultPhases: number
}

export function isDrywallHangerKey(key: string): boolean {
  return key === DRYWALL_HANGER_PIECE_KEY || key.startsWith('drywall_hanging_')
}

export function isComponentLaborKey(key: string): boolean {
  return COMPONENT_LABOR_PIECE_KEY_SET.has(key)
}

export function isFinishScopePieceKey(
  key: string,
  finishScopeCatalog: FinishScopeCatalogEntry[],
): boolean {
  return finishScopeCatalog.some(
    (scope) => scope.id === key || scope.payroll_piece_key === key,
  )
}

export function isLegacyPayrollWorkType(key: string): boolean {
  return PAYROLL_WORK_TYPES.some((wt) => wt.value === key)
}

export function resolvePieceEntryKey(entry: {
  piece_key?: string
  workType?: string
}): string {
  return entry.piece_key || entry.workType || 'finisher'
}

export function findFinishScopeByPieceKey(
  key: string,
  finishScopeCatalog: FinishScopeCatalogEntry[],
): FinishScopeCatalogEntry | undefined {
  return finishScopeCatalog.find(
    (scope) => scope.id === key || scope.payroll_piece_key === key,
  )
}

function laborRateFromCatalogEntries(
  entries: { labor_rate?: number }[] | undefined,
): number | null {
  if (!entries?.length) return null
  const withRate = entries.find((e) => (e.labor_rate ?? 0) > 0)
  const rate = withRate?.labor_rate ?? entries[0]?.labor_rate
  if (rate == null) return null
  return rate
}

/** Default $/sqft (or $/unit for components) rate for a v3 piece key from org catalogs. */
export function defaultRateForPieceKey(
  pieceKey: string,
  catalogs: OrgDrywallCatalogs,
): number | null {
  if (isDrywallHangerKey(pieceKey)) {
    return null
  }

  const finishScope = findFinishScopeByPieceKey(pieceKey, catalogs.finish_scopes)
  if (finishScope) {
    return finishScope.finisher_rate
  }

  if (isComponentLaborKey(pieceKey)) {
    const catalogKey =
      COMPONENT_CATALOG_KEY_BY_PIECE_KEY[pieceKey as ComponentLaborPieceKey]
    if (!catalogKey) return null
    return laborRateFromCatalogEntries(
      catalogs[catalogKey] as { labor_rate?: number }[],
    )
  }

  return null
}

export function defaultPhasesForPieceKey(
  pieceKey: string,
  catalogs: OrgDrywallCatalogs,
): number {
  if (isDrywallHangerKey(pieceKey) || isComponentLaborKey(pieceKey)) return 1
  if (isFinishScopePieceKey(pieceKey, catalogs.finish_scopes)) return 5
  const legacy = PAYROLL_WORK_TYPES.find((wt) => wt.value === pieceKey)
  return legacy?.defaultPhases ?? 1
}

export function buildPayrollPieceTypeOptions(
  catalogs: OrgDrywallCatalogs,
): PayrollPieceTypeOption[] {
  const options: PayrollPieceTypeOption[] = []

  options.push({
    value: DRYWALL_HANGER_PIECE_KEY,
    label: 'Drywall — Hanging',
    group: 'drywall',
    catalogSource: 'v3_drywall',
    defaultPhases: 1,
  })

  for (const scope of catalogs.finish_scopes) {
    const key = scope.payroll_piece_key || scope.id
    options.push({
      value: key,
      label: `Drywall — ${scope.display_name}`,
      group: 'drywall',
      catalogSource: 'v3_drywall',
      defaultPhases: 5,
    })
  }

  for (const pieceKey of Object.values(COMPONENT_LABOR_PIECE_KEYS)) {
    options.push({
      value: pieceKey,
      label: COMPONENT_LABOR_LABELS[pieceKey],
      group: 'component',
      catalogSource: 'v3_drywall',
      defaultPhases: 1,
    })
  }

  for (const wt of PAYROLL_WORK_TYPES) {
    options.push({
      value: wt.value,
      label: wt.label,
      group: 'legacy',
      catalogSource: 'legacy',
      defaultPhases: wt.defaultPhases,
    })
  }

  return options
}

export function labelForPieceKey(
  pieceKey: string,
  catalogs: OrgDrywallCatalogs | null | undefined,
): string {
  if (catalogs) {
    const options = buildPayrollPieceTypeOptions(catalogs)
    const match = options.find((o) => o.value === pieceKey)
    if (match) return match.label
  }

  const legacy = PAYROLL_WORK_TYPES.find((wt) => wt.value === pieceKey)
  if (legacy) return legacy.label

  if (isComponentLaborKey(pieceKey)) {
    return COMPONENT_LABOR_LABELS[pieceKey as ComponentLaborPieceKey] ?? pieceKey
  }

  if (pieceKey === DRYWALL_HANGER_PIECE_KEY) return 'Drywall — Hanging'

  return pieceKey
}
