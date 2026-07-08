import { DRYWALL_QUOTE_BASE_DEFAULTS } from './drywallQuoteDefaults'
import { buildV3FromV2, v2QuoteFromV3Snapshot, V3_LINE_MIGRATION_OVERRIDE_REASON } from './convertQuoteV2ToV3'
import type { DrywallQuotePdfSettings, DrywallQuoteV3, QuoteAlternate, QuoteLineItem, QuoteLineItemType } from '@/types/drywall'
import { generateQuoteId } from './drywallQuoteHelpers'

export function createEmptyDrywallQuoteV3(): DrywallQuoteV3 {
  const d = DRYWALL_QUOTE_BASE_DEFAULTS
  return {
    version: 3,
    scope_of_work: '',
    prep_clean_rate: d.prepCleanRate,
    project_hanger_rate: d.hangerRate,
    project_finisher_rate: d.finisherRate,
    overhead_pct: d.overheadPercentage,
    profit_pct: d.profitPercentage,
    sales_tax_pct: d.salesTaxRate,
    component_include_labor_burden: true,
    lineItems: [],
    alternates: [],
    notes: '',
    updatedAt: new Date().toISOString(),
  }
}

export function hydrateDrywallQuoteV3(raw: unknown): DrywallQuoteV3 {
  const base = createEmptyDrywallQuoteV3()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base

  const q = raw as Record<string, unknown>
  const v2Snap = q.legacyV2Snapshot ? v2QuoteFromV3Snapshot(q.legacyV2Snapshot) : null

  let hydrated: DrywallQuoteV3 = {
    ...base,
    version: 3,
    quoteNumber: typeof q.quoteNumber === 'string' ? q.quoteNumber : base.quoteNumber,
    scope_of_work: typeof q.scope_of_work === 'string' ? q.scope_of_work : base.scope_of_work,
    ceiling_thickness: hydrateScopeString(q.ceiling_thickness, v2Snap?.ceilingThickness),
    wall_thickness: hydrateScopeString(q.wall_thickness, v2Snap?.wallThickness),
    hang_exceptions: hydrateScopeString(q.hang_exceptions, v2Snap?.hangExceptions),
    ceiling_finish: hydrateScopeString(q.ceiling_finish, v2Snap?.ceilingFinish),
    ceiling_finish_other: hydrateScopeString(q.ceiling_finish_other, v2Snap?.ceilingFinishOther),
    ceiling_exceptions: hydrateScopeString(q.ceiling_exceptions, v2Snap?.ceilingExceptions),
    wall_finish: hydrateScopeString(q.wall_finish, v2Snap?.wallFinish),
    wall_finish_other: hydrateScopeString(q.wall_finish_other, v2Snap?.wallFinishOther),
    wall_exceptions: hydrateScopeString(q.wall_exceptions, v2Snap?.wallExceptions),
    build_type: hydrateScopeString(q.build_type, v2Snap?.buildType),
    complexity: hydrateScopeString(q.complexity, v2Snap?.complexity),
    paper_floors_required: hydrateScopeBool(q.paper_floors_required, v2Snap?.paperFloorsRequired),
    bead_sticks: hydrateScopeBeadSticks(q.bead_sticks, v2Snap?.beadSticks),
    use_custom_scope_of_work:
      q.use_custom_scope_of_work === true
        ? true
        : v2Snap?.useCustomScopeOfWork === true
          ? true
          : optionalBool(q.use_custom_scope_of_work),
    custom_scope_of_work: hydrateScopeString(q.custom_scope_of_work, v2Snap?.customScopeOfWork),
    prep_clean_rate: num(q.prep_clean_rate, base.prep_clean_rate),
    project_hanger_rate:
      q.project_hanger_rate != null ? num(q.project_hanger_rate) : base.project_hanger_rate,
    project_finisher_rate:
      q.project_finisher_rate != null ? num(q.project_finisher_rate) : base.project_finisher_rate,
    overhead_pct: num(q.overhead_pct, base.overhead_pct),
    profit_pct: num(q.profit_pct, base.profit_pct),
    sales_tax_pct: num(q.sales_tax_pct, base.sales_tax_pct),
    hanger_include_labor_burden: optionalBool(q.hanger_include_labor_burden),
    finisher_include_labor_burden: optionalBool(q.finisher_include_labor_burden),
    prep_clean_include_labor_burden: optionalBool(q.prep_clean_include_labor_burden),
    component_include_labor_burden: optionalBool(q.component_include_labor_burden) ?? true,
    lineItems: Array.isArray(q.lineItems)
      ? (q.lineItems as QuoteLineItem[]).map((raw) =>
          migrateLegacyLaborFields(hydrateLineItem(raw), raw, q.legacyV2Snapshot),
        )
      : [],
    alternates: Array.isArray(q.alternates)
      ? (q.alternates as QuoteAlternate[]).map((alt) =>
          hydrateAlternate(alt, q.legacyV2Snapshot),
        )
      : [],
    legacyV2Snapshot: q.legacyV2Snapshot,
    pdf_settings: hydratePdfSettings(q.pdf_settings),
    notes: typeof q.notes === 'string' ? q.notes : base.notes,
    updatedAt: typeof q.updatedAt === 'string' ? q.updatedAt : base.updatedAt,
  }

  // Repair early v3 converts that kept snapshot but dropped carried-over lines.
  if (hydrated.lineItems.length === 0 && hydrated.legacyV2Snapshot) {
    const fromV2 = buildV3FromV2(v2QuoteFromV3Snapshot(hydrated.legacyV2Snapshot))
    hydrated = {
      ...hydrated,
      scope_of_work: hydrated.scope_of_work || fromV2.scope_of_work,
      ceiling_thickness: hydrated.ceiling_thickness ?? fromV2.ceiling_thickness,
      wall_thickness: hydrated.wall_thickness ?? fromV2.wall_thickness,
      hang_exceptions: hydrated.hang_exceptions ?? fromV2.hang_exceptions,
      ceiling_finish: hydrated.ceiling_finish ?? fromV2.ceiling_finish,
      ceiling_finish_other: hydrated.ceiling_finish_other ?? fromV2.ceiling_finish_other,
      ceiling_exceptions: hydrated.ceiling_exceptions ?? fromV2.ceiling_exceptions,
      wall_finish: hydrated.wall_finish ?? fromV2.wall_finish,
      wall_finish_other: hydrated.wall_finish_other ?? fromV2.wall_finish_other,
      wall_exceptions: hydrated.wall_exceptions ?? fromV2.wall_exceptions,
      build_type: hydrated.build_type ?? fromV2.build_type,
      complexity: hydrated.complexity ?? fromV2.complexity,
      paper_floors_required: hydrated.paper_floors_required ?? fromV2.paper_floors_required,
      bead_sticks: hydrated.bead_sticks ?? fromV2.bead_sticks,
      use_custom_scope_of_work:
        hydrated.use_custom_scope_of_work ?? fromV2.use_custom_scope_of_work,
      custom_scope_of_work: hydrated.custom_scope_of_work ?? fromV2.custom_scope_of_work,
      lineItems: fromV2.lineItems,
      alternates: hydrated.alternates.length > 0 ? hydrated.alternates : fromV2.alternates,
      hanger_include_labor_burden:
        hydrated.hanger_include_labor_burden ?? fromV2.hanger_include_labor_burden,
      finisher_include_labor_burden:
        hydrated.finisher_include_labor_burden ?? fromV2.finisher_include_labor_burden,
      prep_clean_include_labor_burden:
        hydrated.prep_clean_include_labor_burden ?? fromV2.prep_clean_include_labor_burden,
      pdf_settings: hydrated.pdf_settings ?? fromV2.pdf_settings,
    }
  }

  return stripMigratedLineLaborRates(hydrated)
}

