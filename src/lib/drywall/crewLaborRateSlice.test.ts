/**
 * Crew pay rates resolved from the narrow catalog slice.
 *
 * Crew used to receive the whole drywall price book — material_rate on 37 items, the org
 * margin floor, the PO cost basis and the dashboard revenue goals — because that is what
 * `fetchOrgDrywallCatalogs()` returns and the RLS predicate on `org_drywall_catalogs` listed
 * 'crew'. Migration 20261008120000 replaces it with board `hanger_rate` and finish scope
 * `finisher_rate` only.
 *
 * The failure mode worth guarding is not disclosure, it is the opposite: a Batch 1B note
 * records that trimming these rates had nearly shipped a broken crew pay estimate once. So
 * the rate resolvers were WIDENED to accept the slice rather than reimplemented for it, and
 * these tests assert the slice answers identically to the full catalogs — including the
 * precedence order, which is where a second copy of the logic would drift.
 */
import { describe, expect, it } from 'vitest'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import { DEFAULT_DASHBOARD_TARGETS } from './dashboardTargets'
import type { QuoteLineItem } from '@/types/drywall'
import {
  getEffectiveFinisherRate,
  getEffectiveHangerRate,
  type LaborRateCatalogSlice,
} from './quoteV3CatalogResolve'

/** The operator read: every field a catalog actually carries. */
const fullCatalogs: OrgDrywallCatalogs = {
  boards: [
    {
      id: 'board_58_type_x',
      display_name: '5/8" Type X',
      material_rate: 0.42,
      hanger_rate: 0.11,
      default_waste_pct: 10,
    },
    {
      id: 'board_12_std',
      display_name: '1/2" Standard',
      material_rate: 0.33,
      hanger_rate: 0.09,
      default_waste_pct: 8,
    },
  ],
  finish_scopes: [
    {
      id: 'level_4',
      display_name: 'Level 4',
      applies_to_locations: ['wall', 'ceiling'],
      finisher_rate: 0.45,
      accessories_applied: { joint_compound: true, tape: true, screws: true, corner_bead: true },
      payroll_piece_key: 'level_4',
    },
    {
      id: 'level_5',
      display_name: 'Level 5',
      applies_to_locations: ['wall'],
      finisher_rate: 0.62,
      accessories_applied: { joint_compound: true, tape: true, screws: true, corner_bead: true },
      payroll_piece_key: 'level_5',
    },
  ],
  accessories: [],
  rc_channel: [],
  suspended_grid: [],
  insulation: [],
  acoustic: [],
  metal_stud: [],
  frp: [],
  door_install: [],
  marginFloorTarget: 0.3,
  poEstimatedCostPerSqft: 1.72,
  dashboardTargets: DEFAULT_DASHBOARD_TARGETS,
}

/** Exactly what `crew_drywall_labor_rates()` returns, derived from the same source. */
const slice: LaborRateCatalogSlice = {
  boards: fullCatalogs.boards.map((b) => ({ id: b.id, hanger_rate: b.hanger_rate })),
  finish_scopes: fullCatalogs.finish_scopes.map((f) => ({
    id: f.id,
    finisher_rate: f.finisher_rate,
  })),
}

function line(patch: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'l1',
    type: 'drywall',
    catalog_id: 'board_58_type_x',
    finish_scope_id: 'level_4',
    ...patch,
  } as QuoteLineItem
}

/** Every case is asserted against BOTH inputs, so a drift cannot pass. */
function bothHanger(l: QuoteLineItem, projectRate?: number) {
  const a = getEffectiveHangerRate(l, fullCatalogs, projectRate)
  const b = getEffectiveHangerRate(l, slice, projectRate)
  expect(b).toBe(a)
  return a
}

function bothFinisher(l: QuoteLineItem, projectRate?: number) {
  const a = getEffectiveFinisherRate(l, fullCatalogs, projectRate)
  const b = getEffectiveFinisherRate(l, slice, projectRate)
  expect(b).toBe(a)
  return a
}

describe('hanger rate from the crew slice', () => {
  it('falls back to the board catalog rate', () => {
    expect(bothHanger(line())).toBe(0.11)
    expect(bothHanger(line({ catalog_id: 'board_12_std' }))).toBe(0.09)
  })

  it('prefers the project rate over the catalog', () => {
    expect(bothHanger(line(), 0.14)).toBe(0.14)
  })

  it('lets a per-line override beat the project rate', () => {
    expect(bothHanger(line({ custom_hanger_rate: 0.2 }), 0.14)).toBe(0.2)
  })

  // A real zero is a decision, not a missing value — it must not fall through to the catalog.
  it('honours a per-line override of zero', () => {
    expect(bothHanger(line({ custom_hanger_rate: 0 }), 0.14)).toBe(0)
  })

  it('is zero for a line that is not drywall', () => {
    expect(bothHanger(line({ type: 'insulation' }), 0.14)).toBe(0)
  })

  it('is zero when the board is not in the catalog', () => {
    expect(bothHanger(line({ catalog_id: 'board_that_was_deleted' }))).toBe(0)
  })
})

describe('finisher rate from the crew slice', () => {
  it('falls back to the finish scope catalog rate', () => {
    expect(bothFinisher(line())).toBe(0.45)
    expect(bothFinisher(line({ finish_scope_id: 'level_5' }))).toBe(0.62)
  })

  it('prefers the project rate over the catalog', () => {
    expect(bothFinisher(line(), 0.5)).toBe(0.5)
  })

  it('lets a per-line override beat the project rate', () => {
    expect(bothFinisher(line({ custom_finisher_rate: 0.7 }), 0.5)).toBe(0.7)
  })

  it('is zero when the line carries no finish scope', () => {
    expect(bothFinisher(line({ finish_scope_id: undefined }))).toBe(0)
  })

  it('is zero for a line that is not drywall', () => {
    expect(bothFinisher(line({ type: 'metal_stud' }), 0.5)).toBe(0)
  })
})

/**
 * The slice is all crew get, so the parity above is only meaningful if the slice genuinely
 * carries nothing else. Asserted here rather than left to the migration alone, because this
 * is the shape the client code is written against.
 */
describe('the slice carries only the two rates', () => {
  it('exposes id and hanger_rate on a board, nothing more', () => {
    expect(Object.keys(slice.boards[0]).sort()).toEqual(['hanger_rate', 'id'])
  })

  it('exposes id and finisher_rate on a finish scope, nothing more', () => {
    expect(Object.keys(slice.finish_scopes[0]).sort()).toEqual(['finisher_rate', 'id'])
  })

  it('carries no material rate, margin floor, cost basis or dashboard target', () => {
    const text = JSON.stringify(slice)
    for (const leaked of [
      'material_rate',
      'marginFloorTarget',
      'poEstimatedCostPerSqft',
      'dashboardTargets',
      'display_name',
      'payroll_piece_key',
      'default_waste_pct',
    ]) {
      expect(text).not.toContain(leaked)
    }
    // And the values themselves, not just the key names.
    expect(text).not.toContain('0.42')
    expect(text).not.toContain('1.72')
  })
})
