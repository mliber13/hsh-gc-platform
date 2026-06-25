import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import {
  DEFAULT_MARGIN_FLOOR_TARGET,
  DEFAULT_PO_ESTIMATED_COST_PER_SQFT,
} from './marginFloor'
import type {
  AccessoryAppliedMap,
  AccessoryCatalogEntry,
  AccessoryCatalogUnit,
  AccessoryCategory,
  BoardCatalogEntry,
  FinishScopeCatalogEntry,
  OrgDrywallCatalogs,
} from '@/types/drywallCatalogs'

export function generateCatalogEntryId(prefix = 'cat'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function parseAccessoryMap(raw: unknown): AccessoryAppliedMap {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    joint_compound: Boolean(o.joint_compound),
    tape: Boolean(o.tape),
    screws: Boolean(o.screws ?? true),
    corner_bead: Boolean(o.corner_bead),
  }
}

function parseBoardEntry(raw: unknown): BoardCatalogEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  const display_name = String(o.display_name ?? '').trim()
  if (!id || !display_name) return null
  return {
    id,
    display_name,
    material_rate: toNum(o.material_rate),
    hanger_rate: toNum(o.hanger_rate),
    default_waste_pct: toNum(o.default_waste_pct, 10),
    notes: o.notes != null ? String(o.notes) : undefined,
  }
}

const ACCESSORY_UNITS: AccessoryCatalogUnit[] = ['bucket', 'roll', 'box', 'bag', 'lf', 'each']
const ACCESSORY_CATEGORIES: AccessoryCategory[] = [
  'joint_compound',
  'tape',
  'screws',
  'corner_bead',
  'other',
]

function parseAccessoryEntry(raw: unknown): AccessoryCatalogEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  const display_name = String(o.display_name ?? '').trim()
  if (!id || !display_name) return null
  const category = ACCESSORY_CATEGORIES.includes(o.category as AccessoryCategory)
    ? (o.category as AccessoryCategory)
    : 'other'
  const unit = ACCESSORY_UNITS.includes(o.unit as AccessoryCatalogUnit)
    ? (o.unit as AccessoryCatalogUnit)
    : 'each'
  return {
    id,
    display_name,
    category,
    unit,
    material_rate: toNum(o.material_rate),
    sqft_per_unit: toNum(o.sqft_per_unit),
    notes: o.notes != null ? String(o.notes) : undefined,
  }
}

function parseFinishScopeEntry(raw: unknown): FinishScopeCatalogEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  const display_name = String(o.display_name ?? '').trim()
  if (!id || !display_name) return null
  const locs = Array.isArray(o.applies_to_locations)
    ? o.applies_to_locations
        .map((v) => String(v))
        .filter((v): v is 'wall' | 'ceiling' => v === 'wall' || v === 'ceiling')
    : (['wall', 'ceiling'] as const)
  return {
    id,
    display_name,
    applies_to_locations: locs.length ? [...locs] : ['wall', 'ceiling'],
    finisher_rate: toNum(o.finisher_rate),
    accessories_applied: parseAccessoryMap(o.accessories_applied),
    payroll_piece_key: String(o.payroll_piece_key ?? id).trim() || id,
    notes: o.notes != null ? String(o.notes) : undefined,
  }
}

function parseArray<T>(raw: unknown, parser: (item: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parser).filter((x): x is T => x != null)
}

function parseGenericEntry<T extends { id: string; display_name: string }>(
  raw: unknown,
  extra: (o: Record<string, unknown>, base: T) => T,
): T | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  const display_name = String(o.display_name ?? '').trim()
  if (!id || !display_name) return null
  return extra(o, { id, display_name } as T)
}

