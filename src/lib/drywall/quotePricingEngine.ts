// @ts-nocheck
/**
 * Shared quote pricing engine helpers.
 * Keeps one canonical pricing pipeline and accumulation model used by
 * quoteCalculations (and later QuoteStage/PDF/send flows).
 */

export function applyPricingPipeline({ materialCost, laborCostWithTax, salesTaxRatePct, overheadPct, profitPct }) {
  const salesTax = materialCost * ((salesTaxRatePct || 0) / 100);
  const directCost = materialCost + salesTax + laborCostWithTax;
  const overhead = directCost * ((overheadPct || 0) / 100);
  const subtotal = directCost + overhead;
  const profit = subtotal * ((profitPct || 0) / 100);
  const total = subtotal + profit;
  return { salesTax, directCost, overhead, subtotal, profit, total };
}

export function createPricingAccumulator() {
  return {
    totalDirectCost: 0,
    subtotal: 0,
    profitAmount: 0,
    breakdownTotal: 0,
    totalSalesTax: 0,
  };
}

export function addPipelineResult(acc, priced) {
  if (!priced) return;
  acc.totalDirectCost += priced.directCost || 0;
  acc.subtotal += priced.subtotal || 0;
  acc.profitAmount += priced.profit || 0;
  acc.breakdownTotal += priced.total || 0;
  acc.totalSalesTax += priced.salesTax || 0;
}

/**
 * Add a component where totals were already priced upstream (e.g. QuoteStage
 * precomputed project-level add-ons). The subtotal contribution is total - profit.
 */
export function addPrecomputedComponent(acc, { total, profit, directCost, salesTax }) {
  const t = total || 0;
  const p = profit || 0;
  const d = directCost || 0;
  const st = salesTax || 0;
  acc.totalDirectCost += d;
  acc.subtotal += t - p;
  acc.profitAmount += p;
  acc.breakdownTotal += t;
  acc.totalSalesTax += st;
}

export function finalizePricing(acc, { selectedOptionsTotal = 0, breakdownCount = 0, hasProjectAddOns = false, itemTotalsSum = 0 }) {
  const overheadAmount = acc.subtotal - acc.totalDirectCost;
  const calculatedBreakdownTotal = acc.subtotal + acc.profitAmount;
  const finalBreakdownTotal = breakdownCount > 0 ? calculatedBreakdownTotal : acc.breakdownTotal;
  const totalQuote = finalBreakdownTotal + selectedOptionsTotal;
  const validationPassed =
    breakdownCount === 0 ||
    hasProjectAddOns ||
    Math.abs(itemTotalsSum - calculatedBreakdownTotal) < 0.01;

  return {
    totalDirectCost: parseFloat(acc.totalDirectCost.toFixed(2)),
    overheadAmount: parseFloat(overheadAmount.toFixed(2)),
    subtotal: parseFloat(acc.subtotal.toFixed(2)),
    profitAmount: parseFloat(acc.profitAmount.toFixed(2)),
    totalQuote: parseFloat(totalQuote.toFixed(2)),
    selectedOptionsTotal: parseFloat(selectedOptionsTotal.toFixed(2)),
    breakdownTotal: parseFloat(finalBreakdownTotal.toFixed(2)),
    totalSalesTax: parseFloat(acc.totalSalesTax.toFixed(2)),
    validationPassed,
    itemTotalsSum: parseFloat(itemTotalsSum.toFixed(2)),
  };
}

