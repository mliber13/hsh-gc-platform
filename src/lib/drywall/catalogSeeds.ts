import type {
  AccessoryAppliedMap,
  AccessoryCatalogEntry,
  BoardCatalogEntry,
  FinishScopeCatalogEntry,
  OrgDrywallCatalogs,
} from '@/types/drywallCatalogs'
import {
  DEFAULT_MARGIN_FLOOR_TARGET,
  DEFAULT_PO_ESTIMATED_COST_PER_SQFT,
} from '@/lib/drywall/marginFloor'
import { DEFAULT_DASHBOARD_TARGETS } from '@/lib/drywall/dashboardTargets'

const ALL_ACCESSORIES: AccessoryAppliedMap = {
  joint_compound: true,
  tape: true,
  screws: true,
  corner_bead: true,
}

function board(id: string, display_name: string): BoardCatalogEntry {
  return {
    id,
    display_name,
    material_rate: 0,
    hanger_rate: 0,
    default_waste_pct: 10,
  }
}

function finishScope(
  id: string,
  display_name: string,
  applies_to_locations: FinishScopeCatalogEntry['applies_to_locations'],
  accessories_applied: AccessoryAppliedMap,
): FinishScopeCatalogEntry {
  return {
    id,
    display_name,
    applies_to_locations,
    finisher_rate: 0,
    accessories_applied,
    payroll_piece_key: id,
  }
}

/** Accessory qty formulas live in quoteV3Accessories.ts (v2 accessoryCalc parity). */
function accessory(
  id: string,
  display_name: string,
  category: AccessoryCatalogEntry['category'],
  unit: AccessoryCatalogEntry['unit'],
  material_rate: number,
  sqft_per_unit: number,
  notes?: string,
): AccessoryCatalogEntry {
  return { id, display_name, category, unit, material_rate, sqft_per_unit, notes }
}

/** Locked Q.A seeds — board/finish rates are $0 until Mark sets via admin UI. */
export function createDefaultDrywallCatalogSeeds(): OrgDrywallCatalogs {
  return {
    boards: [
      board('5_8_type_x', '5/8" Type X'),
      board('5_8_regular', '5/8" Regular'),
      board('5_8_mr', '5/8" Moisture-Resistant'),
      board('5_8_cement', '5/8" Cement Board'),
      board('5_8_sound', '5/8" Sound Board'),
      board('5_8_densglass', '5/8" DensGlass'),
      board('1_2_regular', '1/2" Regular'),
      board('1_2_mr', '1/2" Moisture-Resistant'),
      board('1_2_cement', '1/2" Cement Board'),
      board('1_2_type_x', '1/2" Type X'),
      board('1_2_sound', '1/2" Sound Board'),
      board('1_2_densglass', '1/2" DensGlass'),
      board('3_8_regular', '3/8" Regular'),
      board('1_4_regular', '1/4" Regular'),
    ],
    finish_scopes: [
      finishScope('firetape_only', 'Firetape Only', ['wall', 'ceiling'], {
        joint_compound: true,
        tape: true,
        screws: true,
        corner_bead: false,
      }),
      finishScope('level_3', 'Level 3', ['wall', 'ceiling'], ALL_ACCESSORIES),
      finishScope('level_4', 'Level 4', ['wall', 'ceiling'], ALL_ACCESSORIES),
      finishScope('level_5', 'Level 5', ['wall', 'ceiling'], ALL_ACCESSORIES),
      finishScope('stomp_knockdown', 'Stomp Knockdown', ['wall', 'ceiling'], ALL_ACCESSORIES),
      finishScope('knockdown', 'Knockdown', ['wall', 'ceiling'], ALL_ACCESSORIES),
      finishScope('splatter', 'Splatter', ['wall', 'ceiling'], ALL_ACCESSORIES),
      finishScope('splatter_knockdown', 'Splatter Knockdown', ['wall', 'ceiling'], ALL_ACCESSORIES),
      finishScope('roll_texture', 'Roll Texture', ['wall', 'ceiling'], {
        joint_compound: true,
        tape: true,
        screws: true,
        corner_bead: false,
      }),
      finishScope('hang_only', 'Hang Only', ['wall', 'ceiling'], {
        joint_compound: false,
        tape: false,
        screws: true,
        corner_bead: false,
      }),
    ],
    accessories: [
      accessory(
        'joint_compound_all_purpose',
        'All Purpose Joint Compound (5 gal bucket)',
        'joint_compound',
        'bucket',
        22,
        960,
        'Qty uses finish-scope multiplier on 4,800 sqft base (v2 accessoryCalc).',
      ),
      accessory(
        'joint_compound_lite_weight',
        'Lite Weight Joint Compound (5 gal bucket)',
        'joint_compound',
        'bucket',
        20,
        600,
        'Base 4,800÷8 sqft/bucket + corner bead add-on per v2.',
      ),
      accessory(
        'joint_compound_easy_sand_90',
        'Easy Sand 90 (bag)',
        'joint_compound',
        'bag',
        12,
        5000,
        'Finish setup compound; corner bead add-on per v2.',
      ),
      accessory(
        'tape_paper_500ft',
        "500' Paper Tape (roll)",
        'tape',
        'roll',
        8,
        1400,
        'v2 paperTapeRate 1,400 sqft/roll.',
      ),
      accessory(
        'tape_mesh_300ft',
        "300' Mesh Tape (roll)",
        'tape',
        'roll',
        15,
        15000,
        'Large-job rate; small jobs use 1,000 sqft/roll threshold in engine.',
      ),
      accessory(
        'screws_1_25_coarse',
        'Drywall Screws 1-1/4" Coarse (box ~5,000)',
        'screws',
        'box',
        35,
        5760,
        'v2 screwRate 5,760 sqft/box.',
      ),
      accessory(
        'screws_1_25_fine',
        'Screws 1-1/4" Fine Thread (box ~5,000)',
        'screws',
        'box',
        35,
        0,
        'RC channel fastener; 4800 LF/box.',
      ),
      accessory(
        'corner_bead_metal',
        'Metal Corner Bead',
        'corner_bead',
        'lf',
        0.85,
        0,
        'Manual LF via line accessoryOverrides.corner_bead_lf; no auto sqft estimate.',
      ),
      accessory(
        'adhesive_titebond_foam',
        'TiteBond Foam (tube)',
        'other',
        'each',
        8,
        5760,
        'v2 titeBondRate — not gated by accessories_applied in Q.C.1.',
      ),
    ],
    rc_channel: [],
    suspended_grid: [],
    insulation: [],
    acoustic: [],
    metal_stud: [],
    frp: [],
    marginFloorTarget: DEFAULT_MARGIN_FLOOR_TARGET,
    poEstimatedCostPerSqft: DEFAULT_PO_ESTIMATED_COST_PER_SQFT,
    dashboardTargets: DEFAULT_DASHBOARD_TARGETS,
  }
}
