// Org drywall quote catalogs — stored in org_drywall_catalogs.payload (Phase Q.A)

import type { DashboardTargets } from '@/lib/drywall/dashboardTargets'

export type AccessoryAppliedMap = {
  joint_compound: boolean
  tape: boolean
  screws: boolean
  corner_bead: boolean
}

export type AccessoryCategory = 'joint_compound' | 'tape' | 'screws' | 'corner_bead' | 'other'

export type AccessoryCatalogUnit = 'bucket' | 'roll' | 'box' | 'bag' | 'lf' | 'each'

export interface AccessoryCatalogEntry {
  id: string
  display_name: string
  category: AccessoryCategory
  unit: AccessoryCatalogUnit
  /** $ per unit — Mark refines via catalog admin. */
  material_rate: number
  /** Baseline sqft per unit for simple linear formulas; finish-dependent items use engine overrides. */
  sqft_per_unit: number
  notes?: string
}

export type FinishScopeLocation = 'wall' | 'ceiling'

/** Board type in org catalog — material and hanger labor rates are board-dependent. */
export interface BoardCatalogEntry {
  id: string
  display_name: string
  material_rate: number
  /** Per-sqft hanger pay; heavier/larger boards typically cost more to hang. */
  hanger_rate: number
  default_waste_pct: number
  notes?: string
}

export interface FinishScopeCatalogEntry {
  id: string
  display_name: string
  applies_to_locations: FinishScopeLocation[]
  finisher_rate: number
  accessories_applied: AccessoryAppliedMap
  payroll_piece_key: string
  notes?: string
}

export interface RcChannelCatalogEntry {
  id: string
  display_name: string
  size: string
  gauge?: string
  spacing?: string
  material_rate_per_piece: number
  /** $ per linear ft installed. */
  labor_rate: number
  default_piece_length_ft?: number
  notes?: string
}

export type SuspendedGridComponentType =
  | 'mains'
  | 'tees_4ft'
  | 'tees_2ft'
  | 'wire'
  | 'lags'
  | 'shiny_90'
  | 'wall_angle'

export interface SuspendedGridCatalogEntry {
  id: string
  display_name: string
  component_type: SuspendedGridComponentType
  unit: 'each' | 'lf'
  material_rate: number
  /** $ per unit (matches entry unit). */
  labor_rate: number
  notes?: string
}

export interface InsulationCatalogEntry {
  id: string
  display_name: string
  r_value: string
  faced: boolean
  rigid: boolean
  material_rate_per_sqft: number
  /** $ per sqft installed. */
  labor_rate: number
  notes?: string
}

export type AcousticComponentType =
  | 'tile'
  | 'mains'
  | 'tees_4ft'
  | 'tees_2ft'
  | 'wire'
  | 'lags'
  | 'wall_angle'

export interface AcousticCatalogEntry {
  id: string
  display_name: string
  component_type: AcousticComponentType
  tile_size?: string
  unit: 'each' | 'sqft' | 'lf'
  material_rate: number
  /** $ per unit (matches entry unit). */
  labor_rate: number
  notes?: string
}

export interface MetalStudCatalogEntry {
  id: string
  display_name: string
  size: string
  gauge: string
  component: 'stud' | 'track'
  material_rate_per_piece: number
  /** $ per LF installed (v2 metalStudLaborRate × totalWallLf parity). */
  labor_rate: number
  default_piece_length_ft?: number
  notes?: string
}

export type FrpComponentType =
  | 'sheet'
  | 'adhesive'
  | 'corner_inside'
  | 'corner_outside'
  | 'jmold'
  | 'division'

export interface FrpCatalogEntry {
  id: string
  display_name: string
  component_type: FrpComponentType
  unit: 'each' | 'sqft' | 'bucket'
  material_rate: number
  /** $ per unit (matches entry unit). */
  labor_rate: number
  notes?: string
}

export interface OrgDrywallCatalogs {
  boards: BoardCatalogEntry[]
  finish_scopes: FinishScopeCatalogEntry[]
  accessories: AccessoryCatalogEntry[]
  rc_channel: RcChannelCatalogEntry[]
  suspended_grid: SuspendedGridCatalogEntry[]
  insulation: InsulationCatalogEntry[]
  acoustic: AcousticCatalogEntry[]
  metal_stud: MetalStudCatalogEntry[]
  frp: FrpCatalogEntry[]
  /** D.4 — org margin floor (0–1). Stored on org_drywall_catalogs row, not JSONB payload. */
  marginFloorTarget: number
  /** D.4 — PO estimated all-in cost per sqft. Stored on org_drywall_catalogs row. */
  poEstimatedCostPerSqft: number
  /** KPI dashboard targets. Stored on org_drywall_catalogs row, not JSONB payload. */
  dashboardTargets: DashboardTargets
}

export type DrywallCatalogKey = Exclude<
  keyof OrgDrywallCatalogs,
  'marginFloorTarget' | 'poEstimatedCostPerSqft' | 'dashboardTargets'
>
