/**
 * Suspended drywall grid parts for an order, from the ceiling's sqft and perimeter (Mark,
 * 2026-10-16, Lisbon Opportunity Homes). The same layout the quote prices a grid line with
 * (quoteV3Math `suspended_grid`) — 12' mains 4' apart, wall angle along the perimeter — with what
 * ordering needs on top:
 *
 *   - cross-tee spacing is chosen per calculation, 16" or 24" (the quote assumes 24");
 *   - hanger wire is counted in 4' pieces, one per hanger, a hanger every 4' along each main;
 *   - lags, one per hanger, ordered by the box of 100;
 *   - wall angle in the 12' pieces it is bought in (the quote divides by 8').
 *
 * Waste applies to the sqft and the perimeter, as on the quote. Every count is a starting point:
 * the dialog lets the office edit any of them before they become material lines.
 */

export type GridTeeSpacingIn = 16 | 24

export interface GridOrderInput {
  sqft: number
  /** Lineal feet of wall angle. When missing, a square room's: 4 × √sqft (as the quote). */
  perimeter?: number
  wastePct: number
  teeSpacingIn: GridTeeSpacingIn
}

export interface GridOrderCounts {
  /** 12' main runners. */
  mains: number
  /** 4' cross tees. */
  tees4ft: number
  /** Wall angle pieces, 12' (Mark, 2026-10-16 — the quote still counts 8' pieces). */
  wallAngle: number
  /** 4' hanger wire pieces — one per hanger. */
  hangerWire: number
  /** Boxes of 100 lags — one lag per hanger. */
  lagBoxes: number
}

const MAIN_SPACING_FT = 4
const MAIN_LENGTH_FT = 12
const TEE_LENGTH_FT = 4
const HANGER_SPACING_FT = 4
const WALL_ANGLE_LENGTH_FT = 12
export const LAGS_PER_BOX = 100

export function gridOrderCounts(input: GridOrderInput): GridOrderCounts | null {
  const sqft = Number(input.sqft) || 0
  if (sqft <= 0) return null
  const waste = 1 + (Number(input.wastePct) || 0) / 100
  const sqftWasted = sqft * waste
  const basePerimeter = input.perimeter && input.perimeter > 0 ? input.perimeter : 4 * Math.sqrt(sqft)
  const perimeterWasted = basePerimeter * waste

  const mains = Math.ceil(sqftWasted / (MAIN_SPACING_FT * MAIN_LENGTH_FT))
  const tees4ft = Math.ceil(sqftWasted / (TEE_LENGTH_FT * (input.teeSpacingIn / 12)))
  const wallAngle = Math.ceil(perimeterWasted / WALL_ANGLE_LENGTH_FT)
  const hangerWire = mains * (MAIN_LENGTH_FT / HANGER_SPACING_FT)
  const lagBoxes = Math.ceil(hangerWire / LAGS_PER_BOX)
  return { mains, tees4ft, wallAngle, hangerWire, lagBoxes }
}

/** The quote's grid, to start the calculator from: grid lines summed, waste from the first. */
export function gridInputFromQuoteLines(
  lines: { type: string; quantity?: number; grid_perimeter?: number; waste_pct?: number }[],
): { sqft: number; perimeter: number; wastePct: number } | null {
  const grid = lines.filter((l) => l.type === 'suspended_grid' && (Number(l.quantity) || 0) > 0)
  if (grid.length === 0) return null
  return {
    sqft: grid.reduce((s, l) => s + (Number(l.quantity) || 0), 0),
    perimeter: grid.reduce((s, l) => s + (Number(l.grid_perimeter) || 0), 0),
    wastePct: grid[0]!.waste_pct ?? 10,
  }
}

/** Material-line subtypes on the Field page ("Suspended Drywall Grid"), with their units. */
export const GRID_ORDER_LINES: { key: keyof GridOrderCounts; subtype: string; unit: string; label: string }[] = [
  { key: 'mains', subtype: 'Main Runners', unit: 'pcs', label: "Main runners (12')" },
  { key: 'tees4ft', subtype: "Cross Tees 4'", unit: 'pcs', label: "Cross tees (4')" },
  { key: 'wallAngle', subtype: 'Wall Angle', unit: 'pcs', label: "Wall angle (12')" },
  { key: 'hangerWire', subtype: 'Hanger Wire', unit: 'pcs', label: "Hanger wire (4' pcs)" },
  { key: 'lagBoxes', subtype: 'Lags', unit: 'box', label: 'Lags (box of 100)' },
]
