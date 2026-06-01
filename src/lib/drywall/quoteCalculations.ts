// @ts-nocheck
/**
 * Single source of truth for quote calculations
 * Uses the calculations object from QuoteStage and ensures TotalQuote = Subtotal + Profit
 */

import { applyWaste, LABOR_TAX_RATE } from './calculations/quantityUtils'
import { calcRcChannelLineTotal } from './calculations/rcChannelLineTotal'
import { normalizeQuoteToV2, quoteV2ToLegacyCompat } from './drywallQuoteSchema'
import {
  applyPricingPipeline,
  createPricingAccumulator,
  addPipelineResult,
  addPrecomputedComponent,
  finalizePricing,
} from './quotePricingEngine'

function coerceNumber(v, fallback = 0) {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function deriveHangFinishSqft({
  baseSqftWithWaste,
  hangLayersDefault,
  finishLayersDefault,
  hangSqftOverrideDefault,
  finishSqftOverrideDefault,
  breakdownItem,
}) {
  const itemHangLayers = Math.max(0, coerceNumber(breakdownItem?.hangLayers, hangLayersDefault));
  const itemFinishLayers = Math.max(0, coerceNumber(breakdownItem?.finishLayers, finishLayersDefault));
  const itemHangOverride =
    breakdownItem?.hangSqftOverride != null && breakdownItem?.hangSqftOverride !== ''
      ? coerceNumber(breakdownItem.hangSqftOverride, null)
      : hangSqftOverrideDefault;
  const itemFinishOverride =
    breakdownItem?.finishSqftOverride != null && breakdownItem?.finishSqftOverride !== ''
      ? coerceNumber(breakdownItem.finishSqftOverride, null)
      : finishSqftOverrideDefault;

  const hangSqft = itemHangOverride != null ? Math.max(0, itemHangOverride) : Math.max(0, baseSqftWithWaste * itemHangLayers);
  const finishSqft = itemFinishOverride != null ? Math.max(0, itemFinishOverride) : Math.max(0, baseSqftWithWaste * itemFinishLayers);
  const extraBoardSqft = Math.max(0, hangSqft - finishSqft);
  return { hangSqft, finishSqft, extraBoardSqft };
}

function calcSuspendedGridBreakdownTotal(item, q, { salesTaxRatePct, overheadPct, profitPct }) {
  const baseSqft = coerceNumber(item?.suspendedGridSqft, 0);
  if (baseSqft <= 0) return null;

  const wastePct = coerceNumber(item?.suspendedGridWastePercentage, coerceNumber(q?.suspendedGridWastePercentage, 0));
  const mult = 1 + wastePct / 100;
  const sqftWithWaste = baseSqft * mult;

  const basePerimeter = coerceNumber(item?.suspendedGridPerimeter, 0);
  const perimeter = (basePerimeter > 0 ? basePerimeter : 4 * Math.sqrt(baseSqft)) * mult;

  // Same estimation logic as QuoteStage quick estimator.
  const shiny90Count = Math.ceil(perimeter / 8);
  const mainsLinearFt = sqftWithWaste / 4;
  const mainsCount = Math.ceil(mainsLinearFt / 12);
  const tees4ftCount = Math.ceil((sqftWithWaste / 16) * 2);
  const wireLinearFt = Math.ceil(sqftWithWaste / 5);
  const lagsCount = Math.ceil(wireLinearFt / 8);

  const shiny90Rate = coerceNumber(item?.shiny90Rate, coerceNumber(q?.shiny90Rate, 0));
  const mainsRate = coerceNumber(item?.mainsRate, coerceNumber(q?.mainsRate, 0));
  const tees4ftRate = coerceNumber(item?.tees4ftRate, coerceNumber(q?.tees4ftRate, 0));
  const wireRate = coerceNumber(item?.wireRate, coerceNumber(q?.wireRate, 0));
  const lagsRate = coerceNumber(item?.lagsRate, coerceNumber(q?.lagsRate, 0));
  const carpenterRate = coerceNumber(item?.carpenterRate, coerceNumber(q?.carpenterRate, 0));

  const materialCost =
    shiny90Count * shiny90Rate +
    mainsCount * mainsRate +
    tees4ftCount * tees4ftRate +
    wireLinearFt * wireRate +
    lagsCount * lagsRate;
  const laborCostWithTax = sqftWithWaste * carpenterRate * (1 + LABOR_TAX_RATE);

  const priced = applyPricingPipeline({
    materialCost,
    laborCostWithTax,
    salesTaxRatePct,
    overheadPct,
    profitPct,
  });

  return { ...priced, sqftWithWaste };
}

function calcMetalStudBreakdownTotal(item, q, { salesTaxRatePct, overheadPct, profitPct }) {
  const wastePct = coerceNumber(item?.metalStudWastePercentage, coerceNumber(q?.metalStudWastePercentage, 0));
  const laborRate = coerceNumber(item?.metalStudLaborRate, coerceNumber(q?.metalStudLaborRate, 0));
  const mult = 1 + wastePct / 100;
  const entries = Array.isArray(item?.metalStudEntries) && item.metalStudEntries.length > 0
    ? item.metalStudEntries
    : [item];
  let totalMaterialCost = 0;
  let totalWallLfW = 0;
  entries.forEach((entry) => {
    const wallLf = coerceNumber(entry?.wallLf, coerceNumber(entry?.metalStudWallLf, 0));
    const wallHeight = coerceNumber(entry?.wallHeight, coerceNumber(entry?.metalStudWallHeight, 0));
    if (wallLf <= 0 || wallHeight <= 0) return;
    const spacing = coerceNumber(entry?.spacing, coerceNumber(entry?.metalStudSpacing, coerceNumber(item?.metalStudSpacing, 16))) || 16;
    const tracksPerRun = Math.max(1, coerceNumber(entry?.tracksPerRun, coerceNumber(entry?.metalStudTracksPerRun, coerceNumber(item?.metalStudTracksPerRun, 2))) || 2);
    const size = String(entry?.size ?? entry?.metalStudSize ?? item?.metalStudSize ?? '3.625');
    const gauge = String(entry?.gauge ?? entry?.metalStudGauge ?? item?.metalStudGauge ?? '20');
    const key = `${size}_${gauge}`;
    const studRate = coerceNumber(entry?.metalStudStudRate, coerceNumber(item?.metalStudStudRate, coerceNumber(q?.metalStudStudRates?.[key], 0)));
    const trackRate = coerceNumber(entry?.metalStudTrackRate, coerceNumber(item?.metalStudTrackRate, coerceNumber(q?.metalStudTrackRates?.[key], 0)));
    const studCount = Math.ceil(wallLf / (spacing / 12));
    const studLfW = studCount * wallHeight * mult;
    const trackLfW = wallLf * tracksPerRun * mult;
    totalMaterialCost += studLfW * studRate + trackLfW * trackRate;
    totalWallLfW += wallLf * mult;
  });
  if (totalMaterialCost <= 0 && totalWallLfW <= 0) return null;
  const laborCostWithTax = totalWallLfW * laborRate * (1 + LABOR_TAX_RATE);

  const priced = applyPricingPipeline({
    materialCost: totalMaterialCost,
    laborCostWithTax,
    salesTaxRatePct,
    overheadPct,
    profitPct,
  });
  return priced;
}

export const calculateQuoteTotals = (quoteData, calculations) => {
  const canonicalQuote = normalizeQuoteToV2(quoteData || {});
  const q = quoteV2ToLegacyCompat(canonicalQuote);
  calculations = calculations || {};
  const breakdowns = q?.breakdowns || [];
  const options = q?.options || [];
  const includeSuspendedGrid = q?.includeSuspendedGrid || false;
  const includeRcChannel = q?.includeRcChannel || false;
  const includeInsulation = q?.includeInsulation || false;
  const includeAcousticCeiling = q?.includeAcousticCeiling || false;
  const includeMetalStudFraming = q?.includeMetalStudFraming || false;
  const includeFRP = q?.includeFRP || false;
  
  const overheadPct = parseFloat(q?.overheadPercentage) || 0;
  const profitPct = parseFloat(q?.profitPercentage) || 0;
  const salesTaxRate = parseFloat(q?.salesTaxRate) || 0;
  
  const pricing = createPricingAccumulator();
  
  if (breakdowns.length > 0) {
    const wastePct = coerceNumber(calculations.wastePercentage, coerceNumber(q?.wastePercentage, 0));
    const drywallScope = q?.drywallScope || 'hang_and_finish';
    const materialRate = coerceNumber(q?.materialRate, 0);
    const boardOnlyMaterialRate = coerceNumber(
      q?.boardOnlyMaterialRate,
      // If unset, default to materialRate so additional layers aren't priced at $0 by surprise.
      materialRate
    );
    const hangerRate = coerceNumber(q?.hangerRate, 0);
    const finisherRate = coerceNumber(q?.finisherRate, 0);
    const prepCleanRate = coerceNumber(q?.prepCleanRate, 0);

    const hangLayersDefault = Math.max(0, coerceNumber(q?.hangLayers, 1));
    const finishLayersDefault = Math.max(0, coerceNumber(q?.finishLayers, 1));
    const hangSqftOverrideDefault =
      q?.hangSqftOverride != null && q?.hangSqftOverride !== ''
        ? Math.max(0, coerceNumber(q?.hangSqftOverride, 0))
        : null;
    const finishSqftOverrideDefault =
      q?.finishSqftOverride != null && q?.finishSqftOverride !== ''
        ? Math.max(0, coerceNumber(q?.finishSqftOverride, 0))
        : null;

    breakdowns.forEach((item) => {
      let itemDrywallTotal = 0;
      let itemRcChannelTotal = 0;
      let itemSuspendedGridTotal = 0;
      let itemMetalStudTotal = 0;
      
      // Drywall: waste on sqft, then material + labor (apply labor burden here).
      const itemBaseSqft = parseFloat(item.sqft) || 0;
      if (itemBaseSqft > 0) {
        const baseSqftWithWaste = applyWaste(itemBaseSqft, wastePct);
        const { hangSqft, finishSqft, extraBoardSqft } = deriveHangFinishSqft({
          baseSqftWithWaste,
          hangLayersDefault,
          finishLayersDefault,
          hangSqftOverrideDefault,
          finishSqftOverrideDefault,
          breakdownItem: item,
        });

        const itemBoardOnlyRate = coerceNumber(item?.boardOnlyMaterialRate, boardOnlyMaterialRate);
        const itemMaterialCost = finishSqft * materialRate + extraBoardSqft * itemBoardOnlyRate;
        const laborBase =
          (drywallScope !== 'finish_only' ? hangSqft * hangerRate : 0) +
          (drywallScope !== 'hang_only' ? finishSqft * finisherRate : 0) +
          (finishSqft * prepCleanRate);
        const itemLaborCostWithTax = laborBase * (1 + LABOR_TAX_RATE);
        const priced = applyPricingPipeline({
          materialCost: itemMaterialCost,
          laborCostWithTax: itemLaborCostWithTax,
          salesTaxRatePct: salesTaxRate,
          overheadPct,
          profitPct,
        });
        itemDrywallTotal = priced.total;
        addPipelineResult(pricing, priced);
      }
      
      // RC Channel: delegated to pure calc (quantities → direct costs → pricing pipeline)
      if (includeRcChannel) {
        const rcPriced = calcRcChannelLineTotal(item, q, {
          salesTaxRatePct: salesTaxRate,
          overheadPct,
          profitPct,
        });
        if (rcPriced) {
          itemRcChannelTotal = rcPriced.total;
          addPipelineResult(pricing, rcPriced);
        }
      }

      if (includeSuspendedGrid) {
        const sgPriced = calcSuspendedGridBreakdownTotal(item, q, {
          salesTaxRatePct: salesTaxRate,
          overheadPct,
          profitPct,
        });
        if (sgPriced) {
          itemSuspendedGridTotal = sgPriced.total;
          addPipelineResult(pricing, sgPriced);
        }
      }

      if (includeMetalStudFraming) {
        const msPriced = calcMetalStudBreakdownTotal(item, q, {
          salesTaxRatePct: salesTaxRate,
          overheadPct,
          profitPct,
        });
        if (msPriced) {
          itemMetalStudTotal = msPriced.total;
          addPipelineResult(pricing, msPriced);
        }
      }
      
      const itemTotal = itemDrywallTotal + itemRcChannelTotal + itemSuspendedGridTotal + itemMetalStudTotal;
      item.drywallTotal = itemDrywallTotal;
      item.rcChannelTotal = itemRcChannelTotal;
      item.suspendedGridTotal = itemSuspendedGridTotal;
      item.metalStudTotal = itemMetalStudTotal;
      item.itemTotal = itemTotal;
    });
    
    // Project-level add-ons: overhead/profit already applied in QuoteStage; we only aggregate here
    const suspendedGridInBreakdowns = breakdowns.some((item) => coerceNumber(item?.suspendedGridSqft, 0) > 0);
    if (includeSuspendedGrid && !suspendedGridInBreakdowns && calculations.suspendedGridSubtotalBeforeProfit) {
      // Check if suspended grid is already included in breakdown items
      addPrecomputedComponent(pricing, {
        total: calculations.suspendedGridTotal || 0,
        profit: calculations.suspendedGridProfit || 0,
        directCost: calculations.suspendedGridTotalDirectCost || 0,
        salesTax: calculations.suspendedGridSalesTax || 0,
      });
    }
    // Add insulation if included (project-level, not in breakdown items)
    if (includeInsulation && (calculations.insulationTotal || 0) > 0) {
      addPrecomputedComponent(pricing, {
        total: calculations.insulationTotal || 0,
        profit: calculations.insulationProfit || 0,
        directCost: calculations.insulationTotalDirectCost || 0,
        salesTax: calculations.insulationSalesTax || 0,
      });
    }
    // Add acoustic ceiling if included (project-level, not in breakdown items)
    if (includeAcousticCeiling && (calculations.acousticCeilingTotal || 0) > 0) {
      addPrecomputedComponent(pricing, {
        total: calculations.acousticCeilingTotal || 0,
        profit: calculations.acousticCeilingProfit || 0,
        directCost: calculations.acousticCeilingTotalDirectCost || 0,
        salesTax: calculations.acousticCeilingSalesTax || 0,
      });
    }
    // Add metal stud framing if included (project-level, not in breakdown items)
    const metalStudInBreakdowns = breakdowns.some((item) => coerceNumber(item?.metalStudWallLf, 0) > 0);
    if (includeMetalStudFraming && !metalStudInBreakdowns && (calculations.metalStudTotal || 0) > 0) {
      addPrecomputedComponent(pricing, {
        total: calculations.metalStudTotal || 0,
        profit: calculations.metalStudProfit || 0,
        directCost: calculations.metalStudTotalDirectCost || 0,
        salesTax: calculations.metalStudSalesTax || 0,
      });
    }
    // Add FRP if included (project-level)
    if (includeFRP && (calculations.frpTotal || 0) > 0) {
      addPrecomputedComponent(pricing, {
        total: calculations.frpTotal || 0,
        profit: calculations.frpProfit || 0,
        directCost: calculations.frpTotalDirectCost || 0,
        salesTax: calculations.frpSalesTax || 0,
      });
    }
  } else {
    // No breakdowns - use combined calculations from QuoteStage (already includes all add-ons)
    pricing.totalDirectCost = calculations.totalDirectCost || 0;
    pricing.subtotal = calculations.subtotalBeforeProfit || 0;
    pricing.profitAmount = calculations.profitAmount || 0;
    pricing.breakdownTotal = calculations.subtotalAfterProfit || 0;
    pricing.totalSalesTax = calculations.salesTax || 0;
  }
  
  // Selected options: fixed price or sqft × rate (option sqft or total quote sqft)
  const selectedOptionsTotal = options
    .filter(opt => opt.selected)
    .reduce((sum, opt) => {
      const optionSqft = opt.useTotalSqft ? (calculations.sqft || 0) : (parseFloat(opt.sqft) || 0);
      const optionRate = parseFloat(opt.rate) || 0;
      if (optionSqft > 0 && optionRate > 0) {
        return sum + (optionSqft * optionRate);
      } else {
        return sum + (parseFloat(opt.price) || 0);
      }
    }, 0);
  
  // Validation: sum of item totals must equal breakdown total within $0.01
  // Skip when project-level add-ons exist (suspended grid, insulation, acoustic, metal stud);
  // those are not in item totals, so we'd false-fail.
  const itemTotalsSum = breakdowns.reduce((sum, item) => sum + (item.itemTotal || 0), 0);
  const suspendedGridInBreakdowns = breakdowns.some((item) => coerceNumber(item?.suspendedGridSqft, 0) > 0);
  const metalStudInBreakdowns = breakdowns.some((item) => coerceNumber(item?.metalStudWallLf, 0) > 0);
  const hasProjectAddOns = (includeSuspendedGrid && !suspendedGridInBreakdowns && (calculations.suspendedGridTotal || 0) > 0) ||
    (includeInsulation && (calculations.insulationTotal || 0) > 0) ||
    (includeAcousticCeiling && (calculations.acousticCeilingTotal || 0) > 0) ||
    (includeMetalStudFraming && !metalStudInBreakdowns && (calculations.metalStudTotal || 0) > 0) ||
    (includeFRP && (calculations.frpTotal || 0) > 0);
  return finalizePricing(pricing, {
    selectedOptionsTotal,
    breakdownCount: breakdowns.length,
    hasProjectAddOns,
    itemTotalsSum,
  });
};