export function parseOrgDrywallCatalogs(raw: unknown): OrgDrywallCatalogs {
  const defaults = createDefaultDrywallCatalogSeeds()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults
  const p = raw as Record<string, unknown>

  const boards = parseArray(p.boards, parseBoardEntry)
  const finish_scopes = parseArray(p.finish_scopes, parseFinishScopeEntry)
  const accessories = parseArray(p.accessories, parseAccessoryEntry)

  return {
    boards: boards.length ? boards : defaults.boards,
    finish_scopes: finish_scopes.length ? finish_scopes : defaults.finish_scopes,
    accessories: accessories.length ? accessories : defaults.accessories,
    rc_channel: parseArray(p.rc_channel, (item) =>
      parseGenericEntry(item, (o, base) => ({
        ...base,
        size: String(o.size ?? ''),
        gauge: o.gauge != null ? String(o.gauge) : undefined,
        spacing: o.spacing != null ? String(o.spacing) : undefined,
        material_rate_per_piece: toNum(o.material_rate_per_piece),
        labor_rate: toNum(o.labor_rate),
        default_piece_length_ft:
          o.default_piece_length_ft != null ? toNum(o.default_piece_length_ft) : undefined,
        notes: o.notes != null ? String(o.notes) : undefined,
      })),
    ),
    suspended_grid: parseArray(p.suspended_grid, (item) =>
      parseGenericEntry(item, (o, base) => ({
        ...base,
        component_type: String(o.component_type ?? 'mains') as OrgDrywallCatalogs['suspended_grid'][0]['component_type'],
        unit: o.unit === 'lf' ? 'lf' : 'each',
        material_rate: toNum(o.material_rate),
        labor_rate: toNum(o.labor_rate),
        notes: o.notes != null ? String(o.notes) : undefined,
      })),
    ),
    insulation: parseArray(p.insulation, (item) =>
      parseGenericEntry(item, (o, base) => ({
        ...base,
        r_value: String(o.r_value ?? ''),
        faced: Boolean(o.faced),
        rigid: Boolean(o.rigid),
        material_rate_per_sqft: toNum(o.material_rate_per_sqft),
        labor_rate: toNum(o.labor_rate),
        notes: o.notes != null ? String(o.notes) : undefined,
      })),
    ),
    acoustic: parseArray(p.acoustic, (item) =>
      parseGenericEntry(item, (o, base) => ({
        ...base,
        component_type: String(o.component_type ?? 'tile') as OrgDrywallCatalogs['acoustic'][0]['component_type'],
        tile_size: o.tile_size != null ? String(o.tile_size) : undefined,
        unit: (['each', 'sqft', 'lf'] as const).includes(o.unit as 'each' | 'sqft' | 'lf')
          ? (o.unit as 'each' | 'sqft' | 'lf')
          : 'each',
        material_rate: toNum(o.material_rate),
        labor_rate: toNum(o.labor_rate),
        notes: o.notes != null ? String(o.notes) : undefined,
      })),
    ),
    metal_stud: parseArray(p.metal_stud, (item) =>
      parseGenericEntry(item, (o, base) => ({
        ...base,
        size: String(o.size ?? ''),
        gauge: String(o.gauge ?? ''),
        component: o.component === 'track' ? 'track' : 'stud',
        material_rate_per_piece: toNum(o.material_rate_per_piece),
        labor_rate: toNum(o.labor_rate),
        default_piece_length_ft:
          o.default_piece_length_ft != null ? toNum(o.default_piece_length_ft) : undefined,
        notes: o.notes != null ? String(o.notes) : undefined,
      })),
    ),
    frp: parseArray(p.frp, (item) =>
      parseGenericEntry(item, (o, base) => ({
        ...base,
        component_type: String(o.component_type ?? 'sheet') as OrgDrywallCatalogs['frp'][0]['component_type'],
        unit: (['each', 'sqft', 'bucket'] as const).includes(o.unit as 'each' | 'sqft' | 'bucket')
          ? (o.unit as 'each' | 'sqft' | 'bucket')
          : 'each',
        material_rate: toNum(o.material_rate),
        labor_rate: toNum(o.labor_rate),
        notes: o.notes != null ? String(o.notes) : undefined,
      })),
    ),
    marginFloorTarget: DEFAULT_MARGIN_FLOOR_TARGET,
    poEstimatedCostPerSqft: DEFAULT_PO_ESTIMATED_COST_PER_SQFT,
  }
}

export function catalogsPayloadOnly(catalogs: OrgDrywallCatalogs): Record<string, unknown> {
  const {
    marginFloorTarget: _m,
    poEstimatedCostPerSqft: _p,
    ...rest
  } = catalogs
  return { ...rest }
}

export function prepareOrgDrywallCatalogs(catalogs: OrgDrywallCatalogs): OrgDrywallCatalogs {
  return parseOrgDrywallCatalogs(catalogs)
}

export function isEmptyCatalogPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true
  const p = raw as Record<string, unknown>
  const keys: (keyof OrgDrywallCatalogs)[] = [
    'boards',
    'finish_scopes',
    'accessories',
    'rc_channel',
    'suspended_grid',
    'insulation',
    'acoustic',
    'metal_stud',
    'frp',
  ]
  return keys.every((k) => !Array.isArray(p[k]) || (p[k] as unknown[]).length === 0)
}
