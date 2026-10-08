import { hydrateDrywallQuoteV3 } from '@/lib/drywall/createEmptyDrywallQuoteV3'
import { quotedSqftWithWaste } from '@/lib/drywall/fieldMeasurementUtils'
import { hangOnlyMeasuredSqft, quotedFinishSqftWithWaste } from '@/lib/drywall/hangOnly'
import { getIntakeSourceFromLegacy, getPoDataFromLegacy } from '@/services/drywallProjectsService'
import type { DrywallPoData, DrywallQuote, DrywallQuoteV3 } from '@/types/drywall'

export type CrewPaySqftBaseSource = 'measured' | 'quoted' | 'po'

export interface CrewPaySqftResult {
  /**
   * HANG sqft — every board hung, hang-only boards included. Base plus accepted change-order
   * crew sqft; null when neither exists. Hanger pay, and the "job size" a crew member sees.
   */
  sqft: number | null
  /**
   * FINISH sqft — the same, less hang-only board (Hardi, a double layer's base layer). Finisher
   * pay. Equal to `sqft` on any job without hang-only board.
   */
  finishSqft: number | null
  baseSqft: number | null
  baseSource: CrewPaySqftBaseSource | null
  acceptedChangeOrderSqft: number
}

/**
 * The sqft a crew member is paid on, and the number the phone shows.
 *
 * Base, first hit wins — this is the crew chain, and payroll uses it too:
 *   1. field-measured total
 *   2. quoted sqft with waste (v3 drywall lines, else v2)
 *   3. PO customer sqft, only when the job was taken in as a PO
 * Then add accepted (or approved) change-order `additionalCrewSqft`.
 *
 * Fallback decision: an unmeasured job defaults to the quote (or the PO),
 * not to blank. No in-flight job is unmeasured today, so this changes no
 * current paycheck except where accepted change-order sqft was missing.
 * The payroll sqft cell stays editable. Paying the quote when there is no
 * measurement matches the number the worker already sees; leaving payroll
 * blank would keep a second rule waiting for the next unmeasured job.
 *
 * Accepted change-order work is work that was done, so it is always included.
 * Payroll moves to this number. The phone does not move down to field-measured only.
 */
export function resolveCrewPaySqft(input: {
  legacy: Record<string, unknown> | null | undefined
  intakeSource?: 'quote' | 'po' | null
  po?: DrywallPoData | null
}): CrewPaySqftResult {
  const legacy = input.legacy ?? {}
  const po = input.po !== undefined ? input.po : getPoDataFromLegacy(legacy)
  const intakeSource = resolveIntake(legacy, input.intakeSource, po)
  const base = resolveBaseSqft(legacy, intakeSource, po)
  const acceptedChangeOrderSqft = acceptedChangeOrderCrewSqft(legacy)
  if (base.sqft == null) {
    const coOnly = acceptedChangeOrderSqft > 0 ? acceptedChangeOrderSqft : null
    return {
      sqft: coOnly,
      finishSqft: coOnly,
      baseSqft: null,
      baseSource: null,
      acceptedChangeOrderSqft,
    }
  }
  // Change-order crew sqft is one number with no hang/finish split; it is treated as finished,
  // which is what it was before this split.
  return {
    sqft: base.sqft + acceptedChangeOrderSqft,
    finishSqft: base.finishSqft + acceptedChangeOrderSqft,
    baseSqft: base.sqft,
    baseSource: base.source,
    acceptedChangeOrderSqft,
  }
}

export function resolveCrewPaySqftFromMetadata(metadata: unknown): CrewPaySqftResult {
  return resolveCrewPaySqft({ legacy: legacyRecord(metadata) })
}

function legacyRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const legacy = (metadata as Record<string, unknown>).legacy
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return {}
  return legacy as Record<string, unknown>
}

