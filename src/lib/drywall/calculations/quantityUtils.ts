// @ts-nocheck
/**
 * Shared quantity and rounding helpers for quote calculations.
 * Preserve exact order of operations when using; do not change formulas.
 */

/** Inches per foot (for spacing conversions). */
export const INCHES_PER_FOOT = 12;

/** RC channel standard piece length in feet. */
export const RC_CHANNEL_PIECE_LENGTH_FT = 12;

/** Default RC channel spacing in inches (ceiling/wall) when not set. */
export const DEFAULT_RC_CHANNEL_SPACING_IN = 24;

/** Labor burden / payroll tax rate (25%). Applied to labor cost before overhead/profit. */
export const LABOR_TAX_RATE = 0.25;

/** Default on when unset — existing quotes keep burden applied. */
export function includeLaborBurden(flag: unknown): boolean {
  return flag !== false;
}

/** Apply optional labor burden to a base labor line (hanger / finisher / prep-clean). */
export function applyLaborBurden(baseCost: number, includeBurden: unknown): number {
  const base = Number(baseCost) || 0;
  return includeLaborBurden(includeBurden) ? base * (1 + LABOR_TAX_RATE) : base;
}

/**
 * Apply waste percentage to a quantity.
 * Formula: qty * (1 + wastePct / 100). Used for sqft and for piece counts before ceil.
 */
export function applyWaste(qty, wastePct) {
  return qty * (1 + (wastePct || 0) / 100);
}

/**
 * Convert linear feet to whole piece count (round up).
 * Used for RC channel and any stick/piece material.
 */
export function lfToPieceCount(lf, pieceLengthFt = RC_CHANNEL_PIECE_LENGTH_FT) {
  return Math.ceil((lf || 0) / pieceLengthFt);
}
