import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type { QuoteLineItem, QuoteLineItemType } from '@/types/drywall'

export const QUOTE_LINE_TYPE_LABELS: Record<QuoteLineItemType, string> = {
  drywall: 'Drywall',
  rc_channel: 'RC Channel',
  suspended_grid: 'Suspended Grid',
  insulation: 'Insulation',
  acoustic: 'Acoustic',
  metal_stud: 'Metal Stud',
  frp: 'FRP',
}

/** Context-aware catalog column header per line type. */
export function catalogColumnLabel(type: QuoteLineItemType): string {
  switch (type) {
    case 'drywall':
      return 'Board'
    case 'rc_channel':
      return 'RC Channel'
    case 'insulation':
      return 'Insulation'
    case 'suspended_grid':
    case 'acoustic':
    case 'metal_stud':
    case 'frp':
      return 'Component'
    default:
      return 'Catalog'
  }
}

export function resolveBoard(line: QuoteLineItem, catalogs: OrgDrywallCatalogs) {
  return catalogs.boards.find((b) => b.id === line.catalog_id)
}

export function resolveFinishScope(line: QuoteLineItem, catalogs: OrgDrywallCatalogs) {
  if (!line.finish_scope_id) return undefined
  return catalogs.finish_scopes.find((f) => f.id === line.finish_scope_id)
}

export function getLineMaterialRate(line: QuoteLineItem, catalogs: OrgDrywallCatalogs): number {
  if (line.custom_material_rate != null) return line.custom_material_rate

  return getCatalogDefaultMaterialRate(line, catalogs)
}

/** Catalog material rate without line override. */
export function getCatalogDefaultMaterialRate(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
): number {
  switch (line.type) {
    case 'drywall':
      return resolveBoard(line, catalogs)?.material_rate ?? 0
    case 'rc_channel':
      return catalogs.rc_channel.find((e) => e.id === line.catalog_id)?.material_rate_per_piece ?? 0
    case 'suspended_grid':
      return catalogs.suspended_grid.find((e) => e.id === line.catalog_id)?.material_rate ?? 0
    case 'insulation':
      return (
        catalogs.insulation.find((e) => e.id === line.catalog_id)?.material_rate_per_sqft ?? 0
      )
    case 'acoustic':
      return catalogs.acoustic.find((e) => e.id === line.catalog_id)?.material_rate ?? 0
    case 'metal_stud':
      return (
        catalogs.metal_stud.find((e) => e.id === line.catalog_id)?.material_rate_per_piece ?? 0
      )
    case 'frp':
      return catalogs.frp.find((e) => e.id === line.catalog_id)?.material_rate ?? 0
    default:
      return 0
  }
}

export function getCatalogDefaultFinisherRate(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
): number {
  if (line.type !== 'drywall') return 0
  return resolveFinishScope(line, catalogs)?.finisher_rate ?? 0
}

export function getCatalogDefaultHangerRate(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
): number {
  if (line.type !== 'drywall') return 0
  return resolveBoard(line, catalogs)?.hanger_rate ?? 0
}

/** @deprecated Use getCatalogDefaultFinisherRate */
export function getCatalogDefaultLaborRate(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
): number {
  return getCatalogDefaultFinisherRate(line, catalogs)
}

export function getEffectiveHangerRate(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
  projectRate?: number,
): number {
  if (line.type !== 'drywall') return 0
  if (line.custom_hanger_rate != null) return line.custom_hanger_rate
  if (projectRate != null) return projectRate
  return getCatalogDefaultHangerRate(line, catalogs)
}

export function getEffectiveFinisherRate(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
  projectRate?: number,
): number {
  if (line.type !== 'drywall') return 0
  if (line.custom_finisher_rate != null) return line.custom_finisher_rate
  if (projectRate != null) return projectRate
  return getCatalogDefaultFinisherRate(line, catalogs)
}