function resolveIntake(
  legacy: Record<string, unknown>,
  explicit: 'quote' | 'po' | null | undefined,
  po: DrywallPoData | null,
): 'quote' | 'po' {
  if (explicit === 'po' || explicit === 'quote') return explicit
  return getIntakeSourceFromLegacy(legacy) ?? (po ? 'po' : 'quote')
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : null
}

function positive(n: number | null): number | null {
  if (n == null || n <= 0) return null
  return n
}

function measuredSqft(legacy: Record<string, unknown>): number | null {
  const field = legacy.fieldTakeoff
  if (!field || typeof field !== 'object' || Array.isArray(field)) return null
  return positive(num((field as Record<string, unknown>).totalMeasuredSqft))
}

function v3Quote(legacy: Record<string, unknown>): DrywallQuoteV3 | null {
  const raw = legacy.quote
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if ((raw as Record<string, unknown>).version !== 3) return null
  return hydrateDrywallQuoteV3(raw)
}

function v2Quote(legacy: Record<string, unknown>): DrywallQuote | null {
  const raw = legacy.quote
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if ((raw as Record<string, unknown>).version === 3) return null
  return raw as DrywallQuote
}

function resolveBaseSqft(
  legacy: Record<string, unknown>,
  intakeSource: 'quote' | 'po',
  po: DrywallPoData | null,
):
  | { sqft: number; finishSqft: number; source: CrewPaySqftBaseSource }
  | { sqft: null; finishSqft: null; source: null } {
  const measured = measuredSqft(legacy)
  if (measured != null) {
    // The stored total is every board; take the hang-only boards back out for the finisher.
    const field = legacy.fieldTakeoff as Record<string, unknown>
    const measurements = Array.isArray(field.measurements) ? field.measurements : []
    const hangOnly = hangOnlyMeasuredSqft(measurements)
    return { sqft: measured, finishSqft: Math.max(0, measured - hangOnly), source: 'measured' }
  }

  const v3 = v3Quote(legacy)
  if (v3?.lineItems?.length) {
    const withWaste = quotedSqftWithWaste(v3)
    if (withWaste > 0) {
      return { sqft: withWaste, finishSqft: quotedFinishSqftWithWaste(v3), source: 'quoted' }
    }
  }

  // v2 quotes and PO intake have no lines to tell hang-only from finished: both numbers match.
  const v2 = v2Quote(legacy)
  if (v2) {
    const withWaste = quotedSqftWithWaste(v2)
    if (withWaste > 0) return { sqft: withWaste, finishSqft: withWaste, source: 'quoted' }
    const direct = positive(num(v2.sqft))
    if (direct != null) return { sqft: direct, finishSqft: direct, source: 'quoted' }
    const breakdownSum = (v2.breakdowns ?? []).reduce((acc, b) => acc + (num(b.sqft) ?? 0), 0)
    if (breakdownSum > 0) return { sqft: breakdownSum, finishSqft: breakdownSum, source: 'quoted' }
  }

  if (intakeSource === 'po' && po) {
    const poSqft = positive(num(po.customerSqft))
    if (poSqft != null) return { sqft: poSqft, finishSqft: poSqft, source: 'po' }
  }

  return { sqft: null, finishSqft: null, source: null }
}

/** Sum of accepted change orders' additional crew sqft (scope the crew hangs and finishes). */
export function acceptedChangeOrderCrewSqft(legacy: Record<string, unknown> | null | undefined): number {
  const raw = legacy?.changeOrders
  if (!Array.isArray(raw)) return 0
  let sum = 0
  for (const co of raw) {
    if (!co || typeof co !== 'object' || Array.isArray(co)) continue
    const c = co as Record<string, unknown>
    const status = String(c.status ?? '').toLowerCase()
    if (status !== 'accepted' && status !== 'approved') continue
    const sqft = Number(c.additionalCrewSqft)
    if (Number.isFinite(sqft) && sqft > 0) sum += sqft
  }
  return sum
}
