/**
 * Fire-taped board: hung, joints fire-taped, never finished.
 *
 * Board has three finishes: finished, fire-taped, hang only. Fire-taped is a kind of hang-only —
 * it is not in finish sqft and the finisher is not paid to finish it — but it is real work: on
 * 2026-10-12 Mark said finishers CAN be paid for fire taping, and sometimes the hanger does it.
 * So it is its own sqft, paid by a Firetape Only piece row to whoever's row it is, at the job's
 * fire-tape rate.
 *
 * Stored on a field board as `hangOnly: true` + `fireTaped: true`, so every reader written for
 * hang-only (finish sqft, finisher pay) is already right about it; only the readers that pay or
 * order for fire tape ask for this.
 *
 * Decisions (Mark, 2026-10-13):
 *   - pay rate: what the quote priced its Firetape Only lines at (Poland: the $0.57 project
 *     rate), else the catalog's Firetape Only rate ($0.10);
 *   - material: tape like finished board, about a third of the compound (one coat).
 */
import { isHangOnlyBoard } from './hangOnly'
import { quotedSqftWithWaste } from './fieldMeasurementUtils'
import type { FieldMeasurementArea, FieldMeasurementBoard } from '@/types/drywall'

/** The Firetape Only finish scope id — also its payroll piece key. */
export const FIRETAPE_SCOPE_ID = 'firetape_only'

/** Share of a full finish's joint compound that fire tape uses (one coat). */
export const FIRETAPE_COMPOUND_SHARE = 1 / 3

export type BoardFinish = 'finished' | 'firetape' | 'hang_only'

export const BOARD_FINISH_LABELS: Record<BoardFinish, string> = {
  finished: 'Finished',
  firetape: 'Fire-taped',
  hang_only: 'Hang only',
}

export function isFireTapedBoard(board: Pick<FieldMeasurementBoard, 'boardType' | 'hangOnly' | 'fireTaped'>): boolean {
  return isHangOnlyBoard(board) && board.fireTaped === true
}

export function boardFinish(board: Pick<FieldMeasurementBoard, 'boardType' | 'hangOnly' | 'fireTaped'>): BoardFinish {
  if (!isHangOnlyBoard(board)) return 'finished'
  return board.fireTaped === true ? 'firetape' : 'hang_only'
}

/**
 * The stored fields for a finish. `fireTaped` is dropped rather than set false off fire tape, so
 * a board never carries a flag that contradicts its hangOnly.
 */
export function boardFinishFields(finish: BoardFinish): { hangOnly: boolean; fireTaped?: true } {
  if (finish === 'finished') return { hangOnly: false }
  return finish === 'firetape' ? { hangOnly: true, fireTaped: true } : { hangOnly: true }
}

/** Apply a finish to a board, removing any stale fireTaped flag. */
export function withBoardFinish<B extends FieldMeasurementBoard>(board: B, finish: BoardFinish): B {
  const { fireTaped: _drop, ...rest } = board
  return { ...rest, ...boardFinishFields(finish) } as B
}

function boardSqft(board: FieldMeasurementBoard): number {
  const width = parseFloat(String(board.width)) || 0
  const length = parseFloat(String(board.length)) || 0
  const quantity = parseFloat(String(board.quantity)) || 0
  return (width / 12) * length * quantity
}

export function fireTapedMeasuredSqft(measurements: FieldMeasurementArea[] | null | undefined): number {
  let total = 0
  for (const area of measurements ?? []) {
    for (const board of area?.boards ?? []) {
      if (isFireTapedBoard(board)) total += boardSqft(board)
    }
  }
  return total
}

export function isFireTapeQuoteLine(line: Record<string, unknown> | null | undefined): boolean {
  return !!line && line.type === 'drywall' && line.finish_scope_id === FIRETAPE_SCOPE_ID
}

/** Quoted sqft with waste on Firetape Only lines — the fire-tape sqft before a measurement. */
export function quotedFireTapeSqftWithWaste(quote: Parameters<typeof quotedSqftWithWaste>[0]): number {
  return quotedSqftWithWaste(quote, (line) => isFireTapeQuoteLine(line))
}

function positiveNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The rate this job's quote priced fire tape at: each Firetape Only line's own rate, else the
 * project finisher rate (getEffectiveFinisherRate's order), weighted by sqft. Null when the
 * quote has no priced Firetape Only line — callers fall back to the catalog rate.
 */
export function jobFireTapeRate(quote: Record<string, unknown> | null | undefined): number | null {
  if (!quote || quote.version !== 3) return null
  const lines = Array.isArray(quote.lineItems) ? (quote.lineItems as Record<string, unknown>[]) : []
  const projectRate = positiveNumber(quote.project_finisher_rate)
  let sqft = 0
  let dollars = 0
  for (const line of lines) {
    if (!isFireTapeQuoteLine(line)) continue
    const rate = line.custom_finisher_rate != null && line.custom_finisher_rate !== ''
      ? positiveNumber(line.custom_finisher_rate)
      : projectRate
    // Same waste default as quotedSqftWithWaste / quoteV3Math.
    const wasteRaw = line.waste_pct
    const waste = wasteRaw == null || wasteRaw === '' ? 10 : Number(wasteRaw) || 0
    const qty = (Number(line.quantity) || 0) * (1 + waste / 100)
    if (rate == null || qty <= 0) continue
    sqft += qty
    dollars += qty * rate
  }
  return sqft > 0 ? dollars / sqft : null
}