/** v2 convert copied labor rates onto every line; project-level rates are canonical in v3. */
function stripMigratedLineLaborRates(quote: DrywallQuoteV3): DrywallQuoteV3 {
  const stripLine = (line: QuoteLineItem): QuoteLineItem => {
    if (line.type !== 'drywall') return line
    if (line.override_reason !== V3_LINE_MIGRATION_OVERRIDE_REASON) return line
    if (line.custom_hanger_rate == null && line.custom_finisher_rate == null) return line
    return {
      ...line,
      custom_hanger_rate: undefined,
      custom_finisher_rate: undefined,
    }
  }

  const lineItems = quote.lineItems.map(stripLine)
  const alternates = quote.alternates.map((alt) => ({
    ...alt,
    lineItems: alt.lineItems.map(stripLine),
  }))

  const changed =
    lineItems.some((line, i) => line !== quote.lineItems[i]) ||
    alternates.some((alt, i) => alt.lineItems !== quote.alternates[i]?.lineItems)

  return changed ? { ...quote, lineItems, alternates } : quote
}

function hydratePdfSettings(
  raw: unknown,
): DrywallQuoteV3['pdf_settings'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const s = raw as Record<string, unknown>
  const validity =
    s.validity_days != null ? num(s.validity_days, NaN) : undefined

  let document_options: DrywallQuotePdfSettings | undefined
  if (s.document_options && typeof s.document_options === 'object' && !Array.isArray(s.document_options)) {
    document_options = s.document_options as DrywallQuotePdfSettings
  }

  return {
    document_options,
    payment_terms:
      typeof s.payment_terms === 'string' ? s.payment_terms : undefined,
    validity_days: Number.isFinite(validity) && validity! > 0 ? validity : undefined,
    signature_lines: optionalBool(s.signature_lines),
    notes_for_customer:
      typeof s.notes_for_customer === 'string' ? s.notes_for_customer : undefined,
  }
}

