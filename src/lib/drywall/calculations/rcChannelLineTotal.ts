// @ts-nocheck
/**
 * RC Channel line total for one breakdown item.
 * Pure function: quantities → direct costs → pricing pipeline (sales tax on material, overhead, profit).
 */

import { applyWaste, lfToPieceCount, RC_CHANNEL_PIECE_LENGTH_FT, LABOR_TAX_RATE, INCHES_PER_FOOT } from './quantityUtils'

/**
 * Pricing pipeline: sales tax on material, then direct → overhead → profit.
 * Same sequence as quoteCalculations breakdown items.
 */
function applyPricingPipeline({ materialCost, laborCostWithTax, salesTaxRatePct, overheadPct, profitPct }) {
  const salesTax = materialCost * ((salesTaxRatePct || 0) / 100);
  const directCost = materialCost + salesTax + laborCostWithTax;
  const overhead = directCost * ((overheadPct || 0) / 100);
  const subtotal = directCost + overhead;
  const profit = subtotal * ((profitPct || 0) / 100);
  const total = subtotal + profit;
  return { salesTax, directCost, overhead, subtotal, profit, total };
}

/**
 * Compute RC Channel total for a single breakdown item.
 * @param item - Breakdown item with rcChannelCeilingSqft, rcChannelWallLinearFt, rcChannelWallHeight
 * @param quoteData - Quote with rcChannelWastePercentage, rcChannelCeilingSpacing, rcChannelWallSpacing, rcChannelRate, rcChannelLaborRate
 * @param rates - { salesTaxRatePct, overheadPct, profitPct }
 * @returns { total, directCost, subtotal, profit, salesTax } or null if item has no RC data
 */
export function calcRcChannelLineTotal(item, quoteData, rates) {
  const itemRcCeilingSqft = parseFloat(item.rcChannelCeilingSqft) || 0;
  const itemRcWallLinearFt = parseFloat(item.rcChannelWallLinearFt) || 0;
  const itemRcWallHeight = parseFloat(item.rcChannelWallHeight) || 0;

  if (itemRcCeilingSqft <= 0 && itemRcWallLinearFt <= 0) return null;

  const rcChannelWastePct = parseFloat(quoteData?.rcChannelWastePercentage) || 0;
  const rcChannelCeilingSpacing = parseFloat(quoteData?.rcChannelCeilingSpacing) || 24;
  const rcChannelWallSpacing = parseFloat(quoteData?.rcChannelWallSpacing) || 24;
  const rcChannelRate = parseFloat(quoteData?.rcChannelRate) || 0;
  const rcChannelLaborRate = parseFloat(quoteData?.rcChannelLaborRate) || 0;

  let itemCeilingLinearFt = 0;
  let itemWallLinearFt = 0;
  let itemCeilingPieces = 0;
  let itemWallPieces = 0;

  if (itemRcCeilingSqft > 0 && rcChannelCeilingSpacing > 0) {
    const spacingInFeet = rcChannelCeilingSpacing / INCHES_PER_FOOT;
    itemCeilingLinearFt = itemRcCeilingSqft / spacingInFeet;
    itemCeilingPieces = lfToPieceCount(itemCeilingLinearFt, RC_CHANNEL_PIECE_LENGTH_FT);
  }

  if (itemRcWallLinearFt > 0 && itemRcWallHeight > 0 && rcChannelWallSpacing > 0) {
    const spacingInFeet = rcChannelWallSpacing / INCHES_PER_FOOT;
    const numberOfRows = Math.ceil(itemRcWallHeight / spacingInFeet);
    itemWallLinearFt = numberOfRows * itemRcWallLinearFt;
    itemWallPieces = lfToPieceCount(itemWallLinearFt, RC_CHANNEL_PIECE_LENGTH_FT);
  } else if (itemRcWallLinearFt > 0) {
    itemWallLinearFt = itemRcWallLinearFt;
    itemWallPieces = lfToPieceCount(itemWallLinearFt, RC_CHANNEL_PIECE_LENGTH_FT);
  }

  const itemTotalPieces = itemCeilingPieces + itemWallPieces;
  const itemPiecesWithWaste = Math.ceil(applyWaste(itemTotalPieces, rcChannelWastePct));

  const itemRcMaterialCost = itemPiecesWithWaste * rcChannelRate;
  const itemRcLaborCostBase = itemPiecesWithWaste * rcChannelLaborRate;
  const itemRcLaborCostWithTax = itemRcLaborCostBase * (1 + LABOR_TAX_RATE);

  return applyPricingPipeline({
    materialCost: itemRcMaterialCost,
    laborCostWithTax: itemRcLaborCostWithTax,
    salesTaxRatePct: rates.salesTaxRatePct,
    overheadPct: rates.overheadPct,
    profitPct: rates.profitPct,
  });
}