export function getCatalogDefaultComponentLaborRate(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
): number {
  switch (line.type) {
    case 'rc_channel':
      return catalogs.rc_channel.find((e) => e.id === line.catalog_id)?.labor_rate ?? 0
    case 'suspended_grid':
      return catalogs.suspended_grid.find((e) => e.id === line.catalog_id)?.labor_rate ?? 0
    case 'insulation':
      return catalogs.insulation.find((e) => e.id === line.catalog_id)?.labor_rate ?? 0
    case 'acoustic':
      return catalogs.acoustic.find((e) => e.id === line.catalog_id)?.labor_rate ?? 0
    case 'metal_stud':
      return catalogs.metal_stud.find((e) => e.id === line.catalog_id)?.labor_rate ?? 0
    case 'frp':
      return catalogs.frp.find((e) => e.id === line.catalog_id)?.labor_rate ?? 0
    default:
      return 0
  }
}

/** Component trade labor — catalog default or line custom_labor_rate override. */
export function getEffectiveComponentLaborRate(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
): number {
  if (line.type === 'drywall') return 0
  if (line.custom_labor_rate != null) return line.custom_labor_rate
  return getCatalogDefaultComponentLaborRate(line, catalogs)
}

export function getEffectiveLaborRate(line: QuoteLineItem, catalogs: OrgDrywallCatalogs): number {
  if (line.type === 'drywall') {
    return getEffectiveHangerRate(line, catalogs) + getEffectiveFinisherRate(line, catalogs)
  }
  return getEffectiveComponentLaborRate(line, catalogs)
}

export function ratesEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0001
}

/** Suffix for material rate column header / aria (e.g. "/sqft"). */
export function materialRateUnitSuffix(line: QuoteLineItem, catalogs: OrgDrywallCatalogs): string {
  switch (line.type) {
    case 'drywall':
    case 'insulation':
      return '/sqft'
    case 'rc_channel':
    case 'metal_stud':
      return '/piece'
    case 'suspended_grid':
    case 'acoustic':
    case 'frp': {
      const unit = getLineUnit(line, catalogs)
      if (unit === 'sqft') return '/sqft'
      if (unit === 'lf') return '/LF'
      return '/each'
    }
    default:
      return ''
  }
}

export function materialRateColumnTitle(line: QuoteLineItem, catalogs: OrgDrywallCatalogs): string {
  const suffix = materialRateUnitSuffix(line, catalogs)
  return suffix ? `Material rate ($${suffix})` : 'Material rate'
}

export function materialRateHeaderForType(type: QuoteLineItemType): string {
  switch (type) {
    case 'drywall':
    case 'insulation':
      return 'Mat. rate ($/sqft)'
    case 'rc_channel':
    case 'metal_stud':
      return 'Mat. rate ($/piece)'
    case 'suspended_grid':
    case 'acoustic':
    case 'frp':
      return 'Mat. rate'
    default:
      return 'Mat. rate'
  }
}

export function finisherRateColumnTitle(): string {
  return 'Per-sqft pay to finisher; default from finish scope catalog, overridable per line.'
}

export function hangerRateColumnTitle(): string {
  return 'Per-sqft pay to hanger; default from board catalog, overridable per line.'
}

export function componentLaborRateColumnTitle(
  line: QuoteLineItem,
  catalogs: OrgDrywallCatalogs,
): string {
  const suffix = componentLaborRateUnitSuffix(line, catalogs)
  return `Labor pay${suffix}; default from component catalog, overridable per line.`
}

export function componentLaborRateUnitSuffix(line: QuoteLineItem, catalogs: OrgDrywallCatalogs): string {
  const unit = getLineUnit(line, catalogs)
  if (unit === 'sqft') return '/sqft'
  if (unit === 'lf') return '/LF'
  if (unit === 'piece') return '/piece'
  return '/each'
}

