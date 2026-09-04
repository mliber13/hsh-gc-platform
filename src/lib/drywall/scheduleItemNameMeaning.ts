/**
 * Schedule item names are not just labels — two systems read meaning out of them:
 *
 *   1. Billing forecast — an item whose name starts with "Bill" is a billing draw,
 *      and its percentage (or "complete/final/remain/balance") drives
 *      `computeProjectedBillings`.
 *   2. Phase colouring — `phaseForItemName` derives measure/hang/finish/etc. from
 *      the name, which sets calendar colours and phase grouping.
 *
 * So renaming an item can silently move money on the KPI hub or re-bucket it on
 * every calendar. This module owns that parsing and the "what would this rename
 * change?" check the editors show before saving.
 */

import {
  phaseForItemName,
  SCHEDULE_PHASE_LABELS,
  type SchedulePhase,
} from '@/components/drywall/schedule/scheduleItemStatusStyles'

export type BillingPctParse =
  | { kind: 'percent'; pct: number }
  | { kind: 'remainder' }

/**
 * Billing draw encoded in a schedule item name, or null if it isn't one.
 * "Bill 50%" → percent 50; "Bill - final" → remainder; "Hang 2nd floor" → null.
 */
export function parseBillingDrawName(name: string): BillingPctParse | null {
  const trimmed = name.trim()
  if (!/^bill\b/i.test(trimmed)) return null
  const pctMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*%/)
  if (pctMatch) {
    const pct = Number(pctMatch[1])
    return Number.isFinite(pct) ? { kind: 'percent', pct } : null
  }
  if (/complete|final|remain|balance/i.test(trimmed)) return { kind: 'remainder' }
  return null
}

function describeDraw(parse: BillingPctParse): string {
  return parse.kind === 'percent' ? `${parse.pct}%` : 'the remaining balance'
}

export interface ScheduleItemRenameImpact {
  /** True when the rename changes anything the app derives from the name. */
  hasImpact: boolean
  phaseChanged: boolean
  fromPhase: SchedulePhase
  toPhase: SchedulePhase
  billingChanged: boolean
  /** Plain-language warnings, most consequential first. Empty when harmless. */
  warnings: string[]
}

/**
 * What a rename would change downstream. `type` matters because office items take
 * their phase from the type, so renaming one never affects colouring.
 */
export function scheduleItemRenameImpact(
  oldName: string,
  newName: string,
  type: 'field' | 'office' = 'field',
): ScheduleItemRenameImpact {
  const fromPhase = type === 'office' ? 'office' : phaseForItemName(oldName)
  const toPhase = type === 'office' ? 'office' : phaseForItemName(newName)
  const phaseChanged = fromPhase !== toPhase

  const fromDraw = parseBillingDrawName(oldName)
  const toDraw = parseBillingDrawName(newName)
  const billingChanged =
    fromDraw?.kind !== toDraw?.kind ||
    (fromDraw?.kind === 'percent' &&
      toDraw?.kind === 'percent' &&
      fromDraw.pct !== toDraw.pct)

  const warnings: string[] = []

  // Billing first — it moves money, phase only moves colour.
  if (billingChanged) {
    if (fromDraw && !toDraw) {
      warnings.push(
        `This stops counting as a billing draw, so ${describeDraw(fromDraw)} drops out of the revenue forecast.`,
      )
    } else if (!fromDraw && toDraw) {
      warnings.push(
        `This starts counting as a billing draw for ${describeDraw(toDraw)} in the revenue forecast.`,
      )
    } else if (fromDraw && toDraw) {
      warnings.push(
        `The billing draw changes from ${describeDraw(fromDraw)} to ${describeDraw(toDraw)} in the revenue forecast.`,
      )
    }
  }

  if (phaseChanged) {
    warnings.push(
      `Phase changes from ${SCHEDULE_PHASE_LABELS[fromPhase]} to ${SCHEDULE_PHASE_LABELS[toPhase]}, so its colour and grouping on the calendar change.`,
    )
  }

  return {
    hasImpact: warnings.length > 0,
    phaseChanged,
    fromPhase,
    toPhase,
    billingChanged,
    warnings,
  }
}
