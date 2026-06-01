// @ts-nocheck
/**
 * Quote schema adapter for phased rollout to unified line-item model (v2).
 *
 * Phase strategy:
 * - New quotes can adopt v2 progressively.
 * - Legacy quotes remain readable.
 * - Current calculators can continue using legacy-compatible shape.
 */

const COMPONENT_TYPES = {
  DRYWALL: 'drywall',
  RC_CHANNEL: 'rc_channel',
  SUSPENDED_GRID: 'suspended_grid',
  METAL_STUD: 'metal_stud',
  INSULATION: 'insulation',
  ACOUSTIC: 'acoustic_ceiling',
  FRP: 'frp',
};

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function toBool(v) {
  return Boolean(v);
}

function normalizeBreakdownFromLegacy(item) {
  const b = item && typeof item === 'object' ? item : {};
  return {
    id: b.id || null,
    description: b.description || '',
    components: [
      {
        type: COMPONENT_TYPES.DRYWALL,
        enabled: true,
        inputs: {
          sqft: b.sqft ?? '',
          hangLayers: b.hangLayers ?? null,
          finishLayers: b.finishLayers ?? null,
          hangSqftOverride: b.hangSqftOverride ?? null,
          finishSqftOverride: b.finishSqftOverride ?? null,
          boardOnlyMaterialRate: b.boardOnlyMaterialRate ?? null,
        },
      },
      {
        type: COMPONENT_TYPES.RC_CHANNEL,
        enabled:
          (parseFloat(b.rcChannelCeilingSqft) || 0) > 0 ||
          (parseFloat(b.rcChannelWallLinearFt) || 0) > 0 ||
          safeArray(b.rcChannelWallEntries).length > 0,
        inputs: {
          ceilingSqft: b.rcChannelCeilingSqft ?? '',
          wallLinearFt: b.rcChannelWallLinearFt ?? '',
          wallHeight: b.rcChannelWallHeight ?? '',
          wallEntries: safeArray(b.rcChannelWallEntries),
        },
      },
    ],
    legacy: b,
  };
}

/**
 * Normalize any quote payload to canonical v2 shape.
 */
export function normalizeQuoteToV2(quoteData) {
  const q = quoteData && typeof quoteData === 'object' ? quoteData : {};
  if (q.version === 2 && Array.isArray(q.breakdowns)) {
    return q;
  }
  return {
    version: 2,
    pricing: {
      overheadPercentage: q.overheadPercentage ?? 0,
      profitPercentage: q.profitPercentage ?? 0,
      salesTaxRate: q.salesTaxRate ?? 0,
      quoteIncludes: q.quoteIncludes ?? 'labor_and_material',
      drywallScope: q.drywallScope ?? 'hang_and_finish',
      wastePercentage: q.wastePercentage ?? 0,
    },
    defaults: {
      drywall: {
        materialRate: q.materialRate ?? 0,
        hangerRate: q.hangerRate ?? 0,
        finisherRate: q.finisherRate ?? 0,
        prepCleanRate: q.prepCleanRate ?? 0,
        hangLayers: q.hangLayers ?? 1,
        finishLayers: q.finishLayers ?? 1,
        hangSqftOverride: q.hangSqftOverride ?? null,
        finishSqftOverride: q.finishSqftOverride ?? null,
        boardOnlyMaterialRate: q.boardOnlyMaterialRate ?? q.materialRate ?? 0,
      },
      rcChannel: {
        enabled: toBool(q.includeRcChannel),
        rate: q.rcChannelRate ?? 0,
        laborRate: q.rcChannelLaborRate ?? 0,
        wastePercentage: q.rcChannelWastePercentage ?? 0,
        ceilingSpacing: q.rcChannelCeilingSpacing ?? '24',
        wallSpacing: q.rcChannelWallSpacing ?? '24',
      },
      suspendedGrid: {
        enabled: toBool(q.includeSuspendedGrid),
      },
      metalStud: {
        enabled: toBool(q.includeMetalStudFraming),
      },
      insulation: {
        enabled: toBool(q.includeInsulation),
      },
      acousticCeiling: {
        enabled: toBool(q.includeAcousticCeiling),
      },
      frp: {
        enabled: toBool(q.includeFRP),
      },
    },
    breakdowns: safeArray(q.breakdowns).map(normalizeBreakdownFromLegacy),
    options: safeArray(q.options),
    legacy: q,
  };
}