export function componentLaborRateHeaderForType(type: QuoteLineItemType): string {
  switch (type) {
    case 'insulation':
      return 'Labor rate ($/sqft)'
    case 'rc_channel':
      return 'Labor rate ($/LF)'
    case 'metal_stud':
      return 'Labor rate ($/LF)'
    case 'suspended_grid':
    case 'acoustic':
    case 'frp':
      return 'Labor rate'
    default:
      return 'Labor rate'
  }
}

export function isHangerRateEnabled(line: QuoteLineItem): boolean {
  return line.type === 'drywall' && Boolean(line.catalog_id)
}

export function isFinisherRateEnabled(line: QuoteLineItem): boolean {
  return line.type === 'drywall' && Boolean(line.finish_scope_id)
}

export function isMaterialRateEnabled(line: QuoteLineItem): boolean {
  return Boolean(line.catalog_id)
}

export function isComponentLaborRateEnabled(line: QuoteLineItem): boolean {
  return line.type !== 'drywall' && Boolean(line.catalog_id)
}

export function isLaborRateEnabled(line: QuoteLineItem): boolean {
  return isFinisherRateEnabled(line) || isComponentLaborRateEnabled(line)
}

export function getLineUnit(line: QuoteLineItem, catalogs: OrgDrywallCatalogs): string {
  switch (line.type) {
    case 'drywall':
    case 'insulation':
      return 'sqft'
    case 'rc_channel':
    case 'metal_stud':
      return 'lf'
    case 'suspended_grid': {
      const e = catalogs.suspended_grid.find((x) => x.id === line.catalog_id)
      return e?.unit ?? 'each'
    }
    case 'acoustic': {
      const e = catalogs.acoustic.find((x) => x.id === line.catalog_id)
      return e?.unit ?? 'sqft'
    }
    case 'frp': {
      const e = catalogs.frp.find((x) => x.id === line.catalog_id)
      return e?.unit ?? 'sqft'
    }
    default:
      return 'each'
  }
}

export function getLineCatalogLabel(line: QuoteLineItem, catalogs: OrgDrywallCatalogs): string {
  switch (line.type) {
    case 'drywall':
      return resolveBoard(line, catalogs)?.display_name ?? '—'
    case 'rc_channel':
      return catalogs.rc_channel.find((e) => e.id === line.catalog_id)?.display_name ?? '—'
    case 'suspended_grid':
      return catalogs.suspended_grid.find((e) => e.id === line.catalog_id)?.display_name ?? '—'
    case 'insulation':
      return catalogs.insulation.find((e) => e.id === line.catalog_id)?.display_name ?? '—'
    case 'acoustic':
      return catalogs.acoustic.find((e) => e.id === line.catalog_id)?.display_name ?? '—'
    case 'metal_stud':
      return catalogs.metal_stud.find((e) => e.id === line.catalog_id)?.display_name ?? '—'
    case 'frp':
      return catalogs.frp.find((e) => e.id === line.catalog_id)?.display_name ?? '—'
    default:
      return '—'
  }
}

export function catalogOptionsForLineType(
  type: QuoteLineItemType,
  catalogs: OrgDrywallCatalogs,
): Array<{ id: string; label: string }> {
  switch (type) {
    case 'drywall':
      return catalogs.boards.map((b) => ({ id: b.id, label: b.display_name }))
    case 'rc_channel':
      return catalogs.rc_channel.map((e) => ({ id: e.id, label: e.display_name }))
    case 'suspended_grid':
      return catalogs.suspended_grid.map((e) => ({ id: e.id, label: e.display_name }))
    case 'insulation':
      return catalogs.insulation.map((e) => ({ id: e.id, label: e.display_name }))
    case 'acoustic':
      return catalogs.acoustic.map((e) => ({ id: e.id, label: e.display_name }))
    case 'metal_stud':
      return catalogs.metal_stud.map((e) => ({ id: e.id, label: e.display_name }))
    case 'frp':
      return catalogs.frp.map((e) => ({ id: e.id, label: e.display_name }))
    default:
      return []
  }
}
