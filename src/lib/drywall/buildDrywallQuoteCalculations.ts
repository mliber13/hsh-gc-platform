// @ts-nocheck — formulas ported verbatim from QuoteStage.jsx; typed at service/UI boundary.
/**
 * Drywall quote calculations engine — ported from QuoteStage.jsx useMemo (formulas unchanged).
 */
import { calcSuspendedGridTotals } from './calculations/suspendedGridCalc'
import {
  applyLaborBurden,
  LABOR_TAX_RATE,
  RC_CHANNEL_PIECE_LENGTH_FT,
} from './calculations/quantityUtils'
import { getInsulationMaterialRate, getStudRateKey } from './drywallQuoteHelpers'
import type { DrywallQuote, DrywallQuoteCalculations } from '@/types/drywall'

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function str(v: unknown): string {
  if (v == null || v === '') return ''
  return String(v)
}

export function buildDrywallQuoteCalculations(quote: DrywallQuote): DrywallQuoteCalculations {
  const q = quote

  const sqft = str(q.sqft)
  const wastePercentage = str(q.wastePercentage)
  const drywallScope = q.drywallScope || 'hang_and_finish'
  const hangLayers = str(q.hangLayers) || '1'
  const finishLayers = str(q.finishLayers) || '1'
  const hangSqftOverride = q.hangSqftOverride != null ? str(q.hangSqftOverride) : ''
  const finishSqftOverride = q.finishSqftOverride != null ? str(q.finishSqftOverride) : ''
  const boardOnlyMaterialRate = str(q.boardOnlyMaterialRate)
  const suspendedGridWastePercentage = str(q.suspendedGridWastePercentage)
  const includeSuspendedGrid = Boolean(q.includeSuspendedGrid)
  const materialRate = str(q.materialRate)
  const hangerRate = str(q.hangerRate)
  const finisherRate = str(q.finisherRate)
  const prepCleanRate = str(q.prepCleanRate)
  const carpenterRate = str(q.carpenterRate)
  const shiny90Count = str(q.shiny90Count)
  const shiny90Rate = str(q.shiny90Rate)
  const mainsCount = str(q.mainsCount)
  const mainsRate = str(q.mainsRate)
  const tees4ftCount = str(q.tees4ftCount)
  const tees4ftRate = str(q.tees4ftRate)
  const wireLinearFt = str(q.wireLinearFt)
  const wireRate = str(q.wireRate)
  const lagsCount = str(q.lagsCount)
  const lagsRate = str(q.lagsRate)
  const includeRcChannel = Boolean(q.includeRcChannel)
  const rcChannelCeilingSqft = str(q.rcChannelCeilingSqft)
  const rcChannelCeilingSpacing = str(q.rcChannelCeilingSpacing) || '24'
  const rcChannelWallEntries = Array.isArray(q.rcChannelWallEntries) ? q.rcChannelWallEntries : []
  const rcChannelWallSpacing = str(q.rcChannelWallSpacing) || '24'
  const rcChannelWastePercentage = str(q.rcChannelWastePercentage)
  const rcChannelRate = str(q.rcChannelRate)
  const rcChannelLaborRate = str(q.rcChannelLaborRate)
  const includeInsulation = Boolean(q.includeInsulation)
  const insulationWastePercentage = str(q.insulationWastePercentage)
  const insulationCeilingLaborRate = str(q.insulationCeilingLaborRate)
  const insulationWallLaborRate = str(q.insulationWallLaborRate)
  const insulationEntries = Array.isArray(q.insulationEntries) ? q.insulationEntries : []
  const includeAcousticCeiling = Boolean(q.includeAcousticCeiling)
  const acousticCeilingTileSize = q.acousticCeilingTileSize || '2x4'
  const acousticCeilingWastePercentage = str(q.acousticCeilingWastePercentage)
  const acousticCeilingTileRate = str(q.acousticCeilingTileRate)
  const acousticCeilingLaborRate = str(q.acousticCeilingLaborRate)
  const acousticCeilingPerimeter = str(q.acousticCeilingPerimeter)
  const acousticWallAngleCount = str(q.acousticWallAngleCount)
  const acousticWallAngleRate = str(q.acousticWallAngleRate)
  const acousticMainsCount = str(q.acousticMainsCount)
  const acousticMainsRate = str(q.acousticMainsRate)
  const acousticTees4ftCount = str(q.acousticTees4ftCount)
  const acousticTees4ftRate = str(q.acousticTees4ftRate)
  const acousticTees2ftCount = str(q.acousticTees2ftCount)
  const acousticTees2ftRate = str(q.acousticTees2ftRate)
  const acousticWireLinearFt = str(q.acousticWireLinearFt)
  const acousticWireRate = str(q.acousticWireRate)
  const acousticLagsCount = str(q.acousticLagsCount)
  const acousticLagsRate = str(q.acousticLagsRate)
  const includeMetalStudFraming = Boolean(q.includeMetalStudFraming)
  const metalStudWastePercentage = str(q.metalStudWastePercentage)
  const metalStudLaborRate = str(q.metalStudLaborRate)
  const metalStudStudRates = (q.metalStudStudRates && typeof q.metalStudStudRates === 'object') ? q.metalStudStudRates as Record<string, number | string> : {}
  const metalStudTrackRates = (q.metalStudTrackRates && typeof q.metalStudTrackRates === 'object') ? q.metalStudTrackRates as Record<string, number | string> : {}
  const metalStudEntries = Array.isArray(q.metalStudEntries) ? q.metalStudEntries : []
  const includeFRP = Boolean(q.includeFRP)
  const frpWastePercentage = str(q.frpWastePercentage)
  const frpSqft = str(q.frpSqft)
  const frpWallCount = str(q.frpWallCount)
  const frpWallHeight = str(q.frpWallHeight)
  const frpInsideCorners = str(q.frpInsideCorners)
  const frpOutsideCorners = str(q.frpOutsideCorners)
  const frpExposedEdgesLf = str(q.frpExposedEdgesLf)
  const frpSheetRate = str(q.frpSheetRate)
  const frpAdhesiveBucketRate = str(q.frpAdhesiveBucketRate)
  const frpDivisionStickRate = str(q.frpDivisionStickRate)
  const frpIcStickRate = str(q.frpIcStickRate)
  const frpOcStickRate = str(q.frpOcStickRate)
  const frpJMoldStickRate = str(q.frpJMoldStickRate)
  const frpLaborRate = str(q.frpLaborRate)
  const overheadPercentage = str(q.overheadPercentage)
  const profitPercentage = str(q.profitPercentage)
  const salesTaxRate = str(q.salesTaxRate)
  const totalQuoteAmount = str(q.totalQuoteAmount)
  const breakdowns = Array.isArray(q.breakdowns) ? q.breakdowns : []
  const options = Array.isArray(q.options) ? q.options : []

  const baseSqft = parseFloat(sqft) || 0;
    const wastePct = parseFloat(wastePercentage) || 0;
    // Calculate total sqft including waste
    const sqftNum = baseSqft * (1 + wastePct / 100);
    const baseSqftWithWaste = sqftNum;
    const overheadPct = parseFloat(overheadPercentage) || 0;
    const profitPct = parseFloat(profitPercentage) || 0;
    const taxRate = parseFloat(salesTaxRate) || 0;
    const totalQuoteAmountNum = parseFloat(totalQuoteAmount) || 0;

    // Standard Drywall calculations (always included)
    const materialRateNum = parseFloat(materialRate) || 0;
    const boardOnlyMaterialRateNum = parseFloat(boardOnlyMaterialRate) || 0;
    const hangerRateNum = parseFloat(hangerRate) || 0;
    const finisherRateNum = parseFloat(finisherRate) || 0;
    const prepCleanRateNum = parseFloat(prepCleanRate) || 0;

    // Standard Drywall direct costs (drywallScope: hang_and_finish | hang_only | finish_only)
    const hangLayersNum = Math.max(0, parseFloat(hangLayers) || 1);
    const finishLayersNum = Math.max(0, parseFloat(finishLayers) || 1);
    const hangSqft =
      hangSqftOverride !== '' ? (parseFloat(hangSqftOverride) || 0) : baseSqftWithWaste * hangLayersNum;
    const finishSqft =
      finishSqftOverride !== '' ? (parseFloat(finishSqftOverride) || 0) : baseSqftWithWaste * finishLayersNum;
    const extraBoardSqft = Math.max(0, hangSqft - finishSqft);

    // Materials: finish materials on finish sqft + board-only for extra layers (hang sqft - finish sqft)
    let materialCost = finishSqft * materialRateNum + extraBoardSqft * boardOnlyMaterialRateNum;
    // Labor: hang uses hang sqft; finish + prep/clean use finish sqft
    let hangerCost = (drywallScope !== 'finish_only') ? hangSqft * hangerRateNum : 0;
    let finisherCost = (drywallScope !== 'hang_only') ? finishSqft * finisherRateNum : 0;
    let prepCleanCost = finishSqft * prepCleanRateNum;
    
    // Labor costs with optional per-trade burden (project-level toggles)
    const hangerCostWithTax = applyLaborBurden(hangerCost, q.hangerIncludeLaborBurden);
    const finisherCostWithTax = applyLaborBurden(finisherCost, q.finisherIncludeLaborBurden);
    const prepCleanCostWithTax = applyLaborBurden(prepCleanCost, q.prepCleanIncludeLaborBurden);
    let totalLaborCost = hangerCostWithTax + finisherCostWithTax + prepCleanCostWithTax;
    
    // Sales tax on materials only
    let salesTax = materialCost * (taxRate / 100);
    let totalMaterialCost = materialCost + salesTax;
    
    // Total direct cost (standard drywall)
    let totalDirectCost = totalMaterialCost + totalLaborCost;
    
    // Standard Drywall totals (for separate display) - always set these
    const standardDrywallDirectCost = totalDirectCost;
    const standardDrywallMaterialCost = totalMaterialCost;
    const standardDrywallLaborCost = totalLaborCost;
    const standardDrywallSalesTax = salesTax;

    // Suspended Grid Ceiling calculations (optional add-on) — delegated to pure calc
    let suspendedGridMaterialCost = 0;
    let suspendedGridLaborCost = 0;
    let suspendedGridSalesTax = 0;
    let suspendedGridTotalMaterialCost = 0;
    let suspendedGridTotalDirectCost = 0;
    let suspendedGridSqft = 0;
    let suspendedGridBaseSqft = 0;
    let suspendedGridPerimeter = 0;
    let suspendedGridOverhead = 0;
    let suspendedGridSubtotalBeforeProfit = 0;
    let suspendedGridProfit = 0;
    let suspendedGridTotal = 0;

    if (includeSuspendedGrid) {
      const sg = calcSuspendedGridTotals({
        baseSqft: q.suspendedGridSqft,
        basePerimeter: q.suspendedGridPerimeter,
        wastePct: suspendedGridWastePercentage,
        carpenterRate,
        shiny90Count,
        shiny90Rate,
        mainsCount,
        mainsRate,
        tees4ftCount,
        tees4ftRate,
        wireLinearFt,
        wireRate,
        lagsCount,
        lagsRate,
        taxRatePct: taxRate,
        overheadPct,
        profitPct,
      });
      suspendedGridBaseSqft = sg.suspendedGridBaseSqft;
      suspendedGridSqft = sg.suspendedGridSqft;
      suspendedGridPerimeter = sg.suspendedGridPerimeter;
      suspendedGridMaterialCost = sg.suspendedGridMaterialCost;
      suspendedGridLaborCost = sg.suspendedGridLaborCost;
      suspendedGridSalesTax = sg.suspendedGridSalesTax;
      suspendedGridTotalMaterialCost = sg.suspendedGridTotalMaterialCost;
      suspendedGridTotalDirectCost = sg.suspendedGridTotalDirectCost;
      suspendedGridOverhead = sg.suspendedGridOverhead;
      suspendedGridSubtotalBeforeProfit = sg.suspendedGridSubtotalBeforeProfit;
      suspendedGridProfit = sg.suspendedGridProfit;
      suspendedGridTotal = sg.suspendedGridTotal;
      totalMaterialCost += sg.suspendedGridTotalMaterialCost;
      totalLaborCost += sg.suspendedGridLaborCost;
      salesTax += sg.suspendedGridSalesTax;
      totalDirectCost += sg.suspendedGridTotalDirectCost;
    }
    
    // Calculate overhead and profit for standard drywall separately
    const standardDrywallOverhead = standardDrywallDirectCost * (overheadPct / 100);
    const standardDrywallSubtotalBeforeProfit = standardDrywallDirectCost + standardDrywallOverhead;
    const standardDrywallProfit = standardDrywallSubtotalBeforeProfit * (profitPct / 100);
    const standardDrywallTotal = standardDrywallSubtotalBeforeProfit + standardDrywallProfit;
    
    // RC Channel calculations (optional add-on)
    let rcChannelMaterialCost = 0;
    let rcChannelLaborCost = 0;
    let rcChannelLaborCostBase = 0;
    let rcChannelSalesTax = 0;
    let rcChannelTotalMaterialCost = 0;
    let rcChannelTotalDirectCost = 0;
    let rcChannelPiecesWithWaste = 0;
    let rcChannelCeilingPieces = 0;
    let rcChannelWallPieces = 0;
    let rcChannelCeilingLinearFt = 0;
    let rcChannelWallLinearFtAgg = 0;
    
    // Calculate RC Channel breakdown totals if breakdowns exist
    let rcChannelBreakdownTotal = 0;
    
    if (includeRcChannel) {
      const wastePct = parseFloat(rcChannelWastePercentage) || 0;
      const rcChannelRateNum = parseFloat(rcChannelRate) || 0;
      const rcChannelLaborRateNum = parseFloat(rcChannelLaborRate) || 0;
      
      
      // Check if breakdowns have RC Channel data
      const breakdownsWithRcChannel = breakdowns.filter(b => 
        (b.rcChannelCeilingSqft && parseFloat(b.rcChannelCeilingSqft) > 0) || 
        (b.rcChannelWallLinearFt && parseFloat(b.rcChannelWallLinearFt) > 0)
      );
      
      // If breakdowns exist with RC Channel data, calculate from breakdowns instead of main fields
      if (breakdownsWithRcChannel.length > 0) {
        rcChannelBreakdownTotal = breakdownsWithRcChannel.reduce((sum, item) => {
          let itemCeilingLinearFt = 0;
          let itemWallLinearFt = 0;
          let itemCeilingPieces = 0;
          let itemWallPieces = 0;
          
          const itemCeilingSqft = parseFloat(item.rcChannelCeilingSqft) || 0;
          const ceilingSpacing = parseFloat(rcChannelCeilingSpacing) || 24;
          if (itemCeilingSqft > 0 && ceilingSpacing > 0) {
            const spacingInFeet = ceilingSpacing / 12;
            itemCeilingLinearFt = itemCeilingSqft / spacingInFeet;
            itemCeilingPieces = Math.ceil(itemCeilingLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
          }
          
          const itemWallLength = parseFloat(item.rcChannelWallLinearFt) || 0;
          const itemWallHeight = parseFloat(item.rcChannelWallHeight) || 0;
          const wallSpacing = parseFloat(rcChannelWallSpacing) || 24;
          if (itemWallLength > 0 && itemWallHeight > 0 && wallSpacing > 0) {
            const spacingInFeet = wallSpacing / 12;
            const numberOfRows = Math.ceil(itemWallHeight / spacingInFeet);
            itemWallLinearFt = numberOfRows * itemWallLength;
            itemWallPieces = Math.ceil(itemWallLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
          } else if (itemWallLength > 0) {
            itemWallLinearFt = itemWallLength;
            itemWallPieces = Math.ceil(itemWallLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
          }
          
          const itemTotalPieces = itemCeilingPieces + itemWallPieces;
          const itemPiecesWithWaste = Math.ceil(itemTotalPieces * (1 + wastePct / 100));
          const itemMaterialCost = itemPiecesWithWaste * rcChannelRateNum;
          const itemLaborCostBase = itemPiecesWithWaste * rcChannelLaborRateNum;
          const itemLaborCostWithTax = itemLaborCostBase * (1 + LABOR_TAX_RATE);
          const itemSalesTax = itemMaterialCost * (taxRate / 100);
          const itemTotalMaterialCost = itemMaterialCost + itemSalesTax;
          const itemDirectCost = itemTotalMaterialCost + itemLaborCostWithTax;
          const itemOverhead = itemDirectCost * (overheadPct / 100);
          const itemSubtotal = itemDirectCost + itemOverhead;
          const itemProfit = itemSubtotal * (profitPct / 100);
          return sum + itemSubtotal + itemProfit;
        }, 0);
        
        breakdownsWithRcChannel.forEach((item) => {
          const itemCeilingSqft = parseFloat(item.rcChannelCeilingSqft) || 0;
          const ceilingSpacing = parseFloat(rcChannelCeilingSpacing) || 24;
          if (itemCeilingSqft > 0 && ceilingSpacing > 0) {
            const spacingInFeet = ceilingSpacing / 12;
            const itemCeilingLinearFt = itemCeilingSqft / spacingInFeet;
            rcChannelCeilingLinearFt += itemCeilingLinearFt;
            rcChannelCeilingPieces += Math.ceil(itemCeilingLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
          }
          const itemWallLength = parseFloat(item.rcChannelWallLinearFt) || 0;
          const itemWallHeight = parseFloat(item.rcChannelWallHeight) || 0;
          const wallSpacing = parseFloat(rcChannelWallSpacing) || 24;
          if (itemWallLength > 0 && itemWallHeight > 0 && wallSpacing > 0) {
            const spacingInFeet = wallSpacing / 12;
            const numberOfRows = Math.ceil(itemWallHeight / spacingInFeet);
            const itemWallLinearFt = numberOfRows * itemWallLength;
            rcChannelWallLinearFtAgg += itemWallLinearFt;
            rcChannelWallPieces += Math.ceil(itemWallLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
          } else if (itemWallLength > 0) {
            rcChannelWallLinearFtAgg += itemWallLength;
            rcChannelWallPieces += Math.ceil(itemWallLength / RC_CHANNEL_PIECE_LENGTH_FT);
          }
        });
      } else {
        // Calculate from main fields (no breakdowns); use rcChannelWallEntries (multiple wall types)
        const ceilingSqft = parseFloat(rcChannelCeilingSqft) || 0;
        const ceilingSpacing = parseFloat(rcChannelCeilingSpacing) || 24;
        if (ceilingSqft > 0 && ceilingSpacing > 0) {
          const spacingInFeet = ceilingSpacing / 12;
          rcChannelCeilingLinearFt = ceilingSqft / spacingInFeet;
          rcChannelCeilingPieces = Math.ceil(rcChannelCeilingLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
        }
        const wallSpacing = parseFloat(rcChannelWallSpacing) || 24;
        (rcChannelWallEntries || []).forEach((entry) => {
          const wallLength = parseFloat(entry.linearFt) || 0;
          const wallHeight = parseFloat(entry.height) || 0;
          if (wallLength > 0 && wallHeight > 0 && wallSpacing > 0) {
            const spacingInFeet = wallSpacing / 12;
            const numberOfRows = Math.ceil(wallHeight / spacingInFeet);
            const entryLinearFt = numberOfRows * wallLength;
            rcChannelWallLinearFtAgg += entryLinearFt;
            rcChannelWallPieces += Math.ceil(entryLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
          } else if (wallLength > 0) {
            rcChannelWallLinearFtAgg += wallLength;
            rcChannelWallPieces += Math.ceil(wallLength / RC_CHANNEL_PIECE_LENGTH_FT);
          }
        });
      }
      
      // Single place: base pieces, apply waste, then cost (always use pieces WITH waste for pricing/display)
      const rcChannelBasePieces = rcChannelCeilingPieces + rcChannelWallPieces;
      rcChannelPiecesWithWaste = Math.ceil(rcChannelBasePieces * (1 + wastePct / 100));
      rcChannelMaterialCost = rcChannelPiecesWithWaste * rcChannelRateNum;
      rcChannelLaborCostBase = rcChannelPiecesWithWaste * rcChannelLaborRateNum;
      const rcChannelLaborCostWithTax = rcChannelLaborCostBase * (1 + LABOR_TAX_RATE);
      rcChannelLaborCost = rcChannelLaborCostWithTax;
      rcChannelSalesTax = rcChannelMaterialCost * (taxRate / 100);
      rcChannelTotalMaterialCost = rcChannelMaterialCost + rcChannelSalesTax;
      rcChannelTotalDirectCost = rcChannelTotalMaterialCost + rcChannelLaborCost;
      
      // Add RC Channel costs to total (for combined quote)
      totalMaterialCost += rcChannelTotalMaterialCost;
      totalLaborCost += rcChannelLaborCost;
      salesTax += rcChannelSalesTax;
      totalDirectCost += rcChannelTotalDirectCost;
    }
    
    // Calculate overhead and profit for RC Channel separately
    let rcChannelOverhead = 0;
    let rcChannelSubtotalBeforeProfit = 0;
    let rcChannelProfit = 0;
    let rcChannelTotal = 0;
    
    if (includeRcChannel) {
      rcChannelOverhead = rcChannelTotalDirectCost * (overheadPct / 100);
      rcChannelSubtotalBeforeProfit = rcChannelTotalDirectCost + rcChannelOverhead;
      rcChannelProfit = rcChannelSubtotalBeforeProfit * (profitPct / 100);
      rcChannelTotal = rcChannelSubtotalBeforeProfit + rcChannelProfit;
    }
    
    // Metal Stud Framing (optional add-on): track $/lf, stud $/lf by size/gauge, labor $/lf
    let metalStudMaterialCost = 0;
    let metalStudLaborCostBase = 0;
    let metalStudLaborCost = 0;
    let metalStudSalesTax = 0;
    let metalStudTotalDirectCost = 0;
    let metalStudOverhead = 0;
    let metalStudSubtotalBeforeProfit = 0;
    let metalStudProfit = 0;
    let metalStudTotal = 0;
    
    // FRP (optional add-on): material + install labor with waste on material quantities
    let frpMaterialCost = 0;
    let frpSalesTax = 0;
    let frpLaborCost = 0;
    let frpLaborCostBase = 0;
    let frpTotalDirectCost = 0;
    let frpOverhead = 0;
    let frpSubtotalBeforeProfit = 0;
    let frpProfit = 0;
    let frpTotal = 0;
    
    if (includeFRP) {
      const sf = parseFloat(frpSqft) || 0;
      const walls = Math.max(0, parseFloat(frpWallCount) || 0);
      const wallH = parseFloat(frpWallHeight) || 0;
      const ic = parseFloat(frpInsideCorners) || 0;
      const oc = parseFloat(frpOutsideCorners) || 0;
      const jLf = parseFloat(frpExposedEdgesLf) || 0;
      const wastePct = parseFloat(frpWastePercentage) || 10;
      const mult = 1 + wastePct / 100;
      const sheetRate = parseFloat(frpSheetRate) || 0;
      const adhesiveRate = parseFloat(frpAdhesiveBucketRate) || 0;
      const divisionRate = parseFloat(frpDivisionStickRate) || 0;
      const icRate = parseFloat(frpIcStickRate) || 0;
      const ocRate = parseFloat(frpOcStickRate) || 0;
      const jMoldRate = parseFloat(frpJMoldStickRate) || 0;
      const sheets = sf > 0 ? sf / 32 : 0;
      const sheetsWithWaste = sheets * mult;
      const adhesiveBuckets = sheetsWithWaste > 0 ? Math.ceil(sheetsWithWaste / 10) : 0;
      const divisionBarLf = (sheets - walls) * wallH;
      const divisionSticksBase = divisionBarLf > 0 ? Math.ceil(divisionBarLf / 10) : 0;
      const divisionSticks = Math.ceil(divisionSticksBase * mult);
      const icSticksBase = (ic * wallH) > 0 ? Math.ceil((ic * wallH) / 10) : 0;
      const icSticks = Math.ceil(icSticksBase * mult);
      const ocSticksBase = (oc * wallH) > 0 ? Math.ceil((oc * wallH) / 10) : 0;
      const ocSticks = Math.ceil(ocSticksBase * mult);
      const jMoldSticksBase = jLf > 0 ? Math.ceil(jLf / 10) : 0;
      const jMoldSticks = Math.ceil(jMoldSticksBase * mult);
      frpMaterialCost = sheetsWithWaste * sheetRate + adhesiveBuckets * adhesiveRate + divisionSticks * divisionRate + icSticks * icRate + ocSticks * ocRate + jMoldSticks * jMoldRate;
      frpSalesTax = frpMaterialCost * (taxRate / 100);
      const frpLaborRateNum = parseFloat(frpLaborRate) || 0;
      frpLaborCostBase = sf > 0 && frpLaborRateNum > 0 ? sf * frpLaborRateNum : 0;
      frpLaborCost = frpLaborCostBase * (1 + LABOR_TAX_RATE);
      frpTotalDirectCost = frpMaterialCost + frpSalesTax + frpLaborCost;
      frpOverhead = frpTotalDirectCost * (overheadPct / 100);
      frpSubtotalBeforeProfit = frpTotalDirectCost + frpOverhead;
      frpProfit = frpSubtotalBeforeProfit * (profitPct / 100);
      frpTotal = frpSubtotalBeforeProfit + frpProfit;
      totalDirectCost += frpTotalDirectCost;
      totalLaborCost += frpLaborCost;
    }
    
    if (includeMetalStudFraming && metalStudEntries.length > 0) {
      const msWaste = parseFloat(metalStudWastePercentage) || 0;
      const laborRate = parseFloat(metalStudLaborRate) || 0;
      const getStudRate = (s, g) => parseFloat(metalStudStudRates[getStudRateKey(s, g)]) || 0;
      const getTrackRate = (s, g) => parseFloat(metalStudTrackRates[getStudRateKey(s, g)]) || 0;
      const mult = 1 + msWaste / 100;
      
      let totalStudLf = 0;
      let totalTrackLf = 0;
      let totalWallLfWithWaste = 0;
      let totalMaterialBeforeTax = 0;
      
      metalStudEntries.forEach((e) => {
        const lf = parseFloat(e.wallLf) || 0;
        const h = parseFloat(e.wallHeight) || 0;
        if (lf <= 0 || h <= 0) return;
        const sp = parseFloat(e.spacing) || 16;
        const tr = typeof e.tracksPerRun === 'number' ? e.tracksPerRun : (parseInt(e.tracksPerRun, 10) || 2);
        const sz = e.size || '3.625';
        const ga = e.gauge || '20';
        const studCount = Math.ceil(lf / (sp / 12));
        const studLf = studCount * h;
        const trackLf = lf * tr;
        const studLfW = studLf * mult;
        const trackLfW = trackLf * mult;
        totalStudLf += studLfW;
        totalTrackLf += trackLfW;
        totalWallLfWithWaste += lf * mult;
        const studRate = getStudRate(sz, ga);
        const trackRate = getTrackRate(sz, ga);
        totalMaterialBeforeTax += trackLfW * trackRate + studLfW * studRate;
      });
      
      if (totalStudLf > 0 || totalTrackLf > 0) {
        metalStudMaterialCost = totalMaterialBeforeTax;
        // Labor is per linear foot of wall (with waste), not per lf of metal
        metalStudLaborCostBase = totalWallLfWithWaste * laborRate;
        metalStudLaborCost = metalStudLaborCostBase * (1 + LABOR_TAX_RATE);
        metalStudSalesTax = metalStudMaterialCost * (taxRate / 100);
        metalStudTotalDirectCost = metalStudMaterialCost + metalStudSalesTax + metalStudLaborCost;
        metalStudOverhead = metalStudTotalDirectCost * (overheadPct / 100);
        metalStudSubtotalBeforeProfit = metalStudTotalDirectCost + metalStudOverhead;
        metalStudProfit = metalStudSubtotalBeforeProfit * (profitPct / 100);
        metalStudTotal = metalStudSubtotalBeforeProfit + metalStudProfit;
        
        totalMaterialCost += metalStudMaterialCost + metalStudSalesTax;
        totalLaborCost += metalStudLaborCost;
        salesTax += metalStudSalesTax;
        totalDirectCost += metalStudTotalDirectCost;
      }
    }
    
    // Insulation calculations (optional add-on)
    let insulationMaterialCost = 0;
    let insulationLaborCost = 0;
    let insulationLaborCostBase = 0;
    let insulationSalesTax = 0;
    let insulationTotalMaterialCost = 0;
    let insulationTotalDirectCost = 0;
    let insulationTotalSqft = 0;
    let insulationCeilingSqft = 0;
    let insulationWallSqft = 0;
    
    if (includeInsulation && insulationEntries.length > 0) {
      const wastePct = parseFloat(insulationWastePercentage) || 0;
      const ceilingLaborRateNum = parseFloat(insulationCeilingLaborRate) || 0;
      const wallLaborRateNum = parseFloat(insulationWallLaborRate) || 0;
      
      // Process each insulation entry
      insulationEntries.forEach(entry => {
        const entrySqft = parseFloat(entry.sqft) || 0;
        if (entrySqft > 0) {
          // Apply waste to sqft
          const entrySqftWithWaste = entrySqft * (1 + wastePct / 100);
          
          // Track sqft by location
          if (entry.location === 'Ceiling') {
            insulationCeilingSqft += entrySqftWithWaste;
          } else {
            insulationWallSqft += entrySqftWithWaste;
          }
          insulationTotalSqft += entrySqftWithWaste;
          
          // Get material rate (use override if provided, otherwise default)
          const materialRateNum = getInsulationMaterialRate(entry.type, entry.face || 'unfaced', entry.materialRate);
          
          // Calculate material cost
          const entryMaterialCost = entrySqftWithWaste * materialRateNum;
          insulationMaterialCost += entryMaterialCost;
          
          // Calculate labor cost based on location
          const laborRateNum = entry.location === 'Ceiling' ? ceilingLaborRateNum : wallLaborRateNum;
          const entryLaborCostBase = entrySqftWithWaste * laborRateNum;
          insulationLaborCostBase += entryLaborCostBase;
        }
      });
      
      // Apply tax to labor (25% estimated tax rate)
      insulationLaborCost = insulationLaborCostBase * (1 + LABOR_TAX_RATE);
      
      // Sales tax on materials only
      insulationSalesTax = insulationMaterialCost * (taxRate / 100);
      insulationTotalMaterialCost = insulationMaterialCost + insulationSalesTax;
      
      // Total direct cost for insulation
      insulationTotalDirectCost = insulationTotalMaterialCost + insulationLaborCost;
      
      // Add insulation costs to total (for combined quote)
      totalMaterialCost += insulationTotalMaterialCost;
      totalLaborCost += insulationLaborCost;
      salesTax += insulationSalesTax;
      totalDirectCost += insulationTotalDirectCost;
    }
    
    // Calculate overhead and profit for Insulation separately
    let insulationOverhead = 0;
    let insulationSubtotalBeforeProfit = 0;
    let insulationProfit = 0;
    let insulationTotal = 0;
    
    if (includeInsulation && insulationEntries.length > 0) {
      insulationOverhead = insulationTotalDirectCost * (overheadPct / 100);
      insulationSubtotalBeforeProfit = insulationTotalDirectCost + insulationOverhead;
      insulationProfit = insulationSubtotalBeforeProfit * (profitPct / 100);
      insulationTotal = insulationSubtotalBeforeProfit + insulationProfit;
    }
    
    // Acoustic Ceiling Tile and Grid calculations (optional add-on)
    let acousticCeilingSqft = 0;
    let acousticCeilingBaseSqft = 0;
    let acousticCeilingTileCost = 0;
    let acousticCeilingGridCost = 0;
    let acousticCeilingMaterialCost = 0;
    let acousticCeilingLaborCost = 0;
    let acousticCeilingLaborCostBase = 0;
    let acousticCeilingSalesTax = 0;
    let acousticCeilingTotalMaterialCost = 0;
    let acousticCeilingTotalDirectCost = 0;
    let acousticCeilingOverhead = 0;
    let acousticCeilingSubtotalBeforeProfit = 0;
    let acousticCeilingProfit = 0;
    let acousticCeilingTotal = 0;
    
    if (includeAcousticCeiling) {
      acousticCeilingBaseSqft = parseFloat(q.acousticCeilingSqft) || 0;
      if (acousticCeilingBaseSqft > 0) {
        const wastePct = parseFloat(acousticCeilingWastePercentage) || 0;
        acousticCeilingSqft = acousticCeilingBaseSqft * (1 + wastePct / 100);
        const tileRateNum = parseFloat(acousticCeilingTileRate) || 0;
        const laborRateNum = parseFloat(acousticCeilingLaborRate) || 0;
        
        // Tile cost: sqft × $/sqft
        acousticCeilingTileCost = acousticCeilingSqft * tileRateNum;
        
        // Grid component costs (Wall Angle, Mains, 4' tees, 2' tees, Wire, Lags)
        const wallAngleCost = (parseFloat(acousticWallAngleCount) || 0) * (parseFloat(acousticWallAngleRate) || 0);
        const mainsCost = (parseFloat(acousticMainsCount) || 0) * (parseFloat(acousticMainsRate) || 0);
        const tees4ftCost = (parseFloat(acousticTees4ftCount) || 0) * (parseFloat(acousticTees4ftRate) || 0);
        const tees2ftCost = (parseFloat(acousticTees2ftCount) || 0) * (parseFloat(acousticTees2ftRate) || 0);
        const wireCost = (parseFloat(acousticWireLinearFt) || 0) * (parseFloat(acousticWireRate) || 0);
        const lagsCost = (parseFloat(acousticLagsCount) || 0) * (parseFloat(acousticLagsRate) || 0);
        acousticCeilingGridCost = wallAngleCost + mainsCost + tees4ftCost + tees2ftCost + wireCost + lagsCost;
        
        acousticCeilingMaterialCost = acousticCeilingTileCost + acousticCeilingGridCost;
        acousticCeilingLaborCostBase = acousticCeilingSqft * laborRateNum;
        acousticCeilingLaborCost = acousticCeilingLaborCostBase * (1 + LABOR_TAX_RATE);
        acousticCeilingSalesTax = acousticCeilingMaterialCost * (taxRate / 100);
        acousticCeilingTotalMaterialCost = acousticCeilingMaterialCost + acousticCeilingSalesTax;
        acousticCeilingTotalDirectCost = acousticCeilingTotalMaterialCost + acousticCeilingLaborCost;
        
        totalMaterialCost += acousticCeilingTotalMaterialCost;
        totalLaborCost += acousticCeilingLaborCost;
        salesTax += acousticCeilingSalesTax;
        totalDirectCost += acousticCeilingTotalDirectCost;
      }
    }
    
    if (includeAcousticCeiling && acousticCeilingBaseSqft > 0) {
      acousticCeilingOverhead = acousticCeilingTotalDirectCost * (overheadPct / 100);
      acousticCeilingSubtotalBeforeProfit = acousticCeilingTotalDirectCost + acousticCeilingOverhead;
      acousticCeilingProfit = acousticCeilingSubtotalBeforeProfit * (profitPct / 100);
      acousticCeilingTotal = acousticCeilingSubtotalBeforeProfit + acousticCeilingProfit;
    }
    
    // Overhead (combined)
    const overheadAmount = totalDirectCost * (overheadPct / 100);
    const subtotalBeforeProfit = totalDirectCost + overheadAmount;
    
    // Profit (combined)
    const profitAmount = subtotalBeforeProfit * (profitPct / 100);
    const subtotalAfterProfit = subtotalBeforeProfit + profitAmount;
    
    // Calculate breakdown totals if breakdowns exist
    let breakdownTotal = 0;
    if (breakdowns.length > 0) {
      breakdownTotal = breakdowns.reduce((sum, item) => {
        const itemBaseSqft = parseFloat(item.sqft) || 0;
        // Apply waste percentage to breakdown item sqft
        const itemSqft = itemBaseSqft * (1 + wastePct / 100);

        const itemHangLayersNum = Math.max(
          0,
          item.hangLayers != null ? (parseFloat(item.hangLayers) || 0) : hangLayersNum
        );
        const itemFinishLayersNum = Math.max(
          0,
          item.finishLayers != null ? (parseFloat(item.finishLayers) || 0) : finishLayersNum
        );
        const itemHangSqft =
          item.hangSqftOverride != null && item.hangSqftOverride !== ''
            ? (parseFloat(item.hangSqftOverride) || 0)
            : itemSqft * itemHangLayersNum;
        const itemFinishSqft =
          item.finishSqftOverride != null && item.finishSqftOverride !== ''
            ? (parseFloat(item.finishSqftOverride) || 0)
            : itemSqft * itemFinishLayersNum;
        const itemExtraBoardSqft = Math.max(0, itemHangSqft - itemFinishSqft);
        
        let itemMaterialCost = 0;
        let itemLaborCost = 0;
        let itemSalesTax = 0;
        
        // Breakdowns are for standard drywall only
        const materialRateNum = parseFloat(materialRate) || 0;
        const boardOnlyMaterialRateNum =
          item.boardOnlyMaterialRate != null && item.boardOnlyMaterialRate !== ''
            ? (parseFloat(item.boardOnlyMaterialRate) || 0)
            : (parseFloat(boardOnlyMaterialRate) || 0);
        const hangerRateNum = parseFloat(hangerRate) || 0;
        const finisherRateNum = parseFloat(finisherRate) || 0;
        const prepCleanRateNum = parseFloat(prepCleanRate) || 0;
        
        itemMaterialCost = itemFinishSqft * materialRateNum + itemExtraBoardSqft * boardOnlyMaterialRateNum;
        const itemHangerBase =
          drywallScope !== 'finish_only' ? itemHangSqft * hangerRateNum : 0;
        const itemFinisherBase =
          drywallScope !== 'hang_only' ? itemFinishSqft * finisherRateNum : 0;
        const itemPrepCleanBase = itemFinishSqft * prepCleanRateNum;
        itemLaborCost =
          applyLaborBurden(itemHangerBase, q.hangerIncludeLaborBurden) +
          applyLaborBurden(itemFinisherBase, q.finisherIncludeLaborBurden) +
          applyLaborBurden(itemPrepCleanBase, q.prepCleanIncludeLaborBurden);
        itemSalesTax = itemMaterialCost * (taxRate / 100);
        
        const itemDirectCost = itemMaterialCost + itemSalesTax + itemLaborCost;
        const itemOverhead = itemDirectCost * (overheadPct / 100);
        const itemSubtotal = itemDirectCost + itemOverhead;
        const itemProfit = itemSubtotal * (profitPct / 100);
        return sum + itemSubtotal + itemProfit;
      }, 0);
    }

    // Calculate selected options total
    const selectedOptionsTotal = options
      .filter(opt => opt.selected)
      .reduce((sum, opt) => {
        // If option has sqft and rate, calculate: sqft × rate
        const optionSqft = opt.useTotalSqft ? sqftNum : (parseFloat(opt.sqft) || 0);
        const optionRate = parseFloat(opt.rate) || 0;
        
        if (optionSqft > 0 && optionRate > 0) {
          // Calculate based on sqft × rate
          return sum + (optionSqft * optionRate);
        } else {
          // Use manual price entry
          return sum + (parseFloat(opt.price) || 0);
        }
      }, 0);

    // Final total - use breakdown total if breakdowns exist, otherwise use calculated total
    // For RC Channel, if breakdowns with RC Channel data exist, use breakdown total; otherwise use calculated RC Channel total
    const breakdownsWithRcChannel = breakdowns.filter(b => 
      (b.rcChannelCeilingSqft && parseFloat(b.rcChannelCeilingSqft) > 0) || 
      (b.rcChannelWallLinearFt && parseFloat(b.rcChannelWallLinearFt) > 0)
    );
    
    let rcChannelFinalTotal = 0;
    if (includeRcChannel) {
      if (breakdownsWithRcChannel.length > 0) {
        rcChannelFinalTotal = rcChannelBreakdownTotal;
      } else {
        rcChannelFinalTotal = rcChannelTotal;
      }
    }
    
    // Calculate subtotal and profit correctly based on whether breakdowns exist
    let actualSubtotalBeforeProfit = 0;
    let actualProfitAmount = 0;
    let actualSubtotalAfterProfit = 0;
    
    if (breakdowns.length > 0) {
      // When breakdowns exist, calculate subtotal and profit from component totals
      // Breakdown total already includes drywall with overhead and profit
      let breakdownSubtotalBeforeProfit = 0;
      let breakdownProfit = 0;
      
      breakdownSubtotalBeforeProfit = breakdowns.reduce((sum, item) => {
        const itemBaseSqft = parseFloat(item.sqft) || 0;
        const itemSqft = itemBaseSqft * (1 + wastePct / 100);
        const materialRateNum = parseFloat(materialRate) || 0;
        const boardOnlyMaterialRateNum =
          item.boardOnlyMaterialRate != null && item.boardOnlyMaterialRate !== ''
            ? (parseFloat(item.boardOnlyMaterialRate) || 0)
            : (parseFloat(boardOnlyMaterialRate) || 0);
        const hangerRateNum = parseFloat(hangerRate) || 0;
        const finisherRateNum = parseFloat(finisherRate) || 0;
        const prepCleanRateNum = parseFloat(prepCleanRate) || 0;

        const itemHangLayersNum = Math.max(
          0,
          item.hangLayers != null ? (parseFloat(item.hangLayers) || 0) : hangLayersNum
        );
        const itemFinishLayersNum = Math.max(
          0,
          item.finishLayers != null ? (parseFloat(item.finishLayers) || 0) : finishLayersNum
        );
        const itemHangSqft =
          item.hangSqftOverride != null && item.hangSqftOverride !== ''
            ? (parseFloat(item.hangSqftOverride) || 0)
            : itemSqft * itemHangLayersNum;
        const itemFinishSqft =
          item.finishSqftOverride != null && item.finishSqftOverride !== ''
            ? (parseFloat(item.finishSqftOverride) || 0)
            : itemSqft * itemFinishLayersNum;
        const itemExtraBoardSqft = Math.max(0, itemHangSqft - itemFinishSqft);

        const itemMaterialCost = itemFinishSqft * materialRateNum + itemExtraBoardSqft * boardOnlyMaterialRateNum;
        const itemHangerBase =
          drywallScope !== 'finish_only' ? itemHangSqft * hangerRateNum : 0;
        const itemFinisherBase =
          drywallScope !== 'hang_only' ? itemFinishSqft * finisherRateNum : 0;
        const itemPrepCleanBase = itemFinishSqft * prepCleanRateNum;
        const itemLaborCost =
          applyLaborBurden(itemHangerBase, q.hangerIncludeLaborBurden) +
          applyLaborBurden(itemFinisherBase, q.finisherIncludeLaborBurden) +
          applyLaborBurden(itemPrepCleanBase, q.prepCleanIncludeLaborBurden);
        const itemSalesTax = itemMaterialCost * (taxRate / 100);
        const itemDirectCost = itemMaterialCost + itemSalesTax + itemLaborCost;
        const itemOverhead = itemDirectCost * (overheadPct / 100);
        return sum + itemDirectCost + itemOverhead;
      }, 0);
      
      breakdownProfit = breakdowns.reduce((sum, item) => {
        const itemBaseSqft = parseFloat(item.sqft) || 0;
        const itemSqft = itemBaseSqft * (1 + wastePct / 100);
        const materialRateNum = parseFloat(materialRate) || 0;
        const boardOnlyMaterialRateNum =
          item.boardOnlyMaterialRate != null && item.boardOnlyMaterialRate !== ''
            ? (parseFloat(item.boardOnlyMaterialRate) || 0)
            : (parseFloat(boardOnlyMaterialRate) || 0);
        const hangerRateNum = parseFloat(hangerRate) || 0;
        const finisherRateNum = parseFloat(finisherRate) || 0;
        const prepCleanRateNum = parseFloat(prepCleanRate) || 0;

        const itemHangLayersNum = Math.max(
          0,
          item.hangLayers != null ? (parseFloat(item.hangLayers) || 0) : hangLayersNum
        );
        const itemFinishLayersNum = Math.max(
          0,
          item.finishLayers != null ? (parseFloat(item.finishLayers) || 0) : finishLayersNum
        );
        const itemHangSqft =
          item.hangSqftOverride != null && item.hangSqftOverride !== ''
            ? (parseFloat(item.hangSqftOverride) || 0)
            : itemSqft * itemHangLayersNum;
        const itemFinishSqft =
          item.finishSqftOverride != null && item.finishSqftOverride !== ''
            ? (parseFloat(item.finishSqftOverride) || 0)
            : itemSqft * itemFinishLayersNum;
        const itemExtraBoardSqft = Math.max(0, itemHangSqft - itemFinishSqft);

        const itemMaterialCost = itemFinishSqft * materialRateNum + itemExtraBoardSqft * boardOnlyMaterialRateNum;
        const itemHangerBase =
          drywallScope !== 'finish_only' ? itemHangSqft * hangerRateNum : 0;
        const itemFinisherBase =
          drywallScope !== 'hang_only' ? itemFinishSqft * finisherRateNum : 0;
        const itemPrepCleanBase = itemFinishSqft * prepCleanRateNum;
        const itemLaborCost =
          applyLaborBurden(itemHangerBase, q.hangerIncludeLaborBurden) +
          applyLaborBurden(itemFinisherBase, q.finisherIncludeLaborBurden) +
          applyLaborBurden(itemPrepCleanBase, q.prepCleanIncludeLaborBurden);
        const itemSalesTax = itemMaterialCost * (taxRate / 100);
        const itemDirectCost = itemMaterialCost + itemSalesTax + itemLaborCost;
        const itemOverhead = itemDirectCost * (overheadPct / 100);
        const itemSubtotal = itemDirectCost + itemOverhead;
        const itemProfit = itemSubtotal * (profitPct / 100);
        return sum + itemProfit;
      }, 0);
      
      // Add suspended grid subtotal and profit
      if (includeSuspendedGrid) {
        breakdownSubtotalBeforeProfit += suspendedGridSubtotalBeforeProfit;
        breakdownProfit += suspendedGridProfit;
      }
      
      // Add Acoustic Ceiling Tile and Grid subtotal and profit
      if (includeAcousticCeiling && acousticCeilingBaseSqft > 0) {
        breakdownSubtotalBeforeProfit += acousticCeilingSubtotalBeforeProfit;
        breakdownProfit += acousticCeilingProfit;
      }
      
      // Add Metal Stud Framing subtotal and profit
      if (includeMetalStudFraming && metalStudTotal > 0) {
        breakdownSubtotalBeforeProfit += metalStudSubtotalBeforeProfit;
        breakdownProfit += metalStudProfit;
      }

      // Add FRP subtotal and profit
      if (includeFRP && frpTotal > 0) {
        breakdownSubtotalBeforeProfit += frpSubtotalBeforeProfit;
        breakdownProfit += frpProfit;
      }
      
      // Add RC Channel subtotal and profit
      if (includeRcChannel) {
        // Define RC Channel variables needed for calculations
        const rcChannelWastePct = parseFloat(rcChannelWastePercentage) || 0;
        const rcChannelRateNum = parseFloat(rcChannelRate) || 0;
        const rcChannelLaborRateNum = parseFloat(rcChannelLaborRate) || 0;
        
        if (breakdownsWithRcChannel.length > 0) {
          // Calculate subtotal and profit from RC Channel breakdown items
          const rcChannelBreakdownSubtotal = breakdownsWithRcChannel.reduce((sum, item) => {
            // Calculate item direct cost, overhead, and subtotal (but not profit yet)
            const itemCeilingSqft = parseFloat(item.rcChannelCeilingSqft) || 0;
            const ceilingSpacing = parseFloat(rcChannelCeilingSpacing) || 24;
            let itemCeilingLinearFt = 0;
            let itemCeilingPieces = 0;
            
            if (itemCeilingSqft > 0 && ceilingSpacing > 0) {
              const spacingInFeet = ceilingSpacing / 12;
              itemCeilingLinearFt = itemCeilingSqft / spacingInFeet;
              itemCeilingPieces = Math.ceil(itemCeilingLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
            }
            
            const itemWallLength = parseFloat(item.rcChannelWallLinearFt) || 0;
            const itemWallHeight = parseFloat(item.rcChannelWallHeight) || 0;
            const wallSpacing = parseFloat(rcChannelWallSpacing) || 24;
            let itemWallLinearFt = 0;
            let itemWallPieces = 0;
            
            if (itemWallLength > 0 && itemWallHeight > 0 && wallSpacing > 0) {
              const spacingInFeet = wallSpacing / 12;
              const numberOfRows = Math.ceil(itemWallHeight / spacingInFeet);
              itemWallLinearFt = numberOfRows * itemWallLength;
              itemWallPieces = Math.ceil(itemWallLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
            } else if (itemWallLength > 0) {
              itemWallLinearFt = itemWallLength;
              itemWallPieces = Math.ceil(itemWallLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
            }
            
            const itemTotalPieces = itemCeilingPieces + itemWallPieces;
            const itemPiecesWithWaste = Math.ceil(itemTotalPieces * (1 + rcChannelWastePct / 100));
            
            const itemMaterialCost = itemPiecesWithWaste * rcChannelRateNum;
            const itemLaborCostBase = itemPiecesWithWaste * rcChannelLaborRateNum;
            const itemLaborCostWithTax = itemLaborCostBase * (1 + LABOR_TAX_RATE);
            const itemSalesTax = itemMaterialCost * (taxRate / 100);
            const itemTotalMaterialCost = itemMaterialCost + itemSalesTax;
            const itemDirectCost = itemTotalMaterialCost + itemLaborCostWithTax;
            const itemOverhead = itemDirectCost * (overheadPct / 100);
            const itemSubtotal = itemDirectCost + itemOverhead;
            return sum + itemSubtotal;
          }, 0);
          
          const rcChannelBreakdownProfit = breakdownsWithRcChannel.reduce((sum, item) => {
            const itemCeilingSqft = parseFloat(item.rcChannelCeilingSqft) || 0;
            const ceilingSpacing = parseFloat(rcChannelCeilingSpacing) || 24;
            let itemCeilingLinearFt = 0;
            let itemCeilingPieces = 0;
            
            if (itemCeilingSqft > 0 && ceilingSpacing > 0) {
              const spacingInFeet = ceilingSpacing / 12;
              itemCeilingLinearFt = itemCeilingSqft / spacingInFeet;
              itemCeilingPieces = Math.ceil(itemCeilingLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
            }
            
            const itemWallLength = parseFloat(item.rcChannelWallLinearFt) || 0;
            const itemWallHeight = parseFloat(item.rcChannelWallHeight) || 0;
            const wallSpacing = parseFloat(rcChannelWallSpacing) || 24;
            let itemWallLinearFt = 0;
            let itemWallPieces = 0;
            
            if (itemWallLength > 0 && itemWallHeight > 0 && wallSpacing > 0) {
              const spacingInFeet = wallSpacing / 12;
              const numberOfRows = Math.ceil(itemWallHeight / spacingInFeet);
              itemWallLinearFt = numberOfRows * itemWallLength;
              itemWallPieces = Math.ceil(itemWallLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
            } else if (itemWallLength > 0) {
              itemWallLinearFt = itemWallLength;
              itemWallPieces = Math.ceil(itemWallLinearFt / RC_CHANNEL_PIECE_LENGTH_FT);
            }
            
            const itemTotalPieces = itemCeilingPieces + itemWallPieces;
            const itemPiecesWithWaste = Math.ceil(itemTotalPieces * (1 + rcChannelWastePct / 100));
            
            const itemMaterialCost = itemPiecesWithWaste * rcChannelRateNum;
            const itemLaborCostBase = itemPiecesWithWaste * rcChannelLaborRateNum;
            const itemLaborCostWithTax = itemLaborCostBase * (1 + LABOR_TAX_RATE);
            const itemSalesTax = itemMaterialCost * (taxRate / 100);
            const itemTotalMaterialCost = itemMaterialCost + itemSalesTax;
            const itemDirectCost = itemTotalMaterialCost + itemLaborCostWithTax;
            const itemOverhead = itemDirectCost * (overheadPct / 100);
            const itemSubtotal = itemDirectCost + itemOverhead;
            const itemProfit = itemSubtotal * (profitPct / 100);
            return sum + itemProfit;
          }, 0);
          
          breakdownSubtotalBeforeProfit += rcChannelBreakdownSubtotal;
          breakdownProfit += rcChannelBreakdownProfit;
        } else {
          breakdownSubtotalBeforeProfit += rcChannelSubtotalBeforeProfit;
          breakdownProfit += rcChannelProfit;
        }
      }
      
      actualSubtotalBeforeProfit = breakdownSubtotalBeforeProfit;
      actualProfitAmount = breakdownProfit;
      actualSubtotalAfterProfit = actualSubtotalBeforeProfit + actualProfitAmount;
    } else {
      // When no breakdowns, use the combined calculation
      actualSubtotalBeforeProfit = subtotalBeforeProfit;
      actualProfitAmount = profitAmount;
      actualSubtotalAfterProfit = subtotalAfterProfit;
    }
    
    // Final total calculation: Subtotal + Profit + Options
    const calculatedTotal = actualSubtotalAfterProfit + selectedOptionsTotal;
    const finalTotal = totalQuoteAmountNum > 0 ? totalQuoteAmountNum : calculatedTotal;
    
    // Actual profit if total is overridden
    const actualProfit = finalTotal - calculatedTotal;
    const actualProfitPercentage = calculatedTotal > 0 ? (actualProfit / calculatedTotal) * 100 : 0;
    const totalCost = calculatedTotal;
    const profitMargin = totalCost > 0 ? (actualProfit / totalCost) * 100 : 0;

    return {
      includeSuspendedGrid,
      baseSqft: baseSqft,
      wastePercentage: wastePct,
      sqft: sqftNum, // Total sqft including waste (standard drywall)
      hangSqft,
      finishSqft,
      extraBoardSqft,
      materialCost,
      hangerCost,
      finisherCost,
      prepCleanCost,
      salesTax,
      totalLaborCost,
      totalMaterialCost,
      totalDirectCost,
      overheadAmount,
      subtotalBeforeProfit: actualSubtotalBeforeProfit,
      profitAmount: actualProfitAmount,
      subtotalAfterProfit: actualSubtotalAfterProfit,
      calculatedTotal,
      finalTotal,
      actualProfit,
      actualProfitPercentage,
      totalCost,
      profitMargin,
      breakdownTotal,
      selectedOptionsTotal,
      // Standard Drywall totals (for separate display)
      standardDrywallMaterialCost: standardDrywallMaterialCost,
      standardDrywallLaborCost: standardDrywallLaborCost,
      standardDrywallSalesTax: standardDrywallSalesTax,
      standardDrywallDirectCost: standardDrywallDirectCost,
      standardDrywallOverhead: standardDrywallOverhead,
      standardDrywallProfit: standardDrywallProfit,
      standardDrywallTotal: standardDrywallTotal,
      // Suspended grid specific (only if included)
      suspendedGridBaseSqft: suspendedGridBaseSqft,
      suspendedGridSqft: suspendedGridSqft,
      suspendedGridPerimeter: suspendedGridPerimeter,
      suspendedGridMaterialCost: suspendedGridMaterialCost,
      suspendedGridLaborCost: suspendedGridLaborCost,
      suspendedGridSalesTax: suspendedGridSalesTax,
      suspendedGridTotalMaterialCost: suspendedGridTotalMaterialCost,
      suspendedGridTotalDirectCost: suspendedGridTotalDirectCost,
      suspendedGridOverhead: suspendedGridOverhead,
      suspendedGridProfit: suspendedGridProfit,
      suspendedGridTotal: suspendedGridTotal,
      // RC Channel specific (only if included)
      includeRcChannel,
      rcChannelBasePieces: rcChannelCeilingPieces + rcChannelWallPieces,
      rcChannelPieces: rcChannelPiecesWithWaste,
      rcChannelCeilingPieces: rcChannelCeilingPieces,
      rcChannelWallPieces: rcChannelWallPieces,
      rcChannelCeilingLinearFt: rcChannelCeilingLinearFt,
      rcChannelWallLinearFt: rcChannelWallLinearFtAgg,
      rcChannelLinearFt: includeRcChannel ? (rcChannelPiecesWithWaste * 12) : 0, // For display only
      rcChannelMaterialCost: rcChannelMaterialCost,
      rcChannelLaborCost: rcChannelLaborCost,
      rcChannelLaborCostBase: rcChannelLaborCostBase,
      rcChannelBreakdownTotal: rcChannelBreakdownTotal,
      rcChannelSalesTax: rcChannelSalesTax,
      rcChannelTotalMaterialCost: rcChannelTotalMaterialCost,
      rcChannelTotalDirectCost: rcChannelTotalDirectCost,
      rcChannelOverhead: rcChannelOverhead,
      rcChannelProfit: rcChannelProfit,
      rcChannelTotal: rcChannelTotal,
      // Insulation specific (only if included)
      includeInsulation,
      insulationTotalSqft: insulationTotalSqft,
      insulationCeilingSqft: insulationCeilingSqft,
      insulationWallSqft: insulationWallSqft,
      insulationMaterialCost: insulationMaterialCost,
      insulationLaborCost: insulationLaborCost,
      insulationLaborCostBase: insulationLaborCostBase,
      insulationSalesTax: insulationSalesTax,
      insulationTotalMaterialCost: insulationTotalMaterialCost,
      insulationTotalDirectCost: insulationTotalDirectCost,
      insulationOverhead: insulationOverhead,
      insulationProfit: insulationProfit,
      insulationTotal: insulationTotal,
      // Acoustic Ceiling Tile and Grid specific (only if included)
      includeAcousticCeiling,
      acousticCeilingBaseSqft,
      acousticCeilingSqft,
      acousticCeilingTileCost,
      acousticCeilingGridCost,
      acousticCeilingMaterialCost,
      acousticCeilingLaborCost,
      acousticCeilingLaborCostBase,
      acousticCeilingSalesTax,
      acousticCeilingTotalMaterialCost,
      acousticCeilingTotalDirectCost,
      acousticCeilingOverhead,
      acousticCeilingProfit,
      acousticCeilingTotal,
      // Metal Stud Framing (optional add-on)
      includeMetalStudFraming,
      metalStudTotalDirectCost,
      metalStudTotal,
      metalStudProfit,
      metalStudMaterialCost,
      metalStudLaborCostBase,
      metalStudLaborCost,
      metalStudLaborTax: metalStudLaborCost - metalStudLaborCostBase,
      metalStudSalesTax,
      // FRP (optional add-on)
      includeFRP,
      frpMaterialCost,
      frpSalesTax,
      frpLaborCostBase,
      frpLaborCost,
      frpLaborTax: frpLaborCost - frpLaborCostBase,
      frpTotalDirectCost,
      frpOverhead,
      frpSubtotalBeforeProfit,
      frpProfit,
      frpTotal,
      // Labor breakdown (for reference)
      hangerCostWithTax: hangerCostWithTax,
      finisherCostWithTax: finisherCostWithTax,
      prepCleanCostWithTax: prepCleanCostWithTax,
      carpenterCost: includeSuspendedGrid ? (suspendedGridSqft * (parseFloat(carpenterRate) || 0)) : 0,
      shiny90Cost: includeSuspendedGrid ? ((parseFloat(shiny90Count) || 0) * (parseFloat(shiny90Rate) || 0)) : 0,
      mainsCost: includeSuspendedGrid ? ((parseFloat(mainsCount) || 0) * (parseFloat(mainsRate) || 0)) : 0,
      tees4ftCost: includeSuspendedGrid ? ((parseFloat(tees4ftCount) || 0) * (parseFloat(tees4ftRate) || 0)) : 0,
      wireCost: includeSuspendedGrid ? ((parseFloat(wireLinearFt) || 0) * (parseFloat(wireRate) || 0)) : 0,
      lagsCost: includeSuspendedGrid ? ((parseFloat(lagsCount) || 0) * (parseFloat(lagsRate) || 0)) : 0,
    };
}