/**
 * Convert canonical v2 quote back to a legacy-compatible object for existing
 * calculators/renderers during phased rollout.
 */
export function quoteV2ToLegacyCompat(quoteV2) {
  const v2 = quoteV2 && typeof quoteV2 === 'object' ? quoteV2 : {};
  if (v2.version !== 2) return v2;
  const legacy = v2.legacy && typeof v2.legacy === 'object' ? { ...v2.legacy } : {};
  const pricing = v2.pricing || {};
  const defaults = v2.defaults || {};
  const drywall = defaults.drywall || {};
  const rc = defaults.rcChannel || {};
  const breakdowns = safeArray(v2.breakdowns).map((b) => {
    const comp = safeArray(b.components);
    const drywallComp = comp.find((c) => c?.type === COMPONENT_TYPES.DRYWALL)?.inputs || {};
    const rcComp = comp.find((c) => c?.type === COMPONENT_TYPES.RC_CHANNEL)?.inputs || {};
    const legacyBreakdown = b.legacy && typeof b.legacy === 'object' ? { ...b.legacy } : {};
    return {
      ...legacyBreakdown,
      id: b.id || legacyBreakdown.id,
      description: b.description ?? legacyBreakdown.description ?? '',
      sqft: drywallComp.sqft ?? legacyBreakdown.sqft ?? '',
      hangLayers: drywallComp.hangLayers ?? legacyBreakdown.hangLayers,
      finishLayers: drywallComp.finishLayers ?? legacyBreakdown.finishLayers,
      hangSqftOverride: drywallComp.hangSqftOverride ?? legacyBreakdown.hangSqftOverride,
      finishSqftOverride: drywallComp.finishSqftOverride ?? legacyBreakdown.finishSqftOverride,
      boardOnlyMaterialRate: drywallComp.boardOnlyMaterialRate ?? legacyBreakdown.boardOnlyMaterialRate,
      rcChannelCeilingSqft: rcComp.ceilingSqft ?? legacyBreakdown.rcChannelCeilingSqft ?? '',
      rcChannelWallLinearFt: rcComp.wallLinearFt ?? legacyBreakdown.rcChannelWallLinearFt ?? '',
      rcChannelWallHeight: rcComp.wallHeight ?? legacyBreakdown.rcChannelWallHeight ?? '',
      rcChannelWallEntries: safeArray(rcComp.wallEntries).length > 0 ? rcComp.wallEntries : safeArray(legacyBreakdown.rcChannelWallEntries),
    };
  });

  return {
    ...legacy,
    overheadPercentage: pricing.overheadPercentage ?? legacy.overheadPercentage,
    profitPercentage: pricing.profitPercentage ?? legacy.profitPercentage,
    salesTaxRate: pricing.salesTaxRate ?? legacy.salesTaxRate,
    quoteIncludes: pricing.quoteIncludes ?? legacy.quoteIncludes,
    drywallScope: pricing.drywallScope ?? legacy.drywallScope,
    wastePercentage: pricing.wastePercentage ?? legacy.wastePercentage,
    materialRate: drywall.materialRate ?? legacy.materialRate,
    hangerRate: drywall.hangerRate ?? legacy.hangerRate,
    finisherRate: drywall.finisherRate ?? legacy.finisherRate,
    prepCleanRate: drywall.prepCleanRate ?? legacy.prepCleanRate,
    hangLayers: drywall.hangLayers ?? legacy.hangLayers,
    finishLayers: drywall.finishLayers ?? legacy.finishLayers,
    hangSqftOverride: drywall.hangSqftOverride ?? legacy.hangSqftOverride,
    finishSqftOverride: drywall.finishSqftOverride ?? legacy.finishSqftOverride,
    boardOnlyMaterialRate: drywall.boardOnlyMaterialRate ?? legacy.boardOnlyMaterialRate,
    includeRcChannel: defaults.rcChannel?.enabled ?? legacy.includeRcChannel,
    rcChannelRate: rc.rate ?? legacy.rcChannelRate,
    rcChannelLaborRate: rc.laborRate ?? legacy.rcChannelLaborRate,
    rcChannelWastePercentage: rc.wastePercentage ?? legacy.rcChannelWastePercentage,
    rcChannelCeilingSpacing: rc.ceilingSpacing ?? legacy.rcChannelCeilingSpacing,
    rcChannelWallSpacing: rc.wallSpacing ?? legacy.rcChannelWallSpacing,
    breakdowns,
    options: safeArray(v2.options),
  };
}