/** Strip retired fields and normalize for JSONB persist. */
export function prepareDrywallQuoteV3ForSave(quote: DrywallQuoteV3): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...quote,
    version: 3,
    scope_of_work: quote.scope_of_work ?? '',
    prep_clean_rate: quote.prep_clean_rate ?? DRYWALL_QUOTE_BASE_DEFAULTS.prepCleanRate,
    updatedAt: new Date().toISOString(),
  }
  delete payload.default_board_id
  delete payload.default_finish_scope_id
  if (Array.isArray(payload.lineItems)) {
    payload.lineItems = (payload.lineItems as QuoteLineItem[]).map(stripLegacyLaborField)
  }
  if (Array.isArray(payload.alternates)) {
    payload.alternates = (payload.alternates as QuoteAlternate[]).map((alt) => ({
      ...alt,
      lineItems: alt.lineItems.map(stripLegacyLaborField),
    }))
  }
  return payload
}

function stripLegacyLaborField(line: QuoteLineItem): QuoteLineItem {
  if (line.type !== 'drywall') return line
  const copy = { ...line } as QuoteLineItem & { custom_labor_rate?: number }
  delete copy.custom_labor_rate
  return copy
}

function hydrateAlternate(raw: QuoteAlternate, legacyV2Snapshot?: unknown): QuoteAlternate {
  return {
    id: raw.id || generateQuoteId(),
    name: raw.name ?? '',
    description: raw.description ?? '',
    lineItems: Array.isArray(raw.lineItems)
      ? raw.lineItems.map((line) =>
          migrateLegacyLaborFields(hydrateLineItem(line), line, legacyV2Snapshot),
        )
      : [],
    totalAdd: raw.totalAdd,
    ...(raw.selected != null ? { selected: Boolean(raw.selected) } : {}),
  }
}

function optionalBool(v: unknown): boolean | undefined {
  if (v === true || v === false) return v
  return undefined
}

function optionalTrimmedString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t || undefined
}

function hydrateScopeString(raw: unknown, v2Value: unknown): string | undefined {
  return optionalTrimmedString(raw) ?? optionalTrimmedString(v2Value)
}

function hydrateScopeBool(raw: unknown, v2Value: boolean | undefined): boolean | undefined {
  if (raw === true || raw === false) return raw
  if (v2Value === true || v2Value === false) return v2Value
  return undefined
}

function hydrateScopeBeadSticks(
  raw: unknown,
  v2Value: string | number | undefined,
): string | number | undefined {
  if (raw != null && String(raw).trim() !== '') {
    const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw)
    return Number.isFinite(n) ? n : String(raw).trim()
  }
  if (v2Value != null && String(v2Value).trim() !== '') return v2Value
  return undefined
}

