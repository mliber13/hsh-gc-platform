// @ts-nocheck
/**
 * Suspended grid ceiling totals: sqft/perimeter with waste → material + labor (with labor tax) → sales tax → overhead → profit.
 * Pure function for testability and clarity.
 */

import { applyWaste, LABOR_TAX_RATE } from './quantityUtils'

/**
 * Compute suspended grid costs and totals.
 * @param {Object} inputs
 * @param {number} inputs.baseSqft - Suspended grid sqft (before waste)
 * @param {number} inputs.basePerimeter - Perimeter (optional; if 0, derived as 4 * sqrt(baseSqft))
 * @param {number} inputs.wastePct - Waste percentage
 * @param {number} inputs.carpenterRate - $/sqft labor
 * @param {number} inputs.shiny90Count
 * @param {number} inputs.shiny90Rate
 * @param {number} inputs.mainsCount
 * @param {number} inputs.mainsRate
 * @param {number} inputs.tees4ftCount
 * @param {number} inputs.tees4ftRate
 * @param {number} inputs.wireLinearFt
 * @param {number} inputs.wireRate
 * @param {number} inputs.lagsCount
 * @param {number} inputs.lagsRate
 * @param {number} inputs.taxRatePct - Sales tax on material
 * @param {number} inputs.overheadPct
 * @param {number} inputs.profitPct
 * @returns {Object} All suspended grid values for display and aggregation
 */
export function calcSuspendedGridTotals(inputs) {
  const baseSqft = parseFloat(inputs.baseSqft) || 0;
  const wastePct = parseFloat(inputs.wastePct) || 0;
  const basePerimeter = parseFloat(inputs.basePerimeter) || 0;
  const calculatedBasePerimeter = basePerimeter > 0 ? basePerimeter : 4 * Math.sqrt(baseSqft);

  const suspendedGridSqft = applyWaste(baseSqft, wastePct);
  const suspendedGridPerimeter = applyWaste(calculatedBasePerimeter, wastePct);

  const carpenterRateNum = parseFloat(inputs.carpenterRate) || 0;
  const shiny90CountNum = parseFloat(inputs.shiny90Count) || 0;
  const shiny90RateNum = parseFloat(inputs.shiny90Rate) || 0;
  const mainsCountNum = parseFloat(inputs.mainsCount) || 0;
  const mainsRateNum = parseFloat(inputs.mainsRate) || 0;
  const tees4ftCountNum = parseFloat(inputs.tees4ftCount) || 0;
  const tees4ftRateNum = parseFloat(inputs.tees4ftRate) || 0;
  const wireLinearFtNum = parseFloat(inputs.wireLinearFt) || 0;
  const wireRateNum = parseFloat(inputs.wireRate) || 0;
  const lagsCountNum = parseFloat(inputs.lagsCount) || 0;
  const lagsRateNum = parseFloat(inputs.lagsRate) || 0;
  const taxRatePct = parseFloat(inputs.taxRatePct) || 0;
  const overheadPct = parseFloat(inputs.overheadPct) || 0;
  const profitPct = parseFloat(inputs.profitPct) || 0;

  const shiny90Cost = shiny90CountNum * shiny90RateNum;
  const mainsCost = mainsCountNum * mainsRateNum;
  const tees4ftCost = tees4ftCountNum * tees4ftRateNum;
  const wireCost = wireLinearFtNum * wireRateNum;
  const lagsCost = lagsCountNum * lagsRateNum;

  const suspendedGridMaterialCost = shiny90Cost + mainsCost + tees4ftCost + wireCost + lagsCost;
  const carpenterCost = suspendedGridSqft * carpenterRateNum;
  const suspendedGridLaborCost = carpenterCost * (1 + LABOR_TAX_RATE);
  const suspendedGridSalesTax = suspendedGridMaterialCost * (taxRatePct / 100);
  const suspendedGridTotalMaterialCost = suspendedGridMaterialCost + suspendedGridSalesTax;
  const suspendedGridTotalDirectCost = suspendedGridTotalMaterialCost + suspendedGridLaborCost;

  const suspendedGridOverhead = suspendedGridTotalDirectCost * (overheadPct / 100);
  const suspendedGridSubtotalBeforeProfit = suspendedGridTotalDirectCost + suspendedGridOverhead;
  const suspendedGridProfit = suspendedGridSubtotalBeforeProfit * (profitPct / 100);
  const suspendedGridTotal = suspendedGridSubtotalBeforeProfit + suspendedGridProfit;

  return {
    suspendedGridBaseSqft: baseSqft,
    suspendedGridSqft,
    suspendedGridPerimeter,
    suspendedGridMaterialCost,
    suspendedGridLaborCost,
    suspendedGridSalesTax,
    suspendedGridTotalMaterialCost,
    suspendedGridTotalDirectCost,
    suspendedGridOverhead,
    suspendedGridSubtotalBeforeProfit,
    suspendedGridProfit,
    suspendedGridTotal,
  };
}