function hydrateAccessoryOverrides(
  raw: QuoteLineItem['accessoryOverrides'],
): QuoteLineItem['accessoryOverrides'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  return {
    joint_compound: optionalBool(raw.joint_compound),
    tape: optionalBool(raw.tape),
    screws: optionalBool(raw.screws),
    corner_bead: optionalBool(raw.corner_bead),
    corner_bead_lf:
      raw.corner_bead_lf != null ? num(raw.corner_bead_lf) : undefined,
    no_joint_compound: optionalBool(raw.no_joint_compound),
  }
}

function hydrateLineItem(raw: QuoteLineItem): QuoteLineItem {
  return {
    id: raw.id || generateQuoteId(),
    type: raw.type ?? 'drywall',
    description: raw.description ?? '',
    location: raw.location ?? '',
    quantity: num(raw.quantity, 0),
    catalog_id: raw.catalog_id ?? '',
    finish_scope_id: raw.finish_scope_id,
    custom_material_rate:
      raw.custom_material_rate != null ? num(raw.custom_material_rate) : undefined,
    custom_hanger_rate:
      raw.custom_hanger_rate != null ? num(raw.custom_hanger_rate) : undefined,
    custom_finisher_rate:
      raw.custom_finisher_rate != null ? num(raw.custom_finisher_rate) : undefined,
    custom_labor_rate:
      raw.custom_labor_rate != null ? num(raw.custom_labor_rate) : undefined,
    rc_surface: raw.rc_surface === 'ceiling' ? 'ceiling' : raw.rc_surface === 'wall' ? 'wall' : undefined,
    rc_wall_height: raw.rc_wall_height != null ? num(raw.rc_wall_height) : undefined,
    rc_spacing_in: raw.rc_spacing_in != null ? num(raw.rc_spacing_in) : undefined,
    override_reason: raw.override_reason,
    waste_pct: raw.waste_pct != null ? num(raw.waste_pct, 10) : undefined,
    accessoryOverrides: hydrateAccessoryOverrides(raw.accessoryOverrides),
    accessories_in_material_rate: optionalBool(raw.accessories_in_material_rate),
    notes: raw.notes,
  }
}

/** One-pass migration from legacy combined custom_labor_rate. */
function migrateLegacyLaborFields(
  line: QuoteLineItem,
  raw: QuoteLineItem,
  legacyV2Snapshot?: unknown,
): QuoteLineItem {
  if (line.custom_hanger_rate != null || line.custom_finisher_rate != null) {
    return line
  }

  const legacyCombined = (raw as QuoteLineItem & { custom_labor_rate?: number }).custom_labor_rate
  if (legacyCombined == null || line.type !== 'drywall') {
    return line
  }

  const combined = num(legacyCombined)

  if (legacyV2Snapshot) {
    const v2 = v2QuoteFromV3Snapshot(legacyV2Snapshot)
    const hanger = num(v2.hangerRate)
    const finisher = num(v2.finisherRate)
    if (hanger > 0 || finisher > 0) {
      return {
        ...line,
        custom_hanger_rate: hanger > 0 ? hanger : undefined,
        custom_finisher_rate: finisher > 0 ? finisher : undefined,
      }
    }
    return {
      ...line,
      custom_hanger_rate: combined / 2,
      custom_finisher_rate: combined / 2,
    }
  }

  return {
    ...line,
    custom_finisher_rate: combined,
  }
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function createQuoteLineItem(
  type: QuoteLineItemType,
  defaults?: { location?: string },
): QuoteLineItem {
  return {
    id: generateQuoteId(),
    type,
    description: '',
    location: defaults?.location ?? '',
    quantity: 0,
    catalog_id: '',
    finish_scope_id: undefined,
    waste_pct: type === 'drywall' ? 10 : undefined,
    rc_surface: type === 'rc_channel' ? 'wall' : undefined,
    rc_spacing_in: type === 'rc_channel' ? 24 : undefined,
    accessoryOverrides: type === 'rc_channel' ? { screws: true } : undefined,
  }
}

export function createQuoteAlternate(name = 'Alternate'): QuoteAlternate {
  return {
    id: generateQuoteId(),
    name,
    description: '',
    lineItems: [],
  }
}
